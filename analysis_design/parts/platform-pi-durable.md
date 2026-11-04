# Pi Durable 运行时分析笔记（外部依赖）

## 1. 概览

Ultimate 的持久化、任务调度、会话、文档、提交与恢复全部来自 `@earendil-works/pi-durable@1.4.0`；模型与 provider 来自 `@earendil-works/pi-ai` 与 `pi-coding-agent`。Ultimate 只做装配与产品化，不重写运行时。本笔记给出复刻所需的 API 边界与装配方式。

## 2. 核心类型（`dist/types.d.ts`、`dist/harness/types.d.ts`）

### 2.1 ID 与记录

```ts
type ConversationId = Id<'conversation'>;  type EntryId = Id<'entry'>
type TaskId<R> = Id<'task',R>;             type SubmissionId = Id<'submission'>
type DocumentId = Id<'document'>;           type Seq = number & …
const ROOT_CONVERSATION_ID = 1
```

- `ConversationRecord`：id、owner（conversation/task）、parent（fork 来源）、createdAt…
- `EntryRecord`：id、conversationId、kind、data、model?、head?、edits?、input?…
- `TaskRecord`：id、conversationId、kind、status（pending/running/waiting/sleeping/completing/terminal/blocked）、state、background、abortRequested、restartCount…
- `SubmissionRecord`：queued/placed/answered/aborted…，`requestId` 去重。

### 2.2 文档

```ts
defineDoc<T>({
  kind, version, scope:'conversation'|'session'|'task',
  history:'latest'|'rewindable', fork:'current'|'initial'|'asOf',
  checkpointWhen(value, ops, info): boolean,
  initial(): T, migrate?(value, fromVersion): T,
})
```

内置：

- `AgentDoc`（`pi.agent`）：rewindable/asOf，`checkpointWhen:()=>true`；
- `LiveDoc`、`UsageDoc`、`InboxDoc`、`ProviderDoc` 等 `pi.*` 文档。

### 2.3 Tx / Session / Storage

```ts
interface Tx {
  conversation(id); entry(id); task(id)
  scanConversations/scanEntries/scanTasks(query, limit, cursor?)
  createConversation({ownership}); forkConversation(parent, at, {ownership})
  appendEntry(conversationId, draft)
  createTask(task, input, options); createSubmission(create)
  settleSubmission(id, settlement); placeSubmission(id, entry)
  doc(token, …): Draft<T>; retireDoc(token, …)
}
interface Session extends DocumentObserver {
  commit<T>(fn:(tx:Tx)=>T|Promise<T>, context): Promise<T>
  subscribeCommits(listener); snapshot(...); documentState(...); watchDoc(...)
  close(context)
}
interface Harness extends Session {
  resume(); hold(); release(); wake()
  root(context,{agent?,init?}); conversation(id); createConversation(options)
  inspect(context); taskGraph(context); watchTaskGraph(context)
  abortTask(id); retryTask(id); waitForTask(id); usage(context)
  submission(id); abortSubmission(id)
}
```

### 2.4 工具与扩展

```ts
type ToolRegistration = Tool & {
  replay?: 'safe' | 'unsafe'
  executionMode?
  prepareArguments?
  structuredOutputSchema?
  callers?: ('model' | 'tools')[]
  deferred?: true
  outputLimits?
  execute(args, api: ToolExecutionApi, context)
}
interface Extension {
  name
  tools?
  sections?
  hooks?
  wraps?
  tasks?
}
```

`ToolExecutionApi`：`taskId`、`conversationId`、`callId`、`agent()`、`models`、`env`、`output()`、`details()`、
`commit()`、`memo()`、`createTask()`、`getTask()`、`waitForTask()`、`conversation()`、`executeTool()`。

### 2.5 设置

```ts
type HarnessSettings = {
  extensions?
  stream?
  retry?
  compaction?
  progress?
  toolExecution?
  steeringMode?: 'all' | 'one-at-a-time'
  followUpMode?
  contextRetentionMs?
  documentRetentionMs?
  afterFailedRun?
  restartLimit?
}
type HarnessOptions = {
  models
  registry
  settings?
  env?
  now?
  setTimer?
  onWake?
  onReport?
  conversationCreated?
}
```

## 3. Ultimate 的装配

`server/harness.ts`：

```ts
const runtime = await ModelRuntime.create()
const settings = SettingsManager.create(projectRoot)
const registry = createRegistry()
const trace = callTrace(...)
const modelCalls = modelTrace(trace)
registry.install(modelCalls.extension)
const modelRuntime = guardToolArguments(runtime, modelCalls)
const storage = await openNodeSqliteStorage(chapter.database)
const harness = await Harness.open(storage, {
  models: modelRuntime,
  registry,
  settings: createHarnessSettings(settings, sortedExtensions),
  env: ({cwd}) => nodeExecutionEnv(cwd),
  onReport: (error, info) => notice(reportMessage(error, info)),
}, context)
const root = await harness.root(context, { agent: {...} })
await root.commit(tx => { tx.doc(UiState, root.id); tx.doc(AgentDoc, root.id).model = model })
harness.resume()
```

要点：

- `HarnessSettings` 用 getter 读当前设置（模型/压缩/扩展排序）；
- `followUpMode:'all'`；
- 压缩按模型覆盖（`compactionOverrides`）；
- `env` 按 cwd 复用 `NodeExecutionEnv`；
- `openNodeSqliteStorage` 来自 `@earendil-works/pi-durable/storage/sqlite/node`；
- `context` 是 `BACKGROUND_CONTEXT`（chord），用于所有非用户触发的提交。

## 4. 恢复与一致性

- Storage 抛错是最终错误，Session 关闭；重开 Storage 后 Harness 从记录恢复。
- 未完成任务按 checkpoint 重跑；工具按 `replay` 决定重跑或标 interrupted。
- `restartLimit`（默认 5）连续崩溃后 park，`retryTask()` 恢复。
- `subscribeCommits` 同步回调，不能阻塞；Ultimate 用它刷新会话列表与 SSE。

## 5. 上游补丁（`patches/@earendil-works__pi-durable@1.4.0.patch`）

- `beforeInput` 事务钩子（在首输入前放条目）；
- 输入来源标记（`entry.input`）；
- 记录每次响应的 thinkingLevel；
- `Harness.hold()/release()`（暂停调度）。

这些是 `prompt` 扩展、`pause` 扩展与 `ui.navigated` 语义所依赖的；复刻时若无法打补丁，需要应用层替代。

## 6. 证据

`node_modules/@earendil-works/pi-durable/dist/types.d.ts:1-1039`；`dist/harness/types.d.ts:83-774`；
`dist/harness/harness.d.ts:16-19`；`dist/storage/sqlite/schema.d.ts:6-34`；`server/harness.ts:57-297`；
`docs/durability.md`、`docs/pi-upstream.md`、`patches/@earendil-works__pi-durable@1.4.0.patch`。
