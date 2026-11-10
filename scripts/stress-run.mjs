/**
 * Concurrency / latency stress test against a running AgentLoom API.
 *
 *   BASE=http://127.0.0.1:8899 RUNS=12 node scripts/stress-run.mjs
 *
 * Writes docs/stress-report.json and docs/stress-report.md. Mock mode is the
 * reproducible baseline; run it again with AGENTLOOM_MODE=live + a key for the
 * real-model numbers.
 */
import fs from 'node:fs'
import path from 'node:path'

const base = (process.env.BASE || 'http://127.0.0.1:8899').replace(/\/$/, '')
const runs = Math.max(2, Number(process.env.RUNS || 12))
const concurrency = Math.max(1, Number(process.env.PARALLEL || 4))

async function json(url, init) {
  const response = await fetch(base + url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${url} ${response.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : {}
}

async function getBootstrap() {
  return json('/api/bootstrap')
}

async function setMaxConcurrency(value, bootstrap) {
  const settings = { ...bootstrap.workflow.settings, maxConcurrency: value }
  return json('/api/workflow', { method: 'PUT', body: JSON.stringify({ settings }) })
}

async function waitRun(id, timeoutMs = 120000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const detail = await json(`/api/runs/${id}`)
    if (['completed', 'failed', 'cancelled'].includes(detail.run.status)) return detail
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
  throw new Error(`run ${id} timeout`)
}

async function runOne(index, label) {
  const started = Date.now()
  const created = await json('/api/runs', {
    method: 'POST',
    body: JSON.stringify({ input: `${label} #${index}：请生成一份 AI 眼镜产业链投研摘要，必须带证据与核查。` }),
  })
  const detail = await waitRun(created.run.id)
  return {
    id: created.run.id,
    ms: Date.now() - started,
    status: detail.run.status,
    score: detail.run.score ?? 0,
    loops: detail.run.loops ?? 0,
    tokens: detail.run.tokens ?? 0,
    nodes: detail.nodes.length,
    toolCalls: detail.events.filter((event) => event.type === 'tool.call').length,
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}

function summarize(label, results) {
  const ok = results.filter((item) => item.status === 'completed')
  const latencies = results.map((item) => item.ms)
  return {
    label,
    runs: results.length,
    completed: ok.length,
    successRate: Number(((ok.length / Math.max(1, results.length)) * 100).toFixed(1)),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    avgMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length)),
    avgScore: Number((ok.reduce((sum, item) => sum + item.score, 0) / Math.max(1, ok.length)).toFixed(3)),
    avgTokens: Math.round(ok.reduce((sum, item) => sum + item.tokens, 0) / Math.max(1, ok.length)),
    toolCalls: ok.reduce((sum, item) => sum + item.toolCalls, 0),
  }
}

const bootstrap = await getBootstrap()
const originalConcurrency = bootstrap.workflow.settings.maxConcurrency
const results = []

try {
  await setMaxConcurrency(1, bootstrap)
  const serial = await Promise.all(Array.from({ length: Math.min(4, runs) }, (_, index) => runOne(index + 1, 'serial')))
  results.push(summarize('serial-maxConcurrency-1', serial))

  await setMaxConcurrency(Math.max(2, concurrency), bootstrap)
  const batches = []
  for (let offset = 0; offset < runs; offset += concurrency) {
    const batch = Array.from({ length: Math.min(concurrency, runs - offset) }, (_, index) =>
      runOne(offset + index + 1, 'parallel'),
    )
    batches.push(...(await Promise.all(batch)))
  }
  results.push(summarize(`parallel-maxConcurrency-${Math.max(2, concurrency)}`, batches))
} finally {
  await setMaxConcurrency(originalConcurrency, bootstrap).catch(() => undefined)
}

const report = { base, mode: bootstrap.mode, runs, concurrency, generatedAt: new Date().toISOString(), results }
fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(path.join('docs', 'stress-report.json'), JSON.stringify(report, null, 2))
const lines = [
  '# 压力 / 并发测试报告',
  '',
  `- 环境：${base}`,
  `- 模式：${bootstrap.mode}`,
  `- 时间：${report.generatedAt}`,
  `- 样本：串行 ${Math.min(4, runs)} 次；并行 ${runs} 次，客户端并发 ${concurrency}`,
  '',
  '| 组 | 运行数 | 成功率 | p50 | p95 | 平均分 | 平均 Tokens | 工具调用 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...results.map(
    (item) =>
      `| ${item.label} | ${item.runs} | ${item.successRate}% | ${item.p50Ms}ms | ${item.p95Ms}ms | ${item.avgScore} | ${item.avgTokens} | ${item.toolCalls} |`,
  ),
  '',
  '> Mock 模式的延迟由固定模拟延迟主导，用于验证调度/并发链路；真实模型数字需要 Live 模式复跑。',
  '',
]
fs.writeFileSync(path.join('docs', 'stress-report.md'), lines.join('\n'))
console.log(lines.join('\n'))
