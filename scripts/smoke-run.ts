/**
 * End-to-end smoke test: seed a throwaway DB, run one mock workflow, and assert
 * the three things the demo depends on — a loop fires, a tool really executes,
 * and the second pass clears the verifier.
 *
 *   pnpm smoke
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dbPath = path.join(os.tmpdir(), `agentloom-smoke-${process.pid}.db`)
process.env.AGENTLOOM_DB = dbPath
process.env.AGENTLOOM_MODE = 'mock'
process.env.AGENTLOOM_MOCK_DELAY = '0'

const db = await import('../src/server/db.js')
const { executeRun } = await import('../src/server/engine.js')

function cleanup() {
  try {
    db.getDb().close()
  } catch {
    // already closed
  }
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true })
  }
}

try {
  db.initDb()

  const { invokeTool } = await import('../src/server/tools.js')
  const math = await invokeTool('calculator', { expression: '(1+2)*3/2' })
  assert.equal((math.result as { value: number }).value, 4.5)
  const rejected = await invokeTool('calculator', { expression: 'process.exit()' })
  assert.ok(rejected.error, 'calculator must reject non-arithmetic input')
  const search = await invokeTool('knowledge_search', { query: '出货量' })
  assert.ok(Array.isArray(search.result) && search.result.length > 0, 'knowledge_search should hit the seed corpus')

  const created = db.createRun('冒烟测试：验证回环、工具调用与终稿', 'mock')
  await executeRun(created.id)

  const run = db.getRun(created.id)
  assert.ok(run, 'run should exist')
  assert.equal(run.status, 'completed', `run status: ${run.status} ${run.error ?? ''}`)
  assert.ok((run.score ?? 0) >= 0.9, `final score ${run.score} should clear 0.9`)
  assert.ok(run.graph?.nodes.length, 'run should snapshot the workflow graph')

  const detail = db.getRunDetail(created.id)
  assert.ok(detail, 'run detail should exist')
  const loops = detail.events.filter((event) => event.type === 'loop.triggered')
  const toolCalls = detail.events.filter((event) => event.type === 'tool.call')
  assert.ok(loops.length >= 1, 'at least one Self-Loop should fire')
  assert.ok(toolCalls.length >= 1, 'at least one tool call should execute')
  assert.match(run.output ?? '', /\[[A-Z]\d+\]/, 'final report should carry citations')

  const latestNode = (nodeId: string) =>
    detail.nodes.filter((node) => node.nodeId === nodeId).sort((a, b) => a.iteration - b.iteration).at(-1)
  assert.ok(latestNode('planner')?.output?.pluginReports?.some((report) => report.id === 'cognition.decompose'), 'planner should run 任务分解')
  assert.ok(latestNode('writer')?.output?.pluginReports?.some((report) => report.id === 'cognition.critique'), 'writer should run 自我批判')
  assert.ok((latestNode('verifier')?.output?.pluginReports?.length ?? 0) >= 3, 'verifier should run its three verification plugins')

  console.log(
    `smoke ok · score=${run.score} · loops=${loops.length} · tools=${toolCalls.length} · tokens=${run.tokens}`,
  )
} finally {
  cleanup()
}
