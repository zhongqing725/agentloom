/**
 * Minimal MCP stdio client.
 *
 * Supports the subset AgentLoom needs: initialize, tools/list, tools/call.
 * One child process per configured server; tools are exposed as
 * `mcp__<server>__<tool>` and fed to the same function-calling loop as local
 * tools. Disabled on Vercel (no child processes).
 *
 * Configure with:
 * AGENTLOOM_MCP_SERVERS='[{"name":"demo","command":"node","args":["scripts/mcp-demo-server.mjs"]}]'
 */
import { spawn, type ChildProcess } from 'node:child_process'
import readline from 'node:readline'
import type { ToolSpec } from './tools.js'

interface McpServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface ServerState {
  config: McpServerConfig
  child: ChildProcess
  pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>
  tools: McpTool[]
  nextId: number
}

const servers = new Map<string, ServerState>()
const remoteTools = new Map<string, { server: string; tool: string; spec: ToolSpec }>()

function parseConfigs(): McpServerConfig[] {
  const raw = process.env.AGENTLOOM_MCP_SERVERS?.trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is McpServerConfig =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as McpServerConfig).name === 'string' &&
        typeof (item as McpServerConfig).command === 'string',
    )
  } catch {
    return []
  }
}

function send(state: ServerState, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const id = state.nextId++
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id)
      reject(new Error(`MCP ${state.config.name} 超时：${method}`))
    }, 8000)
    state.pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
    })
    state.child.stdin?.write(payload)
  })
}

function notify(state: ServerState, method: string, params: Record<string, unknown> = {}) {
  state.child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

async function startOne(config: McpServerConfig): Promise<void> {
  const child = spawn(config.command, config.args ?? [], {
    cwd: config.cwd ?? process.cwd(),
    env: { ...process.env, ...(config.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const state: ServerState = { config, child, pending: new Map(), tools: [], nextId: 1 }
  servers.set(config.name, state)

  readline.createInterface({ input: child.stdout! }).on('line', (line) => {
    if (!line.trim()) return
    let message: { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: unknown }
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (typeof message.id === 'number') {
      const pending = state.pending.get(message.id)
      if (!pending) return
      state.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message ?? 'MCP 调用失败'))
      else pending.resolve(message.result)
    }
  })

  child.stderr?.on('data', (chunk) => {
    const text = String(chunk).trim()
    if (text) console.warn(`[mcp:${config.name}] ${text.slice(0, 240)}`)
  })
  child.on('exit', (code) => {
    for (const pending of state.pending.values()) pending.reject(new Error(`MCP ${config.name} 已退出`))
    state.pending.clear()
    for (const [name, entry] of remoteTools) if (entry.server === config.name) remoteTools.delete(name)
    servers.delete(config.name)
    if (code && code !== 0) console.warn(`[mcp:${config.name}] exited ${code}`)
  })

  await send(state, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'agentloom', version: '0.1.0' },
  })
  notify(state, 'notifications/initialized')
  const listed = (await send(state, 'tools/list')) as { tools?: McpTool[] } | undefined
  state.tools = listed?.tools ?? []

  for (const tool of state.tools) {
    const exposed = `mcp__${config.name}__${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
    const spec: ToolSpec = {
      name: exposed,
      description: `[MCP:${config.name}] ${tool.description ?? tool.name}`,
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
      run: (args) => callMcpTool(exposed, args),
    }
    remoteTools.set(exposed, { server: config.name, tool: tool.name, spec })
  }
}

export async function startMcpServers(): Promise<void> {
  if (process.env.VERCEL) return
  const configs = parseConfigs()
  if (configs.length === 0) return
  await Promise.all(
    configs.map(async (config) => {
      try {
        await startOne(config)
      } catch (error) {
        console.warn(`[mcp:${config.name}] 启动失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }),
  )
}

export function mcpToolSpecs(): ToolSpec[] {
  return [...remoteTools.values()].map((entry) => entry.spec)
}

export function mcpStatus(): Array<{ name: string; tools: string[] }> {
  return [...servers.values()].map((state) => ({
    name: state.config.name,
    tools: state.tools.map((tool) => tool.name),
  }))
}

export async function callMcpTool(exposed: string, args: Record<string, unknown>): Promise<unknown> {
  const entry = remoteTools.get(exposed)
  if (!entry) throw new Error(`未知 MCP 工具：${exposed}`)
  const state = servers.get(entry.server)
  if (!state) throw new Error(`MCP 服务未连接：${entry.server}`)
  const result = (await send(state, 'tools/call', { name: entry.tool, arguments: args })) as {
    content?: Array<{ type?: string; text?: string }>
    isError?: boolean
  }
  const text = (result?.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
  if (result?.isError) throw new Error(text || 'MCP 工具返回错误')
  return text || result
}

export function stopMcpServers(): void {
  for (const state of servers.values()) state.child.kill()
  servers.clear()
  remoteTools.clear()
}
