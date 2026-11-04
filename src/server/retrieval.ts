import type { DatabaseSync } from 'node:sqlite'
import type { SearchHit } from '../shared/types.js'

const STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '及', '对', '从', '到', '为', '有', '也', '就', '都',
  '而', '被', '把', '让', '给', '这', '那', '一个', '一种', '我们', '他们', '以及', '通过',
  '进行', '可以', '可能', '需要', '如何', '什么', '哪些', '多少', '是否',
])

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })

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

interface ChunkRow {
  id: string
  document_id: string
  title: string
  text: string
}

export function searchKnowledge(db: DatabaseSync, projectId: string, query: string, limit = 6, docId?: string): SearchHit[] {
  const sql = `SELECT c.id, c.document_id, c.text, d.title
     FROM chunks c JOIN documents d ON d.id = c.document_id
     WHERE c.project_id = ?${docId ? ' AND d.id = ?' : ''}`
  const chunks = (docId
    ? db.prepare(sql).all(projectId, docId)
    : db.prepare(sql).all(projectId)) as unknown as ChunkRow[]
  if (chunks.length === 0) return []

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const tokenized = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text)
    const tf = new Map<string, number>()
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1)
    return { chunk, tf, length: tokens.length }
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
    let score = 0
    for (const token of queryTokens) {
      const tf = item.tf.get(token) ?? 0
      if (tf === 0) continue
      const df = documentFrequency.get(token) ?? 0
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5))
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * item.length) / avgLength)))
    }
    if (score <= 0) continue
    if (item.chunk.text.includes(query.trim())) score *= 1.25
    hits.push({
      chunkId: item.chunk.id,
      docId: item.chunk.document_id,
      docTitle: item.chunk.title,
      text: item.chunk.text,
      score: Number(score.toFixed(4)),
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
