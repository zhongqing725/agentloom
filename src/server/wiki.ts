/**
 * Wiki layer: compile the knowledge base into three angle pages of rule-extracted
 * fact cards, then use those cards to check a report for coverage and conflicts.
 *
 * Design contract (see docs/architecture.md §12):
 * - Fact cards are extracted by deterministic rules, never by a model. The
 *   verifier only trusts this layer, otherwise it would be grading model output
 *   against model output.
 * - A model-written narrative layer can sit on top later; it is display-only and
 *   must never feed a verdict.
 */

import type { DatabaseSync } from 'node:sqlite'
import type {
  ConflictCheckItem,
  ConflictResult,
  CoverageItem,
  CoverageResult,
  WikiAngle,
  WikiCheckResult,
  WikiConflict,
  WikiConflictValue,
  WikiFact,
  WikiPage,
  WikiSnapshot,
  WikiSource,
} from '../shared/types.js'

const ANGLE_TITLES: Record<WikiAngle, string> = {
  市场: '市场：规模、增速与价格',
  产业链: '产业链：BOM、价值池与毛利',
  竞争: '竞争：份额、渠道与洗牌',
}

const ANGLE_KEYWORDS: Record<WikiAngle, string[]> = {
  市场: ['出货', '市场', '渗透', '价格', '销量', '规模', '增速', 'ASP', '零售', '需求', '退货率', '留存'],
  产业链: ['BOM', '毛利', '价值池', '光学', '芯片', '成本', '环节', '器件', '组装', '声学', '电池', '壁垒', '良率'],
  竞争: ['份额', 'Meta', '雷朋', '竞争', '渠道', '品牌', '厂商', '护城河', '洗牌', '格局', '进入者'],
}

/** Longest first: "光学与摄像头" must win over "光学". */
const METRICS = [
  '光学与摄像头',
  '低功耗 SoC',
  '结构件与组装',
  '整机市场规模',
  '复合增速',
  '平均售价',
  '市场规模',
  '价值池',
  '出货量',
  '渗透率',
  '退货率',
  '留存率',
  '毛利率',
  '净利率',
  '使用时长',
  '认证周期',
  '充电时间',
  '唤醒延迟',
  '光学模组',
  '整机品牌',
  '组装代工',
  '结构件',
  '组装',
  '声学',
  '电池',
  '光学',
  'SoC',
  'ASP',
  'BOM',
  '重量',
  '续航',
  '份额',
  '价格',
  '成本',
  '增速',
  '估值',
  '像素',
]

/** Only used to anchor a fact to a subject; unknown subjects stay empty. */
const ENTITIES = [
  'Ray-Ban Meta',
  '雷鸟创新',
  '整机品牌',
  '组装代工',
  '光学模组',
  '低功耗 SoC',
  '光学与摄像头',
  'AI 眼镜',
  'AR 眼镜',
  '智能手机',
  '整机',
  '中国',
  '全球',
  '雷朋',
  'Meta',
  '雷鸟',
  'Rokid',
  '小米',
  '华为',
  'OPPO',
  'vivo',
  '字节',
  '阿里',
  '百度',
  'SoC',
  '光学',
  '电池',
  '声学',
  '组装',
]

const UNIT_PATTERN = '%|％|个百分点|亿美元|万美元|万台|万部|亿美元|美元|亿元|元|克|小时|分钟|个月|倍|MP'

const RANGE_RE = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(%|％)?\\s*(?:—|–|-|~|至)\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})`,
  'g',
)

const SINGLE_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})`, 'g')

const SKIP_SENTENCE = /每(差|提升|增加|下降)|差异|对应约|演示知识库|不构成真实投资依据|亿元，?其中/
const SCENARIO_SENTENCE = /假设|情景|乐观|保守|中性|若|如果/

/** Only these metrics become "must cover" checks; segment splits stay browsable. */
const KEY_METRICS = new Set([
  '出货量',
  '渗透率',
  '毛利率',
  '份额',
  'BOM',
  '退货率',
  '留存率',
  'ASP',
  '复合增速',
  '整机市场规模',
  '价值池',
  'SoC',
])

/** Unit families guard against inheriting a metric from the wrong clause. */
const METRIC_UNITS: Record<string, string[]> = {
  出货量: ['万台', '万部', '亿台'],
  渗透率: ['%'],
  退货率: ['%'],
  留存率: ['%'],
  毛利率: ['%'],
  净利率: ['%'],
  份额: ['%'],
  复合增速: ['%'],
  增速: ['%'],
  价格: ['美元', '元', '万美元'],
  ASP: ['美元', '元'],
  BOM: ['美元', '元'],
  成本: ['美元', '元'],
  整机市场规模: ['亿美元', '亿元'],
  价值池: ['亿美元', '亿元'],
  SoC: ['亿美元', '亿元', '%'],
}

function normalizeUnit(unit: string): string {
  return unit.replace(/％/g, '%')
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；\n])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 8 && !sentence.startsWith('#') && !sentence.startsWith('>'))
}

function classifyAngle(sentence: string, fallback: WikiAngle): WikiAngle {
  const scores: Record<WikiAngle, number> = { 市场: 0, 产业链: 0, 竞争: 0 }
  for (const angle of Object.keys(scores) as WikiAngle[]) {
    for (const keyword of ANGLE_KEYWORDS[angle]) {
      if (sentence.includes(keyword)) scores[angle] += 1
    }
  }
  let best: WikiAngle = fallback
  let bestScore = 0
  for (const angle of Object.keys(scores) as WikiAngle[]) {
    if (scores[angle] > bestScore) {
      best = angle
      bestScore = scores[angle]
    }
  }
  return best
}

/** Seed docs already declare their angle; uploaded docs fall back to keywords. */
function angleOfDoc(docId: string): WikiAngle | undefined {
  if (docId === 'doc-market') return '市场'
  if (docId === 'doc-chain') return '产业链'
  if (docId === 'doc-competition') return '竞争'
  return undefined
}

function findMetricWithInheritance(lower: string, index: number): { metric: string; at: number; inherited: boolean } | undefined {
  const direct = findMetric(lower, index)
  if (direct) return { ...direct, inherited: false }
  // "2028 年达到 3200 万台" continues the metric from the previous clause.
  const start = clauseStart(lower, index)
  const prefix = lower.slice(start, Math.min(lower.length, start + 12))
  if (!/^(20\d{2}\s*年|达到|降至|升至|约|为|其中|对应|同比)/.test(prefix)) return undefined
  const previous = findMetric(lower, Math.max(0, start - 1))
  if (!previous) return undefined
  return { ...previous, inherited: true }
}

function unitFits(metric: string, unit: string): boolean {
  const allowed = METRIC_UNITS[metric]
  return !allowed || allowed.includes(unit)
}
function clauseStart(lower: string, index: number): number {
  const window = lower.slice(0, index)
  return (
    Math.max(
      window.lastIndexOf('，'),
      window.lastIndexOf('。'),
      window.lastIndexOf('；'),
      window.lastIndexOf('、'),
      window.lastIndexOf('（'),
      window.lastIndexOf('）'),
      window.lastIndexOf('\n'),
    ) + 1
  )
}

function findMetric(lower: string, index: number): { metric: string; at: number } | undefined {
  const start = clauseStart(lower, index)
  const window = lower.slice(start, index)
  let best: { metric: string; at: number } | undefined
  for (const metric of METRICS) {
    const needle = metric.toLowerCase()
    const at = window.lastIndexOf(needle)
    if (at < 0) continue
    // Rightmost end wins so "结构件与组装" beats the nested "组装"; longer wins ties.
    const end = at + needle.length
    const bestEnd = best ? best.at + best.metric.length : -1
    if (!best || end > bestEnd || (end === bestEnd && needle.length > best.metric.length)) {
      best = { metric, at: start + at }
    }
  }
  return best
}

function findSubject(lower: string, from: number, to: number): string {
  const start = Math.max(0, from)
  const window = lower.slice(start, Math.max(start, to))
  let best: { entity: string; at: number } | undefined
  for (const entity of ENTITIES) {
    const needle = entity.toLowerCase()
    const at = window.lastIndexOf(needle)
    if (at < 0) continue
    const bestAt = best?.at ?? -1
    if (!best || at > bestAt || (at === bestAt && needle.length > best.entity.length)) {
      best = { entity, at }
    }
  }
  const period = window.match(/(\d+)\s*日$/)
  if (period && best) return `${period[1]}日${best.entity}`
  if (period) return `${period[1]}日`
  return best?.entity ?? ''
}

function findYear(lower: string, index: number): string | undefined {
  const window = lower.slice(0, index)
  const matches = [...window.matchAll(/(20\d{2})/g)]
  return matches.length > 0 ? matches[matches.length - 1][1] : undefined
}

function salienceOf(fact: Omit<WikiFact, 'id' | 'salience'>): number {
  let score = 1
  if (fact.unit === '%') score += 1
  if (/万台|万部|亿美元|亿元/.test(fact.unit)) score += 1
  if (fact.metric === '出货量' || fact.metric === '毛利率' || fact.metric === '份额' || fact.metric === '渗透率') {
    score += 0.8
  }
  if (!fact.scenario) score += 0.6
  if (fact.sentence.length > 45) score += 0.3
  return Number(score.toFixed(2))
}

interface RawMatch {
  value: string
  numeric: number
  unit: string
  index: number
  end: number
}

function scanNumbers(sentence: string): RawMatch[] {
  const matches: RawMatch[] = []
  const consumed: Array<{ start: number; end: number }> = []

  for (const match of sentence.matchAll(RANGE_RE)) {
    const index = match.index ?? 0
    const low = Number(match[1])
    const high = Number(match[3])
    const percentTail = match[4] === '%' || match[4] === '％'
    const unit = normalizeUnit(percentTail ? '%' : match[4])
    matches.push({
      value: `${match[1]}-${match[3]}`,
      numeric: Number(((low + high) / 2).toFixed(2)),
      unit,
      index,
      end: index + match[0].length,
    })
    consumed.push({ start: index, end: index + match[0].length })
  }

  for (const match of sentence.matchAll(SINGLE_RE)) {
    const index = match.index ?? 0
    if (consumed.some((span) => index >= span.start && index < span.end)) continue
    const unit = normalizeUnit(match[2])
    const numeric = Number(match[1])
    if (!Number.isFinite(numeric)) continue
    matches.push({ value: match[1], numeric, unit, index, end: index + match[0].length })
  }

  return matches.sort((a, b) => a.index - b.index)
}

export function extractFacts(sources: WikiSource[]): WikiFact[] {
  const facts: WikiFact[] = []
  const seen = new Set<string>()

  for (const source of sources) {
    const declared = angleOfDoc(source.docId)
    for (const sentence of splitSentences(source.text)) {
      if (SKIP_SENTENCE.test(sentence)) continue
      const scenario = SCENARIO_SENTENCE.test(sentence)
      const lower = sentence.toLowerCase()
      for (const match of scanNumbers(sentence)) {
        const metricHit = findMetricWithInheritance(lower, match.index)
        if (!metricHit) continue
        const metric = metricHit.metric
        if (metricHit.inherited && !unitFits(metric, match.unit)) continue
        const clause = lower.slice(clauseStart(lower, match.index), match.index)
        // A rate ("年降 8%—12%", "同比增长 210%") is not a level fact.
        if (match.unit === '%' && /下降|降幅|增长|提升|减少|上升/.test(clause) && !/增速/.test(metric)) continue
        const subject = findSubject(lower, Math.max(clauseStart(lower, metricHit.at), metricHit.at - 24), metricHit.at)
        const year = findYear(lower, match.index)
        const key = `${source.chunkId}|${metric}|${subject}|${match.value}|${match.unit}|${year ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        const angle = declared ?? classifyAngle(sentence, '市场')
        const base = {
          angle,
          metric,
          subject,
          value: match.value,
          numeric: match.numeric,
          unit: match.unit,
          year,
          scenario,
          sentence,
          docId: source.docId,
          docTitle: source.docTitle,
          chunkId: source.chunkId,
        }
        facts.push({ id: `${source.chunkId}-f${facts.length}`, ...base, salience: salienceOf(base) })
      }
    }
  }

  return facts
}

/** Metrics that always describe the whole market; entity words are noise there. */
const AGGREGATE_METRICS = new Set(['出货量', '渗透率', '整机市场规模', '价值池', '复合增速'])

function conflictKey(fact: WikiFact): string {
  const subject = AGGREGATE_METRICS.has(fact.metric) ? '' : fact.subject
  return `${fact.metric}|${subject}|${fact.unit}|${fact.year ?? ''}`
}

export function detectConflicts(facts: WikiFact[]): WikiConflict[] {
  const groups = new Map<string, WikiFact[]>()
  for (const fact of facts) {
    if (fact.scenario) continue
    const key = conflictKey(fact)
    const list = groups.get(key) ?? []
    list.push(fact)
    groups.set(key, list)
  }

  const conflicts: WikiConflict[] = []
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const numericValues = [...new Set(list.map((fact) => fact.numeric))].sort((a, b) => a - b)
    if (numericValues.length < 2) continue
    const spread = Number((numericValues[numericValues.length - 1] / Math.max(numericValues[0], 0.0001)).toFixed(2))
    if (spread < 1.1) continue
    const first = list[0]
    const values: WikiConflictValue[] = []
    for (const fact of list) {
      if (values.some((item) => item.value === fact.value)) continue
      values.push({
        factId: fact.id,
        value: fact.value,
        docId: fact.docId,
        docTitle: fact.docTitle,
        sentence: fact.sentence,
      })
    }
    if (values.length < 2) continue
    conflicts.push({
      id: `wf-${conflicts.length + 1}`,
      angle: first.angle,
      metric: first.metric,
      subject: first.subject,
      unit: first.unit,
      year: first.year,
      values,
      spread,
    })
  }

  return conflicts.sort((a, b) => b.spread - a.spread)
}

function dedupeFacts(facts: WikiFact[]): WikiFact[] {
  const seen = new Set<string>()
  const result: WikiFact[] = []
  for (const fact of facts.slice().sort((a, b) => b.salience - a.salience)) {
    const key = `${fact.metric}|${fact.subject}|${fact.value}|${fact.unit}|${fact.year ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(fact)
  }
  return result.sort((a, b) => b.salience - a.salience)
}

export function compileWiki(sources: WikiSource[]): WikiSnapshot {
  const facts = extractFacts(sources)
  const conflicts = detectConflicts(facts)
  const angles: WikiAngle[] = ['市场', '产业链', '竞争']
  const pages: WikiPage[] = angles.map((angle) => {
    const pageFacts = dedupeFacts(facts.filter((fact) => fact.angle === angle && !fact.scenario))
    const pageConflicts = conflicts.filter((conflict) => conflict.angle === angle)
    const top = pageFacts.slice(0, 2).map((fact) => `${fact.metric} ${fact.value}${fact.unit}`).join('、')
    return {
      angle,
      title: ANGLE_TITLES[angle],
      summary: `共 ${pageFacts.length} 条事实卡，${pageConflicts.length} 处资料分歧${top ? `；要点：${top}` : ''}`,
      facts: pageFacts,
      conflicts: pageConflicts,
    }
  })
  return { pages, facts, conflicts, compiledAt: new Date().toISOString() }
}

/** Report body without the scenario section, evidence index, or recommendations. */
export function reportBody(markdown: string): string {
  return markdown
    .split('## 证据索引')[0]
    .split('## 五、三种情景')[0]
    .split('## 七、投资建议')[0]
}

export function containsValue(text: string, value: string): boolean {
  const parts = value.split('-')
  return parts.every((part) => new RegExp(`(^|[^\\d.])${part.replace(/\./g, '\\.')}(?![\\d.])`).test(text))
}

export function pickRequiredFacts(facts: WikiFact[], perAngle = 3): WikiFact[] {
  const angles: WikiAngle[] = ['市场', '产业链', '竞争']
  const picked: WikiFact[] = []
  for (const angle of angles) {
    const pool = facts.filter((fact) => fact.angle === angle && !fact.scenario && KEY_METRICS.has(fact.metric))
    // One representative per metric — the newest year, then the most salient.
    const perMetric = new Map<string, WikiFact>()
    for (const fact of pool) {
      const current = perMetric.get(fact.metric)
      if (!current) {
        perMetric.set(fact.metric, fact)
        continue
      }
      const currentYear = Number(current.year ?? 0)
      const nextYear = Number(fact.year ?? 0)
      if (nextYear > currentYear || (nextYear === currentYear && fact.salience > current.salience)) {
        perMetric.set(fact.metric, fact)
      }
    }
    const ranked = [...perMetric.values()].sort((a, b) => b.salience - a.salience)
    picked.push(...ranked.slice(0, perAngle))
  }
  return picked
}

export function coverageCheck(markdown: string, facts: WikiFact[], perAngle = 3): CoverageResult {
  const body = reportBody(markdown)
  const required = pickRequiredFacts(facts, perAngle)
  // Any value from the same conflict group counts: the check asks "did the report
  // discuss this metric", not "did it pick this exact source".
  const groupValues = new Map<string, string[]>()
  for (const fact of facts) {
    const key = conflictKey(fact)
    const list = groupValues.get(key) ?? []
    list.push(fact.value)
    groupValues.set(key, list)
  }
  const missing: CoverageItem[] = []
  for (const fact of required) {
    const accepted = groupValues.get(conflictKey(fact)) ?? [fact.value]
    if (accepted.some((value) => containsValue(body, value))) continue
    missing.push({
      factId: fact.id,
      angle: fact.angle,
      metric: fact.metric,
      subject: fact.subject,
      value: fact.value,
      unit: fact.unit,
      year: fact.year,
      sentence: fact.sentence,
      docTitle: fact.docTitle,
      chunkId: fact.chunkId,
    })
  }
  const covered = required.length - missing.length
  return {
    required: required.length,
    covered,
    score: required.length === 0 ? 1 : Number((covered / required.length).toFixed(2)),
    missing,
  }
}

export function conflictCheck(markdown: string, conflicts: WikiConflict[]): ConflictResult {
  const sentences = splitSentences(reportBody(markdown))
  const DISAGREE = /口径|差异|分歧|相左|不同来源|另有/
  const unhandled: ConflictCheckItem[] = []
  let handled = 0
  for (const conflict of conflicts) {
    const hit = sentences.find((sentence) => {
      const values = conflict.values.filter((item) => containsValue(sentence, item.value))
      if (values.length >= 2) return true
      return values.length >= 1 && DISAGREE.test(sentence)
    })
    if (hit) {
      handled += 1
      continue
    }
    const found = conflict.values.filter((item) => containsValue(markdown, item.value))
    unhandled.push({
      ...conflict,
      missingValues: conflict.values.filter((item) => !found.includes(item)).map((item) => item.value),
    })
  }
  return {
    total: conflicts.length,
    handled,
    score: conflicts.length === 0 ? 1 : Number((handled / conflicts.length).toFixed(2)),
    unhandled,
  }
}

export function wikiCheck(markdown: string, snapshot: WikiSnapshot, citations: number, perAngle = 3): WikiCheckResult {
  const coverage = coverageCheck(markdown, snapshot.facts, perAngle)
  const conflicts = conflictCheck(markdown, snapshot.conflicts)
  return {
    dimensions: { citations, coverage: coverage.score, conflicts: conflicts.score },
    coverage,
    conflicts,
  }
}

/** Derived data: compiled per run from the chunks table, never persisted. */
export function loadWikiSnapshot(db: DatabaseSync, projectId: string): WikiSnapshot {
  const rows = db
    .prepare(
      `SELECT c.id AS chunk_id, c.document_id AS doc_id, c.text AS text, d.title AS title
       FROM chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.project_id = ? ORDER BY c.document_id, c.idx`,
    )
    .all(projectId) as Array<{ chunk_id: string; doc_id: string; text: string; title: string }>
  return compileWiki(
    rows.map((row) => ({
      docId: row.doc_id,
      docTitle: row.title,
      chunkId: row.chunk_id,
      text: row.text,
    })),
  )
}
