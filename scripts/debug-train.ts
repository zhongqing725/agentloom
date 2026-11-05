import { getAgent, initDb, listEvalCases } from '../src/server/db.js'
import { runAgentNode, scoreAgentOutput, type AgentContext } from '../src/server/llm.js'

initDb()
const agent = getAgent('agent-writer')
if (!agent) throw new Error('no writer')
const cases = listEvalCases('agent-writer')
const evalCase = cases[0]

const directive = '硬性要求：只允许使用证据原文中出现过的数字，证据里没有的数字一律不写。'
const ctx: AgentContext = {
  agent: { ...agent, systemPrompt: `${agent.systemPrompt}\n\n${directive}` },
  nodeId: agent.id,
  input: evalCase.input,
  upstream: evalCase.fixture.upstream.map((item) => ({
    nodeId: item.nodeId,
    title: item.title,
    output: {
      ...(item.data !== undefined ? { data: item.data } : {}),
      ...(item.text !== undefined ? { text: item.text, markdown: item.text } : {}),
      ...(item.citations !== undefined ? { citations: item.citations } : {}),
    },
  })),
  evidence: evalCase.fixture.evidence.map((item) => ({
    ref: item.ref,
    docId: item.docId,
    docTitle: item.docTitle,
    quote: item.quote,
    score: item.score ?? 0.8,
  })),
  feedback: evalCase.fixture.feedback,
  iteration: evalCase.fixture.iteration ?? 0,
  mode: 'mock',
}

const output = await runAgentNode(ctx, 0.9)
const verdict = scoreAgentOutput(output, ctx, 0.9)
console.log('fixture evidence', evalCase.fixture.evidence.length)
console.log('ctx evidence', ctx.evidence.length)
console.log('upstream citations', ctx.upstream[0]?.output.citations?.length)
console.log('output citations', output.citations?.length)
console.log('score', verdict.score, 'claims', verdict.claims?.length)
console.log('--- markdown ---')
console.log(output.markdown)
