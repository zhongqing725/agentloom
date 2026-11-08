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
pnpm smoke
pnpm tsx scripts/eval-verifier.ts
pnpm tsx scripts/eval-verifier.ts data/claims-bench-large.json
```

演示库重置：

```bash
pnpm reset
pnpm dev
```

## 6. 边界

- 42 条手标集规模不大，且由团队自己标注，没有第二标注者一致性数据；材料里不要写成“人类评估”。
- 143 条构造集只覆盖三条来源、五类扰动，不能代表开放域。
- `extractClaims` 只检查含引用或含数字的句子；纯定性主张（“某公司更强”）目前不在核查范围，材料里不要写成“所有结论都被验证”。
- Mock 模式的 Token 与成本是估算，不是账单。
- 工具覆盖 `calculator`、`knowledge_search`、`data_stats`、`browser_fetch`；`tool.python` 是受限统计，不执行任意代码；MCP 仍未接入。
- `browser_fetch` 需要外网，Demo 主流程没有默认挂载它。
