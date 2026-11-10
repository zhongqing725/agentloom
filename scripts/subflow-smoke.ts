/**
 * Sub-workflow smoke test: insert a `subflow` node between input and planner,
 * run the parent, and assert the child run completed.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dbPath = path.join(os.tmpdir(), `agentloom-subflow-${process.pid}.db`)
process.env.AGENTLOOM_DB = dbPath
process.env.AGENTLOOM_MODE = 'mock'
process.env.AGENTLOOM_MOCK_DELAY = '0'

const db = await import('../src/server/db.js')
const { executeRun } = await import('../src/server/engine.js')

try {
  db.initDb()
  const workflow = db.getWorkflow()
  const subflowNodeId = 'subflow-review'
  const nodes = [
    ...workflow.graph.nodes.filter((node) => node.id !== subflowNodeId),
    {
      id: subflowNodeId,
      type: 'subflow' as const,
      position: { x: 90, y: 160 },
      data: {
        label: '单角色复核',
        subtitle: '子工作流',
        kind: 'subflow' as const,
        subflowWorkflowId: 'workflow-review',
      },
    },
  ]
  const edges = [
    ...workflow.graph.edges.filter((edge) => edge.id !== 'e-input-planner'),
    { id: 'e-input-subflow', source: 'input', target: subflowNodeId, kind: 'flow' as const },
    { id: 'e-subflow-planner', source: subflowNodeId, target: 'planner', kind: 'flow' as const },
  ]
  db.updateWorkflow({ graph: { nodes, edges } })

  const run = db.createRun('子工作流冒烟：先复核，再进入主流程', 'mock')
  await executeRun(run.id)
  const detail = db.getRunDetail(run.id)
  assert.ok(detail, 'parent detail should exist')
  assert.equal(detail.run.status, 'completed', `parent status ${detail.run.status} ${detail.run.error ?? ''}`)
  const subflow = detail.nodes.filter((node) => node.nodeId === subflowNodeId).at(-1)
  assert.ok(subflow, 'subflow node should run')
  const childId = String(subflow.output?.data?.subflowRunId ?? '')
  assert.ok(childId, 'subflow node should expose childRunId')
  const child = db.getRun(childId)
  assert.equal(child?.status, 'completed', 'child run should complete')
  console.log(`subflow ok · parent=${detail.run.score} · child=${childId} · childStatus=${child?.status}`)
} finally {
  try {
    db.getDb().close()
  } catch {}
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true })
}
