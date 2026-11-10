import { DOCS, chunkDocument } from '../src/server/seed.js'
import { compileWiki, coverageCheck, conflictCheck, pickRequiredFacts, type WikiSource } from '../src/server/wiki.js'

const sources: WikiSource[] = DOCS.flatMap((doc) =>
  chunkDocument(doc.content).map((text, index) => ({
    docId: doc.id,
    docTitle: doc.title,
    chunkId: `${doc.id}-c${index}`,
    text,
  })),
)

const snapshot = compileWiki(sources)

console.log(`chunks: ${sources.length}  facts: ${snapshot.facts.length}  conflicts: ${snapshot.conflicts.length}`)
console.log('')

for (const page of snapshot.pages) {
  console.log(`## ${page.angle}  (${page.facts.length} facts, ${page.conflicts.length} conflicts)`)
  for (const fact of page.facts.slice(0, 8)) {
    const flags = [fact.scenario ? 'SCENARIO' : '', fact.subject ? `@${fact.subject}` : ''].filter(Boolean).join(' ')
    console.log(`  ${fact.metric} = ${fact.value}${fact.unit}${fact.year ? ` (${fact.year})` : ''} ${flags} s=${fact.salience}`)
    console.log(`     ${fact.sentence.slice(0, 72)}`)
  }
  console.log('')
}

console.log('## required facts')
for (const fact of pickRequiredFacts(snapshot.facts, 3)) {
  console.log(`  [${fact.angle}] ${fact.metric} ${fact.value}${fact.unit}${fact.year ? ` (${fact.year})` : ''} · ${fact.docTitle}`)
}
console.log('')

console.log('## conflicts')
for (const conflict of snapshot.conflicts.slice(0, 10)) {
  console.log(`  ${conflict.metric} ${conflict.subject ? `@${conflict.subject}` : ''} ${conflict.year ?? ''} spread=${conflict.spread}`)
  for (const value of conflict.values) {
    console.log(`    ${value.value}  ${value.docTitle}  | ${value.sentence.slice(0, 56)}`)
  }
}
console.log('')

// A hand-copied v1 report body: the same factual sentences reportV1 emits.
const sampleV1 = `# AI 眼镜产业链投资价值研究
## 一、核心结论
1. AI 眼镜正处于渗透率拐点前，2024—2028 年出货量复合增速约 65% [M1]。
2. 价值池向光学与 SoC 集中，二者合计约占 BOM 价值池的一半 [L1]。
3. Meta 仍占据全球约六成份额，中国厂商的机会在性价比与本地生态 [C1]。
## 二、市场：拐点前的高增长
2024 年全球 AI 眼镜出货量约 230 万台，同比增长 210% [M1]。IDC 预计 2028 年达到 3200 万台，对应 2024—2028 年复合增速约 65% [M1]。
预计 2028 年全球出货量将突破 5000 万台 [M1]。
价格带正在下探。2024 年主流产品 ASP 约 299 美元，随着 BOM 每年下降 8%—12%，2027 年可能降至 249 美元 [M2]。
## 三、产业链：价值向光学与芯片集中
一台 299 美元的 AI 眼镜，BOM 约 160 美元，其中 SoC 占 32%，光学与摄像头占 18%，组装占 14% [L1]。
毛利率的分布更关键：整机品牌约 25%—35%，组装代工只有 8%—12%，而低功耗 SoC 可达 45%—55% [L2]。
## 四、竞争：Meta 领跑，中国厂商追赶
2024 年 Meta 与雷朋合作的 Ray-Ban Meta 系列份额约 62%，优势来自品牌、3000 多家线下门店与社交生态 [C1]。
中国厂商走三条路径：性价比、本地生态、垂直场景。雷鸟、Rokid、小米、华为在不同价格带竞争 [C2]。
行业将在 2027 年迎来第一轮洗牌。
`

const coverage = coverageCheck(sampleV1, snapshot.facts, 3)
const conflicts = conflictCheck(sampleV1, snapshot.conflicts)
console.log(`## coverage of sample v1: ${coverage.covered}/${coverage.required} (${coverage.score})`)
for (const item of coverage.missing) {
  console.log(`  missing [${item.angle}] ${item.metric} ${item.value}${item.unit}${item.year ? ` (${item.year})` : ''}`)
}
console.log('')
console.log(`## conflict handling of sample v1: ${conflicts.handled}/${conflicts.total} (${conflicts.score})`)
for (const item of conflicts.unhandled) {
  console.log(`  unhandled ${item.metric}${item.subject ? ` @${item.subject}` : ''}: ${item.values.map((value) => value.value).join(' vs ')}`)
}

const ok = snapshot.conflicts.length >= 3 && coverage.score < 1 && conflicts.score < 1
console.log(ok ? '\nPROBE OK' : '\nPROBE FAILED: extraction no longer produces conflicts or gaps')
if (!ok) process.exitCode = 1
