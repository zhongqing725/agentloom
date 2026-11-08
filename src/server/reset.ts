import fs from 'node:fs'
import path from 'node:path'

// Only delete the database files. `data/` also holds the verifier benchmark and
// source snapshots; wiping the whole directory made `pnpm reset` destroy them.
const dbPath = process.env.AGENTLOOM_DB
  ? path.resolve(process.env.AGENTLOOM_DB)
  : path.join(path.resolve(process.cwd(), 'data'), 'agentloom.db')

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true })
}

const { initDb, getBootstrap } = await import('./db.js')
initDb()
const bootstrap = getBootstrap('mock')

console.log(`已重置演示数据：${bootstrap.documents.length} 篇资料 / ${bootstrap.agents.length} 个 Agent / ${bootstrap.workflow.graph.nodes.length} 个节点`)
