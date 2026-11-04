# 30 · 任务编排可视化桌面应用实现 Spec（TaskScope）

| 字段             | 值                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| 文档 ID          | AD-30                                                                                               |
| 产品名（工作名） | **TaskScope**                                                                                       |
| 需求前缀         | `REQ-T-*` / 验收 `AC-T-*`                                                                           |
| 状态             | 1.0（通过质量门）                                                                                   |
| 证据基线         | `3f7b7bec`（2026-10-27）；外部资料访问日期 2026-10-28                                               |
| 前置阅读         | `../subagent-orchestration/20-subagent-orchestration-spec.md` §3.10（可观测性）、`../00-plan.md` §4 |
| 读者             | 要复刻该桌面应用的 AI agent / 桌面工程师                                                            |

---

## 0. 一句话结论

TaskScope 是一个**本地优先、只读优先、事件溯源**的任务编排可视化桌面应用：它把 Ultimate 的 task graph / trace / events（或任意 OTel/JSONL 来源）归一化为一个 `orchestra.event.v1` 事件流，提供 **DAG + 时间线 + 详情 + 回放** 四个联动视图，让用户在一个窗口里回答四个问题：

1. 现在什么在跑、什么卡住、什么失败？
2. 关键路径是哪条？瓶颈在哪个任务？
3. 这次运行为什么变成这样？
4. 和上次相比，哪里变好了/变差了？

推荐技术栈：**Electron 45 + React 19 + TypeScript + @xyflow/react 12.12 + elkjs 0.12 + SQLite（better-sqlite3）**。如果安装包体积/内存是第一约束，用 Tauri 2.12.5 替代 Electron；其余架构不变（替换点见 §3.5）。

---

## 1. 用户、场景与需求

### 1.1 Personas

| Persona            | 目标                                     | 痛点                                    | 主要视图               |
| ------------------ | ---------------------------------------- | --------------------------------------- | ---------------------- |
| **开发者**（主要） | 看自己的 agent run 卡在哪、改完是否恢复  | 日志分散在多个会话；失败要翻 transcript | DAG + 详情             |
| **Tech Lead**      | 看多条 branch/任务的整体进度、风险、返工 | 只能问 @ultimate；缺少全局视图          | 概览 + 时间线          |
| **值班/运维**      | 快速定位失败、重试、判断是否升级         | 失败卡缺少上下文；无法对比历史          | 告警 + 失败详情 + 回放 |
| **复盘者**         | 事后分析关键路径、成本、瓶颈             | 只有聊天记录，没有结构化数据            | 时间线 + 对比          |

### 1.2 Jobs-to-be-Done

| ID     | JTBD                                                | 对应视图   |
| ------ | --------------------------------------------------- | ---------- |
| J-T-01 | 一眼看出当前 run 的健康度（running/blocked/failed） | 概览       |
| J-T-02 | 找到最慢/最贵/失败最多的任务                        | DAG + 排序 |
| J-T-03 | 看清任务之间的依赖与所有权                          | DAG        |
| J-T-04 | 看一个任务从开始到结束的完整时间线                  | 时间线     |
| J-T-05 | 打开失败任务的错误、日志、产物、关联会话            | 详情       |
| J-T-06 | 回放一次 run，按时间前进/后退                       | 回放       |
| J-T-07 | 对比两次 run 的差异（新增/删除/变慢/变贵）          | 对比       |
| J-T-08 | 导出快照/报告给他人                                 | 导出       |

### 1.3 需求清单

| ID        | 需求                                                        | 优先级 |
| --------- | ----------------------------------------------------------- | ------ |
| REQ-T-001 | 应用必须本地运行，默认只读，不修改源系统                    | P0     |
| REQ-T-002 | 必须支持至少一个真实数据源（Ultimate）与一个离线源（JSONL） | P0     |
| REQ-T-003 | 必须把异构来源归一化为统一事件模型                          | P0     |
| REQ-T-004 | 必须提供 DAG 视图，支持缩放/平移/选择/折叠                  | P0     |
| REQ-T-005 | 必须提供时间线视图，支持缩放与任务对齐                      | P0     |
| REQ-T-006 | 必须提供详情面板，含状态/耗时/错误/日志/产物/关联           | P0     |
| REQ-T-007 | 必须支持按状态/agent/时间/文本过滤                          | P1     |
| REQ-T-008 | 必须支持关键路径高亮                                        | P1     |
| REQ-T-009 | 必须支持回放（时间旅行）                                    | P1     |
| REQ-T-010 | 必须支持两次 run 的对比                                     | P2     |
| REQ-T-011 | 必须支持 10k 任务/100k 事件不崩溃                           | P0     |
| REQ-T-012 | 必须支持断线重连与增量恢复                                  | P0     |
| REQ-T-013 | 必须支持导出 PNG/JSON/CSV                                   | P1     |
| REQ-T-014 | 必须支持键盘操作与命令面板                                  | P2     |
| REQ-T-015 | 必须支持暗色/亮色主题与高对比度                             | P1     |
| REQ-T-016 | 必须提供可复现的构建/签名/更新流程                          | P1     |
| REQ-T-017 | 必须提供可注入的假数据源用于测试                            | P0     |
| REQ-T-018 | 必须记录并展示数据新鲜度（ingestion lag）                   | P1     |
| REQ-T-019 | 必须在无数据/加载/错误/断线时有明确空状态                   | P1     |
| REQ-T-020 | 必须提供性能基准脚本与预算                                  | P0     |

---

## 2. 调研：产品、标准与可借鉴点

### 2.1 任务编排产品

| 产品                | 核心视图                                            | 可借鉴                                                     | 不照搬                    |
| ------------------- | --------------------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| **Temporal Web UI** | Workflow 列表、事件历史、调用栈、pending activities | 事件历史是唯一真相；按 event id 回放；失败可重试           | 面向服务端工作流，术语重  |
| **Apache Airflow**  | DAG 图、Grid（按时间）、Task 实例                   | Grid 视图把"每次运行 × 每个任务"铺开，适合发现长期失败模式 | 调度器中心，图偏静态      |
| **Dagster**         | Asset graph、Run timeline、分区                     | Asset-centric 视图适合"产物"而非"任务"；运行详情清晰       | 资产模型对 agent 任务过重 |
| **Prefect**         | Flow run、任务状态、日志                            | 状态颜色与失败摘要直接                                     | 云优先                    |
| **Windmill**        | Run 列表、步骤时间线、日志                          | 单步重跑与日志联动                                         | 脚本平台假设强            |
| **n8n**             | 节点画布、执行列表                                  | 画布交互（缩放、节点详情）成熟                             | 低代码编辑器，不是观测器  |

来源（访问日期 2026-10-28）：

- Temporal Web UI: https://docs.temporal.io/web-ui
- Airflow UI: https://airflow.apache.org/docs/apache-airflow/stable/ui.html
- Dagster UI: https://docs.dagster.io/concepts/webserver/ui
- Prefect: https://www.prefect.io/
- Windmill Flow editor: https://www.windmill.dev/docs/flows/flow_editor
- n8n Workflows: https://docs.n8n.io/workflows/

**结论 R-T-01**：任务编排 UI 的骨架是"列表 + 图 + 时间线 + 详情"，不是单一画布。只做 DAG 会输给"为什么慢/为什么失败"的问题。

**结论 R-T-02**：事件历史（append-only）必须是一等公民；图和时间线都是事件的投影。否则回放/对比无法做。

### 2.2 数据标准

| 标准                    | 用途                    | 可映射字段                                                                                                                                      | 缺口                                    |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **OpenTelemetry GenAI** | LLM/agent span 语义     | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, span status | 没有"任务图/所有权/审批"语义            |
| **OTel Traces 通用**    | 分布式调用树            | trace_id, span_id, parent_span_id, name, start/end, status, attributes                                                                          | 需要自定义 `orchestra.*` 属性补任务语义 |
| **AG-UI**               | agent 与前端的事件协议  | run/task 状态、tool call、文本流                                                                                                                | 偏交互，不是历史存储                    |
| **A2A**                 | agent-to-agent 任务委派 | task id, state, artifacts, messages                                                                                                             | 偏跨组织协议，字段较重                  |
| **MCP**                 | 工具/资源协议           | tool call 元数据                                                                                                                                | 不是观测协议                            |

来源：

- OTel GenAI: https://opentelemetry.io/docs/specs/semconv/gen-ai/
- OTel traces: https://opentelemetry.io/docs/concepts/signals/traces/
- AG-UI: https://docs.ag-ui.com/
- A2A: https://a2a-protocol.org/

**结论 R-T-03**：内部规范用 `orchestra.event.v1`；OTel 只作为**导入适配器**，不要把 OTel 属性直接泄漏到 UI 模型。

**结论 R-T-04**：必须保留 `traceId/spanId/parentSpanId` 作为关联键，否则无法把任务图与调用树对齐。

### 2.3 桌面技术调研

| 维度                | Electron 45.0.0              | Tauri 2.12.5         | Wails         | Avalonia              |
| ------------------- | ---------------------------- | -------------------- | ------------- | --------------------- |
| 运行时              | Chromium 156 + Node 24       | 系统 WebView2/WebKit | 系统 WebView  | .NET                  |
| 包体积（空应用）    | ~120–200 MB                  | ~10–30 MB            | ~10–20 MB     | ~30–60 MB             |
| 内存（空应用）      | ~150–250 MB                  | ~60–120 MB           | ~60–120 MB    | ~80–150 MB            |
| 后端语言            | Node/TS                      | Rust                 | Go            | C#                    |
| 本地 SQLite         | better-sqlite3（需 rebuild） | rusqlite/sqlx        | Go sqlite     | Microsoft.Data.Sqlite |
| SSE/HTTP            | Node 原生                    | reqwest              | net/http      | HttpClient            |
| 自动更新            | electron-updater             | tauri-plugin-updater | 自建          | 自建                  |
| 代码签名（Windows） | 成熟                         | 成熟                 | 一般          | 成熟                  |
| AI agent 复刻难度   | 低（单一 TS）                | 中（TS + Rust）      | 中（TS + Go） | 高（C#）              |
| 适用                | 快速交付、Node 生态          | 小体积、强安全       | Go 团队       | .NET 团队             |

版本证据：Electron 45.0.0（2026-10-20 发布，https://releases.electronjs.org/）；Tauri crate 2.12.5 / CLI 2.12.4（crates.io / npm registry，2026-10-28 查询）。

### 2.4 技术选型决策矩阵

权重按"AI agent 在 3–4 周内复刻一个可用的本地工具"设定：

| 维度                            | 权重 | Electron |    Tauri |    Wails | Avalonia |
| ------------------------------- | ---: | -------: | -------: | -------: | -------: |
| 实现速度/单一语言               |  30% |        5 |        3 |        3 |        2 |
| 本地系统访问（SQLite/SSE/文件） |  20% |        5 |        4 |        4 |        5 |
| 分发体积/内存                   |  15% |        2 |        5 |        4 |        4 |
| 性能（大图/长事件流）           |  15% |        3 |        4 |        4 |        5 |
| 安全（进程隔离/签名）           |  10% |        3 |        4 |        4 |        4 |
| 生态/文档/可招聘                |  10% |        5 |        4 |        3 |        2 |
| **加权**                        | 100% | **4.05** | **3.85** | **3.60** | **3.55** |

计算：Electron = .30×5 + .20×5 + .15×2 + .15×3 + .10×3 + .10×5 = 1.50+1.00+0.30+0.45+0.30+0.50 = **4.05**；Tauri = .30×3 + .20×4 + .15×5 + .15×4 + .10×4 + .10×4 = 0.90+0.80+0.75+0.60+0.40+0.40 = **3.85**。

**敏感性**：若"分发体积/内存"权重升到 30%、实现速度降到 15%，Tauri 反超（Tauri 4.15 vs Electron 3.60）。因此：

- **本 spec 的参考实现默认 Electron 45**：优化目标是"AI agent 在 3–4 周内复刻"，单一 TypeScript、Node 生态可直接复用 Ultimate 的 TS 类型/适配器；这不是对产品分发的最终建议。
- **若产品要发给非开发者/体积敏感**：选 Tauri 2.12.5（CLI 2.12.4），Rust 侧只做 SQLite + SSE + 文件监听，前端不变；见 §3.5 替换点。
- **不推荐**：Wails（生态小）、Avalonia（复刻成本高，除非团队是 .NET）。

> **与 `research/desktop-research.md` 的关系**：调研备忘录以"产品分发"为第一约束，给出 Tauri 4.45 vs Electron 4.20；本 spec 以"AI agent 复刻速度"为第一约束，矩阵给出 Electron 4.05 vs Tauri 3.85。两者不是事实冲突，而是权重不同。采用哪套，先确定硬约束（包体积/内存/签名 vs 单一语言/交付周期），再按 §2.4 矩阵与 §3.5 替换点决策。

### 2.5 前端图形选型

| 方案                    | 适用                                    | 风险                            |
| ----------------------- | --------------------------------------- | ------------------------------- |
| **@xyflow/react 12.12** | 自定义节点、边、交互、MiniMap、Controls | 大图需虚拟化/聚合；布局要自己做 |
| Cytoscape.js            | 大图/图算法丰富                         | React 集成弱，样式定制成本高    |
| D3 + Canvas             | 极致性能/定制                           | 交互/可访问性全自己做，工期长   |
| vis-timeline            | 时间线                                  | 维护活跃度一般；定制受限        |
| 自研 Canvas 时间线      | 10 万事件                               | 工期长，但可控                  |

**推荐**：`@xyflow/react` 做 DAG；时间线用 **Canvas + d3-scale** 自研（或 `vis-timeline` 做 MVP）；布局用 `elkjs`（Web Worker）。

**结论 R-T-05**：React Flow 负责"可交互的图"，ELK 负责"分层布局"，二者通过 Worker 解耦；不要把布局放在主线程。

---

## 3. 架构

### 3.1 进程与模块

```
┌────────────────────────────────────────────────────────────┐
│ Electron main (Node)                                       │
│  ├─ SourceManager: Ultimate SSE / OTLP / JSONL            │
│  ├─ Normalizer: source events → orchestra.event.v1         │
│  ├─ Store: SQLite (WAL) + migrations + retention           │
│  ├─ QueryService: runs/tasks/events/aggregates             │
│  └─ IPC handlers (typed, zod-validated)                    │
├────────────────────────────────────────────────────────────┤
│ Preload (contextBridge)                                    │
│  └─ window.orchestra: invoke/listen, no Node               │
├────────────────────────────────────────────────────────────┤
│ Renderer (React 19 + Vite)                                 │
│  ├─ App shell / routing / command palette                  │
│  ├─ Graph view (@xyflow/react + elkjs worker)              │
│  ├─ Timeline view (Canvas + d3-scale)                      │
│  ├─ Inspector / filters / compare / replay                 │
│  └─ Zustand stores + selectors                             │
└────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
Ultimate /api/events (SSE)
  → SourceManager.parse
  → Normalizer.normalize
  → Store.appendBatch (transaction)
  → IPC event 'store.appended' {seq}
  → Renderer incremental query
  → Graph/Timeline projection
```

关键原则：

1. **事件先落库，再渲染**。UI 永远从 SQLite 查询，不从网络直接画。
2. **归一化在 main 进程**。Renderer 只认 `orchestra.event.v1`。
3. **查询是投影**。DAG 和时间线都是 SQL/内存投影，不额外维护两套状态。
4. **增量**。每次 append 返回 `seq`，Renderer 只拉 `seq > lastSeq`。

### 3.3 数据源适配器

```ts
interface SourceAdapter {
  id: string
  kind: 'ultimate' | 'otel' | 'jsonl'
  start(ctx: SourceContext): Promise<void>
  stop(): Promise<void>
  status(): SourceStatus
}

interface SourceContext {
  emit(events: OrchestraEvent[]): Promise<void>
  signal: AbortSignal
  log(level: 'info' | 'warn' | 'error', message: string): void
}
```

#### UltimateAdapter

- 连接 `baseUrl`（默认 `http://127.0.0.1:4747`）。
- `GET /api/events?conversation=1` SSE；处理 `system`、`conversations`、`tasks`、`view`、`doc`、`docOps`。
- `POST /api/extensions/system/actions/stream` 拉事件/调用流（分页）。
- `POST /api/extensions/system/actions/tree {trace}` 拉调用树。
- `POST /api/extensions/system/actions/lanes {since,until}` 拉泳道（供 AD-40）。
- `POST /api/extensions/tasks/actions/started {ids}` 拉任务开始时间。
- `POST /api/extensions/workspaces/actions/info {id}` 拉 workspace。
- 断线：指数退避 1s→30s；重连后从最后 `seq` 补拉（若源不支持，重拉快照并 diff）。

映射：

| Ultimate                   | orchestra                  |
| -------------------------- | -------------------------- |
| `tasks` TaskGraph node     | `task.*` 事件 + `Task`     |
| `conversations` overview   | `actor`/`title` 元数据     |
| `system.stream` event/call | `event`/`span`             |
| `system.tree`              | `call` 树 → `span` 父子    |
| `workspaces.landed`        | `artifact`/`milestone`     |
| `subagents.started`        | `task.spawned`（AD-40 用） |

#### OtlpAdapter

- 本地 HTTP receiver `127.0.0.1:4318`，接受 OTLP/HTTP JSON（先做 JSON，protobuf 后补）。
- 每个 span → `span` 事件；有 `orchestra.run.id`/`orchestra.task.id` 属性则归入对应任务，否则按 trace 建任务。
- GenAI 属性映射 token/模型；未知属性放 `metadata`。

#### JsonlReplayAdapter

- 逐行读取 `*.jsonl`，每行一个 `OrchestraEvent`；校验 `v===1`、必填字段。
- 支持 `speed`（1x/10x/max）与 `loop`。
- 用于测试、演示、离线复盘。

#### 3.3.5 Ultimate 数据缺口与降级（v0 必读）

`research/desktop-research.md` §7.2 的 G1–G12 是硬约束。适配器必须把它们变成显式字段，不得假装存在：

| 缺口 | 事实                                                              | v0 处理                                                                                      |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| G1   | `TaskGraph` 只含 live task，完成后消失                            | 历史从 `system.stream` / 本地归档重建；首屏只保证 live                                       |
| G2   | 无 `endedAt`、attempt/retry                                       | `endedAt` 由事件推断；无事件则 `null`；UI 显示 "unknown"；attempt 从重复 `task.started` 推断 |
| G3   | 无静态依赖边，只有 `waiting.on`                                   | 依赖边只画当前 wait；历史依赖标 `inferred:true`                                              |
| G4   | token 在 model call `result` JSON，可能被截断                     | 解析成功才显示；失败显示 "usage unavailable"；成本显示 "—"                                   |
| G5   | 无 agent 状态时间线，`busy` 是布尔                                | 泳道块由 call 间隔（>20s）切分，标 `inferred`                                                |
| G6   | `board.sent` 不含正文                                             | 只画消息边；正文需用户显式打开原会话                                                         |
| G7   | event id 与 trace position 两套序列                               | 统一排序键 `(at, source, id)`；不假设单一自增                                                |
| G8   | lanes 40 / run 200 calls / tree 5000 / stream 500 页 / trace 7 天 | 聚合 + 本地归档；超出显示 "partial"                                                          |

降级原则：

1. **能推断的标 `inferred`，不能推断的显示 `unknown`，绝不填假值。**
2. 每个视图在数据不完整时显示 `partial` 徽标和原因。
3. 验收时检查 `inferred`/`partial` 的覆盖率；不允许"看起来完整"。

### 3.4 安全模型

| 面       | 措施                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| Renderer | `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、CSP `default-src 'self'` |
| IPC      | 所有参数 zod 校验；只暴露白名单方法；不暴露 `eval`/`shell`                                    |
| 网络     | 默认只允许 loopback；远程 URL 需用户显式添加并二次确认                                        |
| 数据     | SQLite 文件权限 0600；不含 prompt/response 原文（只存元数据/摘要）                            |
| 更新     | 签名清单 + 代码签名；禁止 `--no-sandbox`                                                      |
| 凭据     | 如未来需要 Ultimate token，存 OS keychain，不进 SQLite                                        |

**隐私原则**：默认不存消息正文、prompt、模型响应；只存 id、时间、状态、token 数、工具名、错误分类。需要正文时由用户显式开启"记录内容"，并显示存储位置/大小。

### 3.5 Tauri 替换点（若选 Tauri 2.12.5）

| Electron 参考实现           | Tauri 替换                               | 备注                               |
| --------------------------- | ---------------------------------------- | ---------------------------------- |
| `src/main/*` (Node)         | `src-tauri/src/*` (Rust)                 | command/event 边界；无 Node        |
| `better-sqlite3`            | `rusqlite` 单写线程 / `tauri-plugin-sql` | 写热路径走 Rust command，不跨 IPC  |
| Node `fetch`/SSE            | `reqwest` + `eventsource-stream`         | sidecar/command 做唯一 HTTP 客户端 |
| `preload` + `contextBridge` | `#[tauri::command]` + `invoke`           | capability/ACL 白名单              |
| `electron-updater`          | `tauri-plugin-updater` + 签名清单        | 更新包必须签名                     |
| `crashReporter`             | `tauri-plugin-sentry` + minidump         | 需自建 symbol 上传                 |
| `BrowserWindow`             | `WebviewWindow` + capability             | 同样 `contextIsolation` 等价语义   |
| 文件对话框/导出             | `tauri-plugin-dialog` / `fs`             | 遵守 capability                    |

前端（React/React Flow/ELK/Canvas/SQLite schema/查询）完全不变；只有 `src/main` 与 `preload` 换成 `src-tauri`，`window.orchestra` 的调用改为 `invoke`。

---

## 4. 数据模型

### 4.1 事件

```ts
export interface OrchestraEvent {
  v: 1
  id: string // ULID/UUID
  seq: number // source-assigned or local monotonic
  at: number // epoch ms
  source: 'ultimate' | 'otel' | 'jsonl'
  runId: string
  taskId?: string
  parentTaskId?: string
  traceId?: string
  spanId?: string
  parentSpanId?: string
  type:
    | 'run.started'
    | 'run.completed'
    | 'run.failed'
    | 'task.created'
    | 'task.started'
    | 'task.waiting'
    | 'task.resumed'
    | 'task.completed'
    | 'task.failed'
    | 'task.aborted'
    | 'task.retried'
    | 'task.blocked'
    | 'task.unblocked'
    | 'edge.added'
    | 'message.sent'
    | 'artifact.added'
    | 'log'
    | 'metric'
  actor?: { kind: 'agent' | 'human' | 'system'; id: string; name?: string }
  data: Record<string, unknown>
}
```

JSON 示例：

```json
{
  "v": 1,
  "id": "01J...",
  "seq": 42,
  "at": 1761580800000,
  "source": "ultimate",
  "runId": "run-7",
  "taskId": "task-12",
  "parentTaskId": "task-3",
  "type": "task.failed",
  "actor": { "kind": "agent", "id": "worker", "name": "worker" },
  "data": { "error": "E_TOOL_TIMEOUT", "durationMs": 18342, "attempt": 1 }
}
```

### 4.2 任务

```ts
export interface Task {
  id: string
  runId: string
  parentId?: string
  name: string
  kind: 'task' | 'tool' | 'model' | 'agent' | 'system'
  status:
    | 'pending'
    | 'running'
    | 'waiting'
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'aborted'
    | 'skipped'
    | 'unknown'
  attempt: number
  startedAt?: number
  endedAt?: number
  actor?: string
  conversationId?: number
  metadata: Record<string, unknown>
}
```

### 4.3 边

```ts
export interface TaskEdge {
  id: string
  runId: string
  from: string
  to: string
  kind: 'owner' | 'dependency' | 'spawn' | 'message'
  label?: string
}
```

### 4.4 SQLite schema

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  name TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  parent_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER,
  ended_at INTEGER,
  actor TEXT,
  conversation_id INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX tasks_run_status ON tasks(run_id, status);
CREATE INDEX tasks_parent ON tasks(parent_id);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT
);
CREATE INDEX edges_run ON edges(run_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  at INTEGER NOT NULL,
  type TEXT NOT NULL,
  task_id TEXT,
  trace_id TEXT,
  span_id TEXT,
  parent_span_id TEXT,
  actor TEXT,
  data TEXT NOT NULL
);
CREATE INDEX events_run_seq ON events(run_id, seq);
CREATE INDEX events_task ON events(task_id, at);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id TEXT,
  kind TEXT NOT NULL,
  uri TEXT,
  label TEXT,
  size INTEGER,
  created_at INTEGER NOT NULL
);
```

迁移：`PRAGMA user_version`；每个迁移一个事务；启动时只向前迁移，不自动降级。

保留：默认 30 天或 1 GB，先删最旧 run；用户可配置。

### 4.5 状态映射

| 源状态                         | orchestra 状态    |
| ------------------------------ | ----------------- |
| pending / queued               | pending           |
| running / active               | running           |
| waiting / blocked / scheduling | waiting / blocked |
| completed / success / done     | completed         |
| failed / error                 | failed            |
| aborted / cancelled / stopped  | aborted           |
| skipped / no-op                | skipped           |
| 缺失/无法推断                  | unknown           |

---

## 5. 状态机

### 5.1 Run

| 当前             | 事件                 | 守卫                | 下一      |
| ---------------- | -------------------- | ------------------- | --------- |
| none             | run.started          | —                   | running   |
| running          | run.completed        | 无 failed task      | completed |
| running          | run.failed           | 任一 failed/aborted | failed    |
| running          | source.disconnect    | —                   | degraded  |
| degraded         | reconnect + backfill | —                   | running   |
| completed/failed | replay.seek          | —                   | replay    |

### 5.2 Task

| 当前    | 事件           | 下一            | 副作用              |
| ------- | -------------- | --------------- | ------------------- |
| pending | task.started   | running         | 记 startedAt        |
| pending | task.blocked   | blocked         | 记阻塞原因          |
| running | task.waiting   | waiting         | 记等待对象          |
| running | task.completed | completed       | 记 endedAt/duration |
| running | task.failed    | failed          | 记 error/attempt    |
| running | task.aborted   | aborted         | 记 abort 来源       |
| failed  | task.retried   | pending/running | attempt +1          |
| blocked | task.unblocked | pending         | 清原因              |
| any     | task.skipped   | skipped         | 记原因              |

非法迁移（如 completed→running）必须拒绝并记 `log` 事件，不静默修改。

### 5.3 View

| 当前    | 事件              | 下一              |
| ------- | ----------------- | ----------------- |
| loading | data.ready        | ready             |
| ready   | filter.change     | ready（重算投影） |
| ready   | source.disconnect | stale             |
| stale   | source.reconnect  | ready             |
| ready   | replay.enter      | replay            |
| replay  | replay.exit       | ready             |
| any     | fatal.error       | error             |

---

## 6. UI 设计

### 6.1 布局

```
┌────────────────────────────────────────────────────────────────────┐
│ Title bar: [TaskScope]  source: ultimate ▾  run: #42 ▾  live ●    │
├──────────┬─────────────────────────────────────────────┬───────────┤
│ Left rail│  Tabs: [Graph] [Timeline] [Compare]         │ Inspector │
│          │                                             │           │
│ Sources  │                                             │ Task      │
│ Runs     │           DAG / Timeline canvas             │ status    │
│ Saved    │                                             │ timing    │
│ views    │                                             │ attempts  │
│          │                                             │ logs      │
│          │                                             │ artifacts │
├──────────┴─────────────────────────────────────────────┴───────────┤
│ Status: 1,284 tasks · 42 running · 3 failed · lag 120ms · 18MB     │
└────────────────────────────────────────────────────────────────────┘
```

### 6.2 概览条

- 运行中 / 等待 / 失败 / 完成 数量；
- p50/p95 任务时长；
- 关键路径长度；
- 数据新鲜度（最后事件年龄）；
- 事件速率（events/s）。

### 6.3 DAG 视图

节点：

- 矩形卡片，宽 180–260px，高 56–72px；
- 第一行：状态点 + 任务名（截断）；
- 第二行：agent/kind + 时长/attempt；
- 失败节点红色左边框；等待节点黄色；完成绿色；运行中蓝色脉冲；
- 折叠节点显示 `+N` 与状态汇总。

边：

- owner：实线，灰；
- dependency：实线，深灰，箭头；
- spawn：虚线，蓝；
- message：点线，紫（AD-40 复用）。

交互：

- 滚轮缩放，拖拽平移；
- 点击选中并打开 Inspector；
- 双击聚焦子图；
- 右键菜单：聚焦、折叠、复制 id、在时间线中定位、导出子图；
- `F` 适配视图，`L` 重新布局，`Esc` 清除选择；
- 框选多选；Shift+点击加选。

### 6.4 时间线视图

- 纵轴：任务行，按 owner/parent 分组，可折叠；
- 横轴：时间，支持 1m/5m/1h/6h/24h/全部；
- 任务条：从 startedAt 到 endedAt；运行中用 now 延伸；
- 失败用红色斜纹；等待用黄色；重试用 `↻2`；
- 依赖用细线连接（可选开关）；
- 缩放/平移同步：在 DAG 选中任务，时间线滚动到对应条；
- 时间桶：>10k 事件时按 1s/10s/1m 聚合，显示密度热力。

### 6.5 Inspector

Tabs：

1. **Summary**：id、name、kind、status、attempt、start/end/duration、actor、conversation 链接。
2. **Timeline**：该任务的 started/waiting/resumed/completed 事件。
3. **Logs**：结构化日志（level、message、at），虚拟列表。
4. **Artifacts**：文件/链接/截图；点击在系统打开（需确认）。
5. **Raw**：JSON（只读），复制按钮。

### 6.6 空/加载/错误状态

| 状态     | 文案                                          | 动作                          |
| -------- | --------------------------------------------- | ----------------------------- |
| 无数据源 | "Connect a source to begin."                  | Connect Ultimate / Open JSONL |
| 连接中   | "Connecting to 127.0.0.1:4747…"               | Cancel                        |
| 无 run   | "No runs yet. Start one in Ultimate."         | Refresh                       |
| 断线     | "Source disconnected · showing last snapshot" | Reconnect                     |
| 解析失败 | "N events could not be parsed"                | View details / Export         |
| 空过滤   | "No tasks match these filters."               | Clear filters                 |

### 6.7 命令面板

`Ctrl/Cmd+K`：

- `Go to run…`
- `Filter status:failed`
- `Focus task…`
- `Toggle timeline`
- `Export current view…`
- `Connect source…`
- `Open settings`

### 6.8 可访问性

- 所有操作可键盘完成；
- 状态不只靠颜色：图标 + 文本；
- 对比度 WCAG AA；
- `prefers-reduced-motion` 时关闭脉冲/动画；
- 图节点有 `aria-label`（name + status + duration）。

---

## 7. 算法

### 7.1 归一化

```text
function normalizeUltimateTaskGraph(graph, runId):
  for node in graph.nodes:
    task = {
      id: node.id,
      runId,
      parentId: node.owner?.taskId ?? null,
      name: node.name ?? node.kind,
      kind: mapKind(node),
      status: mapStatus(node.status),
      attempt: node.attempt ?? 1,
      startedAt: node.startedAt,
      endedAt: node.endedAt,
      actor: node.actor,
      conversationId: node.conversationId,
      metadata: ...
    }
    emit task.created/started/completed based on status
  for edge in graph.edges: emit edge.added
```

### 7.2 分层布局（ELK）

```text
async function layout(graph):
  elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '24',
      'elk.layered.edgeRouting': 'ORTHOGONAL',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP'
    },
    children: nodes.map(n => ({id:n.id, width:n.w, height:n.h})),
    edges: edges.map(e => ({id:e.id, sources:[e.from], targets:[e.to]}))
  }
  return elk.layout(elkGraph)   // in Web Worker
```

复杂度：ELK layered 近似 O(V+E) 到 O(V log V)，1k 节点约 100–300ms；10k 节点必须聚合。

### 7.3 关键路径

```text
function criticalPath(tasks, edges, now):
  order = topologicalSort(tasks, edges)       // dependency edges only
  dist = map(task -> duration(task, now))
  prev = map()
  for t in order:
    for e in incoming(t):
      cand = dist[e.from] + duration(t, now)
      if cand > dist[t]: dist[t] = cand; prev[t] = e.from
  end = argmax(dist)
  return path(end, prev)
```

运行中任务的 duration 用 `now - startedAt`；等待时间单独统计，不混入执行时长。

### 7.4 折叠/聚合

```text
function collapse(tasks, groupBy):
  groups = groupBy(tasks, groupBy)   // owner | parent | agent | status
  for group:
    node = {
      id: 'group:' + key,
      name: key + ' (' + group.length + ')',
      status: rollup(group.statuses),   // failed > running > waiting > completed
      children: group.map(t => t.id)
    }
  edges = groupEdges(edges, groups)
  return { nodes, edges }
```

### 7.5 时间线聚合

```text
function bucket(events, range, widthPx):
  bucketMs = chooseBucket(range, widthPx)  // 1s/10s/1m/5m/1h
  counts = map(bucket -> {started, completed, failed})
  return sorted(counts)
```

### 7.6 增量布局

```text
function updateLayout(prev, next):
  added = next.nodes - prev.nodes
  removed = prev.nodes - next.nodes
  if added.length + removed.length < prev.nodes.length * 0.05:
    place added near parent; keep prev positions
  else:
    scheduleFullLayout(debounce 250ms)
```

### 7.7 对比

```text
function diffRuns(a, b):
  keys = union(a.taskKeys, b.taskKeys)
  for key:
    statusDiff, durationDelta, costDelta, attemptDelta
  return {
    added: keys only in b,
    removed: keys only in a,
    slower: durationDelta > 20%,
    faster: durationDelta < -20%,
    moreExpensive: costDelta > 20%,
    newlyFailing: a.completed && b.failed
  }
```

---

## 8. 性能预算

| 指标         | 预算                  | 降级                     |
| ------------ | --------------------- | ------------------------ |
| 冷启动       | < 2 s                 | 骨架屏                   |
| 1k 节点布局  | < 300 ms              | Worker + 缓存            |
| 10k 节点首屏 | < 1.5 s               | 自动聚合到 ≤2k           |
| 平移/缩放    | 60 fps                | 只渲染可见节点；关闭动画 |
| 摄入         | 5k events/s           | 批量 500/事务；背压      |
| 查询         | < 100 ms（10 万事件） | 索引 + 分页              |
| 内存         | < 600 MB（10k 任务）  | 释放不可见子图           |
| SQLite       | < 1 GB / 30 天        | 保留策略                 |

实现要点：

- `onlyRenderVisibleElements`（React Flow）；
- 节点/边 memo 化，避免全量 re-render；
- 选择器精确订阅（Zustand `useStore(selector)`）；
- 时间线 Canvas，不用 DOM 画每个条；
- 布局结果缓存 key = `topologyHash + sizeHash`；
- 事件批量写入，UI 每 100ms 合并刷新；
- 大字段（日志/JSON）按需加载，不进入首屏。

---

## 9. 文件清单与实施顺序

### 9.1 目录

```
taskscope/
├─ package.json
├─ electron.vite.config.ts
├─ src/
│  ├─ main/
│  │  ├─ index.ts              # app lifecycle, window, security
│  │  ├─ ipc.ts                # typed handlers
│  │  ├─ db/
│  │  │  ├─ schema.ts          # migrations
│  │  │  ├─ store.ts           # append/query
│  │  │  └─ retention.ts
│  │  ├─ sources/
│  │  │  ├─ ultimate.ts
│  │  │  ├─ otlp.ts
│  │  │  ├─ jsonl.ts
│  │  │  └─ manager.ts
│  │  └─ normalize/
│  │     ├─ ultimate.ts
│  │     ├─ otel.ts
│  │     └─ jsonl.ts
│  ├─ preload/
│  │  └─ index.ts              # contextBridge API
│  ├─ shared/
│  │  ├─ events.ts             # OrchestraEvent
│  │  ├─ models.ts             # Task/Run/Edge
│  │  └─ ipc.ts                # channel types
│  └─ renderer/
│     ├─ app.tsx
│     ├─ stores/
│     │  ├─ runs.ts
│     │  ├─ graph.ts
│     │  └─ filters.ts
│     ├─ views/
│     │  ├─ GraphView.tsx
│     │  ├─ TimelineView.tsx
│     │  ├─ CompareView.tsx
│     │  └─ Overview.tsx
│     ├─ components/
│     │  ├─ TaskNode.tsx
│     │  ├─ Inspector.tsx
│     │  ├─ FilterBar.tsx
│     │  └─ CommandPalette.tsx
│     ├─ layout/
│     │  ├─ elk.worker.ts
│     │  └─ criticalPath.ts
│     └─ styles/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
└─ fixtures/
   ├─ ultimate-run.jsonl
   └─ large-10k.jsonl
```

### 9.2 实施顺序

#### M0 — 壳与假数据（2–3 天）

- Electron 窗口、安全配置、preload、IPC 骨架；
- `OrchestraEvent`/`Task` 类型；
- JSONL adapter + 一个 50 任务的 fixture；
- 能显示 run 列表与原始 JSON。
- 验收：`AC-T-001`、`AC-T-002`。

#### M1 — SQLite 与归一化（3–4 天）

- schema/migrations/store；
- Ultimate normalizer（tasks/conversations/events）；
- 增量 append + 查询。
- 验收：`AC-T-003`、`AC-T-004`。

#### M2 — DAG（4–5 天）

- React Flow 节点/边；
- ELK worker 布局；
- 选择/缩放/折叠/关键路径。
- 验收：`AC-T-005` ~ `AC-T-007`。

#### M3 — 时间线（3–4 天）

- Canvas 时间线、缩放、任务条、依赖线；
- 与 DAG 联动。
- 验收：`AC-T-008`、`AC-T-009`。

#### M4 — Inspector 与过滤（2–3 天）

- 详情 tabs、日志虚拟列表、artifact；
- 过滤/搜索/命令面板。
- 验收：`AC-T-010`、`AC-T-011`。

#### M5 — 回放与对比（2–3 天）

- 时间旅行、run diff；
- 导出 PNG/JSON/CSV。
- 验收：`AC-T-012` ~ `AC-T-014`。

#### M6 — 性能与打包（3–4 天）

- 10k fixture 基准；聚合/虚拟化；
- 签名、自动更新、崩溃报告。
- 验收：`AC-T-015` ~ `AC-T-018`。

---

## 10. 测试计划

### 10.1 单元

| 编号    | 测试                      | 期望               |
| ------- | ------------------------- | ------------------ |
| UT-T-01 | Ultimate task → Task 映射 | 字段/状态正确      |
| UT-T-02 | 非法事件                  | 拒绝并记录         |
| UT-T-03 | 状态迁移                  | 非法迁移拒绝       |
| UT-T-04 | 关键路径                  | 最长路径正确       |
| UT-T-05 | 折叠                      | 汇总状态正确       |
| UT-T-06 | 时间桶                    | 边界正确           |
| UT-T-07 | diff                      | 新增/删除/变慢正确 |
| UT-T-08 | 迁移                      | 从 v0 到最新幂等   |

### 10.2 集成

| 编号    | 场景          | 期望                     |
| ------- | ------------- | ------------------------ |
| IT-T-01 | SSE 重连      | 不重复、不丢事件         |
| IT-T-02 | 批量写入 5k/s | < 1s 落库                |
| IT-T-03 | 10 万事件查询 | < 100ms                  |
| IT-T-04 | 保留策略      | 删除最旧 run，不破坏外键 |
| IT-T-05 | JSONL 回放    | 与源事件一致             |
| IT-T-06 | OTLP span     | 正确归入 trace/task      |

### 10.3 E2E

| 编号     | 场景                           | 期望                      |
| -------- | ------------------------------ | ------------------------- |
| E2E-T-01 | 连接 Ultimate，启动一个 branch | 5s 内出现 run/task        |
| E2E-T-02 | 失败任务                       | 红色节点 + Inspector 错误 |
| E2E-T-03 | 10k fixture                    | 首屏 < 1.5s；可平移       |
| E2E-T-04 | 回放                           | 前进/后退状态正确         |
| E2E-T-05 | 对比                           | 差异列表正确              |
| E2E-T-06 | 断线                           | 显示 stale，重连恢复      |

### 10.4 性能基准

```bash
pnpm bench:load fixtures/large-10k.jsonl
pnpm bench:layout
pnpm bench:query
```

期望输出：加载 ms、布局 ms、查询 ms、内存 MB；CI 保存基线，回归 >20% 失败。

---

## 11. 验收 Checklist

| ID       | 验收项（二元）                                                 | 覆盖 REQ             |
| -------- | -------------------------------------------------------------- | -------------------- |
| AC-T-001 | 应用冷启动 < 2s，显示空状态                                    | REQ-T-001, REQ-T-019 |
| AC-T-002 | JSONL fixture 能完整加载并显示 run                             | REQ-T-002, REQ-T-017 |
| AC-T-003 | Ultimate SSE 能实时显示新任务                                  | REQ-T-002, REQ-T-012 |
| AC-T-004 | 事件先落 SQLite，重启后仍在                                    | REQ-T-003            |
| AC-T-005 | DAG 可缩放/平移/选择/折叠                                      | REQ-T-004            |
| AC-T-006 | 1k 节点布局 < 300ms                                            | REQ-T-011            |
| AC-T-007 | 关键路径高亮正确                                               | REQ-T-008            |
| AC-T-008 | 时间线缩放/对齐正确                                            | REQ-T-005            |
| AC-T-009 | DAG 选择联动时间线                                             | REQ-T-005            |
| AC-T-010 | Inspector 显示状态/耗时/错误/日志/产物                         | REQ-T-006            |
| AC-T-011 | 过滤/搜索/命令面板可用                                         | REQ-T-007, REQ-T-014 |
| AC-T-012 | 回放前进/后退正确                                              | REQ-T-009            |
| AC-T-013 | 两次 run diff 正确                                             | REQ-T-010            |
| AC-T-014 | 导出 PNG/JSON/CSV                                              | REQ-T-013            |
| AC-T-015 | 10k 任务首屏 < 1.5s，自动聚合                                  | REQ-T-011            |
| AC-T-016 | 断线显示 stale 并可恢复                                        | REQ-T-012, REQ-T-018 |
| AC-T-017 | 暗色/亮色/高对比度可用                                         | REQ-T-015            |
| AC-T-018 | 签名安装包可启动，自动更新可用                                 | REQ-T-016            |
| AC-T-019 | 无数据/加载/错误状态有明确文案                                 | REQ-T-019            |
| AC-T-020 | 性能基准脚本可复现                                             | REQ-T-020            |
| AC-T-021 | 缺失字段（endedAt/attempt/cost）显示 unknown/partial，不填假值 | REQ-T-003            |

---

## 12. 失败矩阵

| 失败         | 原因                   | 检测            | 恢复               | 用户可见            |
| ------------ | ---------------------- | --------------- | ------------------ | ------------------- |
| 源不可达     | Ultimate 未启动/端口错 | fetch/SSE error | 指数退避重连       | 断线横幅 + 最后快照 |
| SSE 断流     | 网络/服务重启          | onerror         | 重连 + 补拉        | stale 状态          |
| 事件解析失败 | 版本不匹配/脏数据      | schema 校验     | 跳过并计数         | "N events skipped"  |
| SQLite 锁    | 多实例/长事务          | SQLITE_BUSY     | 重试 + 单实例锁    | 提示关闭其他实例    |
| 迁移失败     | 旧 schema/磁盘满       | 启动检查        | 备份后修复；不降级 | 错误页 + 备份路径   |
| 布局超时     | 图太大                 | Worker timeout  | 降级为网格/聚合    | 提示已简化          |
| 内存超限     | 大图/日志              | 监控            | 释放不可见子图     | 提示                |
| 导出失败     | 磁盘权限               | 写文件错误      | 选择其他路径       | 错误提示            |

---

## 13. 端到端样例（用 Ultimate 数据）

场景：@ultimate 启动 branch #42，coordinator 派 worker #43，worker 在 worktree 提交，reviewer #44 审查，lander 落地。

期望事件序列（节选）：

```jsonl
{"v":1,"id":"e1","seq":1,"at":1761580000000,"source":"ultimate","runId":"run-42","taskId":"t42","type":"run.started","data":{"title":"Branch titles on the branch tool"}}
{"v":1,"id":"e2","seq":2,"at":1761580001000,"source":"ultimate","runId":"run-42","taskId":"t42.1","parentTaskId":"t42","type":"task.created","data":{"name":"coordinator","kind":"agent","status":"running"}}
{"v":1,"id":"e3","seq":3,"at":1761580002000,"source":"ultimate","runId":"run-42","taskId":"t43","parentTaskId":"t42.1","type":"task.created","data":{"name":"worker","kind":"agent","status":"running","agent":"worker"}}
{"v":1,"id":"e4","seq":4,"at":1761580010000,"source":"ultimate","runId":"run-42","taskId":"t43.1","parentTaskId":"t43","type":"task.completed","data":{"name":"edit","kind":"tool","durationMs":3200}}
{"v":1,"id":"e5","seq":5,"at":1761580030000,"source":"ultimate","runId":"run-42","taskId":"t43","type":"task.completed","data":{"durationMs":28000,"result":"committed"}}
{"v":1,"id":"e6","seq":6,"at":1761580035000,"source":"ultimate","runId":"run-42","taskId":"t44","parentTaskId":"t42.1","type":"task.created","data":{"name":"reviewer","kind":"agent","status":"running"}}
{"v":1,"id":"e7","seq":7,"at":1761580060000,"source":"ultimate","runId":"run-42","taskId":"t44","type":"task.completed","data":{"verdict":"APPROVED"}}
{"v":1,"id":"e8","seq":8,"at":1761580070000,"source":"ultimate","runId":"run-42","taskId":"t42","type":"run.completed","data":{"sha":"3f7b7be"}}
```

期望截图描述：

- DAG：`run-42` 根节点 → `coordinator` → 三个子节点 `worker`/`reviewer`/`lander`；`worker` 下有两个工具节点；`reviewer` 与 `worker` 并行；关键路径经过 `worker` 的最长工具链。
- 时间线：worker 条最长；reviewer 在 worker 结束后开始；lander 最后。
- Inspector：选中 worker 显示 `agent: worker`、`worktree branch`、`commits ahead 1`、`duration 28s`。
- 概览：1 run、4 agents、2 tool calls、0 failures、关键路径 40s。

---

## 14. 未决问题

| ID     | 内容                                                 | 处理                                                 |
| ------ | ---------------------------------------------------- | ---------------------------------------------------- |
| Q-T-01 | Ultimate 的 trace 保留 7 天，历史 run 如何长期保存？ | 桌面 app 自己落库；提供导入                          |
| Q-T-02 | 是否支持多项目/多 host？                             | 先单 host；数据源可多个，UI 按 source 分组           |
| Q-T-03 | 是否需要写入/控制（重试、停止）？                    | v1 只读；v2 通过 Ultimate action 做，需权限与审计    |
| Q-T-04 | 时间线用 Canvas 还是 DOM？                           | 10k 事件必须 Canvas；MVP 可 vis-timeline             |
| Q-T-05 | 是否支持 Windows 以外？                              | Electron 跨平台；先 Windows 验证                     |
| Q-T-06 | 数据隐私                                             | 默认不存正文；提供开关与本地加密选项                 |
| Q-T-07 | 与 AD-40 共享多少代码？                              | 共享 `@orchestra/core`/`ui`；两 app 只做视图与适配器 |
