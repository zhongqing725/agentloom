# 织序 AgentLoom

> 把一支 Agent 团队，织成可验证的执行流。

织序 AgentLoom 是 2026 第五届“未来杯”创新大赛 **赛题一（Agent 编排创新应用）** 的参赛项目：一个面向多 Agent 协作的**可视化编排、动态调度、工具调用、执行与验证平台**。

它不只是把几个 Agent 串起来，而是把“团队怎么组、每个节点会用什么工具、结果怎么验”变成可配置、可观察、可回放的运行时能力。

> 交接请先读 [docs/handover.md](docs/handover.md)；文档导航见 [docs/README.md](docs/README.md)。

![首页](docs/boardui/desktop/01-home.png)

> 11/8 清洁演示数据：1 条运行、100% 通过率、14 个角色。插件页与运行事件流截图见同目录 `02-plugins.png`、`03-run-events.png`。

## 技术栈

- **前端**：React 19、Vite 7、TypeScript、React Router 7、React Flow 12、BoardUI 源组件、Tailwind CSS v4（PostCSS）、Remix Icon。
- **后端**：Fastify 5、SQLite（Node `node:sqlite`）、SSE、`unpdf`（PDF 文本抽取）。
- **设计系统**：BoardUI 语义 token；首页暗色、控制台浅色，截图见 `docs/boardui/`。
- 不使用 Next.js、Server Component、next/font 或 next/navigation；这是纯 Vite 前端 + Fastify API。

## 为什么是“节点能力插件”

大多数 Agent 平台在“团队”这一层做文章：加角色、连线、跑流程。织序把粒度再往下压一层：

```text
Agent 节点 = 角色 + 模型 + 知识源 + 能力插件
```

插件不绑定某个 Agent，而是像显卡一样插到任意节点上：

- `cognition.diverge`：把一个节点展开成稳健 / 进取 / 反方三条思维分支，由裁判收敛。
- `verify.citations`：逐条核对结论与证据，不通过就触发 Self-Loop。
- `knowledge.retrieve`：从项目知识库召回证据，并作为 `knowledge_search` 工具执行。
- `tool.calculator`：沙箱算术工具，派生数字必须经过它，调用会写入事件流。
- `cognition.critique` / `cognition.debate` / `tool.browser` / `tool.python`：目录态，界面标注“目录态”，不参与运行时。

工具运行时只做三件事：把 `Agent.tools` 里的 id 映射到工具注册表；Live 模式把同一份 JSON Schema 交给模型的 function calling；Mock 模式直接执行工具，保证离线演示也有真实的 `tool.call` / `tool.result` 轨迹。

同一个“发散卡”，插到投研 Agent 上会展开投资情景，插到写作 Agent 上会展开叙事结构。**插件管思考方式，Agent 管领域知识**——这是“万用”的真正含义。

## 五个核心能力

### 1. 知识库 grounding

- Markdown / TXT / PDF 入库；PDF 按页抽取并保留页码标记，扫描件会被拒绝。
- 文档记录来源链接、类型（论文 / 报告 / 报道 / 公告）与发布时间，引用可回查。
- 中文 BM25 检索，词级分词 + 双字回退。
- 每条证据有稳定引用编号，报告中的 `[M2]` 可回查原文。

### 2. 可视化编排

- 默认 10 个节点的 DAG：输入 → 规划 → 三路并行研究 → 分析 → 写作 → 核查 → 终稿；团队库共 14 个角色，未上画布的可从「添加 Agent → 团队库」直接插入。
- 节点可拖动、连线、删除；位置自动保存。
- 添加专家节点：插入“风险审查员/数据可视化师/合规审查员”，自动接到下游。
- 只有已接入运行时的插件可拖拽；目录态插件在团队页标注，不会被误挂。

### 3. 工具运行时

- `calculator`：递归下降解析，只接受数字与 `+ - * / ( )`，不走 `eval`；测试覆盖恶意输入。
- `knowledge_search`：复用 BM25，返回片段、来源与评分。
- Live 模式走 OpenAI `tools` 协议，最多 3 跳；Mock 模式照样执行真工具。
- 每次调用写入 `tool.call` / `tool.result` 事件，运行页与节点输出都可回放。

### 4. 动态调度

- 就绪队列按关键路径深度排序。
- 三路研究并行执行，受 `maxConcurrency` 控制。
- 节点失败自动重试；预算超限停止模型调用。
- 每个调度动作都以事件形式写入 SSE，可实时观察、可回放。

### 5. Self-Loop 与验证

- 核查员抽取报告中的结论与引用。
- 四态判定：`supported` / `partial` / `contradicted` / `unsupported`，并检查方向、单位、统计期间、主体与数字锚点。
- 不通过时按类型路由：缺引用回研究员，数字不一致回分析师，表述问题回写作。
- 证据账本：逐条主张、引用原文、支持状态、核查结论与路由目标。
- 默认最多回环 2 次，最终报告保留核查分与逐条结论。

演示运行的真实轨迹：

```text
第 1 轮核查：86%，3 条问题（中国出货量 80 万/35% 与证据 48 万/21% 不一致；2028 出货量 5000 万缺证据；2027 洗牌缺引用）
        ↓ 路由：citation → 竞争情报员；下游分析师/撰写/核查随依赖重跑，数字问题同轮修正
第 2 轮核查：100%，通过
```

## 快速开始

要求：Node.js 22.19+ 或 24+，pnpm 10+。

```bash
pnpm install
pnpm dev
```

- Web：http://127.0.0.1:5173
- API：http://127.0.0.1:8787

生产模式：

```bash
pnpm build
pnpm start
# http://127.0.0.1:8787
```

首次启动会自动建库、写入 6 篇演示资料、14 个 Agent 和示例工作流。数据在 `data/agentloom.db`；`pnpm reset` 只重建数据库，保留 `data/` 里的评测基准与来源文件。

开发验证：

```bash
pnpm typecheck
pnpm smoke      # 临时库跑完整 Mock 流程：回环 + 工具调用 + 终稿引用
pnpm build
```

如果 5173 页面显示成无样式的裸 HTML，通常是旧的 Vite 进程在 `postcss.config.mjs` 出现之前启动的；重启 `dev:web` 即可，不需要改页面代码。

## 接入真实模型

默认是 **Mock 演示模式**，无需 API Key 即可完整跑通流程，适合录制与离线演示。

在页面右上角“设置”中填入 DeepSeek API Key，或使用环境变量：

```bash
AGENTLOOM_API_KEY=sk-...
AGENTLOOM_BASE_URL=https://api.deepseek.com/v1
AGENTLOOM_MODEL=deepseek-chat
pnpm dev
```

设置页保存的 Key 只存在当前服务进程内，不写入数据库；重启服务后按环境变量重新判断模式。

Live 模式下，`Agent.tools` 里的工具会以 OpenAI `tools` 协议下发给模型，模型返回 `tool_calls` 后由本地注册表执行；Mock 模式直接执行同一套工具，因此离线演示也能看到真实的工具轨迹。

## 架构

```text
┌──────────────────────────────────────────────────────────┐
│  React Console                                           │
│  首页 / 知识库 / Agent 团队 / 编排 / 运行 / 评测 / 训练  │
└───────────────────────┬──────────────────────────────────┘
                        │ REST + SSE
┌───────────────────────▼──────────────────────────────────┐
│  Fastify API                                             │
│  /api/runs  /api/kb  /api/agents  /api/workflow          │
└───────────────────────┬──────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────┐
│  Orchestration Runtime                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ Scheduler   │  │ DAG Engine  │  │ Self-Loop       │   │
│  │ 优先级/并发 │  │ 依赖/分支   │  │ 核查→回写→重跑  │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ Agent Nodes │  │ Plugins     │  │ Verifier        │   │
│  │ 14 roles    │  │ 4 runtime   │  │ 四态蕴含        │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Tool Registry  calculator / knowledge_search        │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────┬───────────────────┬───────────────────────────┘
           │                   │
     ┌─────▼─────┐       ┌─────▼──────────┐
     │ SQLite    │       │ Model Gateway  │
     │ runs/events│      │ Mock / DeepSeek│
     └───────────┘       └────────────────┘
```

更完整的技术设计见 [docs/architecture.md](docs/architecture.md)。

## 提交材料

| 材料 | 文件 |
|---|---|
| **交接说明（接手先读）** | [docs/handover.md](docs/handover.md) |
| 项目白皮书（Word / PDF） | `deliverables/织序AgentLoom-项目白皮书.docx` / `.pdf` |
| 项目介绍 PPT（PPTX / PDF） | `deliverables/织序AgentLoom-项目介绍.pptx` / `.pdf` |
| 3 分钟演示脚本 | [docs/demo-script.md](docs/demo-script.md) |
| 技术架构 | [docs/architecture.md](docs/architecture.md) |
| 验证与工具证据 | [docs/verification.md](docs/verification.md) |
| 当前 UI 截图 | [docs/boardui/](docs/boardui/) |
| 白皮书源稿 | [docs/white-paper.md](docs/white-paper.md) |
| 文档索引 | [docs/README.md](docs/README.md) |
| 提交清单 | `deliverables/提交清单.md` |

> 白皮书与 PPT 中的团队名称、成员姓名目前是 `【待填】` 占位，提交前替换为报名信息。
> 演示数据为模拟整理，已在界面与文档中标注；真实模型成本需接入 DeepSeek 后复测。
> 已生成的白皮书/PPT 可能仍使用迁移前截图；若要同步当前 BoardUI 界面，请重新截图并重新导出。

## 目录

```text
src/
  server/
    engine.ts      调度器、DAG 执行、Self-Loop、工具事件
    llm.ts         Mock / DeepSeek 适配、function calling、发散、核查
    tools.ts       工具注册表：calculator / knowledge_search
    entailment.ts  四态主张判定
    trainer.ts     提示词候选训练与版本启用
    retrieval.ts   中文 BM25
    seed.ts        演示知识库、Agent、插件、工作流
    db.ts          SQLite 数据访问
    index.ts       Fastify API + SSE
  web/
    App.tsx        应用 shell、导航、运行/设置 Modal
    pages/         首页、知识库、团队、编排、运行、评测、插件、训练
    components/    React Flow 画布、自定义节点、共享 UI
  components/      BoardUI 源组件（免费组件）
  styles/          BoardUI tokens + AgentLoom 主题
  utils/           cx / directional icon
  shared/
    types.ts       领域类型
docs/
  handover.md      交接说明
  README.md        文档索引
  architecture.md  技术架构
  verification.md  验证与工具证据
  demo-script.md   3 分钟演示脚本
  boardui/         当前 UI 截图（桌面 3 / 移动 1）
boardui.json       BoardUI 路径/别名配置
postcss.config.mjs Tailwind v4 PostCSS 配置
```

## 演示场景

**AI 眼镜产业链投研**：上传 6 篇产业资料，交给工作流里的 8 个 Agent（团队库共 14 个角色）。三路研究并行，首席分析师用三视角发散、调用 `calculator` 复核规模数字并裁判收敛，撰写师产出带引用的报告，核查员发现 3 个问题后触发回环，第二轮通过。

这不是一个“聊天机器人”，而是一条可以被观察、被干预、被验证的研究生产线。

## 当前边界

- 工具运行时已接入 `calculator` 与 `knowledge_search`；`tool.browser` / `tool.python` / MCP 客户端是下一步，不在本届 MVP。
- 插件目录里的“辩论 / 自我批判 / 图谱检索”等仍是目录态，界面会标注，运行时不会假装执行。
- 知识库支持 Markdown / TXT / PDF；扫描件没有文字层会被拒绝，OCR 不在范围内。
- 当前只有一张演示工作流；多项目、多工作流选择、认证、多租户、插件市场不在本届 MVP。
- Mock 模式的 Token 与成本为模拟计量，用于演示口径；`pnpm smoke` 使用临时库，不会污染演示数据。

## 赛事信息

- 赛道：赛题一（Agent 编排创新应用）
- 命题：大模型 Agent 工具编排调度平台
- 截止：2026 年 11 月 20 日
- 官网：https://www.omniedu.com/ai-hub/contest

## License

本项目为参赛作品，源代码与文档版权归团队所有。
