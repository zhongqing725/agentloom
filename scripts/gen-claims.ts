/**
 * Expands the two authoritative sources into a larger claim set by controlled
 * perturbation. Labels are correct by construction: a verbatim sentence is
 * supported, a swapped number contradicts, a swapped year changes the period,
 * a negated verb inverts the direction, an uncited sentence has no evidence.
 *
 *   pnpm tsx scripts/gen-claims.ts  → data/claims-bench-large.json
 */
import fs from 'node:fs'
import path from 'node:path'

type Source = { id: string; title: string; publisher: string; publishedAt: string; url: string; text: string }
type Case = { id: string; claim: string; ref: string | null; label: string; kind: string }

const root = process.cwd()
const sources = (JSON.parse(fs.readFileSync(path.join(root, 'data', 'sources.json'), 'utf8')) as { documents: Source[] }).documents

const sentences = (text: string) =>
  text
    .split(/(?<=[。！？])|(?<=\.)\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 20 && item.length <= 150 && /\d/.test(item))

const years = (text: string) => new Set((text.match(/20\d{2}/g) ?? []).map(Number))
const freshYear = (text: string) => {
  const used = years(text)
  for (const candidate of [2031, 2032, 2033, 2026]) if (!used.has(candidate)) return candidate
  return 2031
}

function swapNumber(sentence: string, salt: number): string | null {
  const match = sentence.match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const original = Number(match[0])
  const factor = 1.2 + (salt % 5) * 0.09
  const next = original % 1 === 0 ? Math.round(original * factor) : Number((original * factor).toFixed(1))
  if (next === original) return null
  const replaced = sentence.replace(match[0], String(next))
  return replaced === sentence ? null : replaced
}

function swapYear(sentence: string, year: number): string | null {
  const match = sentence.match(/20\d{2}/)
  if (!match) return null
  return sentence.replace(match[0], String(year))
}

const FLIPS: Array<[RegExp, string]> = [
  [/增长/g, '下滑'],
  [/上升/g, '下降'],
  [/提升/g, '下降'],
  [/grew/gi, 'declined'],
  [/increased/gi, 'decreased'],
  [/rising/gi, 'falling'],
  [/surged/gi, 'collapsed'],
]

function negate(sentence: string): string | null {
  for (const [pattern, replacement] of FLIPS) {
    if (pattern.test(sentence)) return sentence.replace(pattern, replacement)
  }
  return null
}

const cases: Case[] = []
let counter = 0
const nextId = (kind: string) => `g-${String(++counter).padStart(4, '0')}-${kind}`

for (const doc of sources) {
  const ref = doc.id
  const list = sentences(doc.text)
  const year = freshYear(doc.text)

  list.forEach((sentence, index) => {
    cases.push({ id: nextId('verbatim'), claim: sentence, ref, label: 'supported', kind: 'verbatim' })

    // two independent perturbations per sentence: one is easy to spot, one is not
    for (const salt of [index, index + 3]) {
      const swapped = swapNumber(sentence, salt)
      if (swapped) cases.push({ id: nextId('number'), claim: swapped, ref, label: 'contradicted', kind: 'number-swap' })
    }

    for (const offset of [0, 1]) {
      const moved = swapYear(sentence, year + offset)
      if (moved) cases.push({ id: nextId('period'), claim: moved, ref, label: 'partial', kind: 'year-swap' })
    }

    const inverted = negate(sentence)
    if (inverted) cases.push({ id: nextId('negation'), claim: inverted, ref, label: 'contradicted', kind: 'negation' })

    cases.push({ id: nextId('nocite'), claim: sentence, ref: null, label: 'unsupported', kind: 'no-citation' })
  })
}

const bench = {
  version: 1,
  note: 'Procedurally generated from public IDC and Counterpoint pages. Labels are correct by construction, so this set measures verifier behaviour, not human agreement. Use data/claims-bench.json for the hand-labelled hard set.',
  citations: sources.map((doc) => ({
    id: doc.id,
    docId: doc.id,
    docTitle: `${doc.publisher} · ${doc.title}`,
    quote: doc.text,
    url: doc.url,
    publishedAt: doc.publishedAt,
  })),
  cases,
}

const out = path.join(root, 'data', 'claims-bench-large.json')
fs.writeFileSync(out, JSON.stringify(bench, null, 2))

const byKind = new Map<string, number>()
for (const item of cases) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1)
console.log(`wrote ${cases.length} cases → ${path.relative(root, out)}`)
for (const [kind, count] of byKind) console.log(`  ${kind}: ${count}`)
