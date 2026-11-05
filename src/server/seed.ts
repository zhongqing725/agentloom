import type { DatabaseSync } from 'node:sqlite'
import type { Agent, EvalFixture, GraphEdge, GraphNode, KnowledgeDoc, PluginDef, Workflow } from '../shared/types.js'

const DEMO_NOTE = '> 演示知识库资料。以下数据为模拟整理，用于展示检索、引用与核验流程，不构成真实投资依据。'

export const PROJECT = {
  id: 'project-ai-glasses',
  name: 'AI 眼镜产业链研究',
  description: '面向投资决策的 AI 眼镜产业链研究，覆盖市场、价值链、竞争与风险。',
  scenario: '产业投研',
}

export const PLUGINS: PluginDef[] = [
  {
    id: 'knowledge.retrieve',
    name: '知识检索',
    category: '知识',
    description: '从项目知识库召回证据片段，并为每条结论生成可追溯引用。',
    icon: 'BookOpen',
    color: '#2F6F6A',
    config: { topK: 4, minScore: 0.05 },
  },
  {
    id: 'cognition.diverge',
    name: '发散思考',
    category: '认知',
    description: '把一个节点展开为稳健、进取、反方三条思维分支，由裁判收敛。',
    icon: 'GitBranch',
    color: '#D4552D',
    config: { branches: 3, perspectives: ['稳健', '进取', '反方'], merge: 'judge' },
  },
  {
    id: 'cognition.critique',
    name: '自我批判',
    category: '认知',
    description: '在输出前增加一轮自我审查，标记逻辑跳跃与证据缺口。',
    icon: 'ShieldQuestion',
    color: '#8A6A3B',
    config: { rounds: 1 },
  },
  {
    id: 'verify.citations',
    name: '引用核验',
    category: '验证',
    description: '逐条核对结论与证据，输出支持率、问题清单与回环建议。',
    icon: 'BadgeCheck',
    color: '#5B5F9E',
    config: { threshold: 0.8 },
  },
  {
    id: 'cognition.debate',
    name: '多角色辩论',
    category: '认知',
    description: '让正反双方就关键判断辩论，裁判提炼共识与分歧。',
    icon: 'MessagesSquare',
    color: '#9B4F6B',
    config: { rounds: 2 },
  },
  {
    id: 'tool.calculator',
    name: '数值计算',
    category: '工具',
    description: '在沙盒中执行确定性的数值计算，避免模型口算误差。',
    icon: 'Calculator',
    color: '#4E6E8E',
    config: { precision: 2 },
  },
]

export const AGENTS: Agent[] = [
  {
    id: 'agent-planner',
    projectId: PROJECT.id,
    name: '研究规划师',
    role: 'planner',
    title: '把模糊问题拆成可执行的研究议程',
    description: '识别决策问题，拆出市场、产业链、竞争三条研究线，并给出初始假设。',
    color: '#D4552D',
    model: 'deepseek-chat',
    temperature: 0.3,
    systemPrompt:
      '你是产业研究规划师。把用户的研究任务拆成 3 个互补的研究问题，分别覆盖市场、产业链、竞争格局。每个问题要具体、可检索、可验证。同时给出一个可被推翻的初始假设。只输出 JSON。',
    tools: [],
    plugins: [],
    sort: 1,
  },
  {
    id: 'agent-market',
    projectId: PROJECT.id,
    name: '市场研究员',
    role: 'researcher',
    title: '规模、增速、渗透率与价格带',
    description: '从知识库召回市场数据，区分事实、预测与观点，给出可引用的证据。',
    color: '#2F6F6A',
    model: 'deepseek-chat',
    temperature: 0.2,
    systemPrompt:
      '你是市场研究员。只基于检索到的证据回答，不要编造数据。输出 JSON：summary、keyPoints、evidence。每条 evidence 必须带引用编号。',
    tools: ['knowledge.retrieve'],
    plugins: ['knowledge.retrieve'],
    sort: 2,
  },
  {
    id: 'agent-chain',
    projectId: PROJECT.id,
    name: '产业链研究员',
    role: 'researcher',
    title: 'BOM、价值量与关键环节',
    description: '拆解AI 眼镜的成本结构，识别价值池与议价能力最强的环节。',
    color: '#8A6A3B',
    model: 'deepseek-chat',
    temperature: 0.2,
    systemPrompt:
      '你是产业链研究员。拆解 BOM、价值量与毛利率，指出价值池最集中的环节。只基于证据回答，输出 JSON。',
    tools: ['knowledge.retrieve'],
    plugins: ['knowledge.retrieve'],
    sort: 3,
  },
  {
    id: 'agent-competition',
    projectId: PROJECT.id,
    name: '竞争情报员',
    role: 'researcher',
    title: '玩家、份额、渠道与护城河',
    description: '梳理全球与中国竞争格局，判断份额变化的真实驱动因素。',
    color: '#5B5F9E',
    model: 'deepseek-chat',
    temperature: 0.2,
    systemPrompt:
      '你是竞争情报员。梳理玩家份额、渠道、生态与护城河，区分品牌声量与真实出货。只基于证据回答，输出 JSON。',
    tools: ['knowledge.retrieve'],
    plugins: ['knowledge.retrieve'],
    sort: 4,
  },
  {
    id: 'agent-analyst',
    projectId: PROJECT.id,
    name: '首席分析师',
    role: 'analyst',
    title: '综合证据，形成可被检验的判断',
    description: '把三条研究线收敛成投资判断，显式列出分歧与三种情景。',
    color: '#B23A48',
    model: 'deepseek-chat',
    temperature: 0.5,
    systemPrompt:
      '你是首席分析师。综合三路研究证据，形成有观点、可被检验的判断。列出稳健、进取、反方三种情景，并给出推荐。只输出 JSON。',
    tools: [],
    plugins: ['cognition.diverge'],
    sort: 5,
  },
  {
    id: 'agent-writer',
    projectId: PROJECT.id,
    name: '报告撰写师',
    role: 'writer',
    title: '结构化输出，引用可追溯',
    description: '把判断写成可读的研究报告，每个关键结论都带证据编号。',
    color: '#3E6B48',
    model: 'deepseek-chat',
    temperature: 0.4,
    systemPrompt:
      '你是研究报告撰写师。写一份结构清晰的中文研究报告。每个关键结论后用 [M1] 这样的编号标注证据。不要编造没有证据的数字。',
    tools: [],
    plugins: ['cognition.critique'],
    sort: 6,
  },
  {
    id: 'agent-verifier',
    projectId: PROJECT.id,
    name: '事实核查员',
    role: 'verifier',
    title: '逐条核对结论与证据',
    description: '抽取报告中的结论与引用，检查证据是否真的支持结论，决定是否回环。',
    color: '#8C4A2F',
    model: 'deepseek-chat',
    temperature: 0.1,
    systemPrompt:
      '你是事实核查员。抽取报告中的关键结论和引用，逐条核对证据是否支持结论。输出 JSON：score、passed、claims、issues。',
    tools: [],
    plugins: ['verify.citations'],
    sort: 7,
  },
  {
    id: 'agent-editor',
    projectId: PROJECT.id,
    name: '主编',
    role: 'editor',
    title: '终稿、风险提示与发布',
    description: '检查结构、语气与风险提示，输出可交付的最终版本。',
    color: '#3A3A3A',
    model: 'deepseek-chat',
    temperature: 0.2,
    systemPrompt:
      '你是主编。检查报告结构、语气、风险提示与引用完整性，输出终稿 Markdown。不要改变已核实的事实与引用编号。',
    tools: [],
    plugins: [],
    sort: 8,
  },
]

const marketDoc = `# AI 眼镜市场：渗透率拐点前的三个信号

${DEMO_NOTE}

## 1. 出货量：从百万级走向千万级

据 IDC 2025 年 3 月《全球智能眼镜追踪报告》，2024 年全球 AI 眼镜出货量约 230 万台，同比增长 210%。其中中国市场约 48 万台，占全球 21%。IDC 预计 2025 年全球出货量达到 550 万台，2028 年达到 3200 万台，2024—2028 年复合增速约 65%。

需要区分“AI 眼镜”和“AR 眼镜”：前者通常不显示或只做单色提示，核心是语音助手、拍摄、翻译与导航；后者带波导和微型显示屏，成本更高、出货更少。2024 年 AR 眼镜全球出货约 60 万台，不到 AI 眼镜的三成。

## 2. 价格带：299 美元是第一个拐点

2024 年 AI 眼镜平均售价约 299 美元，主流产品集中在 249—349 美元。中国市场价格带更低，雷鸟、Rokid 等品牌的主力产品在 1499—2499 元人民币。随着 SoC、摄像头模组和声学器件降本，行业平均 BOM 预计每年下降 8%—12%，2027 年主流产品 ASP 可能降至 249 美元。

价格下探会带来两个结果：一是从极客人群扩展到大众用户，二是整机厂毛利率被压缩，价值向光学、芯片等上游环节转移。

## 3. 需求：拍摄、翻译、导航是前三场景

对 2024 年购买用户的抽样调研显示，日均使用时长约 42 分钟，前三场景分别是第一视角拍摄（31%）、实时翻译（24%）、步行与骑行导航（18%）。7 日留存率约 38%，30 日留存率约 21%。退货率约 15%，主要原因是重量、续航和拍摄效果不及预期。

## 4. 渗透率：仍处在早期

以全球智能手机年出货 12 亿部为参照，2024 年 AI 眼镜渗透率约 0.2%，2028 年若达到 3200 万台，渗透率约 2.7%。这意味着行业仍处在早期，但也意味着预测对渗透率假设非常敏感：渗透率每差 1 个百分点，对应约 1200 万台出货量差异。`

const chainDoc = `# 产业链拆解：谁拿走 AI 眼镜的价值

${DEMO_NOTE}

## 1. 一台 299 美元的 AI 眼镜，BOM 约 160 美元

以 2024 年主流无显示 AI 眼镜为例，整机 BOM 约 160 美元，拆解结构大致为：SoC 32%（约 51 美元）、光学与摄像头 18%（约 29 美元）、电池 6%（约 10 美元）、声学 5%（约 8 美元）、结构件与组装 14%（约 22 美元）、其他 25%（约 40 美元）。带显示的 AR 眼镜会增加波导与 microLED，显示环节占 BOM 可升至 30% 以上。

## 2. 毛利率：上游高于整机

按 2024 年样本估算，整机品牌毛利率约 25%—35%，组装代工约 8%—12%，光学模组约 35%—45%，低功耗 SoC 约 45%—55%。这意味着出货量增长并不必然带来整机厂利润增长，价值池更容易被光学和芯片环节拿走。

## 3. 价值池测算

以 2028 年 3200 万台、ASP 249 美元计算，整机市场规模约 79.7 亿美元，对应 BOM 价值池约 40 亿美元。其中 SoC 约 12.8 亿美元，光学与摄像头约 7.2 亿美元，电池约 2.4 亿美元，声学约 2 亿美元，组装约 5.6 亿美元。光学与 SoC 合计拿走 BOM 价值池的一半左右。

## 4. 关键环节与壁垒

- **光学**：波导良率、镀膜均匀性、重量控制是核心壁垒，国内舜宇光学、水晶光电等公司在部分环节具备全球竞争力。
- **SoC**：低功耗、集成 ISP 与 NPU 是关键，恒玄、瑞芯微、高通在不同价位段竞争。
- **组装与声学**：歌尔股份等公司在整机组装与声学模组上规模领先，但毛利率偏低。
- **电池**：小型化与快充是难点，德赛电池、亿纬锂能等公司受益于出货量增长。

## 5. 投资含义

如果行业按预期增长，最确定的受益环节不是整机品牌，而是“单机价值量高、竞争格局集中、毛利率稳定”的上游。整机厂的机会在于渠道与生态，而不是硬件本身。`

const competitionDoc = `# 竞争格局：Meta 领跑，中国厂商的三条路径

${DEMO_NOTE}

## 1. 全球份额：Meta 一家独大

2024 年全球 AI 眼镜市场，Meta 与雷朋合作的 Ray-Ban Meta 系列份额约 62%，2025 年预计仍保持在 60% 左右。其优势来自三个方面：雷朋的品牌与线下渠道（全球 3000 多家门店）、Meta 的社交生态与 AI 助手、以及先发的产品定义能力。

Meta 的弱点同样明显：中国市场进入受限、本地 AI 服务缺失、价格带偏高。这给中国厂商留出了窗口。

## 2. 中国厂商：性价比、本地生态、快速迭代

2024 年中国 AI 眼镜市场，雷鸟创新份额约 12%，Rokid 约 9%，小米约 8%，华为约 6%，其余为创业公司与白牌。中国厂商的三条路径：

1. **性价比**：把主力价格打到 1499—1999 元，用供应链优势换出货量。
2. **本地生态**：接入微信、抖音、高德、支付宝等本地服务，做“中文场景更好用”的 AI 助手。
3. **垂直场景**：面向骑行、翻译、工业巡检、医疗等场景做定制化产品。

## 3. 新进入者

字节、阿里、百度等互联网公司正在评估 AI 眼镜入口；手机厂商（小米、华为、OPPO、vivo）具备渠道与生态优势，可能复制“手机配件”的打法。2026—2027 年，行业可能进入第一轮洗牌。

## 4. 护城河判断

AI 眼镜的护城河不在单点硬件，而在“光学/芯片自研 + 渠道 + 生态”的组合。单纯靠代工和低价，很难建立长期壁垒；但如果没有规模，自研也无法摊薄成本。这是典型的“规模—研发”正循环行业。

## 5. 对中国的含义

中国供应链在光学、声学、组装环节具备全球优势，整机品牌则在本土市场和性价比上更强。未来 3 年，最值得关注的不是“谁做出第一台”，而是“谁能把退货率降下来、把日活做上去”。`

const technologyDoc = `# 技术路线与成本曲线：AI 眼镜 vs AR 眼镜

${DEMO_NOTE}

## 1. 两条路线

**AI 眼镜**：不显示或只做单色提示，核心是语音交互、拍摄、翻译、导航。代表产品是 Ray-Ban Meta、雷鸟 V3、Rokid Glasses。优点是重量轻、成本低、续航可控；缺点是没有视觉信息层，交互依赖语音和手机。

**AR 眼镜**：带波导和微型显示屏，能把通知、导航、翻译字幕叠加到视野中。代表产品是 HoloLens、Magic Leap、雷鸟 X3。优点是信息密度高；缺点是重量、功耗、成本和良率。

## 2. 工程指标

2024 年主流 AI 眼镜的重量约 45—55 克，续航 4—6 小时，充电 1 小时，拍摄 12MP，语音唤醒延迟 0.8—1.5 秒。用户可接受的上限大约是 50 克、全天候续航（配合眼镜盒）、1 秒内响应。超过这个阈值，退货率会明显上升。

## 3. 成本曲线

AI 眼镜 BOM 从 2023 年的约 190 美元降至 2024 年的 160 美元，预计 2027 年降至 130 美元，年降幅 8%—12%。降本主要来自 SoC 制程升级、摄像头模组国产化、声学器件集成和组装良率提升。

AR 眼镜的成本下降更慢：波导良率仍是瓶颈，microLED 成本高，全彩显示量产难度大。2024 年 AR 眼镜 BOM 仍在 400 美元以上，短期内难以进入大众价格带。

## 4. 技术拐点

- **低功耗 SoC**：12nm 及以下制程、集成 NPU，是续航的关键。
- **光学**：表面浮雕光栅波导的良率提升，决定 AR 能否降本。
- **电池**：硅碳负极、异形电池，决定重量与续航的平衡。
- **AI**：端云协同，把高频任务放在端侧，把复杂任务放在云侧。

## 5. 判断

2025—2027 年，AI 眼镜的技术演进是“减重、降本、提续航”，而不是“加显示”。AR 眼镜的拐点要等到波导良率和 microLED 成本同时下降，时间可能在 2028 年以后。`

const riskDoc = `# 政策、隐私与供应链风险

${DEMO_NOTE}

## 1. 隐私与合规

AI 眼镜带摄像头，天然涉及隐私。欧盟 GDPR 要求明确告知、最小化采集和数据可删除；中国《个人信息保护法》对公共场所的人脸采集有严格限制；美国 FTC 关注未经同意的录音录像。2024 年已有厂商因“拍摄指示灯不明显”被监管问询。

产品层面的应对包括：明显的录制指示灯、本地处理优先、默认不上传、可审计的权限日志。这些会增加 BOM 和研发成本，但也是进入欧美市场的门槛。

## 2. 认证与供应链

AI 眼镜需要 CE、FCC、3C、UN38.3 等认证，周期 3—6 个月。核心器件依赖少数供应商：低功耗 SoC 集中在台积电 12nm/6nm，光学波导产能有限，微型电池的良率仍在爬坡。任何单点断供都会影响出货。

## 3. 产品风险

2024 年行业平均退货率约 15%，主要原因是重量、续航、拍摄效果和连接稳定性。30 日留存率只有 21%，说明“新鲜感”之后，产品还没有形成刚需。如果 2026 年退货率不能降到 10% 以下，行业增速可能低于预期。

## 4. 竞争风险

手机厂商进入后，可能用“配件”逻辑定价，把 AI 眼镜拉到 999 元甚至更低，压缩创业公司的生存空间。互联网公司则可能用补贴换入口，重演智能音箱的价格战。

## 5. 估值风险

一级市场对 AI 眼镜公司的估值普遍采用 PS 5—8 倍，隐含了 2027 年以后的高增长假设。如果 2025—2026 年出货量不及预期，估值可能快速回调。`

const investmentDoc = `# 投资框架：从出货量到单机价值量

${DEMO_NOTE}

## 1. 市场空间公式

AI 眼镜的市场空间可以拆成三个变量：出货量 × 平均售价 × 渗透率。2028 年中性假设为 3200 万台、ASP 249 美元，对应整机市场约 79.7 亿美元。乐观假设 4500 万台，对应约 112 亿美元；保守假设 2000 万台，对应约 50 亿美元。

## 2. 价值池分配

整机市场规模不等于利润池。按 BOM 与毛利率估算，2028 年 BOM 价值池约 40 亿美元，其中 SoC 约 12.8 亿美元、光学约 7.2 亿美元、组装约 5.6 亿美元。光学与 SoC 的毛利率更高，利润池占比可能超过 60%。

## 3. 四条投资主线

1. **核心光学**：波导、镀膜、摄像头模组，受益于单机价值量提升。
2. **低功耗 SoC**：集成 NPU 与 ISP，受益于 AI 功能升级。
3. **整机 ODM/组装**：受益于出货量，但毛利率低，弹性来自规模。
4. **品牌与渠道**：受益于渗透率提升，但竞争激烈，需要看复购与日活。

## 4. 关键跟踪指标

- 季度出货量与同比增速
- 平均售价与 BOM 变化
- 退货率、30 日留存、日均使用时长
- 供应链公司的产能利用率与毛利率
- 监管政策与认证进展

## 5. 结论

AI 眼镜正处于“渗透率拐点前”的阶段。2026—2028 年是关键窗口，行业会经历一轮洗牌。投资上，优先关注“单机价值量高、格局集中、毛利率稳定”的光学与芯片环节；整机品牌的机会在于渠道与生态，但需要用退货率和日活证明产品力。`

export const DOCS: Array<Omit<KnowledgeDoc, 'createdAt' | 'chunkCount'> & { content: string }> = [
  {
    id: 'doc-market',
    projectId: PROJECT.id,
    title: 'AI 眼镜市场：渗透率拐点前的三个信号',
    source: 'IDC / 行业公开资料（模拟整理）',
    tags: ['市场', '出货量', '价格'],
    content: marketDoc,
  },
  {
    id: 'doc-chain',
    projectId: PROJECT.id,
    title: '产业链拆解：谁拿走 AI 眼镜的价值',
    source: '供应链访谈 / 公司公告（模拟整理）',
    tags: ['产业链', 'BOM', '毛利率'],
    content: chainDoc,
  },
  {
    id: 'doc-competition',
    projectId: PROJECT.id,
    title: '竞争格局：Meta 领跑，中国厂商的三条路径',
    source: 'Counterpoint / 公开报道（模拟整理）',
    tags: ['竞争', '份额', '渠道'],
    content: competitionDoc,
  },
  {
    id: 'doc-technology',
    projectId: PROJECT.id,
    title: '技术路线与成本曲线：AI 眼镜 vs AR 眼镜',
    source: '技术拆解 / 供应链访谈（模拟整理）',
    tags: ['技术', 'AR', '成本'],
    content: technologyDoc,
  },
  {
    id: 'doc-risk',
    projectId: PROJECT.id,
    title: '政策、隐私与供应链风险',
    source: '监管文件 / 行业研究（模拟整理）',
    tags: ['风险', '合规', '隐私'],
    content: riskDoc,
  },
  {
    id: 'doc-investment',
    projectId: PROJECT.id,
    title: '投资框架：从出货量到单机价值量',
    source: '内部研究框架（模拟整理）',
    tags: ['投资', '估值', '价值池'],
    content: investmentDoc,
  },
]

const NODES: GraphNode[] = [
  {
    id: 'input',
    type: 'input',
    position: { x: 0, y: 160 },
    data: { label: '研究任务', subtitle: '用户输入', kind: 'input' },
  },
  {
    id: 'planner',
    type: 'agent',
    position: { x: 165, y: 160 },
    data: { label: '研究规划师', subtitle: '拆解问题', agentId: 'agent-planner', kind: 'agent' },
  },
  {
    id: 'market',
    type: 'agent',
    position: { x: 365, y: 20 },
    data: { label: '市场研究员', subtitle: '规模与渗透率', agentId: 'agent-market', angle: '市场', kind: 'agent' },
  },
  {
    id: 'chain',
    type: 'agent',
    position: { x: 365, y: 160 },
    data: { label: '产业链研究员', subtitle: 'BOM 与价值池', agentId: 'agent-chain', angle: '产业链', kind: 'agent' },
  },
  {
    id: 'competition',
    type: 'agent',
    position: { x: 365, y: 300 },
    data: { label: '竞争情报员', subtitle: '份额与护城河', agentId: 'agent-competition', angle: '竞争', kind: 'agent' },
  },
  {
    id: 'analyst',
    type: 'agent',
    position: { x: 565, y: 160 },
    data: { label: '首席分析师', subtitle: '三视角收敛', agentId: 'agent-analyst', kind: 'agent' },
  },
  {
    id: 'writer',
    type: 'agent',
    position: { x: 565, y: 470 },
    data: { label: '报告撰写师', subtitle: '带引用写作', agentId: 'agent-writer', kind: 'agent' },
  },
  {
    id: 'verifier',
    type: 'verifier',
    position: { x: 745, y: 470 },
    data: { label: '事实核查员', subtitle: '引用核验', agentId: 'agent-verifier', kind: 'verifier' },
  },
  {
    id: 'editor',
    type: 'agent',
    position: { x: 925, y: 470 },
    data: { label: '主编', subtitle: '终稿与风险提示', agentId: 'agent-editor', kind: 'agent' },
  },
  {
    id: 'output',
    type: 'output',
    position: { x: 1105, y: 470 },
    data: { label: '研究报告', subtitle: '可交付成果', kind: 'output' },
  },
]

const EDGES: GraphEdge[] = [
  { id: 'e-input-planner', source: 'input', target: 'planner' },
  { id: 'e-planner-market', source: 'planner', target: 'market' },
  { id: 'e-planner-chain', source: 'planner', target: 'chain' },
  { id: 'e-planner-competition', source: 'planner', target: 'competition' },
  { id: 'e-market-analyst', source: 'market', target: 'analyst' },
  { id: 'e-chain-analyst', source: 'chain', target: 'analyst' },
  { id: 'e-competition-analyst', source: 'competition', target: 'analyst' },
  { id: 'e-analyst-writer', source: 'analyst', target: 'writer' },
  { id: 'e-writer-verifier', source: 'writer', target: 'verifier' },
  { id: 'e-verifier-editor', source: 'verifier', target: 'editor' },
  { id: 'e-editor-output', source: 'editor', target: 'output' },
  { id: 'e-loop', source: 'verifier', target: 'writer', kind: 'loop', label: '未通过则回环' },
]

export const WORKFLOW: Workflow = {
  id: 'workflow-investment',
  projectId: PROJECT.id,
  name: 'AI 眼镜产业链投研',
  description: '8 个角色、三路并行研究、发散收敛、引用核验与回环。',
  graph: { nodes: NODES, edges: EDGES },
  settings: {
    maxConcurrency: 3,
    budgetUsd: 0.8,
    maxLoop: 2,
    verifyThreshold: 0.9,
  },
}

export function seedDatabase(db: DatabaseSync) {
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO projects (id, name, description, scenario, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(PROJECT.id, PROJECT.name, PROJECT.description, PROJECT.scenario, now)

  for (const agent of AGENTS) {
    db.prepare(
      `INSERT INTO agents (id, project_id, name, role, title, description, color, model, temperature, system_prompt, tools_json, plugins_json, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      agent.id,
      agent.projectId,
      agent.name,
      agent.role,
      agent.title,
      agent.description,
      agent.color,
      agent.model,
      agent.temperature,
      agent.systemPrompt,
      JSON.stringify(agent.tools),
      JSON.stringify(agent.plugins),
      agent.sort,
    )
  }

  for (const plugin of PLUGINS) {
    db.prepare(
      'INSERT INTO plugins (id, name, category, description, icon, color, config_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(plugin.id, plugin.name, plugin.category, plugin.description, plugin.icon, plugin.color, JSON.stringify(plugin.config))
  }

  for (const doc of DOCS) {
    db.prepare(
      'INSERT INTO documents (id, project_id, title, source, tags_json, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(doc.id, doc.projectId, doc.title, doc.source, JSON.stringify(doc.tags), doc.content, now)
    const chunks = chunkDocument(doc.content)
    chunks.forEach((text, idx) => {
      db.prepare(
        'INSERT INTO chunks (id, document_id, project_id, idx, text) VALUES (?, ?, ?, ?, ?)',
      ).run(`${doc.id}-c${idx}`, doc.id, doc.projectId, idx, text)
    })
  }

  db.prepare(
    'INSERT INTO workflows (id, project_id, name, description, graph_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    WORKFLOW.id,
    WORKFLOW.projectId,
    WORKFLOW.name,
    WORKFLOW.description,
    JSON.stringify(WORKFLOW.graph),
    JSON.stringify(WORKFLOW.settings),
    now,
    now,
  )
}

export function chunkDocument(content: string): string[] {
  const sections = content
    .split(/\n(?=##\s)/)
    .map((section) => section.trim())
    .filter(Boolean)
  const chunks: string[] = []
  for (const section of sections) {
    if (section.length <= 340) {
      chunks.push(section)
      continue
    }
    const sentences = section.split(/(?<=[。！？；])/).filter((sentence) => sentence.trim().length > 0)
    let current = ''
    for (const sentence of sentences) {
      if (current.length + sentence.length > 300 && current.length > 0) {
        chunks.push(current.trim())
        current = sentence
      } else {
        current += sentence
      }
    }
    if (current.trim()) chunks.push(current.trim())
  }
  return chunks
}

/* ---------------------------------------------------------------------------
 * Agent training fixtures
 *
 * A training case freezes the upstream context one agent would have received
 * in a real run, so two prompt versions can be compared on the same input.
 * ------------------------------------------------------------------------ */

const TRAINING_EVIDENCE = [
  {
    ref: 'M1',
    docId: 'doc-market',
    docTitle: 'AI 眼镜市场：渗透率拐点前的三个信号',
    quote: '2024 年全球 AI 眼镜出货量约 230 万台，同比增长 210%。IDC 预计 2028 年达到 3200 万台，2024—2028 年复合增速约 65%。',
  },
  {
    ref: 'L1',
    docId: 'doc-chain',
    docTitle: '产业链拆解：谁拿走 AI 眼镜的价值',
    quote: '整机 BOM 约 160 美元：SoC 占 32%，光学与摄像头占 18%，组装占 14%。',
  },
  {
    ref: 'L2',
    docId: 'doc-chain',
    docTitle: '产业链拆解：谁拿走 AI 眼镜的价值',
    quote: '整机品牌毛利率约 25%—35%，组装代工约 8%—12%，光学模组约 35%—45%，低功耗 SoC 约 45%—55%。',
  },
  {
    ref: 'L3',
    docId: 'doc-chain',
    docTitle: '产业链拆解：谁拿走 AI 眼镜的价值',
    quote: '以 2028 年 3200 万台、ASP 249 美元计算，整机市场规模约 79.7 亿美元，对应 BOM 价值池约 40 亿美元。',
  },
  {
    ref: 'M2',
    docId: 'doc-market',
    docTitle: 'AI 眼镜市场：渗透率拐点前的三个信号',
    quote: '2024 年 AI 眼镜平均售价约 299 美元，随着 BOM 每年下降 8%—12%，2027 年主流产品 ASP 可能降至 249 美元。',
  },
  {
    ref: 'C1',
    docId: 'doc-competition',
    docTitle: '竞争格局：Meta 领跑，中国厂商的三条路径',
    quote: 'Ray-Ban Meta 系列份额约 62%，优势来自雷朋的品牌与全球 3000 多家门店。',
  },
  {
    ref: 'C2',
    docId: 'doc-competition',
    docTitle: '竞争格局：Meta 领跑，中国厂商的三条路径',
    quote: '雷鸟创新份额约 12%，Rokid 约 9%。2026—2027 年，行业可能进入第一轮洗牌。',
  },
]

const ANALYST_DATA = {
  thesis: 'AI 眼镜正从极客玩具走向大众终端，价值池向光学与 SoC 集中。',
  insights: [],
  scenarios: [
    {
      id: 'base',
      name: '稳健情景',
      stance: '渗透率线性提升，优先配置确定性更高的上游。',
      points: ['2028 年全球出货量约 3200 万台，复合增速约 65% [M1]', '光学与 SoC 合计拿走 BOM 价值池约一半 [L1]'],
      score: 0.88,
      rationale: '证据覆盖最完整。',
    },
    {
      id: 'bull',
      name: '进取情景',
      stance: 'AI 助手成为手机替代入口，出货量超预期。',
      points: ['2028 年出货量上探 4500 万台'],
      score: 0.79,
      rationale: '上行空间大，但假设更激进。',
    },
    {
      id: 'bear',
      name: '反方情景',
      stance: '重量、续航与隐私制约，增速低于预期。',
      points: ['退货率约 15%，30 日留存仅 21%'],
      score: 0.83,
      rationale: '风险识别到位。',
    },
  ],
  recommendation: '优先关注单机价值量高、格局集中、毛利率稳定的光学与低功耗 SoC。',
  disagreements: ['市场研究员与反方情景对出货量假设存在分歧。'],
  judge: '裁判按证据覆盖、假设可检验性、行动性三项打分，选择稳健情景作为主判断。',
}

const ANALYST_CITATIONS = TRAINING_EVIDENCE.map((item) => ({
  id: item.ref,
  docId: item.docId,
  docTitle: item.docTitle,
  quote: item.quote,
  score: 0.8,
}))

const WRITER_FIXTURE: EvalFixture = {
  evidence: TRAINING_EVIDENCE,
  upstream: [
    {
      nodeId: 'analyst',
      title: '首席分析师',
      data: ANALYST_DATA as unknown as Record<string, unknown>,
      text: JSON.stringify(ANALYST_DATA),
      citations: ANALYST_CITATIONS,
    },
  ],
  iteration: 0,
}

const REVISION_FIXTURE: EvalFixture = {
  ...WRITER_FIXTURE,
  feedback: '[citation → 竞争情报员] 结论没有引用证据。\n[number → 首席分析师] 数字 5000 在证据中找不到对应值。',
}

const FINAL_REPORT = `# AI 眼镜产业链投资价值研究

> 研究任务：AI 眼镜产业链投研
> 版本：v2（已核查）

## 一、核心结论

1. AI 眼镜正处于渗透率拐点前，2024—2028 年出货量复合增速约 65% [M1]。
2. 价值池向光学与 SoC 集中，二者合计约占 BOM 价值池的一半 [L1]。

## 二、市场

2024 年全球 AI 眼镜出货量约 230 万台，同比增长 210% [M1]。预计 2028 年全球出货量约 3200 万台 [M1]。

## 三、产业链

一台 299 美元的 AI 眼镜，BOM 约 160 美元 [L1]。整机品牌毛利率约 25%—35%，低功耗 SoC 约 45%—55% [L2]。

## 四、竞争

Ray-Ban Meta 系列份额约 62%，全球 3000 多家门店 [C1]。雷鸟、Rokid 在不同价格带竞争 [C2]。

## 证据索引

- [M1] AI 眼镜市场：2024 年全球 AI 眼镜出货量约 230 万台。
`

const EDITOR_FIXTURE: EvalFixture = {
  evidence: TRAINING_EVIDENCE,
  upstream: [
    {
      nodeId: 'writer',
      title: '报告撰写师',
      text: FINAL_REPORT,
      data: { markdown: FINAL_REPORT, version: 'v2' },
      citations: ANALYST_CITATIONS,
    },
    {
      nodeId: 'verifier',
      title: '事实核查员',
      data: { passed: true, score: 1, issues: [], routes: [] },
      verdict: { passed: true, score: 1, issues: [], routes: [], claims: [] },
    },
  ],
  iteration: 1,
}

const TRAINING_CASES = [
  {
    id: 'case-writer-first',
    agentId: 'agent-writer',
    title: '首稿：带引用的投研报告',
    input: '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。',
    fixture: WRITER_FIXTURE,
  },
  {
    id: 'case-writer-revision',
    agentId: 'agent-writer',
    title: '修订稿：带着问题清单重写',
    input: '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。',
    fixture: REVISION_FIXTURE,
  },
  {
    id: 'case-editor-final',
    agentId: 'agent-editor',
    title: '终稿：核查信息与结构',
    input: '请对已核查的报告做终审，补充核查结论与出品信息。',
    fixture: EDITOR_FIXTURE,
  },
]

/**
 * Idempotent: inserts the training eval set and one active v1 per agent the
 * first time the database is opened, so an existing data/ directory upgrades
 * in place without a reset.
 */
export function seedTraining(db: DatabaseSync) {
  const now = new Date().toISOString()
  // Upsert: keeps the seeded eval set in sync with the fixtures in code while
  // leaving anything a user added untouched.
  for (const item of TRAINING_CASES) {
    db.prepare(
      `INSERT INTO eval_cases (id, agent_id, title, input, fixture_json, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, input = excluded.input, fixture_json = excluded.fixture_json`,
    ).run(item.id, item.agentId, item.title, item.input, JSON.stringify(item.fixture), now)
  }

  const agents = db.prepare('SELECT id, system_prompt FROM agents').all() as Array<{ id: string; system_prompt: string }>
  for (const agent of agents) {
    const existing = (db.prepare('SELECT COUNT(*) AS n FROM agent_versions WHERE agent_id = ?').get(agent.id) as { n: number }).n
    if (existing > 0) continue
    db.prepare(
      'INSERT INTO agent_versions (id, agent_id, version, system_prompt, score, cases_json, note, is_active, created_at) VALUES (?, ?, 1, ?, NULL, ?, ?, 1, ?)',
    ).run(`ver-${agent.id}-1`, agent.id, agent.system_prompt, '[]', '初始提示词', now)
  }
}
