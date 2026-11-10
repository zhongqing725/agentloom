/**
 * Minimal A2A (Agent-to-Agent) surface.
 *
 * Implements the parts a remote agent needs to discover and delegate to this
 * platform: an Agent Card plus JSON-RPC `message/send` and `tasks/get`.
 * It is deliberately a compatible subset, not a full A2A SDK.
 */
import crypto from 'node:crypto'
import type { Mode } from '../shared/types.js'
import { createRun, getRun } from './db.js'
import { cancelRun, executeRun } from './engine.js'

export function agentCard(mode: Mode) {
  const base = (process.env.AGENTLOOM_PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 8787}`).replace(/\/$/, '')
  return {
    name: '织序 AgentLoom',
    description: '可验证的多 Agent 研究编排平台：规划、并行研究、发散收敛、证据核查与定向回环。',
    url: `${base}/a2a`,
    version: '0.1.0',
    protocolVersion: '0.2.5',
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/markdown', 'application/json'],
    skills: [
      {
        id: 'verified-research',
        name: '可验证产业研究',
        description: '多 Agent 并行研究，输出带证据编号、四态核查与证据账本的研究报告。',
        tags: ['research', 'multi-agent', 'verification'],
        examples: ['生成一份 AI 眼镜产业链投研报告，重点回答市场空间、价值链、竞争与风险。'],
      },
    ],
    metadata: { mode },
  }
}

interface A2ARequest {
  jsonrpc?: string
  id?: string | number
  method?: string
  params?: Record<string, unknown>
}

function textFromMessage(params: Record<string, unknown>): string {
  const message = params.message as { parts?: Array<{ kind?: string; type?: string; text?: string }> } | undefined
  const parts = message?.parts ?? []
  return parts
    .map((part) => (part.kind === 'text' || part.type === 'text' ? String(part.text ?? '') : ''))
    .join('\n')
    .trim()
}

function taskOf(runId: string, contextId?: string) {
  const run = getRun(runId)
  if (!run) return undefined
  const state =
    run.status === 'completed'
      ? 'completed'
      : run.status === 'failed' || run.status === 'cancelled'
        ? 'failed'
        : run.status === 'queued'
          ? 'submitted'
          : 'working'
  return {
    kind: 'task',
    id: run.id,
    contextId: contextId ?? run.id,
    status: { state, timestamp: new Date().toISOString() },
    artifacts:
      run.status === 'completed' && run.output
        ? [{ artifactId: `${run.id}-report`, name: '研究报告', parts: [{ kind: 'text', text: run.output }] }]
        : [],
    metadata: { mode: run.mode, score: run.score, loops: run.loops ?? 0, tokens: run.tokens },
  }
}

export async function handleA2A(body: A2ARequest, mode: Mode) {
  const id = body.id ?? crypto.randomUUID()
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const error = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

  if (body.method === 'message/send' || body.method === 'message/stream') {
    const params = body.params ?? {}
    const input = textFromMessage(params)
    if (!input) return error(-32602, 'message.parts 中没有 text。')
    const contextId = String((params.message as { contextId?: string } | undefined)?.contextId ?? crypto.randomUUID())
    const run = createRun(input, mode)
    // A2A returns a task immediately; the run continues in this process.
    void executeRun(run.id).catch((cause) => console.warn('[a2a] run failed', cause))
    return reply(taskOf(run.id, contextId))
  }

  if (body.method === 'tasks/get') {
    const params = body.params ?? {}
    const taskId = String(params.id ?? '')
    const task = taskOf(taskId, typeof params.contextId === 'string' ? params.contextId : undefined)
    return task ? reply(task) : error(-32001, '任务不存在。')
  }

  if (body.method === 'tasks/cancel') {
    const params = body.params ?? {}
    const taskId = String(params.id ?? '')
    if (!getRun(taskId)) return error(-32001, '任务不存在。')
    cancelRun(taskId)
    return reply(taskOf(taskId, typeof params.contextId === 'string' ? params.contextId : undefined))
  }

  return error(-32601, `未知方法：${body.method ?? ''}`)
}
