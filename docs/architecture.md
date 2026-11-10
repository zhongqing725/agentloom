# 织序 AgentLoom 技术架构

> 本文聚焦运行时、调度、验证与数据。前端设计系统、启动/交接步骤见 [handover.md](./handover.md)。

## 1. 设计原则

1. **节点是编排的最小单位。** 团队不是一团 prompt，而是一张有依赖、有端口、有状态的图。
2. **能力插件化。** 插件不绑定业务 Agent；它改变节点的执行策略，因此可以复用到不同领域。
3. **验证是一等公民。** 每个结论都应该能回到证据；验证不通过必须能驱动回写，而不是只打一个分。
4. **可观察。** 调度、分支、回环、Token 都是事件；运行结束后仍可回放。
5. **先跑通闭环，再谈生态。** MVP 不建插件市场，只证明“插件挂到节点上真的能改变结果”。

## 2. 领域模型

```ts
Project
  ├── KnowledgeDoc → Chunk
  ├── Agent (role, model, tools, plugins)
  ├── Plugin (id, category, config)
  └── Workflow
        ├── GraphNode (input | agent | verifier | output)
        └── GraphEdge (flow | loop)
Run
  ├── NodeRun[] (each attempt / iteration)
  └── RunEvent[] (append-only trace)
```

关键字段：

| 实体 | 作用 |
|---|---|
| `Agent.role` | planner / researcher / analyst / writer / verifier / editor / specialist |
| `GraphNode.data.agentId` | 节点绑定哪个 Agent |
| `GraphNode.data.angle` | 研究员的检索角度（市场 / 产业链 / 竞争） |
| `GraphEdge.kind = loop` | 可视化回环边，不参与 DAG 依赖计算 |
| `Run.mode` | mock / live |
| `NodeRun.iteration` | 第几次回环 |

## 3. 执行生命周期

```text
createRun
  → run.started
  → input 节点完成
  → 调度器计算就绪队列
  → planner 执行
  → 三个 researcher 并行执行（受 maxConcurrency 限制）
  → analyst 展开三条思维分支 → 裁判收敛
  → writer 生成 v1
  → verifier 核查
       ├─ 通过 → editor → output → run.completed
       └─ 不通过 → 按问题类型选择 target（研究员/分析师/写作）
                    → 重置 target 及其下游，带 feedback 重跑
                    → verifier 再核查
```

### 3.1 就绪判定

一个节点进入就绪队列的条件：

```text
status = pending
且所有非 loop 入边的源节点 status = completed
```

`loop` 边只用于 UI 表达回环，不参与依赖计算，避免 DAG 成环。

### 3.2 优先级

对每个节点计算“到汇点的最长路径”：

```ts
depth(id) = 1 + max(depth(target))   // 忽略 loop 边
```

就绪队列按 `depth` 降序排列，关键路径上的节点优先获得并发槽位。相同深度按画布 `x` 坐标排序，保证行为可复现。

### 3.3 并发与失败

- `maxConcurrency` 默认 3；三路研究可以并行。
- 节点失败后最多重试 1 次（共 2 次尝试），重试前等待 600ms。
- 预算检查在每次模型调用前执行；超过 `budgetUsd` 直接终止运行。
- 运行取消通过 `cancelledRuns` 集合在调度循环边界生效。

### 3.4 Self-Loop

核查节点不通过时：

1. 当前 `NodeRun` 标记为 `waiting`，保存核查结果。
2. 按问题类型选择 target：
   - `citation` → 对应角度的研究员；
   - `number` / `logic` → 首席分析师；
   - `wording` → 报告撰写师。
3. 重置 target 及其下游节点，而不是一律重置 writer。
4. `feedback` 设为带类型和目标的问题清单。
5. `loopCount + 1`，写 `loop.triggered` 事件（含 `target` 与 `routeType`）。
6. 下一轮 target 读取 `feedback` 重跑，下游按依赖重算；verifier 再次执行。
7. 达到 `maxLoop` 后即使未通过也继续终稿，但 `Run.score` 保留低分，UI 标记“需要复核”。

这是“验证驱动”的回环，不是简单重试。回环会改变输入（问题清单）与执行路径（target），而不是重复同一个调用。

## 4. 节点能力插件

### 4.1 设计契约

```yaml
id: cognition.diverge
category: 认知
mount: agent-node
config:
  branches: 3
  perspectives: [稳健, 进取, 反方]
  merge: judge
ports:
  in:  { task: text, evidence: citations }
  out: { result: text, candidates: text[] }
hooks:
  before: expand
  after: merge
```

一个插件包含：

- **挂载点**：只挂 Agent 节点，不改变团队拓扑。
- **展开策略**：分支数量、视角、温度、预算。
- **收敛策略**：内部裁判收敛，或暴露多个输出端口。
- **运行时语义**：分支是调度器里的真实任务，有状态、有 Token、有事件。

### 4.2 当前实现

| 插件 | 运行时行为 |
|---|---|
| `knowledge.retrieve` | 按角度做 BM25 检索；同时作为 `knowledge_search` 工具 |
| `knowledge.graph` | 在首轮命中后补同主题邻居片段，扩大证据面 |
| `knowledge.freshness` | 按文档 `published_at` / `created_at` 重排证据 |
| `cognition.diverge` | 分析师节点展开稳健/进取/反方，裁判按分数选择主判断；其他节点追加三视角摘要 |
| `cognition.critique` | 输出后追加证据缺口与逻辑跳跃清单 |
| `cognition.decompose` | 输出后追加 3 个可并行子任务与依赖 |
| `cognition.strawman` | 追加 3 条反方论证与证伪条件 |
| `cognition.debate` | 追加正反论据与裁判纪要 |
| `verify.citations` | 核查员做四态判定；未挂载则 fail-closed，分数为 0 |
| `verify.numbers` | 扫描报告数字，列出引用中找不到对应值的项 |
| `verify.entailment` | 汇总 supported/partial/contradicted/unsupported |
| `verify.coverage` | 编译三页事实卡，检查关键事实覆盖与资料口径冲突；三项达标才算通过 |
| `tool.calculator` | 沙箱算术，调用写入 `tool.call` / `tool.result` |
| `tool.python` | 受限 `data_stats` 统计（mean/median/sum/min/max），不执行任意代码 |
| `tool.browser` | `browser_fetch` 公开页面抓取，拦截内网地址，8 秒超时 |

认知/验证插件的产出写入 `NodeOutput.pluginReports`，运行页节点弹窗可查看；写给报告时追加在证据索引之后，不干扰核查范围。

### 4.3 发散与裁判

分析师节点执行 `runDiverge`：

1. 依次/并行生成三个候选（Mock 模式为确定性模板，Live 模式为三次模型调用）。
2. 每个候选带 `score` 与 `rationale`。
3. 裁判选择分数最高的候选作为主判断。
4. 所有候选写入 `NodeOutput.candidates`，UI 可展开查看。
5. `node.branch` / `node.merge` 事件进入 trace。

之所以不是“同一条思维链复制三份”，是因为三个分支使用不同视角提示词；在 Live 模式下还会使用不同温度。评委可以追问“分支是否真的不同”，答案在候选卡片和分数里。

### 4.4 工具运行时

`Agent.tools` 存的是插件 id，`src/server/tools.ts` 把四个映射成可执行工具：

| id | 工具 | 输入 | 实现 |
|---|---|---|---|
| `tool.calculator` | `calculator` | `{ expression }` | 递归下降解析，只接受数字与 `+ - * / ( )`，不走 `eval` |
| `knowledge.retrieve` | `knowledge_search` | `{ query, limit }` | 复用 BM25，返回片段、来源与评分 |
| `tool.python` | `data_stats` | `{ values, operation }` | 受限统计，不执行任意代码 |
| `tool.browser` | `browser_fetch` | `{ url, limit }` | 公开 http(s) 页面抓取，拦截 localhost/内网，8 秒超时 |

- **Live**：把工具 JSON Schema 通过 OpenAI `tools` 协议下发；模型返回 `tool_calls` 后本地执行，最多 3 跳，结果以 `role=tool` 回填。
- **Mock**：直接调用同一个 `invokeTool`，保证离线演示也有真实工具轨迹。
- **可观察**：每次调用写 `tool.call` 与 `tool.result` 事件，参数、结果、耗时、错误都可回放；完整调用保存在 `NodeOutput.toolCalls`。
- **失败处理**：工具错误不会让节点崩溃，错误信息进入事件流与模型上下文。

### 4.6 记忆、条件分支、负载调度

- **记忆**：`agent_memory` 保存每次节点完成的 600 字摘要；`recallAgentMemory` 按任务关键词重叠召回最近 3 条，注入 Live prompt。`GET/POST/DELETE /api/agents/:id/memory` 可查看、手写、清空；手动写入的 `runId=manual`。
- **条件分支**：`NodeKind=condition`，节点数据 `condition: { sourceNodeId, path, op, value }`；出边 `condition: 'true' | 'false'`。调度器执行后计算命中分支的可达集，把未命中且不在命中集里的 pending 节点标记 `skipped`，依赖检查把 `skipped` 视为已满足。
- **负载调度**：`Agent.capacity` 是同一 Agent 的并发上限；就绪排序为 `depth 降序 → agentLoad 升序 → x 升序`，容量满的节点留在 pending。`node.queued` 事件带 `agentLoad` / `agentCapacity`，可回放调度决策。
- **子工作流**：`subflow` 节点用 `data.subflowWorkflowId` 引用 `workflows` 表中的另一张图，父节点创建 child Run 并等待完成；最多 2 层，父输出带 `subflowRunId`。
- **人工干预与 checkpoint**：`POST /api/runs/:id/pause|resume` 在调度循环边界暂停/继续；每个节点完成后写 `run_checkpoints`（节点状态、输出、iteration、feedback、成本/Token），`GET /api/runs/:id/checkpoints` 可查。没有回滚到任意 checkpoint 的恢复执行。
- **边界**：条件节点的可视化新建/编辑表单还没做完整；当前通过画布 JSON 或 API 写入。负载调度只做节点级容量，不做跨机负载均衡。

### 4.7 MCP / A2A / 向量索引

- **MCP stdio**：`mcp.ts` 启动 `AGENTLOOM_MCP_SERVERS` 配置的子进程，完成 `initialize` → `notifications/initialized` → `tools/list`；工具名 `mcp__<server>__<tool>` 进入同一套 `ToolSpec`，Live 下发给模型，Mock 也真执行。`scripts/mcp-demo-server.mjs` 提供 `now` / `echo` 示例。
- **A2A**：`/.well-known/agent.json` 返回 Agent Card；`POST /a2a` 支持 JSON-RPC `message/send` 与 `tasks/get`。`message/send` 创建 Run 并立即返回 task，`tasks/get` 返回状态与最终报告 artifact。
- **向量索引**：`chunk_vectors` 存 192 维特征哈希向量；`searchKnowledge` 用 `BM25 + 0.75 * cosine` 排序，`SearchHit.vectorScore` 暴露相似度。配置 `AGENTLOOM_EMBEDDING_URL` 时，首次检索会调用 OpenAI-compatible `/embeddings` 重建全部 chunk 向量并写入 `vector_meta`；API 失败回退哈希。

## 5. 验证算法

`deterministicVerdict` 的核查范围是**事实性章节**（核心结论、市场、产业链、竞争），不包含明确标注为“情景假设”的第五部分和规范性建议。

每条主张由 `classifyClaim` 给出四态之一：`supported` / `partial` / `contradicted` / `unsupported`。判定信号：

1. **引用存在性**：没有 `[M2]`、引用不在证据库中，直接 `unsupported`。
2. **数字**：忽略年份（1900–2100），支持区间（`35%—45%` 蕴含 `40%`）与指标锚点（`平均售价 299` 对 `289`）。
3. **方向**：增长/下滑、上升/下降的否定翻转。
4. **单位**：美元/人民币、百分比/百分点、万台/亿台冲突。
5. **统计期间**：主张的首个年份与引用焦点句的年份是否一致。
6. **主体**：AR/VR、Meta/苹果/雷鸟等主体错配。
7. **语义覆盖**：中文分词覆盖率，决定“部分支持”还是“无关”。

汇总：`supported` 记 1，`partial` 记 0.5，其余记 0；`passed = score >= threshold`。不通过时输出 `issues` 与 `routes`，作为下一轮 target 节点的 feedback。

可复现基线（`pnpm tsx scripts/eval-verifier.ts`）：

- 42 条手标难例：四态准确率 88%，`supported` F1 100%，11 条 `contradicted` 没有一条被放过。
- 143 条构造用例（标签由扰动方式保证）：四态准确率 100%。
- 对照旧规则 v1：42 条难例四态准确率 55%，会把方向相反的主张判成支持。

Live 模式会优先让模型核查，解析失败时回退到同一套规则核查；细节见 [verification.md](./verification.md)。

## 6. 知识库与检索

- 入库：Markdown / TXT 直接读文本；PDF 用 `unpdf` 按页抽取，插入 `<!-- 第 N 页 -->` 标记，扫描件（无文字层）拒绝入库。
- 切分：按 `##` 章节切分；单节超过 340 字时按句切到约 300 字。
- 索引：SQLite `chunks` 表；检索时在内存中计算 BM25。
- 分词：`Intl.Segmenter('zh-CN')` 词级分词 + 中文双字回退 + 英文/数字 token。
- 排序：BM25（k1=1.5, b=0.75）+ 0.75 × 向量余弦；同文档最多 6 个片段。
- 向量：`chunk_vectors` + `vector_meta`；默认 192 维特征哈希，配置 `AGENTLOOM_EMBEDDING_URL` 后升级为 OpenAI-compatible embedding，失败回退。`SearchHit.vectorScore` 可观测。
- 引用：研究员按角度加前缀（M/L/C），并按目标文档的 chunk 顺序稳定编号。
- 目的：让报告中的 `[M2]` 在多次运行中保持可解释，而不是随机映射。

## 7. API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/bootstrap` | 项目、Agent、插件、工作流、文档、运行、统计 |
| GET | `/api/wiki` | 规则编译后的三页事实卡、冲突列表与编译时间 |
| GET | `/api/config` | 当前模式 / 模型 / 是否配置 Key |
| POST | `/api/config` | 运行时设置 Key / Base URL / 模型 |
| POST | `/api/runs` | 创建运行并异步启动 |
| GET | `/api/runs/:id` | 运行详情 + 节点轨迹 + 事件 |
| GET | `/api/runs/:id/events` | SSE 实时事件（含历史回放） |
| GET | `/api/runs/:id/report` | 下载 Markdown 报告 |
| POST | `/api/runs/:id/cancel` | 取消运行 |
| POST | `/api/runs/:id/pause` / `/resume` | 暂停 / 继续运行 |
| GET | `/api/runs/:id/checkpoints` | 运行 checkpoint 列表 |
| GET | `/api/workflows` | 工作流模板列表（含子流程模板） |
| POST | `/api/kb/search` | BM25 检索测试 |
| POST | `/api/documents` | JSON 或 multipart 入库（MD / TXT / PDF） |
| POST | `/api/agents` | 创建按需专家节点（specialist） |
| PUT | `/api/agents/:id` | 修改模型 / 温度 / 提示词 / 工具 / 插件 / 容量 |
| GET/POST/DELETE | `/api/agents/:id/memory` | 查看 / 写入 / 清空短期记忆 |
| GET | `/api/health` | 健康检查 + MCP 连接状态 |
| GET | `/.well-known/agent.json` | A2A Agent Card |
| POST | `/a2a` | A2A JSON-RPC：`message/send` / `tasks/get` |
| PUT | `/api/workflow` | 保存画布位置与调度设置 |
| GET / POST | `/api/training` | 读取评测集/版本，或启动一次训练 |
| GET | `/api/training/:id` | 训练进度与候选分数 |
| POST | `/api/training/:id/activate` | 启用某个候选提示词 |
| POST | `/api/training/versions/:id/activate` | 回滚到历史版本 |
| POST | `/api/training/cases/from-docs` | 从知识库资料自动生成评测用例 |

## 8. 数据与可观察性

- `run_events` 是 append-only；SSE 连接晚到也会先回放历史事件。
- `runs.graph_json` 在创建运行时保存当时的 workflow 快照；运行页优先用快照回放，旧运行没有快照时回退当前图。
- 每个节点执行产生一条 `node_runs`，回环会产生多条，`iteration` 区分。
- UI 的“节点轨迹”取每个节点的最新一次 `node_run`；核查页保留全部轮次。
- 事件类型：`run.started`、`node.queued`、`node.started`、`node.branch`、`node.merge`、`tool.call`、`tool.result`、`node.completed`、`node.skipped`、`node.retry`、`verify.failed`、`loop.triggered`、`run.completed`。

## 9. 评测

评测页展示：

- 累计运行、平均核查分、一次通过率、Tokens。
- 最近一次运行的“回环前 vs 回环后”对比。
- 全部运行记录。

训练页（`trainer.ts`）把“反馈优化”落成可回滚的闭环：

1. 每个 Agent 有固定评测集（`eval_cases`），输入与上游上下文冻结，只换提示词。
2. 同一套规则核查给 5 个候选打分：基线、强制引用、数字只取证据、去模糊词、组合约束。
3. 胜出候选写入 `agent_versions` 并可直接启用；旧版本可一键回滚，团队页同步显示新提示词。
4. Mock 模式用提示词里的显式约束改变输出，离线也能演示“训练前后分数变化”；Live 模式真实调用模型。

下一步：固定任务集上跑“单分支 / 三视角”A/B，把质量、延迟、Tokens 写入实验报告。

## 10. 安全与边界

- 默认只监听 `127.0.0.1`。
- API Key 只存在进程内，不落库。
- 工具边界：`calculator` 只接受数字与四则运算字符，不走 `eval`；`knowledge_search` 只读本地 SQLite；没有任意代码执行与网络抓取。
- 单个工具有 200 字符表达式上限、BM25 结果上限与 3 跳调用上限；工具错误只进入事件流，不终止运行。
- 没有认证与多租户；这是本地演示/校赛原型，不是生产系统。
- Mock 数据标注为“模拟整理”，不构成真实投资依据。

## 11. 下一步

1. **工具选择自适应**：让规划师在运行时决定调用哪个工具/专家，而不是画布上预先连死。
2. **Agent-as-Tool**：把每个 Agent 暴露成可调用工具，供其他节点在运行时发现与委派。
3. **多工作流**：项目级工作流选择与模板库，支持软件交付、客服、政策研究等第二场景。
4. **实验平台**：单分支 vs 多视角的自动化 A/B，把质量、延迟、Tokens 写成报告。
5. **权限与沙盒**：工具声明所需数据权限，运行时最小授权。

## 12. 覆盖与冲突核验（verify.coverage）

知识库不只被检索，还会在每次运行前被**规则编译**成三页事实卡：市场、产业链、竞争（`src/server/wiki.ts`）。不落库、不调模型、不需要 API Key。

- **事实卡**：指标 + 主体 + 数值 + 年份 + 原文句 + 来源文档。指标匹配以分句为边界；跨分句继承指标要求单位兼容（“2028 年达到 3200 万台”继承前一分的“出货量”，但不会把万台继承给“渗透率”）。
- **冲突登记**：同一指标、主体、单位、年份出现不同数值，且离散度 ≥ 1.1 才登记。标注“假设 / 情景 / 乐观 / 保守”的句子不参与；不同环节的毛利率、不同公司的份额按主体分组，不互相冲突。
- **三维判定**：`verify.coverage` 挂在核查员上时，`Verdict` 增加 `dimensions: { citations, coverage, conflicts }`，三项都必须达到 `verifyThreshold`；`score` 取三项均值。
- **路由**：漏掉的关键事实回写作；未说明的口径差异回分析师（重置分析师会连带重置下游写作）；第 2 轮写作补一段“口径差异与关键事实补录”，每条带 `[M…]` 或新铸的 `[W…]` 引用。
- **可复现**：Mock 与 Live 使用同一套规则检查，Live 只是在模型结论之后叠加，不依赖模型自评。
- **演示数据**：种子含第 7 篇《券商深度：AI 眼镜的三条分歧》，制造 4 处真实分歧（2028 出货量 3200 vs 5000 万台、复合增速 65% vs 85%、退货率 15% vs 12%、Meta 份额 62% vs 55%）。
- **自检**：`pnpm exec tsx scripts/wiki-probe.ts` 打印事实卡、冲突与示例报告覆盖结果，提取质量退化时以非零码退出。
- **边界**：编译是 O(chunks) 的内存计算；知识库涨到数千片段时应加缓存或持久表。规则抽取只处理有数字的陈述，定性结论不进事实卡。
