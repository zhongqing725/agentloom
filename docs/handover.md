# 织序 AgentLoom — 交接说明

更新：2026-11-10

当前分支：`ui/swiss-redesign`

最后提交：`b7d4aff`（工具运行时、全部插件运行时、四态核查、运行图快照、团队角色可用化、仓库清理）。
状态：工作区有未提交增量；`pnpm typecheck` / `pnpm smoke:all` / `pnpm build` 通过。
2026-11-10 增量：短期记忆、条件分支（画布可新建/编辑）、子工作流嵌套、负载/容量调度、BM25+哈希向量混合检索、MCP stdio 客户端、A2A 兼容端点（send/get/cancel）、运行暂停/继续与 checkpoint、压力测试、Live 证据采集脚本。

> 接手顺序：先读本文 → `docs/architecture.md` → `docs/verification.md` → `README.md`。
> 视觉验收图片在 `docs/boardui/`，旧版提交材料在 `deliverables/`。

## 1. 项目现状

织序 AgentLoom 是面向多 Agent 协作的可视化编排、调度与验证平台。默认演示场景为“AI 眼镜产业链投研”：

- 6 篇模拟知识资料，14 个 Agent 角色（默认工作流用 8 个）；其余角色可在「添加 Agent → 团队库」直接插入，不新建 Agent。
- 三路研究并行，首席分析师展开三视角并调用 `calculator`，核查员失败后按问题类型路由并回环。
- 知识库支持 MD / TXT / PDF；文档带来源链接、类型与发布时间。
- 工具运行时：`calculator` / `knowledge_search` / `data_stats` / `browser_fetch`；Mock 模式也真执行，事件流可见 `tool.call` / `tool.result`。
- 扩展：短期记忆（`agent_memory`）、条件节点（`condition`）、Agent 容量与负载调度、`chunk_vectors` 混合检索、MCP stdio、A2A `message/send` / `tasks/get`。
- 证据：`pnpm smoke:all`、`pnpm stress`、`pnpm live-evidence`；报告在 `docs/stress-report.md` / `docs/live-evidence.md`。
- 验证：四态蕴含 v2；42 条手标难例准确率 88%，`supported` F1 100%，见 [verification.md](./verification.md)。
- 训练：5 个提示词候选 + 固定评测集 + 版本启用/回滚，见 `/training`。
- 前端：React 19 + Vite 7 + TypeScript + React Router 7 + React Flow + BoardUI 源组件 + Tailwind CSS v4（PostCSS）。
- 后端：Fastify 5 + SQLite（Node 内置 `node:sqlite`）+ SSE。
- 页面：Home（首页）、知识库、Agent 团队、编排画布、运行详情（五个标签）、评测、训练；除首页外以 overlay 打开。
- 设计：钛白 / 石墨 / 单一铜色；BoardUI 语义 token + composite type utilities；React Flow 画布与自定义节点保留。
- 不使用 Next.js、Server Component、next/font 或 next/navigation。

当前本机曾有演示服务运行在 5173 / 8787；这些进程和 `data/` 都是本地状态，不属于 Git 提交内容。

## 2. 5 分钟启动

要求：Node.js 22.19+ 或 24+，pnpm 10+。

```bash
cd D:\workspace\agentloom
pnpm install
pnpm reset       # 可选：重建演示数据库（保留 data/ 里的评测基准）
pnpm dev         # API 8787 + Web 5173
```

改完代码至少跑：

```bash
pnpm typecheck
pnpm smoke       # 临时库跑完整 Mock 流程，不污染 data/
```

- Web：http://127.0.0.1:5173
- API：http://127.0.0.1:8787
- 生产预览：

```bash
pnpm build
pnpm start
# http://127.0.0.1:8787
```

### 端口冲突

`pnpm dev` 依赖 **5173 和 8787 同时空闲**。如果已有旧服务：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173,8787 | Select-Object LocalPort,OwningProcess
# 确认 PID 后：
Stop-Process -Id <pid> -Force
```

在 Windows 上建议先停 API 再执行 `pnpm reset`，避免 SQLite 文件被占用。

## 3. 运行模式与配置

默认是 **Mock 演示模式**，不需要 Key，适合离线录屏。Mock 不是假轨迹：`calculator` 与 `knowledge_search` 仍然真实执行，事件流里能看到 `tool.call` / `tool.result`。

使用真实模型：

```bash
AGENTLOOM_API_KEY=sk-...
AGENTLOOM_BASE_URL=https://api.deepseek.com/v1
AGENTLOOM_MODEL=deepseek-chat
pnpm dev
```

也可以在页面右上角「设置」中填写 Key / Base URL / 模型。**设置只保存在当前服务进程内，重启后丢失，不写入数据库。** 当前进程如果配置过 Key，会显示 Live；新环境启动时按环境变量重新判断。交接时不要复用他人的 Key。

## 4. 数据与重置

- 数据库：`data/agentloom.db`；`data/` 被 `.gitignore` 忽略。
- 首次启动会自动建库并写入演示资料、Agent、插件和工作流。
- 重置：

```bash
pnpm reset
# 或先停服务，再删除 data/agentloom.db* 后重新启动
```

- 运行记录、证据、事件都存 SQLite。重置会丢失所有历史运行，但会恢复 14 Agent / 10 节点 / 6 资料初始状态。
- 无认证、无多租户，这是本地演示原型。

## 5. 代码地图

```text
src/
  server/
    index.ts      Fastify 路由、SSE、静态文件
    engine.ts     DAG 调度、Self-Loop、工具事件
    llm.ts        Mock / DeepSeek、function calling、发散、裁判、核查
    tools.ts      工具注册表：calculator / knowledge_search
    entailment.ts 四态主张判定
    trainer.ts    提示词候选训练、版本启用/回滚
    retrieval.ts  中文 BM25
    seed.ts       演示数据
    db.ts         SQLite 访问
  web/
    App.tsx       Home + overlay 路由、设置 Modal
    api.ts        REST 客户端
    pages/        首页 / 知识库 / 团队 / 编排 / 运行 / 评测 / 训练
    components/
      Graph.tsx   React Flow 画布、自定义节点、边、自动平移
      ui.tsx      Modal 适配、PageHeader、Surface、StatusPill、ScoreRing、Markdown
  components/     BoardUI 源组件（Button/Modal/Tabs/Input/Textarea/Switch/Tooltip/Spinner 等）
  styles/         BoardUI theme/typography/globals + agentloom-theme.css
  utils/          cx、directional-icon
  shared/         前后端共享类型
docs/
  handover.md            本文
  README.md              文档索引
  architecture.md        后端、调度、插件、工具运行时、验证设计
  verification.md        主张基准、端到端冒烟、工具轨迹
  demo-script.md         3 分钟演示脚本
  white-paper.md         白皮书源稿
  boardui/               当前 UI 截图（桌面 3 张 / 移动 1 张）
deliverables/            白皮书/PPT/提交清单
boardui.json             BoardUI 源目录与别名配置
postcss.config.mjs       Tailwind v4 PostCSS 接入
AGENTS.md / .cursor/     BoardUI always-on 设计规则
```

## 6. 页面与功能

| 路由 | 功能 |
|---|---|
| `/` | 首页：14 角色统计、运行入口、最近运行、证据/插件入口 |
| `/knowledge` | 资料入库（Markdown/TXT/PDF）、检索测试、资料卡、查看/删除 |
| `/team` | 14 个 Agent、能力插件库、模型/温度/Prompt、插件 Switch |
| `/workflow` | React Flow 画布、拖拽/连线/删除、添加 Agent、插件拖放、检查器 |
| `/runs/:id` | 执行图谱、研究报告、证据账本、核查与回环、事件流（含 tool.call） |
| `/evals` | 累计指标、回环前后对比、全部运行历史 |
| `/plugins` | 14 个插件、全部可运行、挂载状态 |
| `/training` | 固定评测集、候选提示词、版本启用/回滚 |

运行页五个标签由 BoardUI `Tabs` 的 segmented 变体提供；移动端导航由 BoardUI `Modal` 提供抽屉形态。

## 7. 一次运行的链路

```text
页面「运行此流程」/ 顶栏「新建运行」
  → POST /api/runs
  → Fastify createRun + executeRun（异步）
  → Scheduler 按 DAG 依赖和深度执行节点
  → 每个动作 appendEvent → SSE /api/runs/:id/events
  → RunPage 以 EventSource 增量接收、每 1800ms 轮询兜底
  → 选中节点时打开输出 Modal
  → run.completed 后关闭 SSE，保留全部事件可回放
```

前端不要把 `run_events` 的 `seq` 当作全局唯一：它是单库自增序列，跨运行不保证从 1 开始。运行页已按 `runId` 过滤并防止旧请求覆盖新路由。

## 8. 前端设计系统与约定

- **BoardUI 是源组件**，不是 npm 运行时依赖；组件在 `src/components`。
- 颜色只走语义 token：`bg-background-*`、`text-text-*`、`border-separator-border`、`text-foreground-icon-*`、`accent-*`、状态 token。不要写 `text-gray-*`、`bg-white`、hex 或 `dark:` 覆盖。
- 类型只用 composite utilities：`text-body-regular`、`text-title-2-medium`、`text-caption-1-semibold` 等，避免自己拼 `text-sm font-medium`。
- 图标只用 `@remixicon/react` 组件引用；类名合并用 `@/utils/cx`。
- 应用级 token / 页面入场 / 报告排版 / 品牌衬线在 `src/styles/agentloom-theme.css`。
- `src/styles/theme.css` 是 BoardUI 原始 token，`agentloom-theme.css` 覆盖 accent、表面、字体、圆角、阴影。修改主题只改后者。
- `src/web/theme-refresh.css` 只允许承载 React Flow 画布相关规则（画布高度、handle、controls、edge）。
- 旧 `src/web/styles.css` 已删除；不要再引入第二套颜色/按钮/Modal 样式。
- 报告正文使用 `.report-serif` / `.report-prose`；页面标题、控件保持无衬线。
- 动效：页面 fade + 4px + 2px blur；hover 150ms；按压只变暗，不放大；`prefers-reduced-motion` 下关闭动画。

### BoardUI CLI 的已知问题

本机 `npx boardui@latest init -y` 能安装依赖，但无法访问 `https://www.boardui.com/r/globals.json`（本机 DNS 问题）。本次通过 BoardUI MCP installer 落盘同一批 registry 文件；`boardui.json` 已配置：

```json
"paths": { "components": "src/components", "utils": "src/utils", "styles": "src/styles" }
```

如果之后再执行 BoardUI CLI `add`，请确认网络/registry；不要把组件重新安装到根目录，也不要覆盖已定制的 `agentloom-theme.css` / `theme-refresh.css`。

## 9. 验证基线

在本机当前版本已通过：

```bash
pnpm typecheck  # 通过
pnpm smoke      # 通过：score=1 · loops=1 · tools=2
pnpm build      # 通过（Vite 仅有 >500 kB chunk 提示）
```

最终构建：JS 约 987 kB / gzip 约 305 kB，CSS 约 166 kB / gzip 约 27 kB。

浏览器验收覆盖 1440×900 与 390×844：

- `/`、`/knowledge`、`/team`、`/workflow`、`/evals`
- `/runs/:id` 的 graph / report / ledger / verify / events
- 全部页面 console error = 0；390px 下页面无横向滚动
- SSE 实时运行、证据账本主张切换、插件 Switch / 拖放、添加/删除 Agent、合法连线与环路拦截、Modal、表单提交、移动导航均已验证。
- 截图：`docs/boardui/desktop/*.png`（3 张：首页/插件/事件流）、`docs/boardui/mobile/*.png`（1 张）；均为 11/8 清洁演示数据（1 条运行、100%）。

自动化测试只有 `pnpm smoke`：临时库跑完整 Mock 流程，断言回环、工具调用与终稿引用。浏览器验收仍是手动为主，新改动请至少重跑 typecheck / smoke / build。

## 10. 已知风险 / 待办

1. **Bundle 体积**：主包约 1.1 MB（Three.js 另拆约 486 kB），Vite 提示 >500 kB。若比赛提交有首屏要求，按路由 `React.lazy` 拆包。
2. **BoardUI CLI registry**：本机 DNS 无法访问 BoardUI registry；当前源文件已落盘，CLI 重新 add 前需恢复网络。
3. **Dark mode 未启用**：token 支持 `.dark`，但产品只交付浅色界面，没有切换入口。
4. **移动画布**：390px 使用 0.62 初始缩放 + 平移，不自动 fit 全图；桌面检查器打开时会自动平移选中节点，移动端为底部抽屉。
5. **真实模型**：Mock 流程已验收；Live 的 function calling 工具循环只做了代码路径，未用真实 Key 回归延迟、工具调用失败与成本。
6. **截图与最新代码差异大**：Home 改版、训练页、工具事件都没有进入 `docs/boardui` 截图；正式提交前重新截取首页、编排、运行事件流、训练页。
7. **开发服务缓存**：Vite 在启动时读取 `postcss.config.mjs`。如果页面显示无样式裸 HTML，先重启 5173 的 Vite 进程，而不是改页面代码。
8. **提交材料仍是 11/5 版式**：数字与“工具运行时/四态核查”附录已在 11/8 补进 DOCX/PPTX/PDF，但截图仍是旧界面，团队信息仍是占位；提交前用 `.screens/` 新截图重新导出并替换团队信息。
9. **团队信息**：白皮书/PPT 里的团队名称、成员仍是占位符，提交前替换。
10. **当前分支未合并**：已提交 `b7d4aff`，但 `ui/swiss-redesign` 尚未合并到 `main`；比赛提交前确认提交点与构建来源。
11. **工具边界**：已有 `calculator`、`knowledge_search`、`data_stats`、`browser_fetch`；`tool.python` 是受限统计，不执行任意代码；MCP 是下一阶段。`browser_fetch` 需要外网。
12. **单工作流**：只有一张演示工作流，没有多项目/多工作流选择；平台化叙事不要超过实现。

## 11. 交接检查清单

- [ ] 确认分支：`git switch ui/swiss-redesign`；审阅 `git status` 与 `git log --oneline main..HEAD`
- [ ] `pnpm install`
- [ ] 如需干净演示数据：先停服务，再 `pnpm reset`
- [ ] `pnpm typecheck && pnpm smoke && pnpm build`
- [ ] `pnpm dev`，确认 5173 与 8787 可用
- [ ] 浏览器逐页检查；390px 检查移动导航、运行页 Tabs、Modal
- [ ] 确认运行模式（Mock / Live）和 Key 归属，不沿用个人 Key
- [ ] 确认截图、白皮书、PPT、演示脚本的团队信息和界面版本
- [ ] 提交或归档 `ui/swiss-redesign` 分支
- [ ] 比赛截止前复核 README 中的截止日期/官网链接

## 12. 相关链接

- [文档索引](./README.md)
- [技术架构](./architecture.md)
- [3 分钟演示脚本](./demo-script.md)
- [白皮书源稿](./white-paper.md)
- [当前 UI 截图](./boardui/)
- [项目 README](../README.md)
