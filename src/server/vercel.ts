import type { IncomingMessage, ServerResponse } from 'node:http'

// 无服务器入口：先定好运行环境，再加载现有 Fastify 应用（它在导入时建库、挂路由）。
process.env.VERCEL ??= '1'
process.env.AGENTLOOM_DB ||= '/tmp/agentloom/agentloom.db'

const { app } = await import('./index.js')

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await app.ready()
  app.server.emit('request', request, response)
}
