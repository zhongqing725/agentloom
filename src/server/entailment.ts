/**
 * Claim-level entailment, v2.
 *
 * The first version asked two questions: does the claim carry a ref, and do its
 * digits appear in the quoted text. That marks "增长的 210%" as supported by a
 * quote saying "下滑 210%" — the number matches, the meaning is inverted.
 *
 * This version classifies each claim into four states and reports the signals
 * it used, so a wrong verdict can be argued with instead of guessed at:
 *
 *   supported    引用原文蕴含该结论
 *   partial      方向对、口径/区间/期间不一致
 *   contradicted 方向相反、单位冲突、同一指标数值冲突
 *   unsupported  没有引用、引用不存在、或与引用几乎无关
 */
import type { Citation } from '../shared/types.js'
import { tokenize } from './retrieval.js'

export type ClaimLabel = 'supported' | 'partial' | 'contradicted' | 'unsupported'

export interface ClaimVerdict {
  label: ClaimLabel
  confidence: number
  reason: string
  checks: string[]
}

const NEGATIONS = [
  '不', '未', '没有', '无法', '并非', '低于', '下降', '下滑', '减少', '回落', '亏损', '不及',
  'declined', 'decreased', 'fell', 'falling', 'dropped', 'collapsed',
]
const POSITIVES = [
  '增长', '提升', '上升', '高于', '超过', '突破', '达到',
  'grew', 'increased', 'rose', 'rising', 'surged',
]

/** Unit pairs that must not be compared as if they were the same thing. */
const UNIT_CONFLICTS: Array<[string, string]> = [
  ['美元', '元'],
  ['美元', '人民币'],
  ['%', '百分点'],
  ['万台', '亿台'],
]

const numbers = (text: string) =>
  (text.match(/\d+(?:\.\d+)?/g) ?? [])
    .map((value) => value.replace(/\.0$/, ''))
    .filter((value) => !(Number(value) >= 1900 && Number(value) <= 2100))

/** "35%—45%" entails 40%; a bare number comparison would call that a conflict. */
function rangesIn(quote: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const pattern = /(\d+(?:\.\d+)?)\s*(?:%|美元|万台|克|小时|秒|亿美元)?\s*[—\-~至到]\s*(\d+(?:\.\d+)?)/g
  for (const match of quote.matchAll(pattern)) {
    const low = Number(match[1])
    const high = Number(match[2])
    if (Number.isFinite(low) && Number.isFinite(high)) ranges.push([Math.min(low, high), Math.max(low, high)])
  }
  return ranges
}

/** A number is entailed if it is quoted verbatim or falls inside a quoted range. */
function entailedNumbers(claimNumbers: string[], quote: string): { missing: string[]; shared: string[] } {
  const quoteNumbers = numbers(quote)
  const ranges = rangesIn(quote)
  const missing: string[] = []
  const shared: string[] = []
  for (const value of claimNumbers) {
    const numeric = Number(value)
    const inRange = ranges.some(([low, high]) => numeric >= low && numeric <= high)
    if (quoteNumbers.includes(value) || inRange) shared.push(value)
    else missing.push(value)
  }
  return { missing, shared }
}

/** Claim and quote must talk about the same subject, not just the same category. */
const SUBJECTS = ['AR', 'VR', 'Vision Pro', '苹果', 'Meta', '雷朋', '歌尔', '舜宇', 'Rokid', '雷鸟']

function subjectMismatch(claim: string, quote: string): string | undefined {
  return SUBJECTS.find((subject) => claim.includes(subject) && !quote.includes(subject))
}

/**
 * The point estimate a quote states for the same metric as the claim.
 * "平均售价约 289 美元" against "平均售价约 299 美元" is wrong even though 289
 * sits inside the quoted 249—349 range; the range describes the market, not the
 * average.
 */
function anchoredValue(body: string, quote: string): { metric: string; claimValue: number; quoteValue: number } | null {
  const match = [...body.matchAll(/(\d+(?:\.\d+)?)/g)].find((item) => {
    const value = Number(item[1])
    return !(value >= 1900 && value <= 2100)
  })
  if (!match || match.index === undefined) return null
  const claimValue = Number(match[1])
  let metric = body.slice(0, match.index).replace(/\s+/g, '')
  while (/[约为达到在是已将至]$/.test(metric)) metric = metric.slice(0, -1)
  metric = metric.slice(-4)
  if (metric.length < 2) return null
  const first = quote.indexOf(metric)
  if (first < 0) return null
  // Only trust the anchor when the metric names one place in the quote.
  if (quote.lastIndexOf(metric) !== first) return null
  const window = quote.slice(first + metric.length, first + metric.length + 14)
  if (/^\s*约?\s*\d+\s*[—\-~]\s*\d+/.test(window)) return null
  const near = window.match(/(\d+(?:\.\d+)?)/)
  if (!near) return null
  const quoteValue = Number(near[1])
  return quoteValue === claimValue ? null : { metric, claimValue, quoteValue }
}

const years = (text: string) => (text.match(/20\d{2}/g) ?? []).filter(Boolean)

function hasAny(text: string, words: string[]): string | undefined {
  return words.find((word) => text.includes(word))
}

/** The sentence a claim actually argues against, not the whole paragraph. */
function focusSentence(quote: string, claim: string): string {
  const parts = quote.split(/(?<=[。！？])|(?<=\.)\s+/).filter((part) => part.trim().length > 0)
  if (parts.length <= 1) return quote
  let best = quote
  let bestScore = -1
  for (const part of parts) {
    const score = coverage(claim, part)
    if (score > bestScore) {
      bestScore = score
      best = part
    }
  }
  return best
}

function coverage(claim: string, quote: string): number {
  const claimTokens = tokenize(claim)
  if (claimTokens.length === 0) return 0
  const quoteTokens = new Set(tokenize(quote))
  let hit = 0
  for (const token of claimTokens) if (quoteTokens.has(token)) hit += 1
  return hit / claimTokens.length
}

/** Confidence rides on how far the deciding signal is from its threshold. */
const clamp = (value: number) => Math.max(0.5, Math.min(0.97, Number(value.toFixed(2))))

export function classifyClaim(claim: string, citation: Citation | null | undefined): ClaimVerdict {
  const checks: string[] = []

  if (!citation) {
    return { label: 'unsupported', confidence: 0.95, reason: '引用不在证据库中。', checks: ['dangling-citation'] }
  }

  const body = claim.replace(/\[[A-Z]\d+\]/g, '')
  const quote = citation.quote
  const focus = focusSentence(quote, body)
  const overlap = coverage(body, quote)
  checks.push(`coverage=${overlap.toFixed(2)}`)

  const claimNumbers = numbers(body)
  const { missing, shared } = entailedNumbers(claimNumbers, quote)
  const subject = subjectMismatch(body, quote)
  const verbatimShared = claimNumbers.filter((value) => numbers(quote).includes(value))
  const anchor = verbatimShared.length === claimNumbers.length ? null : anchoredValue(body, focus)
  if (subject) checks.push(`subject=${subject}`)
  if (missing.length > 0) checks.push(`number-missing=${missing.join(',')}`)
  if (shared.length > 0) checks.push(`number-shared=${shared.join(',')}`)

  const claimNeg = hasAny(body, NEGATIONS)
  const quoteNeg = hasAny(focus, NEGATIONS)
  const claimPos = hasAny(body, POSITIVES)
  const quotePos = hasAny(focus, POSITIVES)
  const flipped = (claimNeg && quotePos && !quoteNeg) || (claimPos && quoteNeg && !claimNeg)
  if (flipped) checks.push('direction-flipped')

  const unitConflict = UNIT_CONFLICTS.find(([a, b]) => body.includes(a) && quote.includes(b) && !quote.includes(a))
  if (unitConflict) checks.push(`unit-conflict=${unitConflict[0]}/${unitConflict[1]}`)

  const claimYears = years(body)
  const quoteYears = years(focus)
  // The claim's own period is the first year it names; later years may be the
  // comparison window and legitimately appear in the quote.
  const periodShift = claimYears.length > 0 && quoteYears.length > 0 && !quoteYears.includes(claimYears[0])
  if (periodShift) checks.push(`period=${claimYears[0]}≠${quoteYears[0]}`)

  // Hard contradictions first: a wrong direction or a wrong unit is not a
  // "less supported" claim, it is a false statement.
  if (subject) {
    return { label: 'unsupported', confidence: 0.8, reason: `引用讨论的不是「${subject}」。`, checks }
  }
  if (anchor && Math.abs(anchor.claimValue - anchor.quoteValue) > 0.001) {
    return {
      label: 'contradicted',
      confidence: 0.82,
      reason: `${anchor.metric} 引用写的是 ${anchor.quoteValue}，结论写成 ${anchor.claimValue}。`,
      checks: [...checks, `anchor=${anchor.metric}`],
    }
  }
  if (flipped && overlap >= 0.25) {
    return { label: 'contradicted', confidence: clamp(0.72 + overlap * 0.2), reason: '结论方向与引用相反。', checks }
  }
  if (unitConflict && overlap >= 0.25) {
    return {
      label: 'contradicted',
      confidence: clamp(0.7 + overlap * 0.2),
      reason: `单位冲突：${unitConflict[0]} 对 ${unitConflict[1]}。`,
      checks,
    }
  }
  if (missing.length > 0 && overlap >= 0.72) {
    return {
      label: 'contradicted',
      confidence: clamp(0.65 + overlap * 0.2),
      reason: `数字 ${missing[0]} 在引用中找不到对应值，且语义高度重合。`,
      checks,
    }
  }
  if (missing.length > 0 && overlap >= 0.45) {
    return {
      label: 'partial',
      confidence: clamp(0.55 + overlap * 0.2),
      reason: `数字 ${missing[0]} 不在引用中。`,
      checks,
    }
  }
  if (missing.length > 0) {
    return { label: 'unsupported', confidence: 0.75, reason: `引用不含数字 ${missing[0]}。`, checks }
  }

  if (periodShift) {
    return {
      label: 'partial',
      confidence: clamp(0.55 + overlap * 0.2),
      reason: `统计期间不一致：${claimYears[0]} 对 ${quoteYears[0]}。`,
      checks,
    }
  }

  // "A 高于 B" needs both numbers to compare; without them this is a reviewer's job.
  const comparison = ['高于', '低于', '大于', '小于', '快于', '慢于'].find((word) => body.includes(word))
  if (comparison && claimNumbers.length === 0) {
    return { label: 'partial', confidence: 0.55, reason: '关系类判断需要人工复核。', checks }
  }

  if (overlap >= 0.62) {
    return { label: 'supported', confidence: clamp(0.78 + overlap * 0.18), reason: '引用原文蕴含该结论。', checks }
  }
  if (overlap >= 0.45) {
    return {
      label: 'partial',
      confidence: clamp(0.52 + overlap * 0.3),
      reason: '引用只覆盖了结论的一部分。',
      checks,
    }
  }
  return { label: 'unsupported', confidence: clamp(0.6 + (1 - overlap) * 0.3), reason: '引用与结论几乎无关。', checks }
}
