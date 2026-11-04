# 40 · 子 Agent 编排可视化桌面应用实现 Spec（AgentLoom）

| 字段             | 值                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 文档 ID          | AD-40                                                                                                                                   |
| 产品名（工作名） | **AgentLoom**                                                                                                                           |
| 需求前缀         | `REQ-V-*` / 验收 `AC-V-*`                                                                                                               |
| 状态             | 1.0（通过质量门）                                                                                                                       |
| 证据基线         | `3f7b7bec`（2026-10-27）；外部资料访问日期 2026-10-28                                                                                   |
| 前置阅读         | `../subagent-orchestration/20-subagent-orchestration-spec.md` §3.10（可观测性）、`30-task-orchestration-desktop-spec.md` §3（共享架构） |
| 读者             | 要复刻该桌面应用的 AI agent / 桌面工程师                                                                                                |

---

## 0. 一句话结论

AgentLoom 是一个**看"谁在什么时候做了什么、谁把工作交给了谁、答案怎么回来"**的本地桌面应用。它不是聊天记录浏览器，而是把多 agent 运行投影成四张联动视图：

1. **Lanes（泳道）**：每个 agent 一行，按生成树缩进；块 = 运行，刻线 = 工具/模型调用；
2. **Spawn Tree（生成树）**：父子关系、分支/常驻/子 agent、worktree、plan task；
3. **Messages（消息）**：agent 之间的消息/报告/回复边（不含正文）；
4. **Replay（回放）**：按时间前进/后退，复盘失败与等待。

推荐栈与 AD-30 共享：**Electron 45 + React 19 + TypeScript + SQLite（better-sqlite3）**；图用 `@xyflow/react 12.12` + `elkjs 0.12`；泳道用 **Canvas**（大数据量）；与 TaskScope 共享 `@orchestra/core` 与 `@orchestra/ui`。若包体积/内存/签名是硬约束，按 `research/desktop-research.md` 选 **Tauri 2.12.5**，替换点见 `30` §3.5。

**默认只读**。控制（steer/stop）是 v2 能力，必须有显式授权、二次确认和审计；v1 不直接写 Ultimate 的数据库。

---

## 1. 用户、场景与需求

### 1.1 Personas

| Persona                | 目标                                                       | 痛点                         | 主要视图           |
| ---------------------- | ---------------------------------------------------------- | ---------------------------- | ------------------ |
| **编排调试者**（主要） | 看 coordinator 是否合理委派、worker 是否卡住、答案是否回来 | 只能翻多个会话；父子关系靠猜 | Lanes + Spawn Tree |
| **成本负责人**         | 看每个 agent/分支的 token、模型、缓存命中、返工            | 账单只有总数；不知道谁烧的   | Cost + Lanes       |
| **故障复盘者**         | 还原失败链：谁先错、谁重试、谁最终放弃                     | 失败卡只有最后一跳           | Replay + Messages  |
| **演示者/导师**        | 向他人解释多 agent 如何协作                                | 聊天记录不直观               | Lanes + 动画回放   |

### 1.2 Jobs-to-be-Done

| ID     | JTBD                                          | 视图           |
| ------ | --------------------------------------------- | -------------- |
| J-V-01 | 一眼看出当前有哪些 agent 在跑、谁在等谁       | Lanes          |
| J-V-02 | 看清谁 spawn 了谁、从哪个工具调用 spawn       | Spawn Tree     |
| J-V-03 | 看某 agent 的完整活动：运行、工具、模型、等待 | Lane detail    |
| J-V-04 | 看消息/报告如何在 agent 间流动                | Messages       |
| J-V-05 | 找出最贵/最慢/失败最多的 agent                | Cost / ranking |
| J-V-06 | 回放一次编排，定位第一个异常                  | Replay         |
| J-V-07 | 对比两次运行，判断改动是否有效                | Compare        |
| J-V-08 | 从可视化跳回 Ultimate 的具体会话/条目         | Deep link      |

### 1.3 需求清单

| ID        | 需求                                                                | 优先级 |
| --------- | ------------------------------------------------------------------- | ------ |
| REQ-V-001 | 必须本地运行，默认只读                                              | P0     |
| REQ-V-002 | 必须支持 Ultimate 实时源与 JSONL 回放源                             | P0     |
| REQ-V-003 | 必须把 agent/conversation/spawn/message/tool/model 归一化为统一模型 | P0     |
| REQ-V-004 | 必须提供泳道视图，按生成树缩进、按时间铺开                          | P0     |
| REQ-V-005 | 必须提供生成树视图，显示 parent/spawn call/kind                     | P0     |
| REQ-V-006 | 必须提供消息/报告边视图（不含正文）                                 | P0     |
| REQ-V-007 | 必须提供 agent 详情：状态、模型、token、工具、workspace、plan task  | P0     |
| REQ-V-008 | 必须支持悬停高亮祖先/后代链                                         | P1     |
| REQ-V-009 | 必须支持时间范围切换（30m/2h/24h/全部）                             | P0     |
| REQ-V-010 | 必须支持回放与时间旅行                                              | P1     |
| REQ-V-011 | 必须支持两次 run 对比                                               | P2     |
| REQ-V-012 | 必须支持成本/缓存/失败率聚合                                        | P1     |
| REQ-V-013 | 必须支持深链回 Ultimate 会话                                        | P1     |
| REQ-V-014 | 必须能处理 200 agents / 100k calls                                  | P0     |
| REQ-V-015 | 必须支持断线/重连/快照对账                                          | P0     |
| REQ-V-016 | 必须提供只读/控制两种模式，控制默认关闭                             | P0     |
| REQ-V-017 | 控制动作必须有二次确认与审计日志                                    | P0     |
| REQ-V-018 | 必须默认不存储 prompt/response 正文                                 | P0     |
| REQ-V-019 | 必须提供空/加载/错误/断线状态                                       | P1     |
| REQ-V-020 | 必须提供可注入的假数据源与性能基准                                  | P0     |

---

## 2. 调研：产品与可借鉴点

### 2.1 Agent/LLM 可观测产品

| 产品                              | 核心能力                             | 可借鉴                                                    | 不照搬                                                    |
| --------------------------------- | ------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| **LangGraph Studio**              | 图可视化、运行、断点、状态编辑       | "图 + 运行 + 单步"的开发 IDE 体验                         | 绑定 LangGraph                                            |
| **AutoGen Studio**                | 多 agent 团队、运行记录、消息        | 团队/agent 配置与运行历史并列；live message streaming     | 官方标为 research prototype，不照搬架构；偏搭建，不是观测 |
| **CrewAI**                        | Crew/Flow、任务与 agent              | 角色/任务/结果的叙事结构                                  | 框架绑定                                                  |
| **Langfuse**                      | trace/session/generation、成本、评分 | session 视图、token/成本、按用户/标签过滤                 | 通用 LLM 观测，缺 spawn 树                                |
| **Arize Phoenix**                 | OTel-native trace、eval、嵌入分析    | OTel 导入、span 树、评估                                  | 偏 ML/评估                                                |
| **AgentOps**                      | session replay、成本、错误、集成     | "session replay" 的叙事与时间线                           | 云优先                                                    |
| **Braintrust**                    | 日志、eval、playground、对比         | 运行对比与评分                                            | 偏实验管理                                                |
| **Ultimate System / Agent Lanes** | 泳道、生成树、消息线、调用树         | 直接的产品参照：树形缩进 + 时间块 + spawn 连线 + 消息竖线 | 只服务单 host                                             |

来源（访问日期 2026-10-28）：

- LangGraph Studio: https://www.langchain.com/blog/langgraph-studio-the-first-agent-ide
- AutoGen Studio: https://microsoft.github.io/autogen/stable/user-guide/autogenstudio-user-guide/index.html
- CrewAI: https://docs.crewai.com/
- Langfuse: https://langfuse.com/docs/tracing
- Arize Phoenix: https://docs.arize.com/phoenix
- AgentOps: https://docs.agentops.ai/
- Braintrust: https://www.braintrust.dev/docs
- Ultimate System: `extensions/system/README.md`

**结论 R-V-01**：agent 可视化的核心不是"图"，而是**时间 × 层级**。泳道（层级缩进 + 时间块）比纯 DAG 更接近"谁在何时做了什么"。

**结论 R-V-02**：spawn 边必须能追溯到"父的哪个工具调用"；否则用户无法回答"为什么会有这个 agent"。

**结论 R-V-03**：消息边是 agent 编排与普通任务编排的最大差异；必须单独表达（方向、reply/steer、时间），但默认不显示正文。

**结论 R-V-04**：成本必须按 agent 聚合，且区分 input/output/cache；否则"谁烧的"无法回答。

### 2.2 数据标准

| 标准            | 可用字段                                                 | 缺口                                  |
| --------------- | -------------------------------------------------------- | ------------------------------------- |
| OTel GenAI      | model/provider、token、operation、tool name、span status | 无 spawn/消息/审批语义                |
| OTel traces     | trace/span/parent、start/end、attributes                 | 需要 `orchestra.agent.*` 自定义属性   |
| AG-UI           | run/task 状态、tool call、消息事件                       | 偏前端交互，不是历史                  |
| A2A             | task state、messages、artifacts                          | 跨组织协议，字段重                    |
| Ultimate events | `subagents.started`, `board.sent`, `tasks`, trace        | 最贴近本 spec；但缺 reporter 阶段事件 |

**结论 R-V-05**：定义 `orchestra.agent.event.v1` 扩展事件；OTel/AG-UI/A2A 只做导入映射。

---

## 3. 架构

### 3.1 与 TaskScope 共享内核

```
packages/
├─ orchestra-core/     # 事件模型、归一化、SQLite、查询、回放
├─ orchestra-ui/       # 设计系统、Canvas 时间线、Inspector、命令面板
├─ orchestra-adapters/ # Ultimate / OTel / JSONL
├─ taskscope/          # 任务编排 app（AD-30）
└─ agentloom/          # 子 agent 编排 app（本文件）
```

共享：

- `OrchestraEvent` 基础字段；
- SQLite 迁移框架；
- source manager 接口；
- UI 主题/图标/状态色；
- 回放时钟；
- 性能基准工具。

差异：

- AgentLoom 多 `agents`、`spawn_edges`、`message_edges`、`model_calls` 表；
- 主视图是泳道，不是 DAG；
- 控制面更敏感（stop/steer）。

### 3.2 进程

```
Electron main
  ├─ UltimateAdapter (SSE + actions)
  ├─ JsonlAdapter
  ├─ Normalizer (agent events)
  ├─ Store (SQLite WAL)
  └─ ControlService (v2, opt-in)
Renderer
  ├─ LanesCanvas (Canvas 2D)
  ├─ SpawnTree (@xyflow/react + ELK)
  ├─ MessagesOverlay
  ├─ Inspector / Cost / Replay
  └─ Zustand stores
```

**Tauri 替换**：把 `Electron main` 换成 `src-tauri` Rust core（`reqwest` SSE + `rusqlite` + command/event），`preload` 换成 `#[tauri::command]` + capability；前端与 Canvas/SQLite schema 不变。完整替换表见 `30` §3.5。选择条件见 `30` §2.4 的"权重差异"说明。

### 3.3 实时摄入

#### 3.3.1 Ultimate 源

优先使用事件流，快照对账：

| 数据          | API                                                       | 频率          |
| ------------- | --------------------------------------------------------- | ------------- |
| 生成/消息事件 | `GET /api/events?conversation=1` SSE                      | 实时          |
| 任务图        | `tasks` SSE 事件                                          | 实时          |
| 泳道快照      | `POST /api/extensions/system/actions/lanes {since,until}` | 2s（仅 live） |
| 调用流        | `POST /api/extensions/system/actions/stream`              | 增量分页      |
| 调用树        | `POST /api/extensions/system/actions/tree {trace}`        | 选中时        |
| 会话元数据    | `conversations` SSE                                       | 实时          |
| workspace     | `POST /api/extensions/workspaces/actions/info {id}`       | 选中/每 5s    |
| plan 关联     | `ultimate.plan.tasks` doc                                 | 实时          |

#### 3.3.2 事件 → 模型

| Ultimate                                                          | `orchestra.event.v1`                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `subagents.started {id, agent, parent?, kind, model?, thinking?}` | `task.created`（`data.kind:'agent'`）+ `edge.added`（`kind:'spawn'`，若 parent） |
| `board.sent {from,to,reply,steer}`                                | `message.sent`（边模型，见 91 §4）                                               |
| `tasks` graph node                                                | `task.started` / `task.completed`（`data.kind` = agent/tool）                    |
| trace `tool`                                                      | `task.started` / `task.completed`（`data.kind:'tool'`）                          |
| trace `model`                                                     | `metric`（`data.kind:'model'`）                                                  |
| `workspaces.landed`                                               | `artifact.added`（`data.kind:'landing'`）                                        |
| `conversations.compacted`                                         | `task.completed`（`data.kind:'compaction'`）                                     |

#### 3.3.3 断线与对账

1. SSE `onerror` → 状态 `stale`，指数退避 1s→30s；
2. 重连后先拉 `lanes` 快照，与本地 `agents` 表 diff；
3. 以快照为准修正状态；缺失事件用 `stream` 补拉；
4. 无法补拉时标记 `partial`，UI 显示"历史可能不完整"。

#### 3.3.4 数据缺口与降级（v0 必读）

| 缺口 | 事实                                  | v0 处理                                                                       |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------- |
| G1   | `TaskGraph` 只含 live task            | agent 历史从 `subagents.started` + `system.stream` + 本地归档重建             |
| G2   | 无结束时间/attempt                    | duration = last call - first call；无法计算则 `null`；attempt 从重复 run 推断 |
| G4   | token 可能被截断/缺失                 | `usage_unavailable`；成本显示 "—"                                             |
| G5   | 无 agent 状态时间线                   | 块由 call 间隔切分；`inferred:true`                                           |
| G6   | `board.sent` 无正文                   | 消息边只显示方向/时间/reply/steer；正文需打开原会话                           |
| G8   | lanes 40 / run 200 calls / trace 7 天 | 视口裁剪 + 本地归档；`partial` 徽标                                           |
| G9   | 无 per-subagent stop/steer action     | v1 只读；v2 用 conversation 级 abort/submit + 审计                            |
| G10  | WebView 直连会被同源策略拦            | 由 sidecar 代理 HTTP；WebView 只拿 DTO                                        |

原则同 `30` §3.3.5：**能推断标 `inferred`，不能推断显示 `unknown`，不填假值。**

### 3.4 安全与隐私

| 面       | 措施                                                          |
| -------- | ------------------------------------------------------------- |
| 默认只读 | 不提供写 API；控制模式需显式开启                              |
| 控制授权 | 一次性 token + 每动作确认 + 审计日志（who/when/what/result）  |
| 数据     | 默认不存 prompt/response；只存元数据、token、工具名、错误分类 |
| 深链     | `http://127.0.0.1:<port>/?conversation=<id>`；只允许 loopback |
| 导出     | 导出前预览字段；默认脱敏                                      |
| 更新     | 签名 + 代码签名                                               |

**控制动作（v2）**：

- `stop agent`：调用 Ultimate 既有的 conversation abort（`POST /api/conversations/:id/abort`）；没有 per-subagent 的独立 action（G9）。
- `steer`：调用 conversation submit，`whenBusy:'steer'`；必须显示"这会改变 agent 行为"。
- 两者都经 sidecar 代理（解决同源 403），并需二次确认 + 本地审计表。
- 禁止：直接写 SQLite、直接杀进程、绕过权限。

---

## 4. 数据模型

### 4.1 Agent

```ts
export interface Agent {
  id: string // conversation id as string
  rootId: string // root agent/run id
  parentId?: string
  name: string // definition name or label
  kind:
    | 'ultimate'
    | 'coordinator'
    | 'branch'
    | 'child'
    | 'standing'
    | 'automation'
    | 'lander'
    | 'watcher'
  status: 'idle' | 'running' | 'waiting' | 'awaiting' | 'done' | 'failed' | 'unknown'
  model?: string // provider/model
  thinking?: string
  title?: string
  startedAt: number
  endedAt?: number
  conversationId: number
  workspace?: { path: string; branch: string; base?: string; landed?: string }
  planTask?: { key: string; title: string; status: string }
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number }
  costUsd?: number
  metadata: Record<string, unknown>
}
```

### 4.2 Spawn 边

```ts
export interface SpawnEdge {
  id: string
  parentId: string
  childId: string
  callId?: string // parent's tool call
  at: number
  inferred?: boolean // no exact call id
  kind: 'subagent' | 'branch' | 'standing' | 'automation'
}
```

### 4.3 消息边

```ts
export interface MessageEdge {
  id: string
  from: string
  to: string
  at: number
  reply: boolean
  steer: boolean
  kind: 'message' | 'report' | 'reply' | 'note'
}
```

### 4.4 调用

```ts
export interface ToolCall {
  id: string
  agentId: string
  name: string
  at: number
  ms: number
  ok: boolean
  error?: string
}

export interface ModelCall {
  id: string
  agentId: string
  provider: string
  model: string
  at: number
  ms: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  stopReason: string
}
```

### 4.5 SQLite 扩展表

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  root_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  thinking TEXT,
  title TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  conversation_id INTEGER NOT NULL,
  workspace TEXT,
  plan_task TEXT,
  tokens TEXT NOT NULL DEFAULT '{}',
  cost_usd REAL,
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX agents_root ON agents(root_id, started_at);
CREATE INDEX agents_parent ON agents(parent_id);

CREATE TABLE spawn_edges (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  call_id TEXT,
  at INTEGER NOT NULL,
  inferred INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL
);
CREATE INDEX spawn_parent ON spawn_edges(parent_id);

CREATE TABLE message_edges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  reply INTEGER NOT NULL,
  steer INTEGER NOT NULL,
  kind TEXT NOT NULL
);
CREATE INDEX message_from ON message_edges(from_id, at);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  at INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX tool_agent ON tool_calls(agent_id, at);

CREATE TABLE model_calls (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  at INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  stop_reason TEXT NOT NULL
);
CREATE INDEX model_agent ON model_calls(agent_id, at);
```

### 4.6 状态映射

| Ultimate 状态                | AgentLoom                       |
| ---------------------------- | ------------------------------- |
| running / working            | running                         |
| waits on you（仅 @ultimate） | waiting                         |
| awaiting @ultimate           | awaiting                        |
| idle                         | idle                            |
| done / concluded             | done                            |
| failed / watchdog.failure    | failed                          |
| 字段缺失/无法推断            | unknown（显示灰色问号，不猜测） |

### 4.7 运行状态

```ts
export type AgentRunStatus = 'running' | 'waiting' | 'awaiting' | 'idle' | 'done' | 'failed'
```

---

## 5. 状态机

### 5.1 Agent

| 当前     | 事件                 | 下一        | 副作用            |
| -------- | -------------------- | ----------- | ----------------- |
| created  | agent.started        | running     | 记 startedAt      |
| running  | message.received     | running     | 消息边            |
| running  | agent.waiting        | waiting     | 记等待对象        |
| running  | tool/model completed | running     | 调用记录          |
| running  | agent.completed      | done        | 记 endedAt/tokens |
| running  | agent.failed         | failed      | 记错误            |
| waiting  | agent.resumed        | running     | 清等待            |
| any      | control.stop         | stopping    | 审计              |
| stopping | stopped              | done/failed | 记结果            |

### 5.2 Spawn

| 当前   | 事件                     | 下一             |
| ------ | ------------------------ | ---------------- |
| none   | task.created with parent | linked           |
| linked | spawn edge resolved      | linked           |
| linked | parent concludes         | retained（历史） |

### 5.3 View

| 当前    | 事件             | 下一   |
| ------- | ---------------- | ------ |
| loading | data.ready       | ready  |
| ready   | timeRange.change | ready  |
| ready   | live.pause       | paused |
| paused  | live.resume      | ready  |
| ready   | replay.enter     | replay |
| replay  | replay.exit      | ready  |
| any     | fatal            | error  |

---

## 6. 视图设计

### 6.1 Lanes（主视图）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ @ultimate        ████████░░░░░░░░  ██████                                │
│  └ coordinator #42     ████████████████████████                          │
│     ├ scout #43            ████                                           │
│     ├ worker #44                  ██████████████                          │
│     │  └ reviewer #45                       ██████                       │
│     └ lander #46                                  ███                    │
│ time ────────────────────────────────────────────────────────────────▶  │
│        10:00      10:05      10:10      10:15      10:20                 │
└──────────────────────────────────────────────────────────────────────────┘
```

- 每行一个 agent，按 spawn 树缩进；树线用点线。
- 块 = 一次运行（trace 的 tool/model 调用聚合，间隔 >20s 切分）。
- 块内刻线 = 单次调用（失败红色）。
- 块的颜色 = 状态；透明度 = 活跃度。
- 父的 spawn 调用点用圆点标出，虚线连到子行第一个块；推断的虚线更淡。
- 消息 = 发送者与接收者之间的竖线（hover 显示方向/时间/reply/steer）。
- 悬停一行：高亮祖先+后代链，其他行降透明度；显示消息线。
- 点击块：打开 Inspector；点击 agent 名：打开详情/深链。

**大数据策略**：

- Canvas 绘制，不用 DOM；
- 视口裁剪：只画可见时间范围与可见行；
- 行折叠：>50 行时按根/分支折叠；
- 调用刻线 >5k 时按 1s 聚合；
- 设备像素比适配。

### 6.2 Spawn Tree

- 节点：agent 名 + kind + status + model + tokens；
- 边：spawn，label = 工具名（`subagent`/`branch`/`automation`）；
- 布局：ELK `layered`，方向 TB/LEFT；
- 折叠已完成子树（`+N finished`，记忆展开状态）；
- 点击节点：Inspector；双击：聚焦子树；
- 与 Lanes 联动：选中同步。

### 6.3 Messages

- 边：from → to，按时间排序；
- 方向：sender → recipient；
- 样式：message 实线、report 虚线、reply 点线、note 点划线；
- 颜色：reply 蓝、steer 橙、failed 红；
- 不显示正文；hover 显示 `from #id · at · reply/steer`；
- 可切换"只看失败/只看 reply/只看跨分支"。

### 6.4 Inspector

Tabs：

1. **Agent**：name、kind、status、model、thinking、started/ended、duration、parent、children、conversation 深链。
2. **Activity**：运行块、工具调用列表（名称、耗时、ok/error）、模型调用（token、cache、stop reason）。
3. **Messages**：收发的消息边（方向、时间、reply/steer），点击跳转对方。
4. **Workspace**：path、branch、base、landed、commits ahead；"Open in Ultimate"。
5. **Plan**：epic/task key、status、coordinator、notes（只读）。
6. **Raw**：JSON。

### 6.5 Cost

- 汇总：总 token、总成本、按 agent 排行、按模型排行、缓存命中率；
- 表：agent、model、input、output、cache read/write、cost、runs；
- 图：堆叠柱状图（按 agent 分段）；
- 过滤：时间范围、agent kind、branch；
- 预算：可选，超过阈值高亮（不阻断）。

公式：

```
cost = Σ(model_calls.input_tokens * price.input
        + model_calls.output_tokens * price.output
        + model_calls.cache_read_tokens * price.cacheRead
        + model_calls.cache_write_tokens * price.cacheWrite)
cacheHitRate = cacheRead / (input + cacheRead)
```

价格表可配置（每 provider/model），默认内置常见模型；未知模型显示 token 不计价。

### 6.6 Replay

- 时间轴：拖动/播放/暂停/速度（1x/10x/60x）；
- 进入回放：快照当前视图，按事件重建状态；
- 事件列表：右侧抽屉，按时间排序，点击跳转；
- 回放时禁用 live 更新；退出恢复。

### 6.7 Compare

- 选择两个 run（同 root 或不同）；
- 对齐：按 agent name + spawn 顺序；
- 差异：新增/删除 agent、duration delta、token delta、失败变化；
- 并排 Lanes 或差异表。

### 6.8 键盘与命令

- `Space` 播放/暂停；
- `←/→` 单步；
- `F` 适配；
- `L` 切换 Lanes/Tree；
- `Ctrl/Cmd+K` 命令面板；
- `Esc` 清除选择。

### 6.9 空/错误状态

| 状态       | 文案                                      | 动作           |
| ---------- | ----------------------------------------- | -------------- |
| 无源       | "Connect Ultimate or open a replay file." | Connect / Open |
| 无 agent   | "No agent activity in this window."       | Widen range    |
| 断线       | "Disconnected · showing last snapshot"    | Reconnect      |
| 部分数据   | "Some traces are missing (retention)."    | Explain        |
| 控制未授权 | "Control is off. Enable in Settings."     | Open settings  |

---

## 7. 算法

### 7.1 生成树构建

```text
function buildTree(agents, spawnEdges):
  byParent = group(spawnEdges by parentId)
  roots = agents where parentId == null or parent not in agents
  for root in roots:
    dfs(root):
      children = byParent[root.id] sorted by at
      for edge in children:
        child = agents[edge.childId]
        child.depth = root.depth + 1
        child.spawn = edge
        dfs(child)
  return roots
```

### 7.2 泳道块切分

```text
function laneBlocks(calls, gapMs = 20_000):
  sort calls by at
  blocks = []
  current = null
  for call in calls:
    if current == null or call.at - current.end > gapMs:
      current = {start: call.at, end: call.at + call.ms, calls: [call]}
      blocks.push(current)
    else:
      current.end = max(current.end, call.at + call.ms)
      current.calls.push(call)
  return blocks
```

### 7.3 关键链

```text
function criticalChain(agents, edges, now):
  # longest path by self time; selfTime = duration - sum(children duration)
  for agent in postOrder(agents):
    selfTime[agent] = max(0, duration(agent, now) - sum(duration(child, now)))
  # longest weighted path in spawn tree
  best[agent] = selfTime[agent] + max(best[child] for child in children, default 0)
  return path(argmax(best))
```

### 7.4 消息线布局

```text
function messageLines(edges, lanes):
  for edge in edges:
    fromY = laneY(edge.from); toY = laneY(edge.to)
    x = timeX(edge.at)
    draw line (x, fromY) -> (x, toY) with style by kind/reply/steer
```

### 7.5 回放重建

```text
function stateAt(runId, t):
  snapshot = latest snapshot <= t
  events = events where at > snapshot.at and at <= t order by seq
  apply(snapshot.state, events)
  return state
```

快照每 1000 事件或每 30s 写一次；回放 O(events since snapshot)。

### 7.6 对比

```text
function compare(a, b):
  keys = union(agentKey(a), agentKey(b))   # name + spawn order
  for key:
    if only a: removed
    if only b: added
    else: durationDelta, tokenDelta, statusChange
  return sorted by abs(durationDelta) desc
```

---

## 8. 性能预算

| 指标                         | 预算        | 降级              |
| ---------------------------- | ----------- | ----------------- |
| 冷启动                       | < 2s        | 骨架              |
| 200 agents / 100k calls 首屏 | < 1.5s      | 视口裁剪 + 聚合   |
| 泳道平移/缩放                | 60fps       | Canvas + 只画可见 |
| 回放 seek                    | < 100ms     | 快照              |
| 实时摄入                     | 2k events/s | 批量 500/事务     |
| 内存                         | < 500MB     | 释放不可见 run    |
| SQLite                       | < 1GB/30 天 | 保留策略          |

---

## 9. 文件清单与实施顺序

### 9.1 目录

```
agentloom/
├─ package.json
├─ electron.vite.config.ts
├─ src/
│  ├─ main/
│  │  ├─ index.ts
│  │  ├─ ipc.ts
│  │  ├─ db/{schema,store,retention}.ts
│  │  ├─ sources/{ultimate,jsonl,manager}.ts
│  │  ├─ normalize/ultimate.ts
│  │  └─ control/service.ts      # v2
│  ├─ preload/index.ts
│  ├─ shared/{events,models,ipc}.ts
│  └─ renderer/
│     ├─ app.tsx
│     ├─ stores/{agents,filters,replay}.ts
│     ├─ views/{LanesView,SpawnTreeView,MessagesView,CostView,ReplayView,CompareView}.tsx
│     ├─ components/{LaneCanvas,SpawnNode,Inspector,MessageOverlay,TimeAxis}.tsx
│     ├─ layout/{treeWorker.ts,criticalChain.ts}
│     └─ styles/
├─ tests/{unit,integration,e2e}
└─ fixtures/{branch-worker-reviewer.jsonl,large-200.jsonl}
```

### 9.2 实施顺序

#### M0 — 壳 + JSONL + 泳道 MVP（3–4 天）

- Electron 安全壳、IPC、JSONL adapter；
- Agent/Edge 模型；
- Canvas 泳道（固定时间轴、块/刻线）。
- 验收：`AC-V-001`、`AC-V-002`。

#### M1 — Ultimate 实时 + SQLite（3–4 天）

- SSE + lanes 对账；
- schema/store；
- 实时更新泳道。
- 验收：`AC-V-003`、`AC-V-004`。

#### M2 — 生成树 + 消息（3–4 天）

- 树布局、spawn 边、消息线、悬停链。
- 验收：`AC-V-005` ~ `AC-V-007`。

#### M3 — Inspector + Cost（3 天）

- 详情 tabs、token/成本、过滤。
- 验收：`AC-V-008`、`AC-V-009`。

#### M4 — 回放 + 对比（3 天）

- 快照、seek、播放、diff。
- 验收：`AC-V-010`、`AC-V-011`。

#### M5 — 性能 + 打包（3–4 天）

- 200 agents/100k calls 基准、Canvas 优化、签名/更新。
- 验收：`AC-V-012` ~ `AC-V-015`。

#### M6 — 控制面（可选，2–3 天）

- 显式授权、二次确认、审计；只通过受控 action。
- 验收：`AC-V-016`、`AC-V-017`。

---

## 10. 测试计划

### 10.1 单元

| 编号    | 测试         | 期望                      |
| ------- | ------------ | ------------------------- |
| UT-V-01 | spawn 树构建 | 父子/深度正确             |
| UT-V-02 | 块切分       | 20s gap 正确              |
| UT-V-03 | 关键链       | 最长 self-time 路径       |
| UT-V-04 | 消息线样式   | reply/steer 正确          |
| UT-V-05 | 回放 seek    | 状态与事件一致            |
| UT-V-06 | 对比         | 新增/删除/耗时差正确      |
| UT-V-07 | 状态映射     | Ultimate → AgentLoom 正确 |

### 10.2 集成

| 编号    | 场景            | 期望        |
| ------- | --------------- | ----------- |
| IT-V-01 | SSE 重连        | 无重复/丢失 |
| IT-V-02 | lanes 对账      | 修正状态    |
| IT-V-03 | 100k calls 查询 | <100ms      |
| IT-V-04 | 快照恢复        | seek <100ms |
| IT-V-05 | 多 root         | 正确分组    |

### 10.3 E2E

| 编号     | 场景                           | 期望             |
| -------- | ------------------------------ | ---------------- |
| E2E-V-01 | branch→worker→reviewer fixture | 泳道/树/消息正确 |
| E2E-V-02 | 悬停链                         | 祖先/后代高亮    |
| E2E-V-03 | 200 agents                     | 首屏 <1.5s       |
| E2E-V-04 | 回放                           | 前进/后退正确    |
| E2E-V-05 | 断线                           | stale + 恢复     |
| E2E-V-06 | 控制未授权                     | 禁用并提示       |

### 10.4 基准

```bash
pnpm bench:lanes fixtures/large-200.jsonl
pnpm bench:replay
pnpm bench:memory
```

---

## 11. 验收 Checklist

| ID       | 验收项（二元）                                       | 覆盖 REQ                                   |
| -------- | ---------------------------------------------------- | ------------------------------------------ |
| AC-V-001 | JSONL fixture 能显示泳道/树/消息                     | REQ-V-002, REQ-V-004, REQ-V-005, REQ-V-006 |
| AC-V-002 | 泳道按 spawn 树缩进、按时间铺开                      | REQ-V-004                                  |
| AC-V-003 | Ultimate SSE 实时出现新 agent/消息                   | REQ-V-002, REQ-V-015                       |
| AC-V-004 | 事件落 SQLite，重启后仍在                            | REQ-V-003                                  |
| AC-V-005 | 生成树显示 parent/spawn call/kind                    | REQ-V-005                                  |
| AC-V-006 | 消息边显示方向/reply/steer，不含正文                 | REQ-V-006, REQ-V-018                       |
| AC-V-007 | 悬停高亮祖先/后代链                                  | REQ-V-008                                  |
| AC-V-008 | Inspector 显示模型/token/工具/workspace/plan         | REQ-V-007, REQ-V-012                       |
| AC-V-009 | 成本按 agent 聚合，缓存命中率正确                    | REQ-V-012                                  |
| AC-V-010 | 回放前进/后退正确                                    | REQ-V-010                                  |
| AC-V-011 | 两次 run 对比正确                                    | REQ-V-011                                  |
| AC-V-012 | 200 agents/100k calls 首屏 <1.5s                     | REQ-V-014                                  |
| AC-V-013 | 30m/2h/24h/全部切换正确                              | REQ-V-009                                  |
| AC-V-014 | 深链能打开 Ultimate 对应会话                         | REQ-V-013                                  |
| AC-V-015 | 断线显示 stale 并可恢复                              | REQ-V-015                                  |
| AC-V-016 | 控制默认关闭；开启需授权+确认                        | REQ-V-016, REQ-V-017                       |
| AC-V-017 | 控制动作写入审计日志                                 | REQ-V-017                                  |
| AC-V-018 | 默认不存 prompt/response                             | REQ-V-018                                  |
| AC-V-019 | 空/加载/错误状态明确                                 | REQ-V-019                                  |
| AC-V-020 | 基准脚本可复现                                       | REQ-V-020                                  |
| AC-V-021 | 默认只读：代码中不存在写源系统的路径，控制需显式开启 | REQ-V-001                                  |
| AC-V-022 | 缺口字段显示 unknown/inferred/partial，不填假值      | REQ-V-003                                  |

---

## 12. 失败矩阵

| 失败               | 原因            | 检测         | 恢复         | 用户可见                |
| ------------------ | --------------- | ------------ | ------------ | ----------------------- |
| 源不可达           | Ultimate 未启动 | fetch        | 退避重连     | 断线横幅                |
| SSE 断流           | 服务重启        | onerror      | 重连+对账    | stale                   |
| 事件缺失           | trace 7 天保留  | 缺口检测     | 标记 partial | "部分历史缺失"          |
| workspace 查询失败 | 已删除/未就绪   | action error | 显示未知     | "workspace unavailable" |
| 回放越界           | 时间超出数据    | seek 检查    | 夹到边界     | 提示                    |
| 控制被拒           | 未授权/会话忙   | action error | 显示原因     | 错误 toast              |
| 成本价格缺失       | 未知模型        | 价格表       | token 不计价 | "price unknown"         |
| 内存超限           | 大 run          | 监控         | 释放不可见   | 提示                    |
| 导出失败           | 权限/磁盘       | 写错误       | 换路径       | 错误                    |

---

## 13. 端到端样例

场景：`branch #42 → worker #43 → reviewer #44`。

```jsonl
{"v":1,"id":"a1","seq":1,"at":1761580000000,"source":"ultimate","runId":"run-42","type":"task.created","data":{"id":"42","name":"coordinator","kind":"agent","agentKind":"branch","parent":null,"model":"openai-codex/gpt-6.1-sol","status":"running"}}
{"v":1,"id":"a2","seq":2,"at":1761580002000,"source":"ultimate","runId":"run-42","type":"edge.added","data":{"from":"42","to":"43","kind":"spawn","spawnKind":"subagent","call":"call-7"}}
{"v":1,"id":"a3","seq":3,"at":1761580002500,"source":"ultimate","runId":"run-42","type":"task.created","data":{"id":"43","name":"worker","kind":"agent","agentKind":"child","parent":"42","model":"openai-codex/gpt-6.1-sol","status":"running"}}
{"v":1,"id":"a4","seq":4,"at":1761580010000,"source":"ultimate","runId":"run-42","type":"task.completed","data":{"kind":"tool","agent":"43","name":"edit","ms":3200,"ok":true}}
{"v":1,"id":"a5","seq":5,"at":1761580030000,"source":"ultimate","runId":"run-42","type":"message.sent","data":{"from":"43","to":"42","kind":"report","reply":false}}
{"v":1,"id":"a6","seq":6,"at":1761580035000,"source":"ultimate","runId":"run-42","type":"edge.added","data":{"from":"42","to":"44","kind":"spawn","spawnKind":"subagent","call":"call-9"}}
{"v":1,"id":"a7","seq":7,"at":1761580060000,"source":"ultimate","runId":"run-42","type":"task.completed","data":{"id":"44","kind":"agent","status":"done","tokens":{"input":1200,"output":300}}}
```

期望截图：

- Lanes：coordinator 行最长；worker 行在 10:00–10:03；reviewer 行在 10:05–10:10；worker→coordinator 有 report 竖线；coordinator→worker/reviewer 有 spawn 虚线。
- Spawn Tree：coordinator 两个子节点，边标签 `subagent`。
- Inspector：worker `agent: worker`、`model: openai-codex/gpt-6.1-sol`、`tool calls: 3`、`tokens 4.2k`。
- Cost：worker 占 60%，reviewer 30%，coordinator 10%。

---

## 14. 未决问题

| ID     | 内容                            | 处理                                   |
| ------ | ------------------------------- | -------------------------------------- |
| Q-V-01 | Ultimate 没有 reporter 阶段事件 | 用 task 状态推导；或在扩展中补只读事件 |
| Q-V-02 | 消息正文是否可见                | v1 不可见；v2 可选"打开原会话"         |
| Q-V-03 | 控制面是否值得做                | 先只读；有明确需求再做 v2              |
| Q-V-04 | 是否支持跨 host                 | 先单 host；多 host 用 source 分组      |
| Q-V-05 | 成本价格表维护                  | 配置文件 + 内置常见模型 + 用户覆盖     |
| Q-V-06 | 与 TaskScope 的代码共享         | `orchestra-core`/`ui`；两 app 独立打包 |
| Q-V-07 | 200 agents 以上                 | 折叠 + 视口裁剪；必要时 WebGL          |
