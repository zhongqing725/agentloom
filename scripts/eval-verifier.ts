/**
 * Claim-verifier benchmark: legacy rules (v1) vs four-state entailment (v2).
 *   pnpm tsx scripts/eval-verifier.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Citation } from '../src/shared/types.js'
import { classifyClaim } from '../src/server/entailment.js'
import { tokenize } from '../src/server/retrieval.js'

type Label = 'supported' | 'partial' | 'contradicted' | 'unsupported'
type Case = { id: string; claim: string; ref: string | null; label: Label }
type Bench = { citations: Array<{ id: string; docTitle: string; quote: string; docId: string }>; cases: Case[] }

const benchPath = process.argv[2] ?? 'data/claims-bench.json'
const bench = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), benchPath), 'utf8').replace(/^\\uFEFF/, '')) as Bench
const library = new Map<string, Citation>(
  bench.citations.map((item) => [item.id, { id: item.id, docId: item.docId, docTitle: item.docTitle, quote: item.quote }]),
)

const numbersIn = (text: string) =>
  (text.match(/\d+(?:\.\d+)?/g) ?? []).map((value) => value.replace(/\.0$/, '')).filter((value) => {
    const numeric = Number(value)
    return !(numeric >= 1900 && numeric <= 2100)
  })

/** The v1 rule set, kept only for comparison. */
function legacy(claim: string, citation: Citation | undefined): Label {
  const refs = [...claim.matchAll(/\[([A-Z]\d+)\]/g)].map((match) => match[1])
  if (refs.length === 0 || !citation) return 'unsupported'
  const claimNumbers = numbersIn(claim.replace(/\[[A-Z]\d+\]/g, ''))
  const quoteNumbers = numbersIn(citation.quote)
  if (claimNumbers.some((value) => !quoteNumbers.includes(value))) return 'unsupported'
  const claimTokens = new Set(tokenize(claim.replace(/\[[A-Z]\d+\]/g, '')))
  const quoteTokens = new Set(tokenize(citation.quote))
  let overlap = 0
  for (const token of claimTokens) if (quoteTokens.has(token)) overlap += 1
  return overlap >= 2 ? 'supported' : 'unsupported'
}

const LABELS: Label[] = ['supported', 'partial', 'contradicted', 'unsupported']
const confusion = new Map<string, number>()
const rows: Array<{ id: string; claim: string; truth: Label; v1: Label; v2: Label; v2label: Label }> = []

for (const item of bench.cases) {
  const citation = item.ref ? library.get(item.ref) : undefined
  const v1 = legacy(item.ref ? `${item.claim} [${item.ref}]` : item.claim, citation)
  const v2 = classifyClaim(item.claim, citation)
  rows.push({ id: item.id, claim: item.claim, truth: item.label, v1, v2: v2.label, v2label: v2.label })
  confusion.set(`${item.label}→${v2.label}`, (confusion.get(`${item.label}→${v2.label}`) ?? 0) + 1)
}

const macro = (predicate: (row: (typeof rows)[number]) => Label) => {
  const per = LABELS.map((label) => {
    const tp = rows.filter((row) => row.truth === label && predicate(row) === label).length
    const fp = rows.filter((row) => row.truth !== label && predicate(row) === label).length
    const fn = rows.filter((row) => row.truth === label && predicate(row) !== label).length
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
    const support = rows.filter((row) => row.truth === label).length
    return { label, precision, recall, f1, support }
  })
  const correct = rows.filter((row) => row.truth === predicate(row)).length
  return { per, accuracy: correct / rows.length }
}

const v1 = macro((row) => row.v1)
const v2 = macro((row) => row.v2)

const pct = (value: number) => `${(value * 100).toFixed(0)}%`
const pad = (value: string, width: number) => value.padEnd(width, ' ')

console.log(`claims: ${rows.length}`)
console.log(`\n4-class accuracy   v1 ${pct(v1.accuracy)}   v2 ${pct(v2.accuracy)}`)
console.log(`binary (supported) v1 ${pct(v1.per[0].f1)} F1   v2 ${pct(v2.per[0].f1)} F1`)

console.log('\nper class (v2)')
console.log(`${pad('label', 14)}${pad('P', 7)}${pad('R', 7)}${pad('F1', 7)}support`)
for (const row of v2.per) {
  console.log(`${pad(row.label, 14)}${pad(pct(row.precision), 7)}${pad(pct(row.recall), 7)}${pad(pct(row.f1), 7)}${row.support}`)
}

console.log('\nconfusion (truth → v2)')
for (const truth of LABELS) {
  const parts = LABELS.map((pred) => {
    const value = confusion.get(`${truth}→${pred}`) ?? 0
    return value > 0 ? `${pred}:${value}` : null
  }).filter(Boolean)
  console.log(`${pad(truth, 14)}${parts.join('  ') || '—'}`)
}

const dangerous = rows.filter((row) => row.truth === 'contradicted' && row.v2 === 'supported').length
const contradicted = rows.filter((row) => row.truth === 'contradicted').length
console.log(`\ncontradicted passed as supported: ${dangerous}/${contradicted}`)

const wrong = rows.filter((row) => row.truth !== row.v2)
if (wrong.length > 0) {
  console.log('\nmisclassified')
  for (const row of wrong) console.log(`- ${row.id} ${row.truth} → ${row.v2}: ${row.claim}`)
}
