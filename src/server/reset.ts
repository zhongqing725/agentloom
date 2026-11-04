import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.cwd(), 'data')
fs.rmSync(dataDir, { recursive: true, force: true })

const { initDb, getBootstrap } = await import('./db.js')
initDb()
const bootstrap = getBootstrap('mock')

console.log(`已重置演示数据：${bootstrap.documents.length} 篇资料 / ${bootstrap.agents.length} 个 Agent / ${bootstrap.workflow.graph.nodes.length} 个节点`)
