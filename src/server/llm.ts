import type { Agent, Candidate, Citation, Mode, NodeOutput, ToolCall, Usage, Verdict, VerdictRoute } from '../shared/types.js'
import { firstSentences, tokenize } from './retrieval.js'
import { classifyClaim, type ClaimVerdict } from './entailment.js'
import { invokeTool, openAiTools, toolsForAgent } from './tools.js'

export interface Evidence {
  ref: string
  docId: string
  docTitle: string
  quote: string
  score: number
}

export interface AgentContext {
  agent: Agent
  nodeId: string
  angle?: string
  input: string
  upstream: Array<{ nodeId: string; title: string; output: NodeOutput }>
  evidence: Evidence[]
  feedback?: string
  iteration: number
  mode: Mode
}

const ANGLE_KEYWORDS: Record<string, string[]> = {
  市场: ['出货', '市场', '渗透', '价格', '增长', '规模', 'ASP', '销量'],
  产业链: ['BOM', '毛利', '价值', '光学', '芯片', '成本', '环节', '器件'],
  竞争: ['份额', 'Meta', '竞争', '渠道', '品牌', '厂商', '雷朋', '护城河'],
}

const ANGLE_THESIS: Record<string, string> = {
  市场: '行业仍处早期，但增速快、预测对渗透率假设高度敏感，2026—2028 是观察拐点的关键窗口。',
  产业链: '价值池向光学与低功耗 SoC 集中，整机与组装的规模弹性大但毛利率低。',
  竞争: 'Meta 的领先来自品牌、渠道与生态的组合；中国厂商的突破口是性价比、本地服务与快速迭代。',
}

const ANGLE_RISK: Record<string, string> = {
  市场: '出货量预测依赖渗透率假设，若退货率与留存不改善，增速可能低于预期。',
  产业链: '光学良率、芯片产能与价格战可能压缩上游毛利。',
  竞争: '手机厂商与互联网公司进入后，可能用补贴与渠道优势重写份额。',
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 2.2))
}

function usageOf(prompt: string, completion: string): Usage {
  const promptTokens = estimateTokens(prompt)
  const completionTokens = estimateTokens(completion)
  return {
    promptTokens,
    completionTokens,
    cost: Number((((promptTokens + completionTokens) / 1000) * 0.002).toFixed(5)),
  }
}

function sumUsage(items: Usage[]): Usage {
  return items.reduce(
    (acc, item) => ({
      promptTokens: acc.promptTokens + item.promptTokens,
      completionTokens: acc.completionTokens + item.completionTokens,
      cost: Number((acc.cost + item.cost).toFixed(5)),
    }),
    { promptTokens: 0, completionTokens: 0, cost: 0 },
  )
}

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function upstreamData(ctx: AgentContext, predicate?: (item: AgentContext['upstream'][number]) => boolean) {
  return ctx.upstream.filter(predicate ?? (() => true)).map((item) => item.output.data).filter(Boolean)
}

function researcherOutputs(ctx: AgentContext) {
  return ctx.upstream
    .filter((item) => item.nodeId === 'market' || item.nodeId === 'chain' || item.nodeId === 'competition')
    .map((item) => item.output)
}

/** The writer is usually `writer`, but an edited canvas may name it anything. */
function lastMarkdown(ctx: AgentContext): NodeOutput | undefined {
  return [...ctx.upstream].reverse().find((item) => item.output.markdown)?.output
}

function allCitations(ctx: AgentContext): Citation[] {
  const map = new Map<string, Citation>()
  for (const item of ctx.upstream) {
    for (const citation of item.output.citations ?? []) {
      map.set(citation.id, citation)
    }
  }
  for (const evidence of ctx.evidence) {
    map.set(evidence.ref, {
      id: evidence.ref,
      docId: evidence.docId,
      docTitle: evidence.docTitle,
      quote: evidence.quote,
      score: evidence.score,
    })
  }
  return [...map.values()]
}

function citation(ctx: AgentContext, id: string): string {
  return allCitations(ctx).some((item) => item.id === id) ? `[${id}]` : `[${id}]`
}

function splitSentences(text: string): string[] {
  return text
    .replace(/^#+\s.*$/gm, '')
    .replace(/^>\s.*$/gm, '')
    .replace(/\n+/g, ' ')
    .split(/(?<=[。！？；])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 8)
}

function pickSentences(evidence: Evidence[], angle: string, count = 2): string[] {
  const keywords = ANGLE_KEYWORDS[angle] ?? []
  const ranked = evidence
    .flatMap((item) => splitSentences(item.quote))
    .map((sentence) => {
      let score = 0
      for (const keyword of keywords) if (sentence.includes(keyword)) score += 2
      if (/\d/.test(sentence)) score += 1.2
      if (sentence.length > 30) score += 0.5
      return { sentence, score }
    })
    .sort((a, b) => b.score - a.score)
  const selected: string[] = []
  for (const item of ranked) {
    if (selected.includes(item.sentence)) continue
    selected.push(item.sentence)
    if (selected.length >= count) break
  }
  return selected
}

function mockPlanner(ctx: AgentContext): NodeOutput {
  const data = {
    topic: ctx.input,
    questions: [
      {
        id: 'q1',
        angle: '市场',
        question: '2024—2028 年 AI 眼镜的出货量、渗透率与价格带会如何演变？',
        why: '判断行业增速与市场空间的上限。',
      },
      {
        id: 'q2',
        angle: '产业链',
        question: 'AI 眼镜 BOM 中哪些环节价值量最高、议价能力最强？',
        why: '判断利润池在哪里，避免只看出货量。',
      },
      {
        id: 'q3',
        angle: '竞争',
        question: 'Meta、雷朋与中国厂商的份额、渠道与生态壁垒是什么？',
        why: '判断谁能把行业增长转化为可持续利润。',
      },
    ],
    thesis: 'AI 眼镜正从极客玩具走向大众终端，2026—2028 年是渗透率拐点；价值池向光学与 SoC 集中，整机品牌的机会在渠道与生态。',
    assumptions: ['AI 助手成为高频入口', '供应链每年降本 8%—12%', '监管不出现实质性收紧'],
  }
  const text = asJson(data)
  return { text, data, usage: usageOf(ctx.agent.systemPrompt + ctx.input, text) }
}

function mockResearcher(ctx: AgentContext): NodeOutput {
  const angle = ctx.angle ?? '市场'
  const evidence = ctx.evidence
  const citations: Citation[] = evidence.map((item) => ({
    id: item.ref,
    docId: item.docId,
    docTitle: item.docTitle,
    quote: item.quote,
    score: item.score,
  }))
  const sentences = pickSentences(evidence, angle, 3)
  const summary =
    sentences.length > 0
      ? `${angle}方面，证据显示：${sentences.slice(0, 2).join('')}`
      : `${angle}方面的直接证据不足，需要用相邻行业数据做类比，并标记为待验证假设。`
  const keyPoints = [
    `核心事实：${sentences[0] ?? '当前知识库没有足够的直接证据。'}`,
    `结构判断：${ANGLE_THESIS[angle] ?? '需要更多证据才能形成结构判断。'}`,
    `待验证：${ANGLE_RISK[angle] ?? '关键假设仍需补充数据。'}`,
  ]
  const data = {
    angle,
    summary,
    keyPoints,
    evidence: citations,
    confidence: evidence.length >= 3 ? 0.82 : 0.55,
  }
  const text = asJson(data)
  // Cite evidence sentences verbatim: the verifier can actually check these.
  const cited = evidence
    .slice(0, 3)
    .map((item) => {
      const sentence = item.quote.split(/(?<=[。！？])/)[0].replace(/[。！？]$/, '')
      return `${sentence} [${item.ref}]。`
    })
    .join('\n\n')
  const markdown = cited || [summary, ...keyPoints].join('\n\n')
  return {
    text,
    markdown,
    data,
    citations,
    usage: usageOf(ctx.agent.systemPrompt + JSON.stringify(evidence), text),
  }
}

function mockAnalyst(ctx: AgentContext): NodeOutput {
  const outputs = researcherOutputs(ctx)
  const parsed = outputs
    .map((output) => output.data as { angle?: string; summary?: string; keyPoints?: string[]; evidence?: Citation[] } | undefined)
    .filter(Boolean)
  const citations = allCitations(ctx)
  const evidenceRef = (angle: string) => {
    const item = parsed.find((entry) => entry?.angle === angle)
    const refs = (item?.evidence ?? []).map((citation) => citation.id)
    return refs[0] ? `[${refs[0]}]` : ''
  }

  const insights = [
    {
      title: '市场：拐点前的高增长',
      body: parsed.find((entry) => entry?.angle === '市场')?.summary ?? '市场证据不足。',
      evidence: evidenceRef('市场'),
    },
    {
      title: '产业链：价值向光学与芯片集中',
      body: parsed.find((entry) => entry?.angle === '产业链')?.summary ?? '产业链证据不足。',
      evidence: evidenceRef('产业链'),
    },
    {
      title: '竞争：Meta 领跑，中国厂商追赶',
      body: parsed.find((entry) => entry?.angle === '竞争')?.summary ?? '竞争证据不足。',
      evidence: evidenceRef('竞争'),
    },
  ]

  const candidates: Candidate[] = [
    {
      id: 'base',
      name: '稳健情景',
      stance: '渗透率线性提升，优先配置确定性更高的上游。',
      points: [
        `2028 年全球出货量约 3200 万台，行业复合增速约 65% ${citation(ctx, 'M1')}`,
        `光学与 SoC 合计拿走 BOM 价值池约一半 ${citation(ctx, 'L1')}`,
        '整机品牌竞争激烈，优先选择光学、低功耗 SoC 与高毛利环节。',
      ],
      score: 0.88,
      rationale: '证据覆盖最完整，假设最保守，适合作为基准情景。',
    },
    {
      id: 'bull',
      name: '进取情景',
      stance: 'AI 助手成为手机替代入口，出货量超预期。',
      points: [
        '2028 年出货量上探 4500 万台，整机与渠道弹性最大。',
        '手机厂商进入后可能用配件逻辑定价，加速渗透。',
        '风险是价格战压缩毛利，需要精选品牌与渠道。',
      ],
      score: 0.79,
      rationale: '上行空间大，但对渗透率和生态成熟度的假设更激进。',
    },
    {
      id: 'bear',
      name: '反方情景',
      stance: '重量、续航与隐私制约，行业增速低于预期。',
      points: [
        '退货率约 15%，30 日留存仅 21%，产品力尚未验证。',
        '手机厂商与互联网公司进入后可能重演价格战。',
        '估值对出货量高度敏感，增速不及预期会快速回调。',
      ],
      score: 0.83,
      rationale: '风险识别到位，但缺少对上行催化的讨论。',
    },
  ]

  const chosen = candidates.find((candidate) => candidate.id === 'base')!
  const judge =
    '裁判按证据覆盖、假设可检验性、行动性三项打分：稳健情景 0.88，反方 0.83，进取 0.79。选择稳健情景作为主判断，反方情景保留为风险压力测试。'

  const data = {
    thesis:
      'AI 眼镜正从极客玩具走向大众终端，2026—2028 年是渗透率拐点。价值池向光学与 SoC 集中，整机品牌的机会在渠道与生态，而不是硬件本身。',
    insights,
    scenarios: candidates,
    recommendation:
      '优先关注单机价值量高、格局集中、毛利率稳定的光学与低功耗 SoC；整机品牌需要用退货率、日活与复购证明产品力。',
    disagreements: [
      '市场研究员认为 2028 年出货量可达 3200 万台，反方情景认为退货率会拖累增速。',
      '竞争情报员认为 Meta 的渠道壁垒稳固，进取情景认为手机厂商会用配件逻辑重写格局。',
    ],
    judge,
    chosenId: chosen.id,
  }
  const text = asJson(data)
  const cited = ctx.evidence
    .slice(0, 3)
    .map((item) => {
      const sentence = item.quote.split(/(?<=[。！？])/)[0].replace(/[。！？]$/, '')
      return `${sentence} [${item.ref}]。`
    })
    .join('\n\n')
  return {
    text,
    markdown: cited || text,
    data,
    citations,
    candidates,
    chosenId: chosen.id,
    judge,
    usage: usageOf(ctx.agent.systemPrompt + JSON.stringify(parsed), text),
  }
}

function citationResolver(citations: Citation[]) {
  return (...needles: string[]) => {
    const exact = citations.find((item) => needles.every((needle) => item.quote.includes(needle)))
    const partial = citations.find((item) => needles.some((needle) => item.quote.includes(needle)))
    const hit = exact ?? partial ?? citations[0]
    return hit ? `[${hit.id}]` : ''
  }
}

function reportV1(ctx: AgentContext): string {
  const citations = allCitations(ctx)
  const cite = citationResolver(citations)
  const analyst = ctx.upstream.find((item) => item.nodeId === 'analyst')?.output.data as
    | { scenarios?: Candidate[]; thesis?: string }
    | undefined
  const scenarios = analyst?.scenarios ?? []
  const scenarioBlock = scenarios
    .map(
      (scenario) =>
        `### ${scenario.name}\n\n${scenario.stance}\n\n${scenario.points.map((point) => `- ${point}`).join('\n')}`,
    )
    .join('\n\n')

  return `# AI 眼镜产业链投资价值研究

> 研究任务：${ctx.input}
> 版本：v1（待核查）
> 生成：织序 AgentLoom · 多智能体研究团队

## 一、核心结论

1. 2024 年全球 AI 眼镜出货量约 230 万台，同比增长 210% ${cite('230', '210')}。
2. IDC 预计 2028 年全球出货量达到 3200 万台，2024—2028 年复合增速约 65% ${cite('3200', '65%')}。
3. 光学与 SoC 合计拿走 BOM 价值池的一半左右 ${cite('一半')}。
4. 2024 年 Meta 与雷朋合作的 Ray-Ban Meta 系列份额约 62% ${cite('62%')}。

## 二、市场：拐点前的高增长

2024 年全球 AI 眼镜出货量约 230 万台，同比增长 210% ${cite('230', '210')}。其中中国市场出货量约 80 万台，占全球 35% ${cite('230')}。IDC 预计 2028 年达到 3200 万台，对应 2024—2028 年复合增速约 65% ${cite('3200', '65%')}。

预计 2028 年全球出货量将突破 5000 万台 ${cite('3200')}。

价格带正在下探。2024 年 AI 眼镜平均售价约 299 美元，主流产品集中在 249—349 美元 ${cite('299', '249')}。随着 SoC、摄像头模组和声学器件降本，行业平均 BOM 预计每年下降 8%—12% ${cite('BOM', '8%—12%')}。这会加速渗透，但也会压缩整机毛利。

## 三、产业链：价值向光学与芯片集中

整机 BOM 约 160 美元，其中 SoC 占 32%，光学与摄像头占 18%，组装占 14% ${cite('160', '32%')}。

整机品牌毛利率约 25%—35%，组装代工约 8%—12%，光学模组约 35%—45%，低功耗 SoC 约 45%—55% ${cite('25%', '45%')}。这意味着出货量增长并不必然带来整机利润增长。

以 2028 年 3200 万台、ASP 249 美元计算，整机市场规模约 79.7 亿美元，对应 BOM 价值池约 40 亿美元 ${cite('79.7', '40')}。光学与 SoC 合计拿走 BOM 价值池的一半左右 ${cite('一半')}。

## 四、竞争：Meta 领跑，中国厂商追赶

2024 年 Meta 与雷朋合作的 Ray-Ban Meta 系列份额约 62%，2025 年预计仍保持在 60% 左右 ${cite('62%', '60%')}。

2024 年中国市场雷鸟创新份额约 12%，Rokid 约 9%，小米约 8%，华为约 6% ${cite('雷鸟创新')}。

字节、阿里、百度等互联网公司正在评估 AI 眼镜入口 ${cite('字节')}。

行业将在 2027 年迎来第一轮洗牌。

## 五、三种情景

> 以下为情景假设，不是事实陈述，用于压力测试，不参与事实核查。

${scenarioBlock}

## 六、风险提示

- 产品力尚未形成刚需，退货率与留存是行业最大的不确定性。
- 手机厂商进入后可能用配件逻辑定价，压缩创业公司空间。
- 一级市场估值隐含高增长假设，出货量不及预期会回调。

## 七、投资建议

优先关注单机价值量高、格局集中、毛利率稳定的光学与低功耗 SoC；整机品牌需要用退货率、日活与复购证明产品力。2026—2028 年是关键窗口，建议按季度跟踪出货量、ASP 与退货率。

## 证据索引

${citations.map((item) => `- [${item.id}] ${item.docTitle}：${firstSentences(item.quote, 1)}`).join('\n')}
`
}

function reportV2(ctx: AgentContext): string {
  const citations = allCitations(ctx)
  const cite = citationResolver(citations)
  return reportV1(ctx)
    .replace('> 版本：v1（待核查）', '> 版本：v2（已核查）')
    .replace(
      /预计 2028 年全球出货量将突破 5000 万台 \[[A-Z]\d+\]。/,
      `预计 2028 年全球出货量约 3200 万台，对应 2024—2028 年复合增速约 65% ${cite('3200', '65%')}。`,
    )
    .replace(
      `其中中国市场出货量约 80 万台，占全球 35% ${cite('230')}。`,
      `其中中国市场约 48 万台，占全球 21% ${cite('48', '21%')}。`,
    )
    .replace(
      '行业将在 2027 年迎来第一轮洗牌。',
      `2026—2027 年，行业可能进入第一轮洗牌 ${cite('2026—2027')}。`,
    )
    .replace(
      '## 一、核心结论',
      '> 修订说明：第 2 轮根据事实核查意见，修正了 2028 年出货量数字，并为竞争格局判断补充了引用。\n\n## 一、核心结论',
    )
}

function mockSpecialist(ctx: AgentContext): NodeOutput {
  const upstreamCount = ctx.upstream.length
  const data = {
    summary: `${ctx.agent.name}对 ${upstreamCount} 个上游节点的输出做了独立审查，重点检查「${ctx.agent.title}」。`,
    findings: [
      '事实性结论与情景假设已经分开标注，没有把预测写成事实。',
      '关键数字都能在证据索引中找到对应片段，但部分判断仍依赖单一来源。',
      '竞争格局与风险提示之间存在张力，建议在终稿中保留反方情景。',
    ],
    recommendation: '建议保留稳健情景作为主判断，同时把反方情景写入风险提示；对单一来源的判断补充第二来源后再对外发布。',
    reviewedNodes: ctx.upstream.map((item) => item.title),
  }
  const text = asJson(data)
  const markdown = ctx.evidence
    .slice(0, 3)
    .map((item) => {
      const sentence = item.quote.split(/(?<=[。！？])/)[0].replace(/[。！？]$/, '')
      return `${sentence} [${item.ref}]。`
    })
    .join('\n\n')
  return {
    text,
    markdown,
    data,
    usage: usageOf(ctx.agent.systemPrompt + JSON.stringify(ctx.upstream.map((item) => item.output.data)), text),
  }
}

function bestCitationFor(sentence: string, citations: Citation[]): string | undefined {
  const tokens = new Set(tokenize(sentence))
  let best: { id: string; overlap: number } | undefined
  for (const citation of citations) {
    let overlap = 0
    for (const token of tokenize(citation.quote)) {
      if (tokens.has(token)) overlap += 1
    }
    if (best === undefined || overlap > best.overlap) best = { id: citation.id, overlap }
  }
  return best?.overlap ? best.id : citations[0]?.id
}

/**
 * Mock-mode instruction following.
 *
 * The mock writer produces fixed prose, so a prompt change alone would never
 * move its score. These two explicit constraints — the same sentences the
 * trainer appends to candidate prompts — let the simulator demonstrate the
 * training loop offline. A live model reads them as ordinary instructions.
 */
function applyWriterConstraints(markdown: string, prompt: string, citations: Citation[]): string {
  let text = markdown
  const quotes = citations.map((citation) => citation.quote)

  if (/只允许使用证据原文中出现过的数字|只使用证据中出现过的数字/.test(prompt)) {
    text = text
      .split('\n')
      .filter((line) => {
        const numbers = numbersIn(line.replace(/^\s*\d+[.)、]\s*/, '').replace(/\[[A-Z]\d+\]/g, ''))
        if (numbers.length === 0) return true
        return numbers.every((number) => quotes.some((quote) => numbersIn(quote).includes(number)))
      })
      .join('\n')
  }

  if (/必须给出证据编号|每条结论都要有引用|每条结论必须带引用/.test(prompt)) {
    text = text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed) return line
        if (/^[#>\-|]/.test(trimmed) || /^\d+\./.test(trimmed)) return line
        if (/\[[A-Z]\d+\]/.test(trimmed)) return line
        if (!/[\u4e00-\u9fff]/.test(trimmed)) return line
        const ref = bestCitationFor(trimmed, citations)
        if (!ref) return line
        return trimmed.endsWith('。') ? `${trimmed.slice(0, -1)} [${ref}]。` : `${trimmed} [${ref}]`
      })
      .join('\n')
  }

  if (/不要使用.约|去掉模糊词|避免模糊表述/.test(prompt)) {
    text = text.replace(/约 ?/g, '')
  }

  return text
}

/**
 * Writer path for evidence that is not the built-in demo corpus (an imported
 * CNKI paper or an official report): every line is lifted from a real quote and
 * carries that quote's ref, so nothing is invented.
 */
function mockEvidenceReport(ctx: AgentContext): string {
  const citations = allCitations(ctx).slice(0, 5)
  const lines = citations.map((citation, index) => {
    const sentence = firstSentences(citation.quote, 1).replace(/\s+/g, ' ').trim()
    // The ref has to sit inside the sentence: the verifier splits on 。 first.
    const body = sentence.endsWith('。') ? `${sentence.slice(0, -1)} ` : `${sentence} `
    return `${index + 1}. ${body}[${citation.id}]。`
  })
  const heading = ctx.input.replace(/^请[^《]*《([^》]+)》.*$/, '$1').slice(0, 48) || '研究结论'
  return `# ${heading}\n\n## 一、核心结论\n\n${lines.join('\n')}\n\n## 证据索引\n\n${citations
    .map((citation) => `- [${citation.id}] ${citation.docTitle}`)
    .join('\n')}\n`
}

function mockWriter(ctx: AgentContext): NodeOutput {
  const citations = allCitations(ctx)
  // The built-in demo keeps its scripted v1 → v2 report; any other corpus gets
  // an evidence-grounded report instead of text that ignores the source.
  const isDemoCorpus = citations.some((citation) => /^[MLC]\d+$/.test(citation.id))
  const draft = isDemoCorpus
    ? ctx.iteration > 0 || ctx.feedback
      ? reportV2(ctx)
      : reportV1(ctx)
    : mockEvidenceReport(ctx)
  const markdown = applyWriterConstraints(draft, ctx.agent.systemPrompt, citations)
  const data = {
    markdown,
    version: ctx.iteration > 0 ? 'v2' : 'v1',
    wordCount: markdown.length,
    citationCount: citations.length,
    appliedFeedback: Boolean(ctx.feedback),
  }
  return {
    text: markdown,
    markdown,
    data,
    citations,
    usage: usageOf(ctx.agent.systemPrompt + JSON.stringify(ctx.upstream.map((item) => item.output.data)), markdown),
  }
}

/** Scores one agent output with the same rule-based verifier a run uses. */
export function scoreAgentOutput(output: NodeOutput, ctx: AgentContext, threshold: number): Verdict {
  const text = output.markdown ?? output.text ?? ''
  return deterministicVerdict(text, allCitations(ctx), threshold)
}

function extractClaims(markdown: string): string[] {
  const body = markdown
    .split('## 证据索引')[0]
    .split('## 五、三种情景')[0]
    .split('## 七、投资建议')[0]
  return body
    .replace(/^#+\s.*$/gm, '')
    .replace(/^>\s.*$/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+[.)、]\s*/gm, '')
    .replace(/\n+/g, ' ')
    .split(/(?<=[。！？])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 14)
    .filter((sentence) => /\[[A-Z]\d+\]/.test(sentence) || (/\d/.test(sentence) && !/版本|生成|研究任务|证据索引/.test(sentence)))
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? [])
    .map((value) => value.replace(/\.0$/, ''))
    .filter((value) => {
      const numeric = Number(value)
      return !(numeric >= 1900 && numeric <= 2100)
    })
}

function inferRouteTarget(claim: string, citation?: string | null): string {
  const ref = citation?.match(/^[MLC]/)?.[0] ?? claim.match(/\[([MLC])\d+\]/)?.[1]
  if (ref === 'M') return 'market'
  if (ref === 'L') return 'chain'
  if (ref === 'C') return 'competition'
  if (/市场|出货|价格|渗透率/.test(claim)) return 'market'
  if (/产业链|BOM|毛利|光学|芯片/.test(claim)) return 'chain'
  if (/竞争|份额|Meta|渠道|厂商|洗牌|格局/.test(claim)) return 'competition'
  return 'writer'
}

function routesFromClaims(claims: Verdict['claims'] = [], issues: string[] = []): VerdictRoute[] {
  const routes = claims
    .filter((claim) => !claim.supported)
    .map((claim) => ({
      type: claim.citation ? ('logic' as const) : ('citation' as const),
      target: inferRouteTarget(claim.claim, claim.citation),
      message: claim.reason,
    }))
  if (routes.length > 0) return routes
  return issues.map((message) => ({ type: 'other' as const, target: 'writer', message }))
}

function deterministicVerdict(markdown: string, citations: Citation[], threshold: number): Verdict {
  const refMap = new Map(citations.map((citation) => [citation.id, citation]))
  const claims = extractClaims(markdown)
  const checked: Array<{
    claim: string
    citation: string | null
    supported: boolean
    label: ClaimVerdict['label']
    confidence: number
    checks: string[]
    reason: string
    route?: VerdictRoute
  }> = claims.map((claim) => {
    const refs = [...claim.matchAll(/\[([A-Z]\d+)\]/g)].map((match) => match[1])
    const citation = refs.length > 0 ? refMap.get(refs[0]) : undefined
    const verdict = classifyClaim(claim, citation)
    const supported = verdict.label === 'supported'

    let route: VerdictRoute | undefined
    if (!supported) {
      const type: VerdictRoute['type'] =
        refs.length === 0 || !citation
          ? 'citation'
          : verdict.checks.some((check) => check.startsWith('number-missing'))
            ? 'number'
            : 'logic'
      // A wrong number is a synthesis error: send it to the analyst, not the
      // researcher whose quote was correct.
      route = { type, target: type === 'number' ? 'analyst' : inferRouteTarget(claim, refs[0]), message: verdict.reason }
    }

    return {
      claim,
      citation: refs[0] ?? null,
      supported,
      label: verdict.label,
      confidence: verdict.confidence,
      checks: verdict.checks,
      reason: verdict.reason,
      route,
    }
  })

  const weightOf = (item: { label: string }) => (item.label === 'supported' ? 1 : item.label === 'partial' ? 0.5 : 0)
  const score =
    checked.length === 0
      ? 0
      : Number((checked.reduce((sum, item) => sum + weightOf(item), 0) / checked.length).toFixed(2))
  const issues = checked.filter((item) => !item.supported).map((item) => `${item.reason}「${item.claim.slice(0, 38)}…」`)
  const routes = checked
    .filter((item) => !item.supported && item.route)
    .map((item) => item.route!)
  return {
    passed: score >= threshold,
    score,
    issues,
    routes,
    claims: checked,
  }
}

function mockVerifier(ctx: AgentContext, threshold: number): NodeOutput {
  const writer = ctx.upstream.find((item) => item.nodeId === 'writer')?.output ?? lastMarkdown(ctx)
  const markdown = writer?.markdown ?? writer?.text ?? ''
  const verdict = deterministicVerdict(markdown, allCitations(ctx), threshold)
  const text = asJson(verdict)
  return {
    text,
    data: verdict as unknown as Record<string, unknown>,
    verdict,
    score: verdict.score,
    usage: usageOf(ctx.agent.systemPrompt + markdown, text),
  }
}

function mockEditor(ctx: AgentContext, verdict?: Verdict): NodeOutput {
  const writer = ctx.upstream.find((item) => item.nodeId === 'writer')?.output ?? lastMarkdown(ctx)
  const markdown = writer?.markdown ?? writer?.text ?? '# 研究报告\n\n暂无内容。'
  const review = verdict
    ? `> 核查结论：${verdict.passed ? '通过' : '需人工复核'}，引用支持率 ${(verdict.score * 100).toFixed(0)}%。`
    : '> 核查结论：未执行。'
  const finalMarkdown = markdown
    .replace(/^# /, '# ')
    .replace(
      '> 生成：织序 AgentLoom · 多智能体研究团队',
      `> 生成：织序 AgentLoom · 多智能体研究团队\n${review}\n> 终审：主编（AgentLoom Editorial）`,
    )
  const data = {
    markdown: finalMarkdown,
    approved: verdict?.passed ?? true,
    review,
    changes: ['补充出品与核查信息', '统一标题层级', '保留全部证据引用'],
  }
  return {
    text: finalMarkdown,
    markdown: finalMarkdown,
    data,
    citations: allCitations(ctx),
    usage: usageOf(ctx.agent.systemPrompt + markdown, finalMarkdown),
  }
}

function perspectivePrompt(perspective: string): string {
  if (perspective === '稳健') {
    return '从稳健视角出发：优先考虑确定性、证据强度和下行风险，给出保守但可执行的判断。'
  }
  if (perspective === '进取') {
    return '从进取视角出发：寻找上行催化、非线性变化和被低估的机会，但必须标注关键假设。'
  }
  return '从反方视角出发：挑战主流叙事，寻找证伪条件、隐藏风险和可能被高估的部分。'
}

type RawToolCall = {
  id: string
  type?: string
  function: { name: string; arguments: string }
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: RawToolCall[]
  tool_call_id?: string
}

async function callLive(
  system: string,
  user: string,
  options?: {
    json?: boolean
    temperature?: number
    messages?: ChatMessage[]
    tools?: ReturnType<typeof openAiTools>
  },
): Promise<{ text: string; usage: Usage; toolCalls?: RawToolCall[] }> {
  const apiKey = process.env.AGENTLOOM_API_KEY
  if (!apiKey) throw new Error('AGENTLOOM_API_KEY 未配置')
  const baseUrl = (process.env.AGENTLOOM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '')
  const model = process.env.AGENTLOOM_MODEL || 'deepseek-chat'
  const messages: ChatMessage[] = options?.messages ?? [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  const promptText = messages.map((message) => message.content ?? '').join('\n')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.3,
      ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
      ...(options?.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`LLM 请求失败 ${response.status}: ${detail.slice(0, 240)}`)
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: RawToolCall[] } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const message = payload.choices?.[0]?.message
  const text = message?.content ?? ''
  return {
    text,
    toolCalls: message?.tool_calls,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? estimateTokens(promptText),
      completionTokens: payload.usage?.completion_tokens ?? estimateTokens(text),
      cost: 0,
    },
  }
}

function parseJsonText(text: string): unknown {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return undefined
      }
    }
    return undefined
  }
}

function livePrompt(ctx: AgentContext, extra?: string): string {
  const evidence = ctx.evidence.map((item) => `[${item.ref}] ${item.docTitle}\n${item.quote}`).join('\n\n')
  return [
    `研究任务：${ctx.input}`,
    ctx.angle ? `研究角度：${ctx.angle}` : '',
    `上游输出：${asJson(ctx.upstream.map((item) => ({ title: item.title, data: item.output.data, text: item.output.text?.slice(0, 1200) })))}`,
    evidence ? `可用证据：\n${evidence}` : '',
    ctx.feedback ? `上一轮核查反馈：${ctx.feedback}` : '',
    extra ?? '',
    '请严格按系统提示输出。',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function toLiveOutput(ctx: AgentContext, text: string, usage: Usage, json: boolean): NodeOutput {
  const parsed = json ? parseJsonText(text) : undefined
  const data = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined
  return {
    text,
    data,
    markdown: ctx.agent.role === 'writer' || ctx.agent.role === 'editor' ? text : undefined,
    citations: allCitations(ctx),
    usage,
  }
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function liveAgent(ctx: AgentContext): Promise<NodeOutput> {
  const json = ctx.agent.role !== 'editor'
  const specs = toolsForAgent(ctx.agent)
  if (specs.length === 0) {
    const result = await callLive(ctx.agent.systemPrompt, livePrompt(ctx), {
      json,
      temperature: ctx.agent.temperature,
    })
    return toLiveOutput(ctx, result.text, result.usage, json)
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: ctx.agent.systemPrompt },
    {
      role: 'user',
      content: livePrompt(ctx, '需要计算时调用 calculator；需要证据时调用 knowledge_search。工具结果要写进最终回答。'),
    },
  ]
  const calls: ToolCall[] = []
  let text = ''
  let usage: Usage = { promptTokens: 0, completionTokens: 0, cost: 0 }

  for (let hop = 0; hop < 3; hop += 1) {
    // A tool turn must stay free-form; response_format=json_object blocks tool calls on some providers.
    const result = await callLive('', '', {
      json: false,
      temperature: ctx.agent.temperature,
      messages,
      tools: openAiTools(specs),
    })
    usage = sumUsage([usage, result.usage])
    if (result.text) text = result.text
    if (!result.toolCalls?.length) break

    messages.push({ role: 'assistant', content: result.text || null, tool_calls: result.toolCalls })
    for (const raw of result.toolCalls) {
      const call = await invokeTool(raw.function.name, parseToolArgs(raw.function.arguments))
      calls.push({ ...call, id: raw.id })
      messages.push({
        role: 'tool',
        tool_call_id: raw.id,
        content: JSON.stringify(call.error ? { error: call.error } : call.result).slice(0, 4000),
      })
    }
  }

  return { ...toLiveOutput(ctx, text, usage, json), toolCalls: calls }
}

async function liveVerifier(ctx: AgentContext, threshold: number): Promise<NodeOutput> {
  const writer = ctx.upstream.find((item) => item.nodeId === 'writer')?.output ?? lastMarkdown(ctx)
  const markdown = writer?.markdown ?? writer?.text ?? ''
  try {
    const result = await callLive(
      ctx.agent.systemPrompt,
      `${livePrompt(ctx)}\n\n待核查报告：\n${markdown}\n\n请输出 JSON：{"score":0-1,"passed":boolean,"claims":[{"claim":"","citation":"","supported":boolean,"reason":""}],"issues":[""],"routes":[{"type":"citation|number|logic|coverage|wording","target":"market|chain|competition|analyst|writer|planner","message":""}]}`,
      { json: true, temperature: 0.1 },
    )
    const parsed = parseJsonText(result.text) as Verdict | undefined
    if (parsed && typeof parsed.score === 'number') {
      const issues = parsed.issues ?? []
      const claims = parsed.claims ?? []
      const verdict: Verdict = {
        passed: parsed.score >= threshold,
        score: Number(parsed.score.toFixed(2)),
        issues,
        routes: parsed.routes?.length ? parsed.routes : routesFromClaims(claims, issues),
        claims,
      }
      return {
        text: result.text,
        data: verdict as unknown as Record<string, unknown>,
        verdict,
        score: verdict.score,
        usage: result.usage,
      }
    }
  } catch {
    // fall through to deterministic verification
  }
  return mockVerifier(ctx, threshold)
}

const DEMO_CALC: Record<string, string> = {
  'agent-analyst': '3200*249/10000',
  'agent-valuation': '2000*249/10000',
}

/** Mock mode still executes the real calculator, so the offline demo has a tool trace. */
async function attachMockTool(ctx: AgentContext, output: NodeOutput): Promise<NodeOutput> {
  if (output.toolCalls?.some((call) => call.name === 'calculator')) return output
  if (!toolsForAgent(ctx.agent).some((tool) => tool.name === 'calculator')) return output
  const expression = DEMO_CALC[ctx.agent.id] ?? '3200*249/10000'
  const call = await invokeTool('calculator', { expression })
  return { ...output, toolCalls: [...(output.toolCalls ?? []), call] }
}

export async function runAgentNode(ctx: AgentContext, threshold: number): Promise<NodeOutput> {
  const output = await runAgentNodeInner(ctx, threshold)
  return ctx.mode === 'mock' ? attachMockTool(ctx, output) : output
}

async function runAgentNodeInner(ctx: AgentContext, threshold: number): Promise<NodeOutput> {
  // A verifier without the plugin is a verifier that cannot pass a report.
  if (ctx.agent.role === 'verifier' && !ctx.agent.plugins.includes('verify.citations')) {
    const verdict: Verdict = {
      passed: false,
      score: 0,
      issues: ['事实核查员未挂载 verify.citations，本次运行按未核查处理。'],
      routes: [],
    }
    return {
      text: asJson(verdict),
      data: verdict as unknown as Record<string, unknown>,
      verdict,
      score: 0,
      usage: usageOf(ctx.agent.systemPrompt, asJson(verdict)),
    }
  }

  if (ctx.agent.role === 'verifier') {
    if (ctx.mode === 'live') return liveVerifier(ctx, threshold)
    return mockVerifier(ctx, threshold)
  }

  if (ctx.agent.role === 'editor') {
    const verdict = ctx.upstream.find((item) => item.nodeId === 'verifier')?.output.verdict
      ?? [...ctx.upstream].reverse().find((item) => item.output.verdict)?.output.verdict
    if (ctx.mode === 'live') {
      const output = await liveAgent(ctx)
      return { ...output, citations: allCitations(ctx) }
    }
    return mockEditor(ctx, verdict)
  }

  if (ctx.mode === 'live') {
    return liveAgent(ctx)
  }

  if (ctx.agent.role === 'planner') return mockPlanner(ctx)
  if (ctx.agent.role === 'specialist') return mockSpecialist(ctx)
  if (ctx.agent.role === 'researcher') return mockResearcher(ctx)
  if (ctx.agent.role === 'analyst') {
    const output = mockAnalyst(ctx)
    if (!ctx.agent.plugins.includes('cognition.diverge')) {
      return { ...output, candidates: undefined, chosenId: undefined, judge: undefined }
    }
    return output
  }
  if (ctx.agent.role === 'writer') return mockWriter(ctx)
  return liveAgent(ctx)
}

export async function runDiverge(
  ctx: AgentContext,
  onBranch: (name: string) => void,
): Promise<{ output: NodeOutput; branches: Array<{ name: string; output: NodeOutput }> }> {
  const perspectives = ['稳健', '进取', '反方']
  const branches: Array<{ name: string; output: NodeOutput }> = []
  for (const perspective of perspectives) {
    onBranch(perspective)
    if (ctx.mode === 'live') {
      const output = await liveAgent({
        ...ctx,
        agent: { ...ctx.agent, systemPrompt: `${ctx.agent.systemPrompt}\n${perspectivePrompt(perspective)}` },
      })
      branches.push({ name: perspective, output })
    } else {
      const base = mockAnalyst(ctx)
      const candidate = base.candidates?.find((item) =>
        perspective === '稳健' ? item.id === 'base' : perspective === '进取' ? item.id === 'bull' : item.id === 'bear',
      )
      branches.push({
        name: perspective,
        output: {
          ...base,
          text: asJson(candidate),
          candidates: candidate ? [candidate] : undefined,
          chosenId: candidate?.id,
          usage: base.usage,
        },
      })
    }
  }
  const primary = branches[0]?.output ?? mockAnalyst(ctx)
  const candidates = branches
    .flatMap((branch) => branch.output.candidates ?? [])
    .filter((candidate, index, array) => array.findIndex((item) => item.id === candidate.id) === index)
  const chosen = candidates.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  const toolCalls = branches.flatMap((branch) => branch.output.toolCalls ?? [])
  const merged: NodeOutput = {
    ...primary,
    candidates,
    chosenId: chosen?.id,
    judge:
      primary.judge ??
      `裁判按证据覆盖、假设可检验性、行动性三项打分，选择「${chosen?.name ?? '稳健情景'}」作为主判断。`,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
  return {
    output: ctx.mode === 'mock' ? await attachMockTool(ctx, merged) : merged,
    branches,
  }
}
