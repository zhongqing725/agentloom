# 验证与工具证据

> 这份文档只回答一个问题：平台说“结果可验证”，证据在哪。
> 所有数字都可以用下面三条命令重跑，不依赖 API Key。

## 1. 三层验证

| 层 | 检查什么 | 命令 |
|---|---|---|
| 单元 | 工具注册表：算术正确性、恶意输入拒绝、知识检索命中 | `pnpm smoke` |
| 基准 | 主张级四态判定：`supported` / `partial` / `contradicted` / `unsupported` | `pnpm tsx scripts/eval-verifier.ts` |
| 端到端 | 一次完整 Mock 运行：回环、工具调用、终稿引用 | `pnpm smoke` |

## 2. 主张判定基准

### 2.1 手标难例（42 条）

`data/claims-bench.json` 是人工标注的难例，覆盖数字替换、方向反转、单位冲突、统计期间错位、主体错配与无引用。

| 指标 | 旧规则 v1 | 四态 v2 |
|---|---|---|
| 四态准确率 | 55% | **88%** |
| `supported` F1 | 77% | **100%** |
| `contradicted` 被放过 | — | **0 / 11** |

v2 的薄弱处：`partial` 只有 2 条支持，recall 50%；`contradicted` 召回 64%，4 条被降级为 `partial`。这两类会继续补规则，但不影响“错误结论不会被判成支持”这条底线。

### 2.2 构造用例（143 条）

`data/claims-bench-large.json` 由三条公开来源逐句扰动生成：原句、换数字、换年份、反转动词、去掉引用。标签由构造方式保证，因此它测的是规则行为，不是人类一致性。

| 指标 | 旧规则 v1 | 四态 v2 |
|---|---|---|
| 四态准确率 | 18% | **100%** |
| 四态 F1 | 0–100% 不均 | **四类均 100%** |

> 口径说明：构造集满分不代表真实世界满分。它的价值是回归——任何规则改动让这 143 条掉分，就说明改坏了。真实场景看 42 条手标集。

## 3. 端到端冒烟

`pnpm smoke` 使用临时 SQLite 文件（`AGENTLOOM_DB`），不会污染演示库。它断言：

1. 工具本身：`calculator` 算出 `(1+2)*3/2 = 4.5`，拒绝 `process.exit()`；`knowledge_search` 能命中种子语料。
2. 一次完整 Mock 运行：状态 `completed`、终稿分数 ≥ 0.9、运行带 graph 快照、至少 1 次 `loop.triggered`、至少 1 次 `tool.call`、报告带引用；planner/writer/verifier 分别产出的插件报告也要存在。

当前输出：

```text
smoke ok · score=1 · loops=1 · tools=2 · tokens≈32k
```

拆开看：

| 轮次 | 核查分 | 说明 |
|---|---|---|
| 第 1 轮 | 0.86 | 3 条问题：中国出货量 80 万/35% 与证据 48 万/21% 不一致；2028 出货量 5000 万缺证据；2027 洗牌缺引用 |
| 第 2 轮 | 1.00 | 路由回上游后修正数字、补引用，18 条主张全部 supported |

`tools=2` 是因为第 1 轮路由回竞争情报员后，下游分析师重跑了一次，两轮各调用一次 `calculator`。每次调用都有独立的 `tool.call` / `tool.result` 事件。

## 4. 工具轨迹长什么样

运行页事件流里可以直接看到：

```text
tool.call   首席分析师 调用 calculator({"expression":"3200*249/10000"})
tool.result calculator 返回结果 {"expression":"3200*249/10000","value":79.68}
```

节点输出同时保留完整 `toolCalls`：

```json
[
  {
    "id": "tool-...",
    "name": "calculator",
    "args": { "expression": "3200*249/10000" },
    "result": { "expression": "3200*249/10000", "value": 79.68 },
    "ms": 1
  }
]
```

Live 模式的路径是同一套工具：模型返回 `tool_calls`，本地执行后以 `role=tool` 回填，最多 3 跳；Mock 模式只是不调用模型，工具本身仍然真执行。

## 5. 怎么复跑

```bash
pnpm typecheck
pnpm smoke:all
pnpm tsx scripts/eval-verifier.ts
pnpm tsx scripts/eval-verifier.ts data/claims-bench-large.json
```

`smoke:all` = 主流程 `smoke` + 条件分支 `smoke:condition` + 子流程 `smoke:subflow` + MCP stdio `smoke:mcp`。

MCP 单独启动示例服务：

```bash
AGENTLOOM_MCP_SERVERS='[{"name":"demo","command":"node","args":["scripts/mcp-demo-server.mjs"]}]' pnpm dev
curl http://127.0.0.1:8787/api/health   # mcp 数组应包含 demo
```

## 5.1 压力 / 并发基线

```bash
BASE=http://127.0.0.1:8899 RUNS=8 PARALLEL=4 pnpm stress
```

当前 Mock 结果（8 次并行 + 4 次串行）：

| 组 | 成功率 | p50 | p95 | 平均分 | 平均 Tokens |
|---|---:|---:|---:|---:|---:|
| 串行 maxConcurrency=1 | 100% | 5012ms | 5067ms | 1.0 | 33466 |
| 并行 maxConcurrency=4 | 100% | 4297ms | 4616ms | 1.0 | 33478 |

写入 `docs/stress-report.md` / `.json`。Mock 延迟由固定模拟延迟主导；真实模型数字需 Live 复跑。

## 5.2 Live 模型证据

```bash
BASE=http://127.0.0.1:8787 RUNS=3 pnpm live-evidence
```

已有真实运行（DeepSeek 兼容端点）：

| 运行 | 核查分 | 主张 | 回环 | 耗时 | Tokens | 成本 | 工具调用 |
|---|---|---:|---:|---:|---:|---:|---:|
| `run-56f27e37` | 1.0 | 17 坐实 + 3 显式缺口 | 0 | 211s | 145,887 | $0.0438 | 20 |
| `run-8eebae66` | 1.0 | 16 坐实 + 6 显式缺口 | 1 | 328s | 258,875 | $0.0713 | 38 |
| `run-c6d116ac` | 1.0 | 19 坐实 + 8 显式缺口 | 0 | 142s | 154,641 | $0.0435 | 44 |

三次全部通过，**没有一条越证断言**；报告 7.3–8.4k 字、7–9 章，缺口在正文里逐条列出。核查分口径：只有「真的断言了事实」的主张进分母（引用坐实算 1），显式声明成证据缺口的主张只披露、不计入分母——否则报告越诚实分数越低；反过来，把有证据的内容全标成缺口会触发 wording 问题，且断言数为 0 时直接判 0 分。

此前 0.82 卡住的根因是核查员每轮自己拍总分，重写修完当轮问题后它又换一批新标准，分数追不上阈值；改为主张打标 + 调用方算分后收敛，且单个节点挂死（曾静默 2 小时）和瞬时断连由 `AbortSignal.timeout` + 一次重试兜底。Live 默认 `AGENTLOOM_LIVE_MAX_LOOP=2`，现场演示仍建议 Mock（无 Key 依赖、无余额风险）。

## 6. 边界

- 42 条手标集规模不大，且由团队自己标注，没有第二标注者一致性数据；材料里不要写成“人类评估”。
- 143 条构造集只覆盖三条来源、五类扰动，不能代表开放域。
- `extractClaims` 只检查含引用或含数字的句子；纯定性主张（“某公司更强”）目前不在核查范围，材料里不要写成“所有结论都被验证”。
- Mock 模式的 Token 与成本是估算，不是账单。
- 工具覆盖 `calculator`、`knowledge_search`、`data_stats`、`browser_fetch`；`tool.python` 是受限统计，不执行任意代码。
- MCP 已接入 stdio 客户端，但需要外部 MCP 服务；A2A 是兼容子集（Agent Card + message/send + tasks/get + tasks/cancel），不是完整 SDK。
- 条件节点支持单条件与 true/false 两路，不支持 and/or 组合表达式；可视化创建/编辑已通。
- 子工作流节点通过 child Run 执行另一张 workflow，最多 2 层；画布可插入，模板通过 seed/API 配置。
- 运行支持暂停/继续与节点 checkpoint，但没有回滚到任意 checkpoint 的恢复执行。
- 混合检索默认是 192 维特征哈希；配置 `AGENTLOOM_EMBEDDING_URL` 后升级为神经 embedding，API 失败回退哈希。
- `browser_fetch` 需要外网，Demo 主流程没有默认挂载它。
