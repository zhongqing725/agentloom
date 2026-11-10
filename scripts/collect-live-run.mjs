/**
 * Collect an already-running live run into the evidence files.
 * Useful when the client command is interrupted but the server run continues.
 *
 *   RUN_ID=run-xxxx node scripts/collect-live-run.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const base = (process.env.BASE || 'http://127.0.0.1:8899').replace(/\/$/, '')
const id = process.env.RUN_ID
if (!id) throw new Error('RUN_ID is required')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let detail
for (;;) {
  const response = await fetch(`${base}/api/runs/${id}`)
  detail = await response.json()
  if (['completed', 'failed', 'cancelled'].includes(detail.run.status)) break
  await sleep(3000)
}

const toolByNode = {}
for (const event of detail.events) {
  if (event.type === 'tool.call') toolByNode[event.nodeId] = (toolByNode[event.nodeId] || 0) + 1
}
const nodeRows = detail.nodes.map((node) => {
  const ms = node.startedAt && node.finishedAt ? Date.parse(node.finishedAt) - Date.parse(node.startedAt) : 0
  return `| ${node.nodeId} | ${node.status} | ${ms}ms | ${node.tokens} | ${node.score ?? '—'} | ${node.iteration} |`
})
const report = {
  base,
  run: detail.run,
  toolCalls: Object.values(toolByNode).reduce((sum, value) => sum + value, 0),
  toolByNode,
  generatedAt: new Date().toISOString(),
}
fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(path.join('docs', 'live-evidence.json'), JSON.stringify(report, null, 2))
const lines = [
  '# Live 模型证据',
  '',
  `- 环境：${base}`,
  `- 运行：${detail.run.id}`,
  `- 模型：${detail.run.mode} / ${detail.run.model ?? 'deepseek-chat'}`,
  `- 状态：${detail.run.status}`,
  `- 核查分：${detail.run.score ?? '—'}`,
  `- 回环：${detail.run.loops ?? 0}`,
  `- Tokens：${detail.run.tokens}`,
  `- 成本：$${Number(detail.run.cost ?? 0).toFixed(4)}`,
  `- 工具调用：${report.toolCalls}`,
  '',
  '| 节点 | 状态 | 耗时 | Tokens | 分数 | 轮次 |',
  '|---|---|---:|---:|---:|---:|',
  ...nodeRows,
  '',
  '> 真实模型调用；Mock 数字不替代本表。',
  '',
]
fs.writeFileSync(path.join('docs', 'live-evidence.md'), lines.join('\n'))
console.log(lines.join('\n'))
