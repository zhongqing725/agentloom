# AgentLoom × BoardUI 迁移记录

分支：`ui/boardui-native`
范围：仅 Web 前端；Fastify API、SQLite 数据与 SSE 协议未改。

## 结果

- 所有页面迁移到 BoardUI 源组件与 Tailwind v4，保留 React Router、React Flow 自定义节点、SSE 实时运行、运行页五个标签、证据账本、插件拖拽、添加/删除 Agent、Modal、表单提交。
- 旧 `src/web/styles.css` 已删除；`theme-refresh.css` 只保留 React Flow 画布层。组件颜色不再依赖自定义色板。
- 新主题集中在 `src/styles/agentloom-theme.css`：暖色被替换为钛白/石墨/单一铜色，卡片 24px、控件 12px，系统 SF / PingFang 字体栈。
- 图标统一为 `@remixicon/react` 组件引用；`lucide-react` 已移除。className 合并使用 `@/utils/cx`。

## BoardUI 接入

- 组件安装在 `src/components/**`，基础样式在 `src/styles/**`，通过 `@/* -> src/*` 别名引用。
- Tailwind v4 经由 `@tailwindcss/postcss` 接入，配置在 `postcss.config.mjs`；`src/web/main.tsx` 先加载 `src/styles/globals.css`。
- `DirectionProvider locale="zh-CN"` 包住应用；BoardUI 的 `"use client"` 指令在 Vite 下被忽略，没有使用任何 Next.js API、Server Component、next/font 或 next/navigation。
- 已安装并使用的免费组件：Button、IconButton、Badge、Tabs/PillTab、Modal、Input、Textarea、Tooltip、Spinner、Switch（以及它们必须的 Direction、CloseButton、ScrollFade 等基础依赖）。
- 迁移前做过最小 Vite spike，验证 React Aria 的 Modal、Tabs、Switch、Tooltip 在 Vite 生产构建与浏览器中可运行，随后才改业务页面。

### 环境限制

`npx boardui@latest init -y` 在当前机器能安装依赖，但访问 `https://www.boardui.com/r/globals.json` 时本地 DNS 无法解析 registry，命令以 exit 1 结束。随后用 BoardUI MCP installer 将同一批 registry 组件/主题写入 `src/`，并手动补齐 PostCSS 与 `boardui.json`。这不是运行时依赖问题，也不影响构建。

## 设计系统

Token 定义在 `src/styles/agentloom-theme.css`：

- 页面：`#F5F5F7`；正文 `#1D1D1F`；次级文字 `#6E6E73`。
- 侧栏：`#161617`；卡片：`rgba(255,255,255,.78)` + 发丝描边 + glass blur。
- Accent：`#B56245` / `#96492F`，状态色只用于状态，不作装饰性彩色标签。
- 卡片 24px，控件 12px；spinner、page entrance、press 状态均走 BoardUI 或语义 CSS。
- 页面进入：fade + 4px 位移 + 2px blur；结束不保留 containing block，避免影响 fixed overlay。
- 衬线只用于「织序」字标和报告正文（`.brand-wordmark` / `.report-serif`）；其余使用 BoardUI composite type utilities。

## 页面迁移摘要

| 页面 | 关键改动 |
| --- | --- |
| 顶栏 / 侧栏 | Button / IconButton / Tooltip；移动端仅保留菜单、面包屑、新建运行；侧栏改为石墨色抽屉。 |
| 总览 | Hero、8 roles 卡、运行启动 Textarea、统计卡、最近运行；Button、Badge、Surface。 |
| 知识库 | 检索表单、资料卡、添加资料 Modal、删除确认 Modal；Input / Textarea / Button。 |
| Agent 团队 | Agent 卡、能力插件库、编辑 Modal、插件 Switch。 |
| 评测 | 指标卡、自回环观察条、运行历史 Badge / StatusPill。 |
| 编排画布 | 保留 React Flow 与自定义节点；工具栏、插件条、检查器用 Button / Switch / Tooltip；画布图元用语义 token；连线与环路校验保留。 |
| 运行详情 | PillTab 分段控件；图谱/报告/账本/核查/事件五视图；证据账本 master-detail；节点输出 Modal；SSE 实时刷新。 |

清理：

- 删除 `src/web/styles.css`（旧按钮/表单/Tab/Modal/多色主题）。
- `src/web/theme-refresh.css` 只保留 React Flow 画布、handle、controls、edge 样式。
- 移除 `lucide-react` 依赖。
- 新增 `boardui.json`，让后续 BoardUI CLI 继续写入 `src/`。

## 验证

```
pnpm typecheck   # pass
pnpm build       # pass，仅有 Vite >500 kB chunk 提示
```

浏览器（Edge headless）在 1440×900 与 390×844 下逐页检查：

- `/`、`/knowledge`、`/team`、`/workflow`、`/evals`
- `/runs/:id` 的 graph / report / ledger / verify / events
- 所有页面 console error = 0；390px 下 `scrollWidth - innerWidth = 0`
- SSE：实时运行出现「Live」、运行中状态，完成后自动收起进度条
- 交互：插件 Switch 立即写回 API；HTML5 插件拖拽挂载；加 Agent → 11 节点/13 边，删除后自动接回 → 10 节点/12 边
- 连线：合法连线写回成功；editor → planner 被环路校验拦截
- 证据账本：点击第二条主张后右侧 detail 更新
- Modal：新建运行、添加 Agent、添加知识、团队编辑在 390px 下标题和 footer 均在视口内
- 表单：团队保存写回 API；通过顶栏“新建运行”启动真实运行并跳转 `/runs/:id`

## 截图

### 1440 × 900

- [总览](./boardui/desktop/01-overview.png)
- [知识库](./boardui/desktop/02-knowledge.png)
- [Agent 团队](./boardui/desktop/03-team.png)
- [编排画布](./boardui/desktop/04-workflow.png)
- [评测](./boardui/desktop/05-evals.png)
- [运行图谱](./boardui/desktop/06-run-graph.png)
- [研究报告](./boardui/desktop/07-run-report.png)
- [证据账本](./boardui/desktop/08-run-ledger.png)
- [核查与回环](./boardui/desktop/09-run-verify.png)
- [事件流](./boardui/desktop/10-run-events.png)
- [画布 + 检查器](./boardui/desktop/11-workflow-inspector.png)
- [新建运行 Modal](./boardui/desktop/12-start-run-modal.png)

### 390 × 844

- [总览](./boardui/mobile/01-overview.png)
- [知识库](./boardui/mobile/02-knowledge.png)
- [Agent 团队](./boardui/mobile/03-team.png)
- [编排画布](./boardui/mobile/04-workflow.png)
- [评测](./boardui/mobile/05-evals.png)
- [运行图谱](./boardui/mobile/06-run-graph.png)
- [研究报告](./boardui/mobile/07-run-report.png)
- [证据账本](./boardui/mobile/08-run-ledger.png)
- [核查与回环](./boardui/mobile/09-run-verify.png)
- [事件流](./boardui/mobile/10-run-events.png)
- [画布 + 检查器](./boardui/mobile/11-workflow-inspector.png)
- [移动导航](./boardui/mobile/12-mobile-nav.png)
- [新建运行 Modal](./boardui/mobile/13-start-run-modal.png)

## 未解决风险

1. **Bundle size**：BoardUI + React Aria 使生产 JS 约 950 kB（gzip 约 300 kB），仍有 Vite >500 kB 警告。若比赛环境关注首屏体积，可以按路由做 `React.lazy` 代码分割。
2. **BoardUI CLI 无法访问 registry**：本次用 MCP installer 落地；`npx boardui add` 在恢复网络前可能仍然失败。`boardui.json` 已写好，网络恢复后可直接沿用。
3. **Dark mode 未启用**：BoardUI 有 `.dark` token 体系，但本产品按需求只交付 light 界面，未提供切换与暗色视觉验收。
4. **移动画布**：390px 下用 0.62 初始缩放 + pan 而不是 fit 全图，避免节点缩到不可读；需要用户拖动画布查看全流程。检查器在桌面会自动向左平移选中节点，移动端以底部抽屉呈现。
5. **真实模型模式未验收**：本地没有 DeepSeek Key，SSE/运行验收使用 Mock 模式；真实模型下的网络失败、超时与预算错误仍走原有服务端逻辑。
6. **自动化测试**：本次为浏览器手工/脚本验收，没有新增单元测试或 Playwright 回归套件。
