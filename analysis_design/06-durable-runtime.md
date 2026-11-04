# 06 · 持久化运行时（Pi Durable 集成）

> Ultimate 的"先提交、再展示、崩溃可续跑"来自外部包 `@earendil-works/pi-durable@1.4.0`。
> 本章说明它提供什么、Ultimate 如何装配、复刻时必须保持的语义。API 以 `node_modules/@earendil-works/pi-durable/dist/*.d.ts` 为准。

## 1. 依赖全景

| 包                                | 版本       | 作用                                                                                          |
| --------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `@earendil-works/chord`           | 1.4.0      | 响应式状态/增量（`Op`、`applyImmutable`、`AttachedReplicatedState`、`Context`）               |
| `@earendil-works/pi-ai`           | 1.4.0      | 模型抽象、消息/工具类型、provider、`clampThinkingLevel`                                       |
| `@earendil-works/pi-coding-agent` | 1.4.0      | `ModelRuntime`、`SettingsManager`、技能加载、项目上下文文件、`ProjectTrustStore`、Pi 工具实现 |
| `@earendil-works/pi-durable`      | 1.4.0      | Harness/Session/Storage/文档/任务/提交/恢复                                                   |
| `@earendil-works/pi-codemode`     | 1.4.0      | QuickJS/WASM 沙箱（codemode 扩展）                                                            |
| `@earendil-works/pi-claude-code`  | github pin | Claude Code provider（实验）                                                                  |

> 全部 `@earendil-works/*` 固定精确版本（`package.json`），`AGENTS.md` 明确要求。

## 2. 核心抽象

### 2.1 Storage → Session → Harness

```
Storage (SQLite)
  ├─ commit(writes[]) → Seq         // 原子持久化
  ├─ mintId()                       // 全局严格递增 id
  ├─ conversation/entry/task/submission 读取
  └─ document 读取（按 address/point）
        ↓
Session
  ├─ commit(tx => …)                // 唯一写入口，串行
  ├─ subscribeCommits(listener)     // 每次成功提交后同步回调（不可阻塞）
  ├─ snapshot / documentState / watchDoc
  └─ close()
        ↓
Harness extends Session
  ├─ resume()/hold()/release()/wake()
  ├─ root()/conversation()/createConversation()
  ├─ inspect()/taskGraph()/watchTaskGraph()
  ├─ abortTask()/retryTask()/waitForTask()
  └─ usage()
```

关键不变量（来自类型注释）：

- **一次 commit = 一个原子批次**；成功后后续读取立即可见；`Seq` 严格递增。
- `subscribeCommits` 监听器**同步**运行在提交采纳之后，不能阻塞、不能调用 Session API。
- `commit` 回调内只能通过 `tx` 读；直接读 Session 可能死锁。
- Storage 抛错是**最终错误**：Session 失败并关闭；瞬时错误必须在 Storage 实现内部重试。
- 恢复：同一 Storage 重新 `Harness.open` 后，任务从最近 checkpoint 继续；未完成工具按 `replay` 策略重跑或标记 interrupted。

### 2.2 任务（Task）

- 任务定义：`Task<I, S, R, H>`，含 `phases`（状态机）、`abort`、`migrate`、`hooks`。
- 每个工具调用、每次模型生成、压缩、子智能体都是 task（`pi.tool`、`pi.generation`…）。
- `TaskOptions` 控制 `conversationId`、`ownership`、`background`、`abandonOnRestart` 等。
- 任务状态：`running | waiting | sleeping | terminal | completing | blocked`（blocked 原因：missing_task/task_too_old/migration_failed/restart_limit）。
- `restartLimit` 默认 5：连续被崩溃/驱逐打断且状态未变则 park，需 `retryTask()`。
- `TaskRuntime` 提供 `commit()`、`memo()`、`waitForTask()`、`createTask()`、`executeTool()`、`output()`、`details()`、`diagnostic()`。

### 2.3 会话与输入

- `Conversation`：`agent()`、`configure()`、`submit()`、`reset()`、`compact()`、`entries()`、`fork()`、`abort()`、`waitForIdle()`、`viewState()`、`watch()`。
- `SubmissionRecord` 状态：`queued | placed | answered | aborted …`（以类型为准）；`Submission.wait()` 等终态。
- `whenBusy`：`reject | steer | followUp`（Ultimate 只用后两者；steer 插入当前 run，followUp 在 run 后成组开始）。
- `followUpMode: 'all'`（Ultimate 设置）：所有排队 follow-up 在下一轮一起开始，而非 Pi 默认的一次一个。

### 2.4 文档（Document）

```ts
defineDoc<T>({
  kind: 'ultimate.ui',            // 持久化 kind，公共协议的一部分
  version: 1,
  scope: 'conversation' | 'session' | 'task',
  history: 'latest' | 'rewindable',
  fork: 'current' | 'initial' | 'asOf',
  checkpointWhen(value, ops, info) => boolean,  // 必填：何时存全量 base
  initial: () => T,
  migrate?(value, fromVersion): T,
})
```

- 每个文档绑定 `(scope, conversationId/taskId, kind)`；支持快照、增量 `Op[]`、watch、as-of 读取。
- `history:'latest'` 只保留当前；`'rewindable'` 可按 entry 回溯（`snapshotAsOf`），fork 可 `asOf`。
- `checkpointWhen` 决定"存 base 还是 delta"；高频小文档常用 `() => false`（永远 delta）。
- Ultimate 的文档：`ultimate.metadata`、`ultimate.ui`、`ultimate.events`、`ultimate.event-feed` 及每个扩展的 `docs`。

### 2.5 注册表（Registry）

```ts
interface Extension {
  name: string
  tools?: ToolRegistration[]
  sections?: PromptSection[]
  hooks?: HookRegistration[]
  wraps?: Wrap[]
  tasks?: AnyTask[]
}
registry.install(extension) // 同名替换，立即发布
registry.uninstall(extension)
```

- 会话通过 `AgentState.extensions` 选择扩展（数组=精确列表；对象=add/remove）。
- `AgentState.modelTools` 过滤"模型可见工具"；`ToolRegistration.callers` 控制 model/tools 可调用性；`deferred` 工具默认不展示。
- `HarnessSettings.extensions` 缺省 = 所有已安装扩展，按安装顺序——Ultimate 用它把所有 server facet 暴露给每个会话。

## 3. Ultimate 的装配（`server/harness.ts`）

```ts
prepareHarness({ ultimateRoot, projectRoot, userHome, home, faux? }) {
  builds = createBuild(ultimateRoot)
  home = options.home ?? ULTIMATE_HOME ?? projectHome(projectRoot, userHome)
  chapter = await activeChapter(home)          // 数据分卷（见 13 章）
  runtime = await ModelRuntime.create()
  settings = SettingsManager.create(projectRoot)
  applyHttpProxySettings(settings.getGlobalSettings().httpProxy)
  configureHttpDispatcher(settings.getHttpIdleTimeoutMs())
  registry = createRegistry()
  envs = Map<cwd, NodeExecutionEnv>
  trace = callTrace(() => chapter.trace)
  modelCalls = modelTrace(trace)
  registry.install(modelCalls.extension)       // 模型调用的 trace 包装作为一个扩展
  modelRuntime = guardToolArguments(runtime, modelCalls)
  ...
  open(resume=true) {
    owner = acquireLock(home/storage.lock, {pid}, supervised ? 10000 : 0)
    finishChapterSwitch(home, …)
    storage = await openNodeSqliteStorage(chapter.database)
    harness = await Harness.open(storage, {
      models: modelRuntime,
      registry,
      settings: createHarnessSettings(settings, () => 按 order 排序的已安装扩展),
      env: ({cwd}) => NodeExecutionEnv({cwd}),
      onReport: (error, info) => report({level:'error', message: reportMessage(error, info)}),
    }, context)
    model = await preferred()                    // faux 或 defaultModel(可用模型, settings)
    root = await harness.root(context, { agent: { cwd: projectRoot, thinkingLevel: settings.getDefaultThinkingLevel() } })
    await root.commit(async tx => {
      await tx.doc(UiState, root.id)
      if (model) (await tx.doc(AgentDoc, root.id)).model = model
    }, context)
    active = { harness, root, storage }
    if (resume) harness.resume()
    return { harness, root, close() { harness.close(); env.cleanup(); owner.close() } }
  }
}
```

要点：

- `HarnessSettings` **getter 形式**每次解析都读当前设置（模型、扩展列表、压缩策略、stream 超时）；
- `extensions` 按 `compareExtensions` 排序后传入，保证 prompt/tool 顺序稳定；
- `followUpMode: 'all'`；
- 压缩策略按模型覆盖（`compactionOverrides`），大窗口模型更晚阻塞、保留更多近期上下文；
- `env` 为每个 cwd 复用一个 `NodeExecutionEnv`，关闭时统一 cleanup；
- `onReport` 把 Pi 的失败映射成用户可读 notice（task/conversation/extension/host callback + 原因）。

## 4. 模型与设置（`pi-coding-agent`）

- `ModelRuntime.create()` 读取 Pi 的 agent 目录（`PI_CODING_AGENT_DIR` 或 `~/.pi/agent`）中的 provider 凭据与模型目录；
- `SettingsManager.create(projectRoot)` 读项目/用户设置，提供：
  - `getProviderRetrySettings()`、`getHttpIdleTimeoutMs()`、`getCompactionSettings()`、`getRetrySettings()`、
    `getSteeringMode()`、`getDefaultThinkingLevel()`、`getDefaultProvider()/getDefaultModel()`、`getGlobalSettings()`
- `ModelRuntime` 负责：`getAvailable()`（有凭据的模型）、`getProviders()`、`getAllModels()`、`getProviderAuthStatus()`、
  `isUsingSubscription()`、`getModel(provider,id)`、`registerNativeProvider()`（测试 faux）、`refresh()`。
- Ultimate 通过 `listModels()` 把上述信息转成 `ModelsResponse` 给 UI。
- 扩展可通过 `host.modelRuntime` 直接发模型请求（health 的 ping、phase 分类），这些调用也被 `modelTrace` 记录。

## 5. 提交 → 推送 的桥

`createApi` 使用：

```ts
const graph = await harness.taskGraph(context)      // AttachedReplicatedState<TaskGraph>
const unsubGraph = graph.subscribe(() => debounce(100ms) → events.emit('tasks', graph.value))
const unsubCommits = harness.subscribeCommits(pub => {
  ids = pub.changes
    .filter(conversation | document(ultimate.metadata | pi.agent.cwd))
    .map(conversationId)
  refreshConversations(ids)   // 串行链，避免并发
})
```

`Conversation.watch()` 提供结构视图（entries + docs）的 `WatchHandle<ConversationView>`：

- 首次 `watch.value` 是快照；
- `watch.start((value, ops) => …)` 推送增量；
- `windowView` 裁剪到 150 条并维护 `older` 游标；
- `windowOps` 把条目位置减去裁剪数；遇到 replace/head marker 返回 undefined → 重发快照。

## 6. 崩溃恢复语义（复刻必须保留）

| 场景                        | 行为                                                           |
| --------------------------- | -------------------------------------------------------------- |
| 进程在模型流中途崩溃        | 任务重启后从 checkpoint 继续；已提交的部分输出/工具结果保留    |
| 工具执行中断                | `replay:'safe'` 重跑；否则结果为 `interrupted`，模型看到失败   |
| 提交后崩溃                  | 提交已持久化，UI 重连后从快照恢复，事件 reactor 从 cursor 继续 |
| 排队输入                    | 存于 `pi.inbox`，重启后仍在；`abort` 可撤回                    |
| 事件 reactor 处理到一半崩溃 | 事务回滚（含 cursor），下次重试该事件                          |
| Storage 本身失败            | Session 关闭（`session_failed`），host 报告；需重开 Storage    |

`docs/durability.md` 明确：工具只有"重跑无害"时才标 `replay:'safe'`，且必须有原因注释（lint `replay-safe-reason`）；
需要记住决策时用 `api.memo()`（工具 invocation 内的持久 memo）。

## 7. 复刻策略（若无法直接使用 Pi Durable）

Pi Durable 是外部依赖，直接复用最省力且语义最正确。若必须自研等价物，最小能力集是：

1. **SQLite 单写者 + 事务提交**：conversations / entries / documents(+base/delta) / tasks / submissions；
2. **文档系统**：kind + scope + version + checkpoint 策略 + 快照/增量/watch/as-of；
3. **任务调度器**：phases、checkpoint、restart limit、abort、父子归属、后台标记；
4. **提交发布**：commit 序号 + 变更列表 + 同步监听；
5. **会话运行时**：模型流、工具调用、输入队列（steer/followUp）、压缩；
6. **恢复**：打开时扫描未完成任务并按 replay 策略续跑。

工作量估计：这是整个项目最重的部分（Pi Durable 的 d.ts 约 100KB，实现远超 Ultimate 自身 core）。
**建议：复刻时把 Pi Durable 当作黑盒依赖，先对齐本仓库的装配方式，再考虑替换。**

## 8. 版本与兼容注意

- Node ≥ 26（`package.json engines`），使用内置 `node:sqlite`（`DatabaseSync`）——不是 better-sqlite3。
- `erasable syntax only`：不能用 enum/namespace/参数属性；相对导入必须带 `.ts`。
- 所有 `@earendil-works/*` 精确版本；升级 Pi 前读 `docs/pi-upstream.md`（列出与上游的耦合点）。
- `tsconfig.swap.json` 是热替换前的类型检查工程，必须覆盖 server/shared/extensions。

## 9. 证据索引

- `node_modules/@earendil-works/pi-durable/dist/types.d.ts:830-1038`（Tx/Storage/Session）
- `.../harness/types.d.ts:83-91`（ConversationHandle）、`238-299`（Tool/PromptSection/Extension）、
  `480-602`（HarnessSettings/Options）、`640-774`（Conversation/Harness）
- `.../harness/harness.d.ts:16-19`（Harness.open）
- `server/harness.ts:57-299`（全部装配）
- `server/api.ts:147-346`（taskGraph/subscribeCommits/watch）
- `docs/durability.md`、`docs/pi-upstream.md`
