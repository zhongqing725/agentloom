import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import multipart from '@fastify/multipart'
import fs from 'node:fs'
import path from 'node:path'
import type { EvalCase, KnowledgeDoc, Mode } from '../shared/types.js'
import {
  activateVersion,
  addDocument,
  createAgent,
  createTrainingRun,
  createVersion,
  deleteDocument,
  getAgent,
  getBootstrap,
  getDb,
  getProject,
  getRun,
  getRunDetail,
  getTrainingRun,
  initDb,
  listDocuments,
  listEvalCases,
  listEvents,
  listChunks,
  listRuns,
  listTrainingRuns,
  listVersions,
  updateAgent,
  updateWorkflow,
  upsertEvalCase,
} from './db.js'
import { extractPdf, looksLikeScannedPdf } from './documents.js'
import { executeRun, cancelRun } from './engine.js'
import { executeTraining } from './trainer.js'
import { runBus } from './bus.js'
import { searchKnowledge } from './retrieval.js'

const PORT = Number(process.env.PORT || 8787)
const WEB_DIST = path.resolve(process.cwd(), 'dist/web')

function resolveMode(): Mode {
  if (process.env.AGENTLOOM_MODE === 'mock') return 'mock'
  return process.env.AGENTLOOM_API_KEY ? 'live' : 'mock'
}

const app = Fastify({ logger: { level: 'warn' } })

await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024 } })

app.get('/api/health', async () => ({ ok: true, mode: resolveMode(), time: new Date().toISOString() }))

app.get('/api/config', async () => ({
  mode: resolveMode(),
  model: process.env.AGENTLOOM_MODEL || 'deepseek-chat',
  baseUrl: process.env.AGENTLOOM_BASE_URL || 'https://api.deepseek.com/v1',
  hasKey: Boolean(process.env.AGENTLOOM_API_KEY),
}))

app.post('/api/config', async (request) => {
  const body = request.body as { apiKey?: string; baseUrl?: string; model?: string; mode?: Mode } | undefined
  if (body?.apiKey?.trim()) process.env.AGENTLOOM_API_KEY = body.apiKey.trim()
  if (body?.baseUrl?.trim()) process.env.AGENTLOOM_BASE_URL = body.baseUrl.trim()
  if (body?.model?.trim()) process.env.AGENTLOOM_MODEL = body.model.trim()
  if (body?.mode === 'mock') process.env.AGENTLOOM_MODE = 'mock'
  if (body?.mode === 'live') {
    if (!process.env.AGENTLOOM_API_KEY) throw new Error('请先填写 API Key。')
    process.env.AGENTLOOM_MODE = 'live'
  }
  return {
    mode: resolveMode(),
    model: process.env.AGENTLOOM_MODEL || 'deepseek-chat',
    baseUrl: process.env.AGENTLOOM_BASE_URL || 'https://api.deepseek.com/v1',
    hasKey: Boolean(process.env.AGENTLOOM_API_KEY),
  }
})

app.get('/api/bootstrap', async () => getBootstrap(resolveMode()))

app.get('/api/documents', async () => ({ documents: listDocuments() }))

app.post('/api/documents', async (request, reply) => {
  if (request.isMultipart()) {
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: '没有收到文件。' })
    const filename = file.filename || '未命名文档.md'
    const extension = path.extname(filename).toLowerCase()
    if (!['.md', '.markdown', '.txt', '.pdf'].includes(extension)) {
      return reply.code(400).send({ error: '支持 Markdown / TXT / PDF。' })
    }
    const buffer = await file.toBuffer()
    let content: string
    if (extension === '.pdf') {
      try {
        const extracted = await extractPdf(buffer)
        if (looksLikeScannedPdf(extracted.text)) {
          return reply.code(422).send({
            error: '这个 PDF 没有可提取的文字层（可能是扫描件），请先用 OCR 转成文本再入库。',
          })
        }
        content = extracted.text
      } catch (cause) {
        return reply.code(422).send({
          error: `PDF 解析失败：${cause instanceof Error ? cause.message : String(cause)}`,
        })
      }
    } else {
      content = buffer.toString('utf8')
    }
    if (!content.trim()) return reply.code(400).send({ error: '文件内容为空。' })
    const fields = file.fields as Record<string, { value?: string } | undefined>
    const title = fields?.title?.value || filename.replace(/\.[^.]+$/, '')
    const source = fields?.source?.value || '上传文档'
    const tags = (fields?.tags?.value || '')
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    const document = addDocument({
      title,
      source,
      content,
      tags,
      url: fields?.url?.value || undefined,
      kind: (fields?.kind?.value || undefined) as KnowledgeDoc['kind'],
      publishedAt: fields?.published_at?.value || undefined,
    })
    return reply.code(201).send({ document })
  }

  const body = request.body as {
    title?: string
    source?: string
    content?: string
    tags?: string[]
    url?: string
    kind?: KnowledgeDoc['kind']
    publishedAt?: string
  } | undefined
  if (!body?.title || !body?.content) {
    return reply.code(400).send({ error: 'title 和 content 不能为空。' })
  }
  const document = addDocument({
    title: body.title,
    source: body.source || '手动录入',
    content: body.content,
    tags: body.tags ?? [],
    url: body.url,
    kind: body.kind,
    publishedAt: body.publishedAt,
  })
  return reply.code(201).send({ document })
})

app.delete('/api/documents/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  if (!deleteDocument(id)) return reply.code(404).send({ error: '文档不存在。' })
  return { ok: true }
})

app.post('/api/kb/search', async (request) => {
  const body = request.body as { query?: string; limit?: number } | undefined
  const query = body?.query?.trim() ?? ''
  if (!query) return { hits: [] }
  const bootstrap = getBootstrap(resolveMode())
  const hits = searchKnowledge(getDb(), bootstrap.project.id, query, Math.min(body?.limit ?? 6, 12))
  return { hits }
})

app.post('/api/agents', async (request, reply) => {
  const body = request.body as {
    name?: string
    role?: 'specialist'
    title?: string
    description?: string
    color?: string
    model?: string
    temperature?: number
    systemPrompt?: string
    tools?: string[]
    plugins?: string[]
  } | undefined
  if (!body?.name?.trim() || !body?.title?.trim()) {
    return reply.code(400).send({ error: 'name 和 title 不能为空。' })
  }
  const agent = createAgent({
    projectId: getProject().id,
    name: body.name.trim(),
    role: body.role ?? 'specialist',
    title: body.title.trim(),
    description: body.description?.trim() || '按需加入的专家节点，负责独立审查与补充判断。',
    color: body.color || '#5B5F9E',
    model: body.model || process.env.AGENTLOOM_MODEL || 'deepseek-chat',
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
    systemPrompt:
      body.systemPrompt ||
      '你是团队按需加入的专家。阅读上游输出，指出被忽略的风险、证据缺口与需要复核的判断。只输出 JSON。',
    tools: body.tools ?? [],
    plugins: body.plugins ?? [],
  })
  return reply.code(201).send({ agent })
})

app.put('/api/agents/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = request.body as Record<string, unknown>
  const agent = updateAgent(id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    title: typeof body.title === 'string' ? body.title : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
    model: typeof body.model === 'string' ? body.model : undefined,
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
    systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
    tools: Array.isArray(body.tools) ? (body.tools as string[]) : undefined,
    plugins: Array.isArray(body.plugins) ? (body.plugins as string[]) : undefined,
  })
  if (!agent) return reply.code(404).send({ error: 'Agent 不存在。' })
  return { agent }
})

app.put('/api/workflow', async (request) => {
  const body = request.body as { graph?: Parameters<typeof updateWorkflow>[0]['graph']; settings?: Parameters<typeof updateWorkflow>[0]['settings']; name?: string } | undefined
  const workflow = updateWorkflow({
    graph: body?.graph,
    settings: body?.settings,
    name: body?.name,
  })
  return { workflow }
})

app.get('/api/runs', async (request) => {
  const query = request.query as { limit?: string } | undefined
  return { runs: listRuns(Math.min(Number(query?.limit || 30), 100)) }
})

app.post('/api/runs', async (request, reply) => {
  const body = request.body as { input?: string } | undefined
  const input =
    body?.input?.trim() ||
    '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。'
  const { createRun } = await import('./db.js')
  const run = createRun(input, resolveMode())
  void executeRun(run.id).catch((error) => {
    app.log.error(error)
  })
  return reply.code(201).send({ run })
})

app.get('/api/runs/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const detail = getRunDetail(id)
  if (!detail) return reply.code(404).send({ error: '运行不存在。' })
  return detail
})

app.get('/api/runs/:id/report', async (request, reply) => {
  const { id } = request.params as { id: string }
  const run = getRun(id)
  if (!run) return reply.code(404).send({ error: '运行不存在。' })
  reply.header('Content-Type', 'text/markdown; charset=utf-8')
  reply.header('Content-Disposition', `inline; filename="${run.id}.md"`)
  return run.output || '# 报告尚未生成'
})

app.get('/api/runs/:id/events', async (request, reply) => {
  const { id } = request.params as { id: string }
  const run = getRun(id)
  if (!run) return reply.code(404).send({ error: '运行不存在。' })

  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  reply.raw.write(': connected\n\n')

  const send = (event: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  for (const event of listEvents(id)) send(event)

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    reply.raw.end()
    return
  }

  const listener = (event: unknown) => send(event)
  runBus.on(id, listener)
  const heartbeat = setInterval(() => {
    reply.raw.write(': heartbeat\n\n')
  }, 15000)

  request.raw.on('close', () => {
    clearInterval(heartbeat)
    runBus.off(id, listener)
  })
})

app.post('/api/runs/:id/cancel', async (request, reply) => {
  const { id } = request.params as { id: string }
  const run = getRun(id)
  if (!run) return reply.code(404).send({ error: '运行不存在。' })
  cancelRun(id)
  return { ok: true }
})

/* ------------------------------------------------------------------ training */

app.get('/api/training', async (request, reply) => {
  const query = request.query as { agentId?: string } | undefined
  const agentId = query?.agentId
  if (!agentId) return reply.code(400).send({ error: 'agentId 不能为空。' })
  if (!getAgent(agentId)) return reply.code(404).send({ error: 'Agent 不存在。' })
  return {
    cases: listEvalCases(agentId),
    versions: listVersions(agentId),
    runs: listTrainingRuns(agentId),
  }
})

app.post('/api/training', async (request, reply) => {
  const body = request.body as { agentId?: string } | undefined
  const agentId = body?.agentId
  if (!agentId) return reply.code(400).send({ error: 'agentId 不能为空。' })
  if (!getAgent(agentId)) return reply.code(404).send({ error: 'Agent 不存在。' })
  const mode = resolveMode()
  const run = createTrainingRun(agentId, mode)
  void executeTraining(run.id, agentId, mode).catch((error) => app.log.error(error))
  return reply.code(201).send({ run })
})

app.get('/api/training/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const run = getTrainingRun(id)
  if (!run) return reply.code(404).send({ error: '训练记录不存在。' })
  return { run }
})

app.post('/api/training/:id/activate', async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = request.body as { candidateId?: string } | undefined
  const run = getTrainingRun(id)
  if (!run) return reply.code(404).send({ error: '训练记录不存在。' })
  if (run.status !== 'done') return reply.code(400).send({ error: '训练还没有结束。' })
  const candidate = run.candidates.find((item) => item.id === body?.candidateId)
  if (!candidate) return reply.code(404).send({ error: '候选不存在。' })
  const agent = getAgent(run.agentId)
  if (!agent) return reply.code(404).send({ error: 'Agent 不存在。' })
  const version = createVersion({
    agentId: run.agentId,
    systemPrompt: candidate.prompt,
    score: candidate.average,
    note: `训练 ${run.id} · ${candidate.label}`,
  })
  activateVersion(version.id)
  return { agent: getAgent(run.agentId), version: activateVersion(version.id) ?? version }
})

app.post('/api/training/versions/:id/activate', async (request, reply) => {
  const { id } = request.params as { id: string }
  const activated = activateVersion(id)
  if (!activated) return reply.code(404).send({ error: '版本不存在。' })
  return { agent: getAgent(activated.agentId), version: activated }
})

/** Ref prefix per source kind, so a citation shows where it came from. */
const REF_PREFIX: Record<string, string> = { paper: 'P', report: 'R', news: 'N', filing: 'F', other: 'D' }

/**
 * Builds eval cases straight from the knowledge base: the document's own chunks
 * become the frozen evidence, so training runs against real sources instead of
 * hand-written fixtures.
 */
app.post('/api/training/cases/from-docs', async (request, reply) => {
  const body = request.body as { agentId?: string; docIds?: string[] } | undefined
  const agentId = body?.agentId
  const docIds = Array.from(new Set(body?.docIds ?? []))
  if (!agentId) return reply.code(400).send({ error: 'agentId 不能为空。' })
  if (docIds.length === 0) return reply.code(400).send({ error: '至少选择一份资料。' })
  if (!getAgent(agentId)) return reply.code(404).send({ error: 'Agent 不存在。' })

  const documents = listDocuments()
  const created: EvalCase[] = []

  for (const docId of docIds) {
    const doc = documents.find((item) => item.id === docId)
    if (!doc) continue
    const chunks = listChunks(docId).slice(0, 6)
    if (chunks.length === 0) continue
    const prefix = REF_PREFIX[doc.kind ?? 'other'] ?? 'D'
    const evidence = chunks.map((chunk, index) => ({
      ref: `${prefix}${index + 1}`,
      docId: doc.id,
      docTitle: doc.title,
      quote: chunk.text,
      score: 0.9,
    }))
    created.push(
      upsertEvalCase({
        id: `case-auto-${doc.id}`,
        agentId,
        title: `自动生成 · ${doc.title}`,
        input: `请阅读《${doc.title}》，提炼 3 条可以引用的结论，并为每条结论标注证据编号。`,
        fixture: { evidence, upstream: [] },
      }),
    )
  }

  if (created.length === 0) return reply.code(400).send({ error: '选中的资料没有可用片段。' })
  return reply.code(201).send({ cases: created })
})

if (fs.existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, prefix: '/' })
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api')) {
      return reply.code(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })
}

initDb()
getDb()
  .prepare("UPDATE runs SET status = 'failed', error = '服务重启，运行中断' WHERE status IN ('running', 'queued')")
  .run()

await app.listen({ port: PORT, host: '127.0.0.1' })
const mode = resolveMode()
console.log(`\n  织序 AgentLoom API  →  http://127.0.0.1:${PORT}`)
console.log(`  模型模式：${mode === 'live' ? 'Live（已配置 API Key）' : 'Mock 演示'}`)
console.log(`  知识库：${getBootstrap(mode).documents.length} 篇 / ${getBootstrap(mode).stats.agents} 个 Agent\n`)
