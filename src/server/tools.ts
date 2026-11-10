/**
 * Tool runtime.
 *
 * Two tools are real: a sandboxed arithmetic evaluator and the existing BM25
 * knowledge search. Agent.tools already stores plugin ids, so this file is the
 * only place that turns those ids into executable code. Live mode feeds the same
 * specs to the model as OpenAI function tools; mock mode calls them directly so
 * the offline demo still shows a real tool trace.
 */
import type { Agent, ToolCall } from '../shared/types.js'
import { getDb, getProject } from './db.js'
import { searchKnowledge } from './retrieval.js'
import { callMcpTool, mcpToolSpecs } from './mcp.js'

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

const MAX_EXPRESSION = 200

/** Recursive-descent arithmetic. No eval; the character whitelist is the boundary. */
function evaluate(expression: string): number {
  const source = expression.replace(/\s+/g, '')
  if (!source || source.length > MAX_EXPRESSION) throw new Error('表达式为空或过长。')
  if (!/^[\d+\-*/().]+$/.test(source)) throw new Error('只支持数字、+ - * / 和括号。')
  let index = 0
  const peek = () => source[index]

  function number(): number {
    const start = index
    while (index < source.length && /[\d.]/.test(source[index])) index += 1
    const value = Number(source.slice(start, index))
    if (!Number.isFinite(value)) throw new Error(`无法解析数字：${source.slice(start, index) || '空'}`)
    return value
  }

  function factor(): number {
    if (peek() === '+') {
      index += 1
      return factor()
    }
    if (peek() === '-') {
      index += 1
      return -factor()
    }
    if (peek() === '(') {
      index += 1
      const value = sum()
      if (peek() !== ')') throw new Error('括号不匹配。')
      index += 1
      return value
    }
    return number()
  }

  function product(): number {
    let value = factor()
    while (peek() === '*' || peek() === '/') {
      const op = source[index++]
      const right = factor()
      if (op === '/' && right === 0) throw new Error('除数为 0。')
      value = op === '*' ? value * right : value / right
    }
    return value
  }

  function sum(): number {
    let value = product()
    while (peek() === '+' || peek() === '-') {
      const op = source[index++]
      const right = product()
      value = op === '+' ? value + right : value - right
    }
    return value
  }

  const value = sum()
  if (index !== source.length) throw new Error(`表达式在 ${index} 处无法解析。`)
  if (!Number.isFinite(value)) throw new Error('结果不是有限数。')
  return value
}

const calculator: ToolSpec = {
  name: 'calculator',
  description: '计算算术表达式（+ - * / 括号）。所有派生数字都必须经过它，不要心算。',
  parameters: {
    type: 'object',
    properties: { expression: { type: 'string', description: '例如 3200*249/100' } },
    required: ['expression'],
  },
  run(args) {
    const expression = String(args.expression ?? '').trim()
    return { expression, value: Number(evaluate(expression).toFixed(4)) }
  },
}

const dataStats: ToolSpec = {
  name: 'data_stats',
  description: '对一组数字做确定性统计（mean / median / sum / min / max），不执行任意代码。',
  parameters: {
    type: 'object',
    properties: {
      values: { type: 'array', items: { type: 'number' }, description: '待统计的数字' },
      operation: { type: 'string', enum: ['mean', 'median', 'sum', 'min', 'max'] },
    },
    required: ['values'],
  },
  run(args) {
    const values = Array.isArray(args.values)
      ? args.values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : []
    if (values.length === 0) throw new Error('values 不能为空。')
    const operation = String(args.operation ?? 'mean')
    const sorted = [...values].sort((a, b) => a - b)
    const sum = values.reduce((total, value) => total + value, 0)
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)]
    const value =
      operation === 'sum'
        ? sum
        : operation === 'median'
          ? median
          : operation === 'min'
            ? sorted[0]
            : operation === 'max'
              ? sorted[sorted.length - 1]
              : sum / values.length
    return { operation, count: values.length, value: Number(value.toFixed(4)) }
  },
}

function assertPublicHost(url: URL) {
  // ponytail: hostname-level SSRF guard only; if this ever leaves localhost,
  // resolve DNS and pin the IP before fetching.
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error('不允许访问本地或内网地址。')
  }
}

const browserFetch: ToolSpec = {
  name: 'browser_fetch',
  description: '读取一个公开 http(s) 页面的标题与正文，返回可引用文本。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '公开页面 URL' },
      limit: { type: 'number', description: '最多返回字符数，默认 4000' },
    },
    required: ['url'],
  },
  async run(args) {
    const raw = String(args.url ?? '').trim()
    const url = new URL(raw)
    if (!/^https?:$/.test(url.protocol)) throw new Error('只支持 http/https。')
    assertPublicHost(url)
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' })
    assertPublicHost(new URL(response.url))
    if (!response.ok) throw new Error(`页面请求失败：${response.status}`)
    const html = (await response.text()).slice(0, 400_000)
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const limit = Math.max(200, Math.min(Number(args.limit ?? 4000), 8000))
    return { url: url.toString(), title, text: text.slice(0, limit) }
  },
}

const knowledgeSearch: ToolSpec = {
  name: 'knowledge_search',
  description: '检索当前项目知识库，返回可引用的片段、来源与评分。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索词，中文关键词即可' },
      limit: { type: 'number', description: '返回条数，1-6' },
    },
    required: ['query'],
  },
  async run(args) {
    const query = String(args.query ?? '').trim()
    if (!query) throw new Error('query 不能为空。')
    const limit = Math.max(1, Math.min(Number(args.limit ?? 4), 6))
    const hits = await searchKnowledge(getDb(), getProject().id, query, limit)
    return hits.map((hit) => ({
      chunk: hit.chunkId,
      doc: hit.docTitle,
      text: hit.text.slice(0, 400),
      score: hit.score,
      vectorScore: hit.vectorScore,
    }))
  },
}

export const TOOL_REGISTRY: Record<string, ToolSpec> = {
  calculator,
  knowledge_search: knowledgeSearch,
  data_stats: dataStats,
  browser_fetch: browserFetch,
}

/** Agent.tools stores plugin ids; only these map to executable tools. */
const AGENT_TOOL_IDS: Record<string, string> = {
  'tool.calculator': 'calculator',
  'knowledge.retrieve': 'knowledge_search',
  'tool.python': 'data_stats',
  'tool.browser': 'browser_fetch',
}

export function toolsForAgent(agent: Agent): ToolSpec[] {
  // UI toggles write both arrays, but older rows may only have one; accept either.
  const ids = new Set([...agent.tools, ...agent.plugins])
  const names = [...new Set([...ids].map((id) => AGENT_TOOL_IDS[id]).filter(Boolean))]
  const local = names.map((name) => TOOL_REGISTRY[name]).filter(Boolean)
  // MCP tools are configured globally; every agent can use them when the
  // operator attaches an MCP server. No tools configured = no overhead.
  return [...local, ...mcpToolSpecs()]
}

export function openAiTools(specs: ToolSpec[]) {
  return specs.map((spec) => ({
    type: 'function',
    function: { name: spec.name, description: spec.description, parameters: spec.parameters },
  }))
}

let counter = 0

export async function invokeTool(name: string, args: Record<string, unknown>): Promise<ToolCall> {
  const started = Date.now()
  const id = `tool-${started.toString(36)}-${(counter += 1)}`
  const spec = TOOL_REGISTRY[name] ?? mcpToolSpecs().find((item) => item.name === name)
  if (!spec) return { id, name, args, error: `未知工具：${name}`, ms: 0 }
  try {
    const result = name.startsWith('mcp__') ? await callMcpTool(name, args) : await spec.run(args)
    return { id, name, args, result, ms: Date.now() - started }
  } catch (error) {
    return { id, name, args, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }
  }
}
