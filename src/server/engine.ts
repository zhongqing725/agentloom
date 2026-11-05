import type { GraphNode, NodeOutput, NodeStatus, Usage, VerdictRoute } from '../shared/types.js'
import type { AgentContext, Evidence } from './llm.js'
import { runAgentNode, runDiverge } from './llm.js'
import { searchKnowledge } from './retrieval.js'
import {
  appendEvent,
  createNodeRun,
  getDb,
  getProject,
  getRun,
  getWorkflow,
  listAgents,
  updateNodeRun,
  updateRun,
} from './db.js'
import { publishRunEvent } from './bus.js'

const cancelledRuns = new Set<string>()

export function cancelRun(runId: string) {
  cancelledRuns.add(runId)
}

interface NodeState {
  node: GraphNode
  status: NodeStatus
  output?: NodeOutput
  nodeRunId?: string
  score?: number
  iteration: number
  attempts: number
  error?: string
}

const ANGLE_PREFIX: Record<string, string> = {
  市场: 'M',
  产业链: 'L',
  竞争: 'C',
}

const ANGLE_QUERY: Record<string, string> = {
  市场: 'AI 眼镜 市场 出货量 渗透率 价格 ASP 增速',
  产业链: 'AI 眼镜 产业链 BOM 毛利率 价值 光学 芯片 成本',
  竞争: 'AI 眼镜 竞争 份额 Meta 雷朋 渠道 厂商 护城河',
}

const ANGLE_DOC: Record<string, string> = {
  市场: 'doc-market',
  产业链: 'doc-chain',
  竞争: 'doc-competition',
}

const NODE_LABEL: Record<string, string> = {
  input: '研究任务',
  planner: '研究规划师',
  market: '市场研究员',
  chain: '产业链研究员',
  competition: '竞争情报员',
  analyst: '首席分析师',
  writer: '报告撰写师',
  verifier: '事实核查员',
  editor: '主编',
  output: '研究报告',
}

export async function executeRun(runId: string): Promise<void> {
  const run = getRun(runId)
  if (!run || run.status !== 'running') return
  const workflow = getWorkflow()
  const agents = listAgents()
  const project = getProject()
  const threshold = workflow.settings.verifyThreshold
  const maxLoop = workflow.settings.maxLoop
  const budget = workflow.settings.budgetUsd
  const maxConcurrency = Math.max(1, workflow.settings.maxConcurrency)
  const mockDelay = Math.max(0, Number(process.env.AGENTLOOM_MOCK_DELAY ?? 380))

  const states = new Map<string, NodeState>()
  for (const node of workflow.graph.nodes) {
    states.set(node.id, {
      node,
      status: 'pending',
      iteration: 0,
      attempts: 0,
    })
  }

  const deps = new Map<string, string[]>()
  for (const node of workflow.graph.nodes) deps.set(node.id, [])
  for (const edge of workflow.graph.edges) {
    if (edge.kind === 'loop') continue
    deps.get(edge.target)?.push(edge.source)
  }

  const depths = new Map<string, number>()
  const depth = (id: string, seen = new Set<string>()): number => {
    if (depths.has(id)) return depths.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const outgoing = workflow.graph.edges.filter((edge) => edge.source === id && edge.kind !== 'loop')
    const value = outgoing.length === 0 ? 0 : 1 + Math.max(...outgoing.map((edge) => depth(edge.target, seen)))
    depths.set(id, value)
    return value
  }

  let totalCost = 0
  let totalTokens = 0
  let feedback = ''
  let loopCount = 0
  let fatalError = ''
  let finalMarkdown = ''

  const emit = (type: string, message?: string, data?: Record<string, unknown>, nodeId?: string) => {
    const event = appendEvent({
      runId,
      ts: new Date().toISOString(),
      type,
      message,
      data,
      nodeId,
    })
    publishRunEvent(event)
  }

  const addUsage = (usage?: Usage) => {
    if (!usage) return
    totalCost = Number((totalCost + usage.cost).toFixed(5))
    totalTokens += usage.promptTokens + usage.completionTokens
    updateRun(runId, { cost: totalCost, tokens: totalTokens })
  }

  const buildUpstream = (currentId: string) =>
    [...states.values()]
      .filter((state) => state.output && state.node.id !== currentId)
      .sort((a, b) => a.node.position.x - b.node.position.x)
      .map((state) => ({
        nodeId: state.node.id,
        title: state.node.data.label,
        output: state.output!,
      }))

  const retrieveEvidence = (angle: string): Evidence[] => {
    const prefix = ANGLE_PREFIX[angle] ?? 'E'
    const preferredDoc = ANGLE_DOC[angle]
    const hits = searchKnowledge(getDb(), project.id, ANGLE_QUERY[angle] ?? `${angle} AI 眼镜`, 6, preferredDoc).sort((a, b) => {
      const ap = a.docId === preferredDoc ? 0 : 1
      const bp = b.docId === preferredDoc ? 0 : 1
      if (ap !== bp) return ap - bp
      const ai = Number(a.chunkId.split('-c').pop() ?? 0)
      const bi = Number(b.chunkId.split('-c').pop() ?? 0)
      return ai - bi
    })
    return hits.map((hit, index) => ({
      ref: `${prefix}${index + 1}`,
      docId: hit.docId,
      docTitle: hit.docTitle,
      quote: hit.text,
      score: hit.score,
    }))
  }

  const downstreamOf = (start: string): Set<string> => {
    const affected = new Set<string>([start])
    let changed = true
    while (changed) {
      changed = false
      for (const edge of workflow.graph.edges) {
        if (edge.kind === 'loop') continue
        if (affected.has(edge.source) && !affected.has(edge.target)) {
          affected.add(edge.target)
          changed = true
        }
      }
    }
    return affected
  }

  const chooseRoute = (routes: VerdictRoute[]): VerdictRoute | undefined => {
    const priority: Record<string, number> = { citation: 5, number: 4, logic: 3, coverage: 2, wording: 1, other: 0 }
    return [...routes].sort((a, b) => (priority[b.type] ?? 0) - (priority[a.type] ?? 0))[0]
  }

  const executeNode = async (state: NodeState): Promise<void> => {
    const node = state.node
    const agent = node.data.agentId ? agents.find((item) => item.id === node.data.agentId) : undefined
    state.status = 'running'
    state.attempts += 1
    const nodeRun = createNodeRun({
      runId,
      nodeId: node.id,
      agentId: agent?.id,
      title: node.data.label,
      kind: node.type,
      iteration: state.iteration,
    })
    state.nodeRunId = nodeRun.id
    emit(
      'node.started',
      `${node.data.label} 开始执行`,
      { agent: agent?.name, role: agent?.role, iteration: state.iteration },
      node.id,
    )

    try {
      if (run.mode === 'mock' && node.type !== 'input' && node.type !== 'output') {
        await new Promise((resolve) => setTimeout(resolve, mockDelay))
      }
      let output: NodeOutput

      if (node.type === 'input') {
        output = { text: run.input, data: { input: run.input } }
      } else if (node.type === 'output') {
        const editor = states.get('editor')?.output
        const markdown = editor?.markdown ?? editor?.text ?? ''
        output = {
          text: markdown,
          markdown,
          citations: editor?.citations ?? [],
          data: { markdown },
        }
        finalMarkdown = markdown
      } else if (agent) {
        if (totalCost > budget) {
          throw new Error(`预算上限 $${budget} 已用完，调度器停止了后续模型调用。`)
        }

        const ctx: AgentContext = {
          agent,
          nodeId: node.id,
          angle: node.data.angle,
          input: run.input,
          upstream: buildUpstream(node.id),
          evidence: agent.role === 'researcher' ? retrieveEvidence(node.data.angle ?? '市场') : [],
          feedback: feedback || undefined,
          iteration: state.iteration,
          mode: run.mode,
        }

        if (agent.role === 'analyst' && agent.plugins.includes('cognition.diverge')) {
          const result = await runDiverge(ctx, (branch) => {
            emit('node.branch', `展开「${branch}」思维分支`, { branch }, node.id)
          })
          output = result.output
          emit(
            'node.merge',
            `裁判收敛：${result.output.candidates?.find((item) => item.id === result.output.chosenId)?.name ?? '稳健情景'}`,
            { chosenId: result.output.chosenId, candidates: result.output.candidates?.map((item) => ({ id: item.id, name: item.name, score: item.score })) },
            node.id,
          )
        } else {
          output = await runAgentNode(ctx, threshold)
        }
      } else {
        throw new Error(`节点 ${node.id} 没有可执行的 Agent。`)
      }

      const usage = output.usage
      const score = output.verdict?.score ?? output.score
      addUsage(usage)

      if (node.type === 'verifier' && output.verdict) {
        if (!output.verdict.passed && loopCount < maxLoop) {
          const routes = output.verdict.routes ?? []
          const chosen = chooseRoute(routes)
          const target = chosen && states.has(chosen.target) ? chosen.target : 'writer'
          const nextIteration = loopCount + 1
          const affected = downstreamOf(target)
          output.verdict.selectedTarget = target
          output.verdict.selectedType = chosen?.type

          state.status = 'pending'
          state.output = undefined
          state.score = output.verdict.score
          updateNodeRun(nodeRun.id, {
            status: 'waiting',
            output,
            score: output.verdict.score,
            cost: usage?.cost ?? 0,
            tokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
            finishedAt: new Date().toISOString(),
          })
          emit(
            'verify.failed',
            `第 ${nextIteration} 轮核查未通过：支持率 ${(output.verdict.score * 100).toFixed(0)}%`,
            {
              score: output.verdict.score,
              issues: output.verdict.issues,
              routes,
              target,
            },
            node.id,
          )

          for (const affectedId of affected) {
            const nodeState = states.get(affectedId)
            if (!nodeState) continue
            nodeState.status = 'pending'
            nodeState.output = undefined
            nodeState.error = undefined
            nodeState.attempts = 0
            nodeState.iteration = nextIteration
          }

          loopCount = nextIteration
          state.iteration = nextIteration
          feedback =
            routes
              .map((route) => `[${route.type} → ${NODE_LABEL[route.target] ?? route.target}] ${route.message}`)
              .join('\n') || output.verdict.issues.join('\n')

          emit(
            'loop.triggered',
            `Self-Loop：${chosen?.type ?? 'issue'} →「${NODE_LABEL[target] ?? target}」`,
            {
              iteration: loopCount,
              target,
              routeType: chosen?.type,
              affected: [...affected],
              issues: output.verdict.issues,
              routes,
            },
            node.id,
          )
          return
        }
      }

      updateNodeRun(nodeRun.id, {
        status: 'completed',
        output,
        score,
        cost: usage?.cost ?? 0,
        tokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
        finishedAt: new Date().toISOString(),
      })
      state.status = 'completed'
      state.output = output
      state.score = score
      state.error = undefined

      const preview =
        output.markdown?.slice(0, 180) ??
        output.text?.slice(0, 180) ??
        String(output.data?.summary ?? '').slice(0, 180) ??
        '已完成'
      emit(
        'node.completed',
        `${node.data.label} 完成`,
        {
          score,
          preview,
          citations: output.citations?.length ?? 0,
          tokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
          iteration: state.iteration,
        },
        node.id,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retryable = state.attempts < 2 && !cancelledRuns.has(runId)
      updateNodeRun(nodeRun.id, {
        status: 'failed',
        error: message,
        finishedAt: new Date().toISOString(),
      })
      if (retryable) {
        state.status = 'pending'
        emit(
          'node.retry',
          `${node.data.label} 执行失败，调度器将在 600ms 后重试（第 ${state.attempts + 1} 次）`,
          { error: message },
          node.id,
        )
        await new Promise((resolve) => setTimeout(resolve, 600))
        return
      }
      state.status = 'failed'
      state.error = message
      fatalError = message
      emit('node.failed', `${node.data.label} 失败：${message}`, { error: message }, node.id)
    }
  }

  emit('run.started', '运行开始：正在构建调度图', {
    nodes: workflow.graph.nodes.length,
    edges: workflow.graph.edges.length,
    mode: run.mode,
  })

  const running = new Map<string, Promise<void>>()

  try {
    while (true) {
      if (cancelledRuns.has(runId)) {
        updateRun(runId, {
          status: 'cancelled',
          finishedAt: new Date().toISOString(),
          cost: totalCost,
          tokens: totalTokens,
        })
        emit('run.cancelled', '运行已取消')
        return
      }
      if (fatalError) break

      const ready = [...states.values()]
        .filter(
          (state) =>
            state.status === 'pending' &&
            deps.get(state.node.id)?.every((dep) => states.get(dep)?.status === 'completed'),
        )
        .sort((a, b) => {
          const depthDiff = depth(b.node.id) - depth(a.node.id)
          if (depthDiff !== 0) return depthDiff
          return a.node.position.x - b.node.position.x
        })

      while (ready.length > 0 && running.size < maxConcurrency) {
        const state = ready.shift()!
        state.status = 'queued'
        emit('node.queued', `${state.node.data.label} 进入调度队列`, {
          priority: depth(state.node.id),
          running: running.size,
        }, state.node.id)
        const promise = executeNode(state).finally(() => {
          running.delete(state.node.id)
        })
        running.set(state.node.id, promise)
      }

      if (running.size > 0) {
        emit('scheduler.tick', `调度器：${running.size} 个节点运行中`, {
          running: [...running.keys()],
          ready: ready.map((state) => state.node.id),
        })
        await Promise.race([...running.values()])
        continue
      }

      const pending = [...states.values()].filter((state) => state.status === 'pending' || state.status === 'queued')
      if (pending.length === 0) break
      throw new Error(`工作流无法继续，等待中的节点：${pending.map((state) => state.node.data.label).join('、')}`)
    }

    if (fatalError) {
      updateRun(runId, {
        status: 'failed',
        error: fatalError,
        finishedAt: new Date().toISOString(),
        cost: totalCost,
        tokens: totalTokens,
      })
      emit('run.failed', `运行失败：${fatalError}`, { error: fatalError })
      return
    }

    const verifierState = states.get('verifier')
    const finalScore = verifierState?.score ?? 1
    updateRun(runId, {
      status: 'completed',
      output: finalMarkdown,
      score: finalScore,
      cost: totalCost,
      tokens: totalTokens,
      finishedAt: new Date().toISOString(),
    })
    emit(
      'run.completed',
      finalScore >= threshold ? '运行完成：核查通过' : '运行完成：核查未达标，需要人工复核',
      {
        score: finalScore,
        threshold,
        loopCount,
        tokens: totalTokens,
        cost: totalCost,
        citations: states.get('output')?.output?.citations?.length ?? 0,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    updateRun(runId, {
      status: 'failed',
      error: message,
      finishedAt: new Date().toISOString(),
      cost: totalCost,
      tokens: totalTokens,
    })
    emit('run.failed', `运行失败：${message}`, { error: message })
  }
}
