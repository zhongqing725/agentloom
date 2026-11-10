# 织序 AgentLoom 文档索引

## 先读

| 文档 | 适合谁 | 内容 |
|---|---|---|
| [交接说明](./handover.md) | 接手开发/运维 | 当前状态、启动、代码地图、验证基线、风险、交接清单 |
| [项目 README](../README.md) | 所有人 | 项目定位、能力、快速开始、提交材料 |
| [技术架构](./architecture.md) | 后端/Agent 工程师 | 领域模型、调度、Self-Loop、插件、工具运行时、MCP/A2A、记忆、条件分支、API、数据与安全边界 |
| [验证与工具证据](./verification.md) | 评委/评审/答辩 | 主张判定基准、端到端冒烟、工具轨迹、压力测试、Live 证据、复跑命令 |
| [赛题一能力对照](./track1-compliance.md) | 评委/答辩 | 赛题要求逐条对照、证据、边界 |

## 提交材料

| 文档 | 内容 |
|---|---|
| [3 分钟演示脚本](./demo-script.md) | 录屏/现场演示的完整旁白与镜头 |
| [白皮书源稿](./white-paper.md) | 问题、方案、技术设计、评测与边界 |
| [当前 UI 截图](./boardui/) | 桌面 3 张（首页/插件/事件流）；移动 1 张 |

可提交文件在仓库根目录的 `deliverables/`：

- `织序AgentLoom-项目白皮书.docx` / `.pdf`
- `织序AgentLoom-项目介绍.pptx` / `.pdf`
- `提交清单.md`

> 这些 Word / PDF / PPTX 的版式与截图仍是 11/5 版；11/8 已把 85%→86%、13→18 条、8→14 角色等数字改掉，并追加“工具运行时与四态核查”附录。若要完全对齐当前界面，仍需用 `.screens/` 的新截图重新导出。

## 当前工程速查

- 技术栈：React 19 + Vite 7 + TypeScript + React Router 7 + React Flow + BoardUI 源组件 + Tailwind CSS v4（PostCSS）；Fastify 5 + SQLite + SSE。
- 开发入口：`pnpm dev` → Web 5173 / API 8787。
- 生产预览：`pnpm build && pnpm start` → 8787。
- 验证：`pnpm typecheck && pnpm smoke:all`；压力 `pnpm stress`；Live `pnpm live-evidence`。主张基准见 [verification.md](./verification.md)。
- 重置演示数据：先停服务，再 `pnpm reset`。
- 当前分支：`ui/swiss-redesign`。
- 详细风险与操作注意事项见 [交接说明](./handover.md)。
