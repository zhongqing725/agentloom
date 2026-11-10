import type { DatabaseSync } from 'node:sqlite'
import type { SearchHit } from '../shared/types.js'

const STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '及', '对', '从', '到', '为', '有', '也', '就', '都',
  '而', '被', '把', '让', '给', '这', '那', '一个', '一种', '我们', '他们', '以及', '通过',
  '进行', '可以', '可能', '需要', '如何', '什么', '哪些', '多少', '是否',
])

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
const VECTOR_DIM = 192

export function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  const tokens = new Set<string>()
  for (const part of segmenter.segment(normalized)) {
    if (!part.isWordLike) continue
    const word = part.segment.trim()
    if (word.length >= 2 && !STOPWORDS.has(word)) tokens.add(word)
  }
  for (const run of normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let i = 0; i < run.length - 1; i += 1) {
      const bigram = run.slice(i, i + 2)
      if (!STOPWORDS.has(bigram)) tokens.add(bigram)
    }
  }
  for (const run of normalized.match(/[a-z0-9]{2,}/g) ?? []) {
    tokens.add(run)
  }
  return [...tokens]
}

/**
 * Lightweight vector index.
 *
 * ponytail: feature hashing is not a neural embedding; it gives a real
 * deterministic vector index without a new dependency or API key. Swap
 * `hashVector` for an embeddings endpoint when one is configured, and keep
 * the same `chunk_vectors` table.
 */
function hashVector(text: string): number[] {
  const vector = new Array<number>(VECTOR_DIM).fill(0)
  for (const token of tokenize(text)) {
    let hash = 2166136261
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    const index = Math.abs(hash) % VECTOR_DIM
    vector[index] += hash % 2 === 0 ? 1 : -1
  }
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  return vector.map((value) => Number((value / norm).toFixed(5)))
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i]
  return dot
}

function parseVector(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(Number) : []
  } catch {
    return []
  }
}

interface EmbeddingConfig {
  url: string
  model: string
  apiKey: string
}

function embeddingConfig(): EmbeddingConfig | null {
  const url = process.env.AGENTLOOM_EMBEDDING_URL?.trim()
  if (!url) return null
  return {
    url: url.replace(/\/$/, ''),
    model: process.env.AGENTLOOM_EMBEDDING_MODEL || 'text-embedding-3-small',
    apiKey: process.env.AGENTLOOM_EMBEDDING_API_KEY || process.env.AGENTLOOM_API_KEY || '',
  }
}

async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const config = embeddingConfig()
  if (!config) return null
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, input: texts }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`embedding ${response.status}`)
    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> }
    const vectors = (payload.data ?? []).map((item) => item.embedding ?? [])
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) return null
    return vectors
  } catch (error) {
    console.warn('[embedding] 调用失败，回退哈希向量：', error instanceof Error ? error.message : String(error))
    return null
  }
}

async function ensureNeuralVectors(db: DatabaseSync, projectId: string): Promise<boolean> {
  const config = embeddingConfig()
  if (!config) return false
  const meta = db
    .prepare('SELECT model FROM vector_meta WHERE project_id = ?')
    .get(projectId) as { model?: string } | undefined
  if (meta?.model === config.model) return true
  const chunks = db
    .prepare('SELECT id, text FROM chunks WHERE project_id = ?')
    .all(projectId) as Array<{ id: string; text: string }>
  if (chunks.length === 0) return false
  const vectors = await embedTexts(chunks.map((chunk) => chunk.text))
  if (!vectors) return false
  const insert = db.prepare(
    'INSERT OR REPLACE INTO chunk_vectors (chunk_id, project_id, vector_json, dim, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  const dim = vectors[0].length
  for (let i = 0; i < chunks.length; i += 1) {
    insert.run(chunks[i].id, projectId, JSON.stringify(vectors[i]), dim, new Date().toISOString())
  }
  db.prepare(
    'INSERT OR REPLACE INTO vector_meta (project_id, provider, model, dim, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(projectId, 'openai-compatible', config.model, dim, new Date().toISOString())
  return true
}

async function queryVectorFor(db: DatabaseSync, projectId: string, query: string): Promise<number[]> {
  const neural = await ensureNeuralVectors(db, projectId)
  if (neural) {
    const vector = await embedTexts([query])
    if (vector?.[0]) return vector[0]
    return []
  }
  return hashVector(query)
}

export function ensureVectors(db: DatabaseSync): number {
  const chunks = db.prepare('SELECT id, project_id, text FROM chunks').all() as Array<{
    id: string
    project_id: string
    text: string
  }>
  const existing = new Set(
    (db.prepare('SELECT chunk_id FROM chunk_vectors').all() as Array<{ chunk_id: string }>).map((row) => row.chunk_id),
  )
  const insert = db.prepare(
    'INSERT OR REPLACE INTO chunk_vectors (chunk_id, project_id, vector_json, dim, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  let added = 0
  for (const chunk of chunks) {
    if (existing.has(chunk.id)) continue
    insert.run(chunk.id, chunk.project_id, JSON.stringify(hashVector(chunk.text)), VECTOR_DIM, new Date().toISOString())
    added += 1
  }
  return added
}

interface ChunkRow {
  id: string
  document_id: string
  title: string
  text: string
}

export async function searchKnowledge(db: DatabaseSync, projectId: string, query: string, limit = 6, docId?: string): Promise<SearchHit[]> {
  const sql = `SELECT c.id, c.document_id, c.text, d.title
     FROM chunks c JOIN documents d ON d.id = c.document_id
     WHERE c.project_id = ?${docId ? ' AND d.id = ?' : ''}`
  const chunks = (docId
    ? db.prepare(sql).all(projectId, docId)
    : db.prepare(sql).all(projectId)) as unknown as ChunkRow[]
  if (chunks.length === 0) return []

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []
  const queryVector = await queryVectorFor(db, projectId, query)

  const vectorRows = db
    .prepare('SELECT chunk_id, vector_json FROM chunk_vectors WHERE project_id = ?')
    .all(projectId) as Array<{ chunk_id: string; vector_json: string }>
  const vectors = new Map(vectorRows.map((row) => [row.chunk_id, parseVector(row.vector_json)]))
  const insertVector = db.prepare(
    'INSERT OR REPLACE INTO chunk_vectors (chunk_id, project_id, vector_json, dim, updated_at) VALUES (?, ?, ?, ?, ?)',
  )

  const tokenized = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text)
    const tf = new Map<string, number>()
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1)
    let vector = vectors.get(chunk.id)
    if (!vector) {
      vector = hashVector(chunk.text)
      insertVector.run(chunk.id, projectId, JSON.stringify(vector), VECTOR_DIM, new Date().toISOString())
      vectors.set(chunk.id, vector)
    }
    return { chunk, tf, length: tokens.length, vectorScore: cosine(queryVector, vector) }
  })

  const avgLength = tokenized.reduce((sum, item) => sum + item.length, 0) / tokenized.length || 1
  const documentFrequency = new Map<string, number>()
  for (const token of queryTokens) {
    let df = 0
    for (const item of tokenized) if (item.tf.has(token)) df += 1
    documentFrequency.set(token, df)
  }

  const k1 = 1.5
  const b = 0.75
  const hits: SearchHit[] = []
  for (const item of tokenized) {
    let bm25 = 0
    for (const token of queryTokens) {
      const tf = item.tf.get(token) ?? 0
      if (tf === 0) continue
      const df = documentFrequency.get(token) ?? 0
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5))
      bm25 += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * item.length) / avgLength)))
    }
    if (item.chunk.text.includes(query.trim())) bm25 *= 1.25
    // Hybrid: keyword score + a small semantic tie-breaker. The vector alone
    // is deliberately not enough to retrieve a chunk (hash vectors are weak).
    const score = bm25 + item.vectorScore * 0.75
    if (score <= 0.05) continue
    hits.push({
      chunkId: item.chunk.id,
      docId: item.chunk.document_id,
      docTitle: item.chunk.title,
      text: item.chunk.text,
      score: Number(score.toFixed(4)),
      vectorScore: Number(item.vectorScore.toFixed(4)),
    })
  }

  hits.sort((a, b) => b.score - a.score)
  const perDoc = new Map<string, number>()
  const selected: SearchHit[] = []
  for (const hit of hits) {
    const count = perDoc.get(hit.docId) ?? 0
    if (count >= 6) continue
    selected.push(hit)
    perDoc.set(hit.docId, count + 1)
    if (selected.length >= limit) break
  }
  return selected
}

export function firstSentences(text: string, count = 2): string {
  const clean = text
    .replace(/^#+\s.*$/gm, '')
    .replace(/^>\s.*$/gm, '')
    .replace(/\n+/g, ' ')
    .trim()
  const sentences = clean.split(/(?<=[。！？；])/).filter((s) => s.trim().length > 6)
  return sentences.slice(0, count).join('')
}
