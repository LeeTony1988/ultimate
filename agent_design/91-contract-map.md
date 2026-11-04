# 91 · 契约映射：Ultimate 机制 → 桌面应用模型

本表是 `10`/`20` 与 `30`/`40` 之间的**唯一接口契约**。任何字段改名/类型变化都必须先改本表。

约定：

- `R` = 必需；`O` = 可选；`D` = 派生（由其他字段计算）。
- 源字段以 Ultimate 当前实现为准；目标字段以 `30`/`40` 的数据模型为准。
- 所有时间都是 Unix epoch ms。

## 1. 身份与层级

| 源                    | 源字段                                | 目标（TaskScope）                | 目标（AgentLoom）                       | 规则                                                         |
| --------------------- | ------------------------------------- | -------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| conversation          | `id`                                  | `Task.conversationId` (O)        | `Agent.id` / `Agent.conversationId` (R) | 转 string 作为 Agent.id                                      |
| `subagents.started`   | `id`                                  | `Task.metadata.conversationId`   | `Agent.id`                              | 同一 id                                                      |
| `subagents.started`   | `parent`                              | `Task.parentId`（映射到父 task） | `Agent.parentId` + `SpawnEdge.parentId` | 无 parent → root                                             |
| `subagents.started`   | `kind`                                | `Task.kind`（`agent`/`branch`）  | `Agent.kind`                            | child/standing/branch/automation                             |
| `subagents.started`   | `agent`                               | `Task.actor`                     | `Agent.name`                            | branch 事件固定 `'branch'`，真实定义名从 `metadata.label` 补 |
| `metadata`            | `label`                               | `Task.metadata.label`            | `Agent.metadata.label`                  | 定义名/landing label                                         |
| `metadata`            | `title`                               | `Task.name`                      | `Agent.title`                           | 任务首行/会话标题                                            |
| `conversations`       | `title`                               | `Task.name`                      | `Agent.title`                           | 优先 metadata.title                                          |
| `workspaces`          | `path/branch/base/landed`             | `Task.metadata.workspace`        | `Agent.workspace`                       | R 当存在                                                     |
| `ultimate.plan.tasks` | `{coordinator,epic,key,title,status}` | `Task.metadata.plan`             | `Agent.planTask`                        | R 当存在                                                     |

## 2. 状态

| 源                           | 源字段         | TaskScope                            | AgentLoom                     | 规则            |
| ---------------------------- | -------------- | ------------------------------------ | ----------------------------- | --------------- |
| `TaskGraph` node             | `state.status` | `Task.status`                        | `Agent.status`                | 映射表见下      |
| `TaskGraph` node             | `background`   | `Task.metadata.background`           | `Agent.metadata.background`   | 布尔            |
| `TaskGraph` node             | `aborting`     | `Task.metadata.aborting`             | `Agent.metadata.aborting`     | 布尔            |
| `TaskGraph` node             | `startedAt`    | `Task.startedAt`                     | `Agent.startedAt`             | ms              |
| `TaskGraph` node             | `endedAt`      | `Task.endedAt`                       | `Agent.endedAt`               | ms              |
| `LiveDoc.run`                | `taskId`       | `Task.metadata.runTaskId`            | `Agent.metadata.runTaskId`    | 仅当前 run      |
| `Subagents.actions[].status` | `status`       | `Task.metadata.actionStatus`         | `Agent.metadata.actionStatus` | 见下            |
| `workspaces.landed`          | `sha`          | `Artifact` + `Task.status=completed` | `Agent.landed`                |                 |
| `watchdog.failure`           | `conversation` | `Task.status=failed`                 | `Agent.status=failed`         | 失败原因在 data |

### 2.1 状态映射

| 源                                | 统一                 |
| --------------------------------- | -------------------- |
| `pending`, `queued`               | `pending`            |
| `running`, `active`               | `running`            |
| `waiting`, `sleeping`             | `waiting`            |
| `blocked`                         | `blocked`            |
| `completed`, `done`, `success`    | `completed` / `done` |
| `failed`, `error`                 | `failed`             |
| `aborted`, `cancelled`, `stopped` | `aborted`            |
| `skipped`                         | `skipped`            |

AgentLoom 的 `Agent.status` 使用产品词：`idle/running/waiting/awaiting/done/failed`；映射：

| 统一          | AgentLoom                   |
| ------------- | --------------------------- |
| pending       | idle                        |
| running       | running                     |
| waiting       | waiting                     |
| blocked       | waiting                     |
| completed     | done                        |
| failed        | failed                      |
| aborted       | failed（附 `aborted:true`） |
| skipped       | done（附 `skipped:true`）   |
| 缺失/无法推断 | unknown                     |

## 3. 生成边

| 源                  | 字段             | SpawnEdge  | 规则                                                         |
| ------------------- | ---------------- | ---------- | ------------------------------------------------------------ |
| `subagents.started` | `parent`         | `parentId` | 无 parent 时用 `owner`/fork source                           |
| trace context       | `parentCall`     | `callId`   | 最精确                                                       |
| `system.lanes`      | `spawn.call`     | `callId`   | 次精确                                                       |
| `system.lanes`      | `spawn.inferred` | `inferred` | 布尔                                                         |
| `subagents.started` | `kind`           | `kind`     | `child`→`subagent`；`branch`→`branch`；`standing`→`standing` |
| event commit        | `at`             | `at`       | event 时间                                                   |

## 4. 消息边

| 源                       | 字段                     | MessageEdge     | 规则                           |
| ------------------------ | ------------------------ | --------------- | ------------------------------ |
| `board.sent`             | `message`                | `id`            |                                |
| `board.sent`             | `from`                   | `from`          | conversation id → string       |
| `board.sent`             | `to`                     | `to`            | conversation id/@name → string |
| `board.sent`             | `reply`                  | `reply`         | 布尔                           |
| `board.sent`             | `steer`                  | `steer`         | 布尔                           |
| `board.sent`             | event at                 | `at`            | ms                             |
| `subagents.report` entry | `sender`/`kind`/`failed` | `kind`=`report` | 需要 entry 扫描                |
| `messages`               | `board.reply`            | `kind`=`reply`  | 需要 entry 扫描                |

**隐私**：`board.sent` 不含文本，这是有意的；桌面应用不得尝试从 transcript 抓正文作为默认行为。

## 5. 调用与成本

| 源             | 字段                                                                | TaskScope               | AgentLoom              | 规则                 |
| -------------- | ------------------------------------------------------------------- | ----------------------- | ---------------------- | -------------------- |
| trace `tool`   | `conversation`, `name`, `ms`, `ok`, `error`                         | `Task.kind=tool` 子节点 | `ToolCall`             | 一次调用一个节点     |
| trace `model`  | `conversation`, `provider`, `model`, token 字段, `ms`, `stopReason` | `Task.metadata.model`   | `ModelCall`            | 不存 prompt/response |
| trace context  | `traceId`, `callId`, `parentCall`                                   | `Task.metadata.trace`   | `Agent.metadata.trace` | 关联键               |
| `system.lanes` | `runs[].calls[]`                                                    | 时间线数据              | Lanes 数据             | 已聚合，适合首屏     |
| `system.tree`  | `calls/events`                                                      | 调用树                  | Inspector Activity     | 选中时拉取           |

## 6. 事件映射（`orchestra.event.v1`）

| Ultimate 事件/记录        | `type`                          | `taskId`     | `data`                                   |
| ------------------------- | ------------------------------- | ------------ | ---------------------------------------- |
| `ultimate.started`        | `run.started`                   | root         | `{generation, build}`                    |
| `subagents.started`       | `task.created`                  | new id       | `{agent, kind, model, thinking, parent}` |
| `tasks` node running      | `task.started`                  | node id      | `{name, kind}`                           |
| `tasks` node terminal     | `task.completed`/`task.failed`  | node id      | `{durationMs, error?}`                   |
| `board.sent`              | `message.sent`                  | —            | `{from, to, reply, steer}`               |
| `workspaces.landed`       | `artifact.added`                | submitter    | `{sha, base, target, commits, paths}`    |
| `conversations.compacted` | `task.completed`                | conversation | `{kind:'compaction'}`                    |
| trace tool                | `task.started`/`task.completed` | call id      | `{name, ms, ok}`                         |
| trace model               | `metric`                        | call id      | `{provider, model, tokens, ms}`          |

## 7. 适配器要求

### 7.1 UltimateAdapter

必须实现：

```ts
interface UltimateAdapter {
  connect(baseUrl: string): Promise<void>
  disconnect(): Promise<void>
  snapshot(): Promise<UltimateSnapshot> // tasks + conversations + workspaces
  subscribe(onEvent: (e: OrchestraEvent) => void): Promise<() => void>
  tracePage(cursor?: string): Promise<{ events: OrchestraEvent[]; next?: string }>
  tree(traceId: string): Promise<TraceTree>
  lanes(since: number, until: number): Promise<Lanes>
}
```

约束：

- 只读；不调用任何写 action。
- SSE 断线必须补拉；不能假设事件连续。
- 快照与事件冲突时，以快照为准，事件用于增量。
- 所有 id 转 string；所有时间转 ms。

### 7.2 JsonlAdapter

```ts
interface JsonlAdapter {
  open(path: string): Promise<void>
  readAll(): AsyncIterable<OrchestraEvent>
  seek(seq: number): Promise<void>
}
```

约束：

- 每行一个 JSON；非法行跳过并计数。
- 必须支持 `v===1`；其他版本拒绝并提示。
- 大文件流式读取，不一次性载入内存。

### 7.3 OtlpAdapter

```ts
interface OtlpAdapter {
  listen(port: number): Promise<void>
  close(): Promise<void>
}
```

映射：

- `resourceSpans[].scopeSpans[].spans[]` → `OrchestraEvent`；
- `traceId/spanId/parentSpanId` 保留；
- `attributes` 中的 `gen_ai.*` 映射到 `data.model/tokens`；
- 无 `orchestra.run.id` 时按 traceId 建 run。

## 8. 不变量

| ID     | 不变量                                                               |
| ------ | -------------------------------------------------------------------- |
| MAP-01 | 所有 id 在跨进程边界统一为 string                                    |
| MAP-02 | 所有时间统一为 epoch ms                                              |
| MAP-03 | 事件先落库再渲染；UI 不直接消费源事件                                |
| MAP-04 | 快照优先于增量；冲突以快照为准                                       |
| MAP-05 | 默认不存 prompt/response/消息正文                                    |
| MAP-06 | 状态映射只在一处实现，两个 app 共享                                  |
| MAP-07 | `subagents.started` 的 `agent='branch'` 不是定义名；需从 metadata 补 |
| MAP-08 | `board.sent` 不含文本；不要从其他表反推正文                          |
| MAP-09 | trace 保留期短；桌面应用必须自己落库                                 |
| MAP-10 | 适配器失败不得阻塞 UI；显示 stale/partial                            |
