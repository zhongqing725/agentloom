# 织序 AgentLoom 技术架构

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

| 插件 | 状态 | 运行时行为 |
|---|---|---|
| `cognition.diverge` | 已实现 | 分析师节点展开稳健/进取/反方，裁判按分数选择主判断 |
| `verify.citations` | 已实现 | 核查员抽取结论，核对引用、数字与语义 |
| `knowledge.retrieve` | 已实现 | 研究员按角度检索目标文档，生成稳定引用 |
| `cognition.critique` | 目录态 | 已挂载到写作节点，下一步实现独立审查调用 |
| `cognition.debate` | 目录态 | 正反辩论 + 裁判提炼 |
| `tool.calculator` | 目录态 | 沙盒数值计算 |

“目录态”插件会出现在插件库和节点配置中，但 MVP 不伪装成已实现能力。

### 4.3 发散与裁判

分析师节点执行 `runDiverge`：

1. 依次/并行生成三个候选（Mock 模式为确定性模板，Live 模式为三次模型调用）。
2. 每个候选带 `score` 与 `rationale`。
3. 裁判选择分数最高的候选作为主判断。
4. 所有候选写入 `NodeOutput.candidates`，UI 可展开查看。
5. `node.branch` / `node.merge` 事件进入 trace。

之所以不是“同一条思维链复制三份”，是因为三个分支使用不同视角提示词；在 Live 模式下还会使用不同温度。评委可以追问“分支是否真的不同”，答案在候选卡片和分数里。

## 5. 验证算法

`deterministicVerdict` 的核查范围是**事实性章节**（核心结论、市场、产业链、竞争），不包含明确标注为“情景假设”的第五部分和规范性建议。

步骤：

1. **抽取结论**：按句切分，过滤标题、引用块、列表编号；只保留含引用或含数字的句子。
2. **定位引用**：从 `[M2]` 这样的标记找到证据条目。
3. **数字一致性**：忽略年份（1900–2100），检查结论中的数字是否都能在证据原文中找到。
4. **语义重叠**：对结论与证据做中文分词，要求至少有 2 个实词重叠。
5. **汇总**：`score = supported / claims`；`passed = score >= threshold`。
6. **回写**：不通过时输出 `issues` 与 `routes`，作为下一轮 target 节点的 feedback。

这个算法不是“让模型给自己打分”，而是可复现的规则核查；Live 模式会优先让模型核查，解析失败时回退到规则核查。

## 6. 知识库与检索

- 入库：按 `##` 章节切分；单节超过 340 字时按句切到约 300 字。
- 索引：SQLite `chunks` 表；检索时在内存中计算 BM25。
- 分词：`Intl.Segmenter('zh-CN')` 词级分词 + 中文双字回退 + 英文/数字 token。
- 排序：BM25（k1=1.5, b=0.75），同文档最多 6 个片段。
- 引用：研究员按角度加前缀（M/L/C），并按目标文档的 chunk 顺序稳定编号。
- 目的：让报告中的 `[M2]` 在多次运行中保持可解释，而不是随机映射。

## 7. API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/bootstrap` | 项目、Agent、插件、工作流、文档、运行、统计 |
| GET | `/api/config` | 当前模式 / 模型 / 是否配置 Key |
| POST | `/api/config` | 运行时设置 Key / Base URL / 模型 |
| POST | `/api/runs` | 创建运行并异步启动 |
| GET | `/api/runs/:id` | 运行详情 + 节点轨迹 + 事件 |
| GET | `/api/runs/:id/events` | SSE 实时事件（含历史回放） |
| GET | `/api/runs/:id/report` | 下载 Markdown 报告 |
| POST | `/api/runs/:id/cancel` | 取消运行 |
| POST | `/api/kb/search` | BM25 检索测试 |
| POST | `/api/documents` | JSON 或 multipart 入库 |
| POST | `/api/agents` | 创建按需专家节点（specialist） |
| PUT | `/api/agents/:id` | 修改模型 / 温度 / 提示词 / 插件 |
| PUT | `/api/workflow` | 保存画布位置与调度设置 |

## 8. 数据与可观察性

- `run_events` 是 append-only；SSE 连接晚到也会先回放历史事件。
- 每个节点执行产生一条 `node_runs`，回环会产生多条，`iteration` 区分。
- UI 的“节点轨迹”取每个节点的最新一次 `node_run`；核查页保留全部轮次。
- 事件类型：`run.started`、`node.queued`、`node.started`、`node.branch`、`node.merge`、`node.completed`、`node.retry`、`verify.failed`、`loop.triggered`、`run.completed`。

## 9. 评测

当前评测页展示：

- 累计运行、平均核查分、一次通过率、Tokens。
- 最近一次运行的“回环前 vs 回环后”对比。
- 全部运行记录。

下一步：

1. 固定 3 个研究任务，跑“单分支 / 三视角”两组。
2. 记录质量、引用支持率、延迟、Tokens。
3. 把结果写入 `evaluations` 表，形成可复现的实验报告。

## 10. 安全与边界

- 默认只监听 `127.0.0.1`。
- API Key 只存在进程内，不落库。
- 工具执行尚未开放任意代码；`tool.calculator` 是目录态。
- 没有认证与多租户；这是本地演示/校赛原型，不是生产系统。
- Mock 数据标注为“模拟整理”，不构成真实投资依据。

## 11. 下一步

1. **插件钩子标准化**：把 `before / expand / merge / after` 做成通用接口，支持第三方插件。
2. **团队模板**：从 8 人投研模板扩展到软件交付、客服、政策研究。
3. **PDF 入库**：接入 PDF 文本抽取与版面清洗。
4. **实验平台**：单分支 vs 多视角的自动化 A/B。
5. **权限与沙盒**：插件声明所需工具与数据权限，运行时最小授权。
