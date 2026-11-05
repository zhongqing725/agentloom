# 织序 AgentLoom 文档索引

## 先读

| 文档 | 适合谁 | 内容 |
|---|---|---|
| [交接说明](./handover.md) | 接手开发/运维 | 当前状态、启动、代码地图、验证基线、风险、交接清单 |
| [项目 README](../README.md) | 所有人 | 项目定位、能力、快速开始、提交材料 |
| [技术架构](./architecture.md) | 后端/Agent 工程师 | 领域模型、调度、Self-Loop、插件、API、数据与安全边界 |
| [BoardUI 迁移记录](./boardui-migration.md) | 前端/设计验收 | 组件映射、主题 token、截图、迁移验证与风险 |

## 提交材料

| 文档 | 内容 |
|---|---|
| [3 分钟演示脚本](./demo-script.md) | 录屏/现场演示的完整旁白与镜头 |
| [白皮书源稿](./white-paper.md) | 问题、方案、技术设计、评测与边界 |
| [当前 UI 截图](./boardui/) | 1440×900 桌面 12 张；390×844 移动 13 张 |
| [旧版截图](./assets/) | 迁移前的界面截图，主要供历史提交材料参考 |

可提交文件在仓库根目录的 `deliverables/`：

- `织序AgentLoom-项目白皮书.docx` / `.pdf`
- `织序AgentLoom-项目介绍.pptx` / `.pdf`
- `提交清单.md`

> 这些 Word / PDF / PPTX 生成于 BoardUI 迁移之前，截图可能是旧版界面。若要提交当前 UI，请用 `docs/boardui/` 的新截图重新导出。

## 当前工程速查

- 技术栈：React 19 + Vite 7 + TypeScript + React Router 7 + React Flow + BoardUI 源组件 + Tailwind CSS v4（PostCSS）；Fastify 5 + SQLite + SSE。
- 开发入口：`pnpm dev` → Web 5173 / API 8787。
- 生产预览：`pnpm build && pnpm start` → 8787。
- 重置演示数据：先停服务，再 `pnpm reset`。
- 当前 UI 分支：`ui/boardui-native`。
- 详细风险与操作注意事项见 [交接说明](./handover.md)。
