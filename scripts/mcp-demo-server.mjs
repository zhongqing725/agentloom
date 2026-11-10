#!/usr/bin/env node
/**
 * Demo MCP server for AgentLoom (stdio, newline-delimited JSON-RPC).
 * Run via:
 * AGENTLOOM_MCP_SERVERS='[{"name":"demo","command":"node","args":["scripts/mcp-demo-server.mjs"]}]'
 */
import readline from 'node:readline'

const tools = [
  {
    name: 'now',
    description: '返回当前服务器时间的 ISO 字符串',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'echo',
    description: '原样返回 text 参数，用于验证 MCP 往返',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: ['text'],
    },
  },
]

const send = (message) => process.stdout.write(JSON.stringify(message) + '\n')

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.id === undefined || message.id === null) return
  const reply = (result) => send({ jsonrpc: '2.0', id: message.id, result })
  const fail = (code, text) => send({ jsonrpc: '2.0', id: message.id, error: { code, message: text } })

  if (message.method === 'initialize') {
    reply({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'agentloom-demo-mcp', version: '0.1.0' },
    })
    return
  }
  if (message.method === 'tools/list') {
    reply({ tools })
    return
  }
  if (message.method === 'tools/call') {
    const name = message.params?.name
    const args = message.params?.arguments ?? {}
    if (name === 'now') {
      reply({ content: [{ type: 'text', text: new Date().toISOString() }] })
      return
    }
    if (name === 'echo') {
      reply({ content: [{ type: 'text', text: String(args.text ?? '') }] })
      return
    }
    fail(-32601, `未知工具 ${name}`)
    return
  }
  fail(-32601, `未知方法 ${message.method}`)
})
