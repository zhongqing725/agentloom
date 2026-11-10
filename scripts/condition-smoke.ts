/**
 * Conditional-branch smoke test: verifier -> condition -> editor (true) /
 * writer (false). The condition is true on a passing verifier, so editor must
 * run and the false branch must not block.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dbPath = path.join(os.tmpdir(), `agentloom-condition-${process.pid}.db`)
process.env.AGENTLOOM_DB = dbPath
process.env.AGENTLOOM_MODE = 'mock'
process.env.AGENTLOOM_MOCK_DELAY = '0'

const db = await import('../src/server/db.js')
const { executeRun } = await import('../src/server/engine.js')

try {
  db.initDb()
  const workflow = db.getWorkflow()
  const graph = workflow.graph
  const conditionId = 'condition-pass'
  const nextNodes = [
    ...graph.nodes.filter((node) => node.id !== conditionId),
    {
      id: conditionId,
      type: 'condition' as const,
      position: { x: 1000, y: 470 },
      data: {
        label: '核查是否通过',
        subtitle: '条件分支',
        kind: 'condition' as const,
        condition: { sourceNodeId: 'verifier', path: 'verdict.score', op: 'gte' as const, value: 0.9 },
      },
    },
  ]
  const nextEdges = [
    ...graph.edges.filter((edge) => edge.id !== 'e-verifier-editor'),
    { id: 'e-verifier-condition', source: 'verifier', target: conditionId, kind: 'flow' as const },
    { id: 'e-condition-editor-true', source: conditionId, target: 'editor', kind: 'flow' as const, condition: 'true' as const, label: '通过' },
    { id: 'e-condition-output-false', source: conditionId, target: 'output', kind: 'flow' as const, condition: 'false' as const, label: '未通过' },
  ]
  db.updateWorkflow({ graph: { nodes: nextNodes, edges: nextEdges } })

  const run = db.createRun('条件分支冒烟：通过则进入主编', 'mock')
  await executeRun(run.id)
  const detail = db.getRunDetail(run.id)
  assert.ok(detail, 'run detail should exist')
  if (detail.run.status !== 'completed') {
    console.log(detail.events.slice(-24).map((event) => `${event.type}:${event.nodeId ?? ''}:${event.message ?? ''}`).join('\n'))
  }
  assert.equal(detail.run.status, 'completed', `status ${detail.run.status} ${detail.run.error ?? ''}`)
  const condition = detail.nodes.filter((node) => node.nodeId === conditionId).at(-1)
  assert.ok(condition, 'condition node should run')
  assert.equal(condition.output?.data?.passed, true, 'condition should be true')
  assert.ok(detail.events.some((event) => event.type === 'node.completed' && event.nodeId === conditionId))
  console.log('condition ok · score=' + detail.run.score + ' · branch=' + condition.output?.data?.passed)
} finally {
  try {
    db.getDb().close()
  } catch {}
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true })
}
