import type { GraphNode, NodeOutput, NodeStatus, Usage, Verdict, VerdictRoute } from '../shared/types.js'
import type { AgentContext, Evidence } from './llm.js'
import { runAgentNode, runDiverge } from './llm.js'
import { searchKnowledge } from './retrieval.js'
import { loadWikiSnapshot } from './wiki.js'
import {
  appendEvent,
  createNodeRun,
  createRun,
  getDb,
  getProject,
  getRun,
  getWorkflow,
  getWorkflowById,
  listAgents,
  recallAgentMemory,
  rememberAgentMemory,
  saveRunCheckpoint,
  updateNodeRun,
  updateRun,
} from './db.js'
import { publishRunEvent } from './bus.js'

const cancelledRuns = new Set<string>()
const pausedRuns = new Set<string>()

export function cancelRun(runId: string) {
  cancelledRuns.add(runId)
}

export function pauseRun(runId: string) {
  pausedRuns.add(runId)
}

export function resumeRun(runId: string) {
  pausedRuns.delete(runId)
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

export async function executeRun(runId: string, runDepth = 0): Promise<void> {
  const run = getRun(runId)
  if (!run || run.status !== 'running') return
  if (runDepth > 2) throw new Error('子工作流嵌套超过 2 层，已停止。')
  const workflow = getWorkflowById(run.workflowId) ?? getWorkflow()
  const agents = listAgents()
  const project = getProject()
  const wiki = loadWikiSnapshot(getDb(), project.id)
  const threshold = workflow.settings.verifyThreshold
  const liveMaxLoop = Number(process.env.AGENTLOOM_LIVE_MAX_LOOP ?? 1)
  const maxLoop =
    run.mode === 'live'
      ? Math.min(workflow.settings.maxLoop, Number.isFinite(liveMaxLoop) ? Math.max(0, liveMaxLoop) : 1)
      : workflow.settings.maxLoop
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

  const previewValue = (value: unknown): string => {
    try {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      return text.length > 400 ? `${text.slice(0, 400)}…` : text
    } catch {
      return String(value)
    }
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

  const retrieveEvidence = async (angle: string, context: string, plugins: string[]): Promise<Evidence[]> => {
    const prefix = ANGLE_PREFIX[angle] ?? 'E'
    const preferredDoc = ANGLE_DOC[angle]
    const query = ANGLE_QUERY[angle] ?? `${angle} ${context}`.trim()
    const db = getDb()
    const hits = (await searchKnowledge(db, project.id, query, 10, preferredDoc)).sort((a, b) => {
      const ap = a.docId === preferredDoc ? 0 : 1
      const bp = b.docId === preferredDoc ? 0 : 1
      if (ap !== bp) return ap - bp
      const ai = Number(a.chunkId.split('-c').pop() ?? 0)
      const bi = Number(b.chunkId.split('-c').pop() ?? 0)
      return ai - bi
    })

    if (plugins.includes('knowledge.graph')) {
      const seen = new Set(hits.map((hit) => hit.chunkId))
      for (const hit of hits.slice(0, 3)) {
        for (const related of await searchKnowledge(db, project.id, hit.text.slice(0, 120), 2)) {
          if (seen.has(related.chunkId)) continue
          seen.add(related.chunkId)
          hits.push(related)
        }
      }
    }

    if (plugins.includes('knowledge.freshness')) {
      const rows = db
        .prepare('SELECT id, published_at, created_at FROM documents')
        .all() as Array<{ id: string; published_at?: string; created_at?: string }>
      const stamp = new Map(rows.map((row) => [row.id, Date.parse(row.published_at ?? row.created_at ?? '') || 0]))
      hits.sort((a, b) => (stamp.get(b.docId) ?? 0) - (stamp.get(a.docId) ?? 0))
    }

    return hits.slice(0, 6).map((hit, index) => ({
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

  const chooseRoute = (verdict: Verdict): VerdictRoute | undefined => {
    const routes = verdict.routes ?? []
    // Route on the dimension that actually failed, not on the loudest issue type.
    const failing = new Set<string>()
    const dims = verdict.dimensions
    if (dims) {
      if (dims.citations < threshold) failing.add('citation')
      if (dims.coverage < threshold) failing.add('coverage')
      if (dims.conflicts < threshold) failing.add('conflict')
    }
    const pool = failing.size > 0 ? routes.filter((route) => failing.has(route.type)) : routes
    const priority: Record<string, number> = {
      conflict: 6,
      citation: 5,
      number: 4,
      coverage: 3,
      logic: 3,
      wording: 1,
      other: 0,
    }
    return [...(pool.length > 0 ? pool : routes)].sort((a, b) => (priority[b.type] ?? 0) - (priority[a.type] ?? 0))[0]
  }

  const evaluateCondition = (node: GraphNode): { passed: boolean; value: unknown; sourceNodeId: string; path: string } => {
    const spec = node.data.condition
    if (!spec) return { passed: false, value: undefined, sourceNodeId: '', path: '' }
    const source = states.get(spec.sourceNodeId)?.output
    let value: unknown = source
    for (const key of spec.path.split('.').filter(Boolean)) {
      if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[key]
      } else {
        value = undefined
        break
      }
    }
    let passed = false
    if (spec.op === 'eq') {
      passed = String(value) === String(spec.value)
    } else {
      const left = Number(value)
      const right = Number(spec.value)
      if (Number.isFinite(left) && Number.isFinite(right)) {
        passed = spec.op === 'gte' ? left >= right : left <= right
      }
    }
    return { passed, value, sourceNodeId: spec.sourceNodeId, path: spec.path }
  }

  /** After a condition completes, skip the branch that was not taken. */
  const applyConditionBranch = (node: GraphNode, passed: boolean) => {
    const chosen = passed ? 'true' : 'false'
    const edges = workflow.graph.edges.filter((edge) => edge.source === node.id && edge.condition)
    if (edges.length === 0) return
    const reachable = (starts: string[]): Set<string> => {
      const seen = new Set<string>(starts)
      let changed = true
      while (changed) {
        changed = false
        for (const edge of workflow.graph.edges) {
          if (edge.kind === 'loop') continue
          if (seen.has(edge.source) && !seen.has(edge.target)) {
            seen.add(edge.target)
            changed = true
          }
        }
      }
      return seen
    }
    const chosenNodes = reachable(edges.filter((edge) => edge.condition === chosen).map((edge) => edge.target))
    const skippedNodes = reachable(
      edges.filter((edge) => edge.condition !== chosen).map((edge) => edge.target),
    )
    for (const id of skippedNodes) {
      if (chosenNodes.has(id)) continue
      const state = states.get(id)
      if (!state || state.status !== 'pending') continue
      state.status = 'skipped'
      emit('node.skipped', `${state.node.data.label} 未走条件分支，已跳过`, { condition: chosen }, id)
    }
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
        // Prefer the editor node; if the graph was edited without one, take the
        // right-most completed node so a custom canvas still produces a report.
        const editor = states.get('editor')?.output
          ?? [...states.values()]
            .filter((item) => item.status === 'completed' && item.output)
            .sort((a, b) => a.node.position.x - b.node.position.x)
            .at(-1)?.output
        const markdown = editor?.markdown ?? editor?.text ?? ''
        output = {
          text: markdown,
          markdown,
          citations: editor?.citations ?? [],
          data: { markdown },
        }
        finalMarkdown = markdown
      } else if (node.type === 'condition') {
        const result = evaluateCondition(node)
        output = {
          text: JSON.stringify(result),
          data: result as unknown as Record<string, unknown>,
          score: result.passed ? 1 : 0,
        }
      } else if (node.type === 'subflow') {
        const subflowId = node.data.subflowWorkflowId
        if (!subflowId) throw new Error(`子工作流节点 ${node.id} 没有配置 subflowWorkflowId。`)
        const child = createRun(run.input, run.mode, subflowId)
        emit('subflow.started', `进入子工作流 ${subflowId}`, { childRunId: child.id }, node.id)
        await executeRun(child.id, runDepth + 1)
        const childRun = getRun(child.id)
        emit('subflow.completed', `子工作流结束：${childRun?.status ?? 'unknown'}`, { childRunId: child.id }, node.id)
        output = {
          text: childRun?.output ?? '',
          markdown: childRun?.output,
          data: {
            subflowRunId: child.id,
            subflowWorkflowId: subflowId,
            subflowStatus: childRun?.status,
          },
          score: childRun?.score,
        }
      } else if (agent) {
        if (totalCost > budget) {
          throw new Error(`预算上限 $${budget} 已用完，调度器停止了后续模型调用。`)
        }

        const knowledgePlugins = agent.plugins.filter((plugin) => plugin.startsWith('knowledge.'))
        const ctx: AgentContext = {
          agent,
          nodeId: node.id,
          angle: node.data.angle,
          input: run.input,
          upstream: buildUpstream(node.id),
          evidence:
            knowledgePlugins.length > 0
              ? await retrieveEvidence(node.data.angle ?? '市场', `${node.data.subtitle ?? ''} ${agent.title}`, knowledgePlugins)
              : [],
          feedback: feedback || undefined,
          iteration: state.iteration,
          mode: run.mode,
          memory: recallAgentMemory(agent.id, `${run.input} ${node.data.angle ?? ''}`.trim(), 3),
          wiki,
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

      for (const call of output.toolCalls ?? []) {
        emit(
          'tool.call',
          `${node.data.label} 调用 ${call.name}(${JSON.stringify(call.args).slice(0, 120)})`,
          { name: call.name, args: call.args },
          node.id,
        )
        emit(
          'tool.result',
          call.error ? `${call.name} 失败：${call.error}` : `${call.name} 返回结果`,
          { name: call.name, result: previewValue(call.result), error: call.error, ms: call.ms },
          node.id,
        )
      }

      if (node.type === 'verifier' && output.verdict) {
        if (!output.verdict.passed && loopCount < maxLoop) {
          const routes = output.verdict.routes ?? []
          const chosen = chooseRoute(output.verdict)
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
            `Self-Loop：${chosen?.type ?? 'issue'} →「${states.get(target)?.node.data.label ?? target}」`,
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

      if (node.type === 'condition') {
        applyConditionBranch(node, Boolean(output.data?.passed))
      }

      if (agent) {
        const memoryText = `${node.data.label}：${output.markdown ?? output.text ?? output.verdict?.issues.join('；') ?? ''}`
        rememberAgentMemory({
          agentId: agent.id,
          projectId: project.id,
          runId,
          nodeId: node.id,
          text: memoryText,
        })
      }

      saveRunCheckpoint(runId, node.id, {
        loopCount,
        feedback,
        totalCost,
        totalTokens,
        nodes: [...states.values()].map((item) => ({
          nodeId: item.node.id,
          status: item.status,
          score: item.score,
          iteration: item.iteration,
          output: item.output,
        })),
      })

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

  const agentCapacity = (agentId?: string) => {
    if (!agentId) return 1
    return Math.max(1, agents.find((agent) => agent.id === agentId)?.capacity ?? 1)
  }
  const agentLoad = (agentId?: string) => {
    if (!agentId) return 0
    return [...running.keys()].filter((nodeId) => states.get(nodeId)?.node.data.agentId === agentId).length
  }

  try {
    let pausedNotice = false
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
      if (pausedRuns.has(runId)) {
        if (!pausedNotice) {
          pausedNotice = true
          emit('run.paused', '运行已暂停，等待人工继续', { running: running.size })
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
        continue
      }
      pausedNotice = false
      if (fatalError) break

      const ready = [...states.values()]
        .filter((state) => {
          if (state.status !== 'pending') return false
          if (!deps.get(state.node.id)?.every((dep) => ['completed', 'skipped'].includes(states.get(dep)?.status ?? ''))) return false
          // Load-aware: a node waits if its agent already has `capacity` running nodes.
          return agentLoad(state.node.data.agentId) < agentCapacity(state.node.data.agentId)
        })
        .sort((a, b) => {
          const depthDiff = depth(b.node.id) - depth(a.node.id)
          if (depthDiff !== 0) return depthDiff
          const loadDiff = agentLoad(a.node.data.agentId) - agentLoad(b.node.data.agentId)
          if (loadDiff !== 0) return loadDiff
          return a.node.position.x - b.node.position.x
        })

      while (ready.length > 0 && running.size < maxConcurrency) {
        const state = ready.shift()!
        state.status = 'queued'
        emit('node.queued', `${state.node.data.label} 进入调度队列`, {
          priority: depth(state.node.id),
          running: running.size,
          agentLoad: agentLoad(state.node.data.agentId),
          agentCapacity: agentCapacity(state.node.data.agentId),
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
