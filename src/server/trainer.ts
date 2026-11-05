/**
 * Agent-level training.
 *
 * One agent, one fixed eval set, several prompt candidates, scored by the same
 * rule-based verifier a run uses. The winner is stored as a prompt version and
 * can be activated (or rolled back) without touching the scheduler.
 */
import type { Agent, EvalCase, Mode, TrainingCandidate } from '../shared/types.js'
import { getAgent, getWorkflow, listEvalCases, updateTrainingRun } from './db.js'
import { runAgentNode, scoreAgentOutput, type AgentContext, type Evidence } from './llm.js'

type Strategy = { id: string; label: string; rationale: string; directive: string }

/**
 * Candidate prompts. Each one is the agent's current prompt plus one explicit
 * constraint the verifier can actually measure — no mystery meat.
 */
const STRATEGIES: Strategy[] = [
  { id: 'baseline', label: '当前提示词', rationale: '不改动，作为基线', directive: '' },
  {
    id: 'cite',
    label: '强制引用',
    rationale: '每条结论必须带证据编号',
    directive: '硬性要求：每条结论必须带引用编号（例如 [M1]）。没有编号的结论不允许出现。',
  },
  {
    id: 'numbers',
    label: '数字只取证据',
    rationale: '禁止出现证据里没有的数字',
    directive: '硬性要求：只允许使用证据原文中出现过的数字，证据里没有的数字一律不写。',
  },
  {
    id: 'hedge',
    label: '去掉模糊词',
    rationale: '把“约 / 可能 / 预计”换成明确判断',
    directive: '硬性要求：不要使用“约”“可能”“预计”这类模糊表述，直接给出判断。',
  },
  {
    id: 'combined',
    label: '引用 + 证据数字',
    rationale: '两条硬约束叠加，最接近可交付要求',
    directive:
      '硬性要求：每条结论必须带引用编号（例如 [M1]）；只允许使用证据原文中出现过的数字，证据里没有的数字一律不写。',
  },
]

function buildContext(agent: Agent, prompt: string, evalCase: EvalCase, mode: Mode): AgentContext {
  const evidence: Evidence[] = evalCase.fixture.evidence.map((item) => ({
    ref: item.ref,
    docId: item.docId,
    docTitle: item.docTitle,
    quote: item.quote,
    score: item.score ?? 0.8,
  }))

  return {
    agent: { ...agent, systemPrompt: prompt },
    nodeId: agent.id,
    input: evalCase.input,
    upstream: evalCase.fixture.upstream.map((item) => ({
      nodeId: item.nodeId,
      title: item.title,
      output: {
        ...(item.data !== undefined ? { data: item.data } : {}),
        ...(item.text !== undefined ? { text: item.text, markdown: item.text } : {}),
        ...(item.citations !== undefined ? { citations: item.citations } : {}),
        ...(item.verdict !== undefined ? { verdict: item.verdict } : {}),
      },
    })),
    evidence,
    feedback: evalCase.fixture.feedback,
    iteration: evalCase.fixture.iteration ?? 0,
    mode,
  }
}

/** Scores every prompt candidate against the agent's eval set. */
export async function executeTraining(runId: string, agentId: string, mode: Mode): Promise<void> {
  const agent = getAgent(agentId)
  if (!agent) {
    updateTrainingRun(runId, { status: 'failed', error: 'Agent 不存在。', finishedAt: new Date().toISOString() })
    return
  }

  const cases = listEvalCases(agentId)
  if (cases.length === 0) {
    updateTrainingRun(runId, {
      status: 'failed',
      error: '这个节点还没有评测集，先为它配置固定的评测任务。',
      finishedAt: new Date().toISOString(),
    })
    return
  }

  const threshold = getWorkflow().settings.verifyThreshold

  try {
    let cost = 0
    let tokens = 0
    const candidates: TrainingCandidate[] = []

    for (const strategy of STRATEGIES) {
      const prompt = strategy.directive ? `${agent.systemPrompt}\n\n${strategy.directive}` : agent.systemPrompt
      const scores: number[] = []
      let candidateTokens = 0

      for (const evalCase of cases) {
        const ctx = buildContext(agent, prompt, evalCase, mode)
        const output = await runAgentNode(ctx, threshold)
        const verdict = scoreAgentOutput(output, ctx, threshold)
        scores.push(verdict.score)

        const used = (output.usage?.promptTokens ?? 0) + (output.usage?.completionTokens ?? 0)
        candidateTokens += used
        tokens += used
        cost += output.usage?.cost ?? 0
      }

      const average = scores.length === 0 ? 0 : Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3))
      candidates.push({
        id: strategy.id,
        label: strategy.label,
        rationale: strategy.rationale,
        prompt,
        scores: scores.map((score) => Number(score.toFixed(3))),
        average,
        tokens: candidateTokens,
      })

      // Publish partial results so the UI can show progress while training.
      updateTrainingRun(runId, { candidates, cost, tokens })
    }

    const baseline = candidates[0]?.average ?? 0
    const best = candidates.reduce((top, candidate) => Math.max(top, candidate.average), 0)

    updateTrainingRun(runId, {
      status: 'done',
      candidates,
      baseline,
      best,
      cost: Number(cost.toFixed(5)),
      tokens,
      finishedAt: new Date().toISOString(),
    })
  } catch (error) {
    updateTrainingRun(runId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    })
  }
}
