# 赛题一能力对照表

> 用途：方案书/答辩时逐条对照赛题要求，避免“讲了但没实现”。
> 证据以当前仓库为准；`pnpm smoke:all`、`pnpm stress`、`pnpm live-evidence` 可复跑。

| 赛题要求 | 当前实现 | 证据 | 边界 |
|---|---|---|---|
| 多 Agent 团队定义 | 14 个角色，角色/模型/温度/提示词/工具/插件/容量可配 | `/api/agents`、团队页 | 不是多租户团队 |
| Agent 记忆能力 | `agent_memory` 短期记忆，运行后写入、按关键词召回注入 prompt | `GET/POST/DELETE /api/agents/:id/memory`、smoke 断言 | 只做短期摘要，不是长期向量记忆 |
| Agent 版本管理 | 提示词版本 `agent_versions`，可启用/回滚 | `/api/training/versions/:id/activate` | Agent 配置本身未版本化 |
| 可视化工作流 | React Flow 画布，拖拽/连线/删除/添加专家/插件拖放 | 编排画布 | — |
| 顺序/并行 | DAG 依赖 + `maxConcurrency` | 三路并行、调度事件 | — |
| 条件判断 | `condition` 节点：`sourceNodeId/path/op/value`，出边 `true/false`；画布可创建、可编辑 | `pnpm smoke:condition` | — |
| 循环迭代 | Self-Loop + 回环边 | `loop.triggered`、`verify.failed` | 回环边仍是视觉表达 |
| 子工作流嵌套 | `subflow` 节点引用另一张 workflow，执行独立子 Run；画布可插入 | `pnpm smoke:subflow`、`GET /api/workflows` | 子流程模板通过 seed/API 配置，暂无模板编辑器 |
| 动态调度 | 关键路径深度 + Agent 负载 + 容量 | `node.queued` 的 `agentLoad/agentCapacity` | 单进程，不是分布式调度 |
| 工具/外部系统 | Function Calling：calculator / knowledge_search / data_stats / browser_fetch | `tool.call` / `tool.result` | browser_fetch 需外网，Demo 默认不挂 |
| MCP | stdio 客户端：initialize / tools/list / tools/call | `pnpm smoke:mcp`、`AGENTLOOM_MCP_SERVERS` | 需外部 MCP 服务；默认不启动 |
| A2A | Agent Card + JSON-RPC `message/send` / `tasks/get` / `tasks/cancel` | `/.well-known/agent.json`、`POST /a2a` | 兼容子集，不是完整 SDK |
| RAG / 知识库 | Markdown/TXT/PDF 入库、BM25、引用编号 | 知识库页、`/api/kb/search` | 无 OCR |
| 向量检索 | SQLite `chunk_vectors` + 哈希向量，BM25 混合排序；配置 embedding 后升级神经向量 | `vectorScore`、`ensureVectors` | 默认哈希；神经路径需 embedding API |
| 结果验证 | 四态判定 + 数字/方向/单位/期间/主体锚点 + 证据账本 | 42 条手标 88%、supported F1 100% | partial/contradicted 召回仍有限 |
| 交叉验证/置信度 | 有基准比对；无多 Agent 交叉验证/校准置信度 | `docs/verification.md` | 加分项缺口 |
| 人工验证节点 | 运行可暂停/继续；每个节点完成写 checkpoint | `POST /api/runs/:id/pause`、`/resume`、`GET /api/runs/:id/checkpoints` | 没有正式审批表单/回滚到任意 checkpoint |
| 反馈优化 | Self-Loop 路由 + 提示词训练/版本回滚 | 运行回环、`/api/training` | 工具选择不会自适应 |
| 执行监控/回放 | SSE、事件流、节点轨迹、图快照、工具调用、checkpoint | 运行页五标签 | 无断点续跑/回滚 |
| 性能/压力 | Mock 并发 8 次 + 串行 4 次，p50/p95/成功率 | `docs/stress-report.md` | 真实模型待 Live 复跑 |
| Live 模型证据 | 真实模型 3/3 通过：`run-56f27e37`、`run-8eebae66`、`run-c6d116ac` 均 1.0（0 条越证断言，3–8 条显式缺口），142–328 秒、$0.043–0.071、20–44 次工具调用 | `docs/live-evidence.md` | 核查分=断言主张的引用支持率，已声明缺口不计入分母；断言数为 0 直接判 0 分 |

## 复跑命令

```bash
pnpm typecheck
pnpm smoke:all
BASE=http://127.0.0.1:8787 RUNS=8 PARALLEL=4 pnpm stress
BASE=http://127.0.0.1:8787 RUNS=3 pnpm live-evidence   # 需要 AGENTLOOM_API_KEY
```

## 答辩时必须主动说明的三个边界

1. **条件分支**：支持单条件（路径 + 比较 + 目标值）与 true/false 两路；不支持 `and/or` 组合表达式、嵌套条件。
2. **Live 证据**：没有 Key 就没有真实模型数字；不要把 Mock 的 100% 说成模型准确率。Live 核查分是「断言主张里被引用坐实的比例」，显式声明的证据缺口不计入分母，不是行业判断准确率。
3. **A2A/向量**：A2A 是兼容子集（无 streaming/push）；向量默认哈希，配置 `AGENTLOOM_EMBEDDING_URL` 后可升级神经 embedding；子流程模板通过 seed/API 配置。
