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
  run(args) {
    const query = String(args.query ?? '').trim()
    if (!query) throw new Error('query 不能为空。')
    const limit = Math.max(1, Math.min(Number(args.limit ?? 4), 6))
    return searchKnowledge(getDb(), getProject().id, query, limit).map((hit) => ({
      chunk: hit.chunkId,
      doc: hit.docTitle,
      text: hit.text.slice(0, 400),
      score: hit.score,
    }))
  },
}

export const TOOL_REGISTRY: Record<string, ToolSpec> = {
  calculator,
  knowledge_search: knowledgeSearch,
}

/** Agent.tools stores plugin ids; only these map to executable tools. */
const AGENT_TOOL_IDS: Record<string, string> = {
  'tool.calculator': 'calculator',
  'knowledge.retrieve': 'knowledge_search',
}

export function toolsForAgent(agent: Agent): ToolSpec[] {
  // UI toggles write both arrays, but older rows may only have one; accept either.
  const ids = new Set([...agent.tools, ...agent.plugins])
  const names = [...new Set([...ids].map((id) => AGENT_TOOL_IDS[id]).filter(Boolean))]
  return names.map((name) => TOOL_REGISTRY[name]).filter(Boolean)
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
  const spec = TOOL_REGISTRY[name]
  if (!spec) return { id, name, args, error: `未知工具：${name}`, ms: 0 }
  try {
    const result = await spec.run(args)
    return { id, name, args, result, ms: Date.now() - started }
  } catch (error) {
    return { id, name, args, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }
  }
}
