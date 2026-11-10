/**
 * Live-model evidence harness.
 *
 * Requires a running API and an API key (set via the settings page or
 * AGENTLOOM_API_KEY). It switches to live, runs N fixed tasks, records
 * latency / tokens / cost / score / loop count, then restores Mock.
 *
 *   BASE=http://127.0.0.1:8899 RUNS=3 node scripts/live-evidence.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const base = (process.env.BASE || 'http://127.0.0.1:8899').replace(/\/$/, '')
const runs = Math.max(1, Number(process.env.RUNS || 3))
const input =
  process.env.INPUT ||
  '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。'

async function json(url, init) {
  const response = await fetch(base + url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${url} ${response.status}: ${text.slice(0, 240)}`)
  return text ? JSON.parse(text) : {}
}

const config = await json('/api/config')
if (!config.hasKey) {
  const message = [
    '# Live 模型证据',
    '',
    '状态：**未执行**。当前服务进程没有 `AGENTLOOM_API_KEY`。',
    '',
    '复跑：在设置页填入 DeepSeek Key，或启动服务时设置 `AGENTLOOM_API_KEY`，然后运行：',
    '',
    '```bash',
    'BASE=http://127.0.0.1:8899 RUNS=3 node scripts/live-evidence.mjs',
    '```',
    '',
  ].join('\n')
  fs.mkdirSync('docs', { recursive: true })
  fs.writeFileSync(path.join('docs', 'live-evidence.md'), message)
  console.log(message)
  process.exit(2)
}

await json('/api/config', { method: 'POST', body: JSON.stringify({ mode: 'live' }) })
const results = []
try {
  for (let index = 0; index < runs; index += 1) {
    const started = Date.now()
    const created = await json('/api/runs', { method: 'POST', body: JSON.stringify({ input }) })
    let detail
    while (true) {
      detail = await json(`/api/runs/${created.run.id}`)
      if (['completed', 'failed', 'cancelled'].includes(detail.run.status)) break
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    results.push({
      id: created.run.id,
      status: detail.run.status,
      ms: Date.now() - started,
      score: detail.run.score ?? 0,
      loops: detail.run.loops ?? 0,
      tokens: detail.run.tokens ?? 0,
      cost: detail.run.cost ?? 0,
      toolCalls: detail.events.filter((event) => event.type === 'tool.call').length,
      error: detail.run.error,
    })
    console.log(`live ${index + 1}/${runs}: ${detail.run.status} · ${Date.now() - started}ms · score=${detail.run.score} · loops=${detail.run.loops}`);
  }
} finally {
  await json('/api/config', { method: 'POST', body: JSON.stringify({ mode: 'mock' }) }).catch(() => undefined)
}

const report = { base, model: config.model, runs: results, generatedAt: new Date().toISOString() }
fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(path.join('docs', 'live-evidence.json'), JSON.stringify(report, null, 2))
const lines = [
  '# Live 模型证据',
  '',
  `- 环境：${base}`,
  `- 模型：${config.model}`,
  `- 时间：${report.generatedAt}`,
  '',
  '| 运行 | 状态 | 延迟 | 核查分 | 回环 | Tokens | 成本 | 工具调用 |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
  ...results.map(
    (item) =>
      `| ${item.id} | ${item.status} | ${item.ms}ms | ${item.score} | ${item.loops} | ${item.tokens} | $${item.cost.toFixed(4)} | ${item.toolCalls} |`,
  ),
  '',
  '> 这是真实模型调用记录；Mock 数字不替代本表。',
  '',
]
fs.writeFileSync(path.join('docs', 'live-evidence.md'), lines.join('\n'))
console.log(lines.join('\n'))
