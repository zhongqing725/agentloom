/**
 * MCP stdio smoke test: starts the bundled demo MCP server, lists its tools,
 * and calls one through the same invokeTool path the agents use.
 */
import assert from 'node:assert/strict'

process.env.AGENTLOOM_MCP_SERVERS = JSON.stringify([
  { name: 'demo', command: process.execPath, args: ['scripts/mcp-demo-server.mjs'] },
])

const mcp = await import('../src/server/mcp.js')
const tools = await import('../src/server/tools.js')

try {
  await mcp.startMcpServers()
  const specs = mcp.mcpToolSpecs()
  assert.ok(specs.some((spec) => spec.name === 'mcp__demo__echo'), 'MCP echo tool should be listed')
  const call = await tools.invokeTool('mcp__demo__echo', { text: 'mcp ping' })
  assert.equal(call.error, undefined, `MCP call error: ${call.error}`)
  assert.match(String(call.result), /mcp ping/)
  const now = await tools.invokeTool('mcp__demo__now', {})
  assert.equal(now.error, undefined, `MCP now error: ${now.error}`)
  console.log('mcp ok · tools=' + specs.map((spec) => spec.name).join(','))
} finally {
  mcp.stopMcpServers()
}
