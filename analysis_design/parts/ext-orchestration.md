# 编排与监督扩展组 分析笔记

## 1. 概览

这 8 个扩展共同构成 Ultimate 的“计划—执行—监督”外环：`plan` 维护可回卷的 epic/task 账本并把计划贴在对话旁；`tasks` 把 Pi Durable 的实时任务树投影成 Tasks 面板；`todos` 是项目级、由用户与 @ultimate 共同拥有的短待办；`phase` 用 `classify` 给忙碌会话贴工作阶段；`automations` 统一 cron/at/every、领域事件、上下文阈值与受监督脚本；`goal` 把 @ultimate 置于 hands-off 目标并留下报告；`pause` 是宿主级软暂停/Play 与 rate-limit 自停；`review` 是本地 Git diff 的审阅面并把评论送回会话。它们都不是 core tier（没有 `tier = 'core'`），但大量消费 core API（`conversations`、`messages`、`subagents`、`workspaces`、`lineage`）以及彼此的可选 API/point，复刻时应把它当作“编排层”，先固定 core 契约。

| 名称          | 一句话职责                                             | 服务端入口                                                                     | 浏览器入口                                                            | 是否 core tier |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------- |
| `plan`        | 持久 epic/task 账本、prompt 计划段、计划浮层与任务索引 | `extensions/plan/server.ts`（`plan` tool + `section('plan')`）                 | `extensions/plan/web.tsx`（`overlay`、tool 卡片、`ConversationTask`） | 否             |
| `tasks`       | 实时任务图面板、开始时间与 crash-loop 任务的 Retry     | `extensions/tasks/server.ts`（`started`/`retry` actions）                      | `extensions/tasks/web.tsx`（Tasks 面板、`RunStart`）                  | 否             |
| `todos`       | 项目级短待办，用户与 @ultimate 各自拥有                | `extensions/todos/server.ts`（`todo` tool + actions）                          | `extensions/todos/web.tsx` / `panel.tsx`（第一个右侧面板）            | 否             |
| `phase`       | 每轮工具后分类工作阶段，供侧栏显示                     | `extensions/phase/server.ts`（`phase.classify` task）                          | `extensions/phase/web.tsx`（`ConversationPhase` point）               | 否             |
| `automations` | 持久触发器和受监督脚本，启动 prompt run 或唤醒订阅者   | `extensions/automations/server.ts`（`automation` tool、scheduler、supervisor） | `extensions/automations/web.tsx`（面板、侧栏、chip、entry 卡片）      | 否             |
| `goal`        | hands-off 目标、决策记录、目标 reminder 与报告         | `extensions/goal/server.ts`（`goal` tool + user actions）                      | `extensions/goal/web.tsx`（状态栏、dialog、goal 卡片）                | 否             |
| `pause`       | 软暂停整个宿主、Play 续跑与 rate-limit 自停            | `extensions/pause/server.ts`（`pause` actions、`messages.gate`）               | `extensions/pause/web.tsx`（状态栏、composer hint、entry 卡片）       | 否             |
| `review`      | 本地 Git diff 审阅面与 `review.comments` 回传          | `extensions/review/server.ts`（`diff`/`ranges`/`recipient`/`send`）            | `extensions/review/web.tsx`（Review surface、`workspaces.review`）    | 否             |

## 2. 逐扩展规格

### 2.1 `plan`

**职责与用户可见行为**

`plan` 为每个 coordinator 保存持久 epic/task 账本：`create` 建 epic（`E1`），`add` 建 task（`E1.1`），`update` 改状态、标题、描述、`body`、`child`、`verdict`，`note` 追加带时间戳的任务备注，`show` 读取完整账本。系统提示只放非 done epic 的紧凑段；UI 另有浮层。

**导出与契约**

- 工具 `plan`，`replay: 'safe'`；参数含 `action`（`create|add|update|note|show`）、`title`、`body`、`epic`、`role`（`worker|reviewer`）、`description`、`deps`、`key`、`status`、`child`、`verdict`、`text`；结果同时写入 `structuredContent`（`server.ts:181-314`）。
- `docs = [Plan, TaskIndex]`：`Plan` kind `ultimate.plan`（`scope:'conversation'`、`history:'rewindable'`、`fork:'asOf'`）；`TaskIndex` kind `ultimate.plan.tasks`（root conversation、`history:'latest'`、`fork:'initial'`）；`Receipt` kind `ultimate.plan.receipt`（task scope）；`Started` kind `plan.started`（conversation、latest、fork initial）（`server.ts:36-70,119-127`）。
- section `plan` 只列 `status !== 'done'` 的 epic 及其 task，附 `deps:` 与 `child:`（`server.ts:164-178`）。
- 无 `api.ts`；`refs.ts` 导出 `PlanDoc`/`TaskIndexDoc` 与 `Task`/`Epic`/`Plan`/`TaskLink`；`ui.tsx` 导出 `statusOf`、`StatusIcon`、`useTaskIndex`、`useTaskOf`、`useOpenTask`、`TaskChip`；`progress.tsx` 导出 `finished`、`pillOf`、`number`；`web.tsx` 提供 `ConversationTask`（`ui.tsx:39-101`，`web.tsx:814-818`）。
- 约束：mutation 只能由账本所有者 coordinator 执行；子会话 `show` 会沿 `conversation.owner` 向上找到根 coordinator，mutation 则报 `Only conversation N edits this plan; report to it instead`（`server.ts:217-227`）。`deps` 必须指向已存在 task；`body` 仅 epic；`description`/`child` 仅 task；状态集合固定（`server.ts:286-305`）。
- settings：无；子会话标题通过 `host.metadata` 的 conversation title 写入（`server.ts:112-114`）。

**状态与持久化**

`ultimate.plan`（每个 coordinator 一份，可回卷）、root 上的 `ultimate.plan.tasks`（`{children:{[id]:TaskLink}}` 索引）、`plan.started`（每个 conversation 的启动标记）三个对话文档，加 task 级的 `ultimate.plan.receipt`。没有 SQLite/文件存储。`TaskIndex` 在每次 mutation 的同一事务里由 `reindex` 重写，并据此把新建或改名的 task 标题同步为子会话标题（`server.ts:82-116,307`）。

**UI 位置**

Agent surface 的 `overlay`：prompt 右上方 pill；coordinator 显示最新开放 epic 的 `E2 · 1/4 done` 和 `+N`，worker 显示 `TaskChip`、任务标题与 `↑ #coordinator`。点开是 `data-plan-panel` 卡片，状态存 durable UI state `plan.panel`；`plan.open`（`{conversation,key}`）由 `TaskChip`/`?task=` 设置；URL 的 `?task=` 读取后即删除。`plan` 调用渲染为 `PlanCall` 卡片；`ConversationTask` 被 sidebar、subagents 等复用（`web.tsx:565-729,814-818`）。

**关键流程**

1. `execute` 先查 `api.memo('result')`，再取/建 receipt UUID，之后进入 `api.commit`；commit 内先解析根 coordinator，再读 `Receipt` 去重（`server.ts:213-229`）。
2. `create` 用 `plan.next++` 生成 `E<n>`；`add` 用 `epic.key.tasks.length+1` 生成子 key；`update` 按字段白名单写回；`note` 只允许 task key。
3. 每次 mutation 调 `reindex(tx, host, coordinator, plan)`，重写 root 索引并在 task 新建/改名时改子会话 metadata 标题（`server.ts:86-116`）。
4. `reply` 序列化结果，commit 关闭后 `api.memo('result', reply(text))` 保存，保证重启重放可取回同一结果（`server.ts:308-311`）。

**失败与恢复**

未知 key、非法状态、把 `body` 写到 task、把 `description/child` 写到 epic 都直接报错；子会话 mutation 被拒。`Receipt` 与 `api.memo` 双保险避免中断重放重复建 task/note。lineage 分支用 `beforeInput`：若分支在 fork 后尚未回答，则在放置第一个 input 的 commit 里把 `Plan` 重置为 `initial()`，首个请求看不到继承计划；回答过的旧分支保留自己的计划（`server.ts:130-160`）。

**关掉它会发生什么**

`plan` 工具、`plan` prompt section、计划浮层、`PlanCall` 卡片与 `ConversationTask` provider 全部消失；已有 `ultimate.plan`/`ultimate.plan.tasks` 文档仍在存储中，但不再更新；`tasks` 面板因读不到索引而不再显示 TaskChip 和任务链接；子会话也不再被自动改名。

**复刻要点**

- 账本按 coordinator 的 conversation scope 存，root 索引只是同一事务里的投影；不要把两者拆成异步同步。
- 所有权解析必须沿 `owner` 链向上；mutation 只在根 coordinator 落地，`show` 才允许子会话读根账本。
- receipt + `api.memo` 是 replay 语义的核心，不能只靠工具名去重。
- `fork:'asOf'` 与 `beforeInput` 重置是分支语义的一部分；换成 `latest` 会让子分支继承错误计划。

**证据**

- `extensions/plan/server.ts:17-70,82-116,130-160,164-178,181-314`
- `extensions/plan/refs.ts:39-42`
- `extensions/plan/ui.tsx:39-101`；`progress.tsx:1-22`
- `extensions/plan/web.tsx:565-729,732-806,814-818`

### 2.2 `tasks`

**职责与用户可见行为**

`tasks` 在右侧面板的 Tasks 标签展示实时任务图：每个有活任务的 conversation 作为根，task 按 owner 组成 generation → tool call → 任务拥有的子会话树；显示 `pending`、运行 phase、等待的 task id、`completing → outcome`、`bg`、`aborting`、已运行时长（超过 10 分钟变 warning）。顶层会话显示 feature tag，链接了 plan task 的会话在标题前显示 `TaskChip`。无法运行的任务显示原因：连续崩溃 5 次被 crash-loop guard **parked** 的任务带 **Retry** 按钮；其他 blocked 原因只显示名称。

**导出与契约**

- server 默认导出 `{ name: 'tasks' }`，`userActions = ['retry']`；`actions.started`（参数 `{ids}` → `{taskId:startedAt}`）与 `actions.retry`（参数 `{id}`，调用 `Harness.retryTask`）（`server.ts:6-33`）。
- `refs.ts` 导出 `StartedAction = actionRef('tasks','started')`、`RetryAction = actionRef('tasks','retry')`（`refs.ts:5-11`）。
- web 默认导出：`provides: [provide(RunStart, useRunStart)]`、`panels: [{id:'tasks', title:'Tasks', icon:ListTreeIcon, order:1}]`、command `tasks.open`（`web.tsx:398-408`）。
- reactor/API/settings：无自定义事件、无 `api.ts`、无 settings key；只提供 `RunStart` point。

**状态与持久化**

没有自己的 doc 或文件。任务树来自 `useTasks()`（server 的 `tasks` event）、`useConversations()` 与 conversations overview document；开始时间来自 task record 的 `startedAt`，通过 `started {ids}` 每任务只问一次；tool 名称来自 `pi.live`；隐藏会话来自 `useUiState('ext.conversations.concluded')`（`web.tsx:333-363`）。

**UI 位置**

右侧面板 Tasks（order 1）；command `tasks.open`（“Show the task graph”）；`RunStart` point（token `ultimate.runStart`）供 transcript 的工作时钟读取；没有 surface 或 status item。

**关键流程**

1. `build` 先按 concluded/hidden conversation 过滤 task 和子会话，再按 `owner == null` 分到 roots、否则分到 children（`web.tsx:43-104`）。
2. `TaskRow` 按 task.kind 去掉 `pi.` 前缀，用 `status()` 计算 pending/running/waiting/sleeping/completing 文案；`tree.started` 有值时显示 `formatDuration(now-startedAt)`（`web.tsx:106-147,200-252`）。
3. 面板对未取到开始时间的 task 调 `StartedAction`，把返回 merge 进 state；`RetryButton` 调 `RetryAction` 并在失败时 `store.notify`（`web.tsx:255-279,342-347`）。

**失败与恢复**

`blocked === 'restart_limit'` 显示 “parked after 5 crashes” 并只给 Retry；`blocked` 为其他原因（missing/too-old definition、failed migration）只显示 `blocked · <reason>`，因为注册表变化后会自动恢复，不能滥用 Retry。`retry` 是 user-only；任务没启动时 `started` 查询会跳过并等下一次。任务本身由 Pi Durable 恢复，本扩展不持久化。

**关掉它会发生什么**

Tasks 面板和 `tasks.open` 消失，`RunStart` 没有 provider，transcript 的运行时钟不显示；任务仍照常执行，plan 的 TaskChip 也仍由 plan 自己提供，但面板里不再出现任务树和 parked 计数。

**复刻要点**

- 只做投影，不要复制 task 状态；`useTasks()` 的快照就是真相。
- 开始时间查询按 id 批量且只问一次；缺失的 task 跳过而不是补 0，否则“运行时长”会撒谎。
- parked 与普通 blocked 必须分开：只有 `restart_limit` 允许用户重试。

**证据**

- `extensions/tasks/server.ts:8-33`；`refs.ts:5-11`
- `extensions/tasks/web.tsx:43-147,200-279,333-363,398-408`
- `web/src/sdk/types.ts:248-253`（`RunStart`）

### 2.3 `todos`

**职责与用户可见行为**

`todos` 是项目级开放事项清单，每项属于 `user` 或 `ultimate`；没有优先级、截止日、标签或嵌套。@ultimate 用 `todo` 工具维护它，用户可在右侧第一个面板添加、勾选、重新打开，并把待办交给 @ultimate（`Work on to-do #N: …` / `Help me with to-do #N: …`）。面板还实时显示 Messages 里等待用户回答的问题。

**导出与契约**

- `Todos = defineDoc` kind `todos`，root conversation、`history:'latest'`、`fork:'initial'`；`docs = [Todos]`；内部 `Seen` kind `todos.seen`（`server.ts:27-46`）。
- 工具 `todo`，`deferred:true`，actions `add {text,owner}` / `done {id}` / `list`；非 `replay:'safe'`（默认），中断不会重跑 add（`server.ts:160-194`）。
- actions token `todos`：`add {text,owner}`、`done {id}`、`reopen {id}`，全部 `userActions`（`server.ts:131-142`，`refs.ts:17-21`）。
- entry `todos.note`：每次 @ultimate 的输入前，若开放列表自上次“听到”后变化，则插入一条模型 user message；数据只带 `{open}` 计数（`server.ts:101-125`）。
- events/hooks/API/settings：无自定义事件、无 `api.ts`、无 settings key；挂 `GenerationTask.beforeInput`，actions 由 `implementAction` 注册。

**状态与持久化**

`TodosDoc = docRef('todos')` 保存 `{next, items}`，item 为 `{id,text,owner,at,done?}`；文本 trim 后 1–300 字符；勾选时保留最新 50 个 done，开放项永不丢。`Seen` 每 conversation 保存上次列表文本的 key；列表不变则不加 note，因此 system prompt 缓存不被破坏。无文件存储。

**UI 位置**

右侧面板第一个 tab `todos`（`order:0`）、command `todos.open`；“For you” 先显示 Messages 的等待问题，再显示用户待办；“For @ultimate” 显示 @ultimate 待办；done 折叠；add 表单可切换 owner。问题行发出 `messages:open {conversation,call}` 并跳到提问会话（`panel.tsx:41-134,231-282,292-343`，`web.tsx:5-16`）。

**关键流程**

1. `add` 校验 text 非空且 ≤300、owner ∈ `user|ultimate`，分配 `next++` 并 push。
2. `mark` 找到 id，done 写入时间戳，再按 done 时间排序只留最新 `DONE_LIMIT=50`；reopen 删除 `done`。
3. `noteFor` 在每个 @ultimate 输入前比较 `listText(items)` 与 `Seen.key`；不同则写 `todos.note`，内容按 “Yours:”/“The user's:” 分组列出 id 和文本；空列表写 `No to-dos are open.`（`server.ts:87-125`）。
4. 面板的 ▶ 以用户身份 `api.submit` 到 standing @ultimate，然后 `showSurface('agent')` 并切过去；busy 时作为 follow-up（`panel.tsx:64-79`）。

**失败与恢复**

`todo` 工具在 transaction 内再次检查 `Standing.ultimate`，非 @ultimate 调用被拒（即使 `deferred` 只是隐藏工具）；其他项目通过 codemode `ultimate.doc('todos',1,{project})` 读取并 `ultimate.tell` 请求添加。add 非 replay-safe，所以崩溃最多提交一次；面板 action 失败在行内显示错误。`Seen` 丢失只会导致多一条 note，不会改数据。

**关掉它会发生什么**

用户失去 To-dos 面板和 ▶ 快捷方式，@ultimate 失去 `todo` 工具与 `todos.note` 提醒；`todos` 文档仍在存储中，其他项目读取也仍能看到，但本项目的 @ultimate 不再主动维护。

**复刻要点**

- 每输入一条 note、绝不放进 system prompt，是保持 prompt cache 的关键。
- 列表变化检测要基于完整开放列表文本，而不是条数；改文字也要触发。
- 用户勾选与 @ultimate 工具共享同一个 doc，写入必须在一个事务里，否则 50 条 done 的裁剪会竞争。

**证据**

- `extensions/todos/server.ts:23-46,50-125,131-158,160-194`
- `extensions/todos/refs.ts:4-21`；`panel.tsx:41-134,231-343`；`web.tsx:5-16`

### 2.4 `phase`

**职责与用户可见行为**

`phase` 在每个工具轮之后为忙碌会话分类当前工作阶段：`exploring`、`planning`、`editing`、`verifying`、`fixing`、`delegating`、`wrapping_up`。标签显示在侧栏分支行的 activity 位置；@ultimate 与其他 standing agent 行则用小写词替代 “working”。等待子代理与 idle 由前端本地推导，不调用模型；因此只要 `phase` 启用，即使没有 `TYPESAFE_API_KEY` 也能显示 “Waiting”。分类依赖 `classify`，会把当前 request、最近工具调用与最新 assistant 文本片段发送到外部 provider。

**导出与契约**

- `question` 是 `ClassifyQuestion`：`type:'choice'`，七个 criteria 的说明固定（`server.ts:19-38`）。
- `Phases = defineDoc` kind `ultimate.conversation-phases`，root conversation、`history:'latest'`、`fork:'initial'`；`docs=[Phases]`；`refs.ts` 导出 `PhasesDoc`。
- task `phase.classify`（`defineTask`，`initial: {phase:'classify'}`，abort 清 pending）；没有 tool/action/API。
- `ui.tsx` 导出 `DisplayPhase`、`usePhase`、`phaseText`、`PhaseLabel`；`web.tsx` 用 `provide(ConversationPhase, useConversationPhase)` 填入 `conversations.phase` point（`web.tsx:16-18`）。
- `host.want(ClassifyApi)`（token `classify`），可选依赖；settings：无自有 key，但 classify 需要 Secrets 里的 `TYPESAFE_API_KEY`（`extensions/classify/README.md`）。

**状态与持久化**

`PhasesDoc` 保存 `{conversations: {[id]: {run?, phase?, confidence?, at?, pending?}}}`。`run` 是 run 的第一个 input submission id（不是 generation id，因为 Pi 每轮工具都会换 generation）；`pending` 是分类 task id，同时充当 in-flight 锁；`confidence` 保存最近一次答案置信度。分类结果 `api.memo('answer')` 绑定 task，重启后取回；无文件存储。

**UI 位置**

没有自己的 panel/surface/command；通过 `ConversationPhase` point 进入 sidebar 的 branch 行、@ultimate 行、lander 行、voice-live 等。`PhaseLabel` 是带 pulse 点的标签。

**关键流程**

1. `beforeRequest` 读取 `LiveDoc.run.inputs[0]`；若与当前 row.run 不同，重置 row 但保留 `pending`（`server.ts:149-161`）。
2. `afterTools` 在 classify 可用且没有 pending 时创建后台 `ClassifyTask`（`background:true`、`abandonOnRestart:true`、conversation ownership），写入 `{run,pending}`（`server.ts:162-185`）。
3. task 从最新 entry 向前收集直到遇到 input，只取当前请求的 entries；`phaseState` 生成 `request`（1500 字符）、最近 15 个 tool call（参数裁剪，失败 tool result 带 `failed` 摘要）、最新 assistant 文本 `agentSaid`（400 字符），调用 `service.ask`，超时 10 秒（`state.ts:17-99`，`server.ts:83-118`）。
4. commit 时只有 `row.pending === task.id` 才清除锁；`row.run === input.run` 且 answer 是合法 choice 且 `confidence >= 0.6`（或尚无 phase）才写 `phase/confidence/at`（`server.ts:123-141`）。

**失败与恢复**

classify provider 错误被吞掉（“Classification is advisory”），绝不让主 run 失败；中断/重启后 `abandonOnRestart` 丢弃分类任务，abort 清 pending；低置信度且已有 phase 时保留旧值；`onYield` 清掉 phase 但保留 pending，避免锁泄漏（`server.ts:71-81,186-194`）。没有 key 时 `host.want` 返回 undefined，afterTools 直接 return。

**关掉它会发生什么**

`usePhase` 因 `useExtensions()` 不再看到启用的 phase 而返回 undefined，侧栏回到普通 “working”，`ConversationPhase` 没有 provider；不会再创建 classify task，也不发送 transcript 片段到 classify 服务。历史 `ultimate.conversation-phases` 残留但不显示。

**复刻要点**

- 绑 run 的第一条 input，而不是 generation/task id；否则每轮工具后分类结果就丢。
- 低置信度保留旧值，且 pending 锁在 yield 时不能清掉，否则会重复分类。
- 分类只是装饰：任何失败都必须降级为空，不影响主流程。

**证据**

- `extensions/phase/server.ts:19-49,54-56,62-198`
- `extensions/phase/state.ts:17-99`；`types.ts:1-17`；`refs.ts:6`
- `extensions/phase/ui.tsx:8-36`；`subtree.tsx:5-24`；`web.tsx:16-18`

### 2.5 `automations`

**职责与用户可见行为**

`automations` 把四类触发统一进一个账本：`cron`/`at`/`every` 调度、领域 `event`、`condition`（上下文百分比阈值，可加 `idleFor` 等待用户安静）、以及 `ask` 启动的受监督脚本。每个自动化可以有 `prompt`（每次 fire 新建 run conversation）和/或 `subscribers`（唤醒已有会话）；脚本通过 stdout 的 `FIRE [text]` 触发，`DONE` + exit 0 干净停止。脚本只在 setup/repair 花 token，prompt run 每次 fire 都花 token；用户在 Automations 面板、Agent 侧栏、状态栏 chip 和 transcript 卡片里看到状态、运行历史、脚本日志与 Repair/Delete。

**导出与契约**

- 工具 `automation`，`replay:'safe'`，14 个 operations：`events`、`list`、`create`、`update`、`pause`、`resume`、`run`、`runs`、`log`、`abort`、`escalate`、`subscribe`、`unsubscribe`、`delete`；create 使用扁平参数 `{name,schedule?|ask?|event?|condition?,once?,secrets?,prompt?,agent?,model?,thinking?,subscribers?,scope?,slug?}`（`server.ts:92-107,738-834`）。
- reactors：`host.react('user-input',[UserInputEvent])` 维护 `condition.inputAt`；`host.react('events', TRIGGER_EVENTS.map(...))` 处理领域事件；context 条件走 `subscribeCommits` + `check`，不是领域事件 reactor（`triggers.ts:198-247,248-274`）。
- `AutomationsApi` token `automations`：`create(args)`、`delete(id)`、`resume(id)`、`pause(id)`、`run(id)`、`status(id)`、`read(tx,id)`；其中 `resume`/`pause`/`run`/`status` 返回带 `alive` 的记录，`read` 返回事务内普通副本；这是可选服务，调用方用 `want`，`create` 的 `subscribers` 可代替 caller（`api.ts:5-25`，`server.ts:702-713`）。
- actions token `automations`：`events`、`list`、`create`、`update`、`pause`、`resume`、`run`、`delete`、`subscribe`、`unsubscribe`、`log`、`escalate`、`script`、`describe`；`runs`/`abort` 是直接注册的函数；`pollActions = ['list','log','script']`。`describe {schedule}` 返回 `{schedule,description,next[]}`（最多 3 次），`script {id}` 返回 `{path,text}`（首 64 KiB），`log` 默认 50 行、最大 2000（`refs.ts:23-64`，`server.ts:619-697`）。
- events：`automations.fired {id,text,fire}`、`automations.started {id,pid}`、`automations.exited {id,code,signal?}`、`automations.done {id,text?}`、`automations.escalated {id,reason}`（`refs.ts:65-76`）。
- tasks：`ultimate.automation-scheduler`（plan/sleep/fire）、`ultimate.automation-run`（create/deliver）、`ultimate.automation-delivery`（deliver）；类型常量 `RUN_TASK = 'ultimate.automation-run'`、`RunLabel='automation'`、`WatcherLabel='watcher'`（`types.ts:5-7,120`，`scheduler.ts:44-266`，`supervisor.ts:315-363`）。
- 依赖：`host.need(SubagentsApi)`、`host.need(MessagesApi)`；side-chat 备注时 `host.need(LineageApi)`（`server.ts:699-700,817-827`）。`section('automations')` 永远渲染（没有启用项时输出 `None enabled.`），避免 prompt 重排（`server.ts:728-736`）。
- web：`tools:{automation}`、entries `automations.fired|failed|escalated|writing`、slots `statusline.right`（Chip，order -2）与 `sidebar.top`（AutomationsSection，order -20）、panel `automations`（order 2.5）、command `automations.open`（`web.tsx:191-220`）。
- settings：无 extension settings；`secrets` 是每条 automation 自己的命名列表，运行时用 `readSecret` 注入，记录不保存值（`supervisor.ts:499-503`）。

**状态与持久化**

- session-level `ultimate.automations` doc（不是 `docs` 导出的 conversation doc），`version:2`，`migrate` 给旧 schedule 记录补 `subscribers:[]`、把旧 runs 当 `fires`/`lastFireAt`；保存所有触发器和每自动化最近 50 个 runs（`server.ts:57-78`，`scheduler.ts:218`）。
- task-scoped `ultimate.automation-receipt` 与 tool `memo` 去重；进程 effect 携带 `previousPid`，重放只针对当时的 pid（`server.ts:79-86`，`types.ts:100`）。
- 用户脚本目录 `~/.ultimate/automations/<project>/<id>/`：可执行 `run`、持久 `state/`、`output.log`（约 2000 行 / 256 KiB）、`pid`；项目脚本在 `<project>/.ultimate/automations/<slug>/` 提交 `run` 与 `automation.json`。`<project>` 是 `basename(host.home)`，不是 worktree cwd（`supervisor.ts:126-132,301-314`，`types.ts:112-117`）。
- run 历史只留 50 条；`recentFires` 只保留一小时窗口；`tail` 默认 50 行、最大 2000 行（`scheduler.ts:218`，`supervisor.ts:301-314`）。

**UI 位置**

Automations 右侧 tab（Activity 之后，order 2.5）；Agent 侧栏 `sidebar.top` 的 Automations 段（最多 5 条，最坏优先，可展开全部）；状态栏 `statusline.right` chip；`automation` 工具卡片；四条 entry 卡片（fired/failed/escalated/writing）；脚本详情包含 pid、uptime、exit、fires、run path、错误、实时 output 或源码。`lookOf` 把状态归一为 failed/investigating/writing/working/watching/scheduled/armed/waiting/paused/done，worst-first 排序（`parts.tsx:120-169`，`panel.tsx:587-753`，`sidebar.tsx:34-134`）。New 与 Edit 共用 `AutomationForm`：先选 trigger（On a schedule / When something happens / When Ultimate…），schedule 用 `describe` 实时预览，agent picker 通过 `subagents:open-definition` 与 `subagents:definition-closed` 和 subagents 面板联动（`form.tsx:79-98,232-253,300-408`）。

**关键流程**

1. **create**：`validate` 要求恰好一个 trigger；`prepareScript` 解析 `scope`/`slug`，项目脚本先校验 trust 并把 manifest 写到 `automation.json`，再用 `creating` 防并发；`change` 分配 `A<n>` 或 slug，写 `script.conversationId`、`subscribers`、`runs:[]`，并创建 watcher delivery（`server.ts:128-300,356-428`）。
2. **schedule**：`parseSchedule` 支持 cron 五字段、`at` ISO、`in 30m`、`every 15m`；`Scheduler` task 的 `plan` 用 `nextAt` 计算并写 `nextAt`，`sleep` 调 `runtime.sleepUntil`，`fire` 在 commit 内 `fire` 并决定是否回到 `plan` 或结束；一次 `at` 触发后禁用（`scheduler.ts:221-266`，`schedule.ts:69-120`）。
3. **fire**：先看 `recentFires`，一小时内第 7 次直接置 `enabled=false`、发 `automations.escalated`，由 escalation delivery 通知订阅者并给 @ultimate 发一条 message；否则按 `prompt` 创建 `RunTask` 或记 skipped（重叠），递增 `fires`/`lastFireAt`，发 `automations.fired`，给每个 subscriber 建一个 delivery task（`scheduler.ts:155-177`，`supervisor.ts:320-338,364-385`）。
4. **prompt run**：`RunTask.create` 用 `SubagentsApi.createChild` 建 label `automation` 的 conversation（可带 agent definition/profile，按 profile 排除 `automation`（有 agent 时也排除 `subagent`）工具，并排除 `automations` extension）；`deliver` 用 requestId `automation-run:<taskId>` 提交 prompt（非空 fire text 追加 `\n\nFired: <text>`），等待答案，记录 done/failed/aborted 和首行 200 字符（`scheduler.ts:44-154`，`supervisor.ts:270-283`）。
5. **script**：watcher 收到 `automations.writing` 后写/测 `run` 并 `automation resume`；supervisor 用 handshake 启动进程组，写 pid + `automations.started`；stdout 行 `FIRE` 在 transaction 内 fire；`once` 首次 FIRE 即 done+disabled 并终止组；非计划退出写 `investigating` 并唤醒 watcher，watcher 的 brief 要求在两次修复失败后 `escalate`（这是 prompt 规则，代码不强制）（`supervisor.ts:468-621,315-363,409-455`）。
6. **event/condition**：event reactor 只处理 `sinceEvent` 之后且 where 严格相等的 10 个 `TRIGGER_EVENTS`，并跳过自身 run 产生的事件；condition 在每次 context doc 提交时按 commit 顺序评估，低于 `above-10` 重新 arm；`idleFor` 由 60 秒 tick 检查，`conversations.compacted` 等由 `UserInputEvent` 更新 `inputAt`（`triggers.ts:17-64,104-283`）。

**失败与恢复**

创建/更新有 task receipt + tool memo，replay 不会重复建记录；进程 resume 记录 old pid，崩溃后 `open` 扫所有 runtime pid 并重启 enabled+running 脚本；scheduler 的 sleep checkpoint 跨重启保留，过期只 fire 一次；重叠 run 记 `skipped` 不排队；删除保留文件和 conversations；一次性任务过期后 `resume` 被拒，必须先改时间；脚本缺 secret 会启动失败并转 investigating；`output.log` 双限裁剪，未换行输出也受 256 KiB 上限。注意本快照 README 提到的 supervisor dashboard `automations/scheduler: ready · durable scheduler` 在源码中未找到对应注册，`server/services.ts:1-10` 说明 core 已不再报告 service 行，推断为过期描述，不必按它实现。

**关掉它会发生什么**

所有 scheduler/run/delivery task 和脚本 supervisor 停止；`automations` API 缺失，`goal` 的 reminder 无法创建（goal 仍可运行），`dream` 的 context automation 也不能创建/迁移；`automations.fired` 等事件不再产生，activity feed、dream 的消费者收不到；Automations 面板、侧栏段和 chip 消失；`ultimate.automations` 文档与脚本文件仍保留。

**复刻要点**

- 一个 session ledger 统一四类 trigger；schedule 触发器本身用 durable task 表达，event/condition 则用 reactor 与 commit 订阅，不要把 cron 放进进程内定时器。
- scheduler 的 plan→sleep→fire 必须与“创建 run + running 记录”在同一事务推进；fire 先 `prepareFires` 读重叠，再写 task/entry，否则事务扫描顺序会报错。
- 脚本 supervisor 只有进程状态放 `host.resource`，函数每次安装重建；pid 文件 + handshake + Job Object/process group 是跨平台关键。
- 所有投递使用稳定 requestId（`automations:<id>:<event>:<target>`），否则重放会重复唤醒。
- event 过滤要同时看 trace conversation 和 data 中的 conversation，且用 owner task kind/input 判断“自己的 run”。

**证据**

- `extensions/automations/types.ts:9-120`；`api.ts:5-25`；`refs.ts:23-76`
- `extensions/automations/schedule.ts:69-153`；`triggers.ts:17-283`；`scheduler.ts:44-283`
- `extensions/automations/server.ts:57-107,128-300,343-586,606-697,698-836`
- `extensions/automations/supervisor.ts:48-132,174-246,315-455,468-621,651-691`
- `extensions/automations/web.tsx:191-220`；`parts.tsx:120-169,288-342`；`panel.tsx:587-753`

### 2.6 `goal`

**职责与用户可见行为**

用户通过 ⌘K “Go hands-off…” 写一个目标，@ultimate 在用户离开期间自行决策、把每个“本来会问用户”的决定连同理由记录，并在结束时留下报告。目标卡片显示目标原文、criteria 状态、最近三个 decisions、reminder 状态（每 30 分钟唤醒或 “Waiting on you: …”）和 **End hands-off**；报告卡片显示 outcome、summary、全部 criteria 与 decisions（含截图）。

**导出与契约**

- `Goals` doc kind `goal`，root conversation、`history:'latest'`、`fork:'initial'`；`docs=[Goals]`；`GoalDoc` 在 `refs.ts`（`server.ts:33-42`，`refs.ts:44`）。
- 工具 `goal`，`deferred:true`，actions `criteria|decide|met|failed|finish|pause|resume`；非 replay-safe（`server.ts:335-376`）。
- 用户 actions token `goal`：`start {text}`、`end`、`images {goal,entry}`；`start`/`end` 在 `userActions`，`images` 不是（`server.ts:265-298`，`refs.ts:49-57`）。
- entries：`goal.started`（input，唤醒 @ultimate）、`goal.report`（write，只追加不唤醒）、`goal.note`（每次 @ultimate run 的 per-input 模型 note）（`delivery.ts:5-46`，`server.ts:306-333`）。
- tasks：`goal.deliver`（`Card` 提交）、`goal.reminder`（sync）；`goal.deliver` 的 requestId 为 `${kind}:${goal}`（`delivery.ts:9-46`，`reminder.ts:84-99`）。
- 依赖：`host.want(AutomationsApi)`；automations 关闭时目标仍可运行，只是没有 reminder（`server.ts:300-303`）。
- web：entries `goal.started`/`goal.report`/`goal.note`（后者渲染为 null）、slots `statusline.right`（HandsOff）与 `overlay`（GoalDialog）、command `goal.start`（`web.tsx:27-37`）。
- events/reactors/settings：不定义新事件，也不注册 reactor；无 `api.ts`、无 settings key；靠 `GenerationTask.beforeInput` 注入 `goal.note`。

**状态与持久化**

`{next, goals: Goal[]}` 存在 root `goal` doc，至多一个 `!goal.ended`；`Goal` 含 `text`、`startedAt`、`criteria`、`decisions`、`reminder?`、`waiting?`、`ended?`。`criteria` 每项 `{text,status:'open'|'met'|'blocked',tries?}`；`decisions` 每项 `{at,question,picked,reason,conversation?,images?}`。`images` 只存 entry id，不复制图片。无文件存储。

**UI 位置**

状态栏右侧 `HandsOff` 按钮（打开 @ultimate）；`GoalDialog` overlay（⌘K 命令）；transcript 的 StartedCard/ReportCard；没有自己的 panel。

**关键流程**

1. `start` 在 commit 内建 goal（拒绝已有 open goal）、投递 `goal.started` 卡片、创建 `goal.reminder` sync task，然后返回 goal（`server.ts:62-76,267-274`）。
2. 每次 @ultimate 的 `beforeInput` 若当前 goal open，插入 `goal.note`；reminder fire 的 input（`automations.fired` 且 id 等于 `goal.reminder`）会在 note 末尾追加“检查 branches/lander queue/reactor lag/watchdog”的提醒（`server.ts:310-332`）。
3. `goal` 工具在 @ultimate 身份下执行：`criteria` 重写标准（同文本保留旧状态）、`decide` 追加 decision 并可绑定截图 entry、`met` 置 met、`failed` 累加 tries 达 3 变 blocked、`finish` 写 `ended` 并投递报告、`pause`/`resume` 维护 `waiting`（`server.ts:148-223`）。
4. `goal.reminder` task 每次变更后最多 6 步对齐：删除多余同名 automation、按需创建 `Goal reminder · goal <id>`（`every 30m`，订阅 @ultimate）、把 id 写回 goal、按 `waiting` pause/resume；崩溃重跑按名字收养，用户删掉的（`goal.reminder` 已记录）不会重建（`reminder.ts:28-100`）。
5. `end`（用户）或 `finish`（@ultimate）都会 `card(...,'goal.report')`，报告写入 @ultimate 的 transcript，之后恢复普通提问（`server.ts:78-84,213-246,275-281`）。

**失败与恢复**

同时只允许一个 open goal；`decide`/`criteria`/`finish` 文本上限 2000 字符；`images` 只接受该 goal 的 decision 引用过的 entry。`goal.deliver` task 在变更同一 commit 创建，requestId 让重试不重复；`goal.started` 即使晚到，其 note 也是按运行时 goal 状态生成，用户已 end 时不会授予权力。reminder sync 用独立 commit，崩溃最多留一个可重跑 task；automations 关闭时直接跳过。

**关掉它会发生什么**

⌘K 入口、HandsOff 状态、`goal.started`/`goal.report` 卡片和 `goal` 工具消失；`goal` 文档残留但不再被使用；没有 reminder，@ultimate 不会收到 goal note。pause 仍可独立工作。

**复刻要点**

- goal 状态用 root doc，报告和启动卡走 durable delivery task，而不是直接 `submit`；否则崩溃会丢卡。
- reminder 不是 goal 的字段同步，而是“收敛任务”：按 id/name 找到 automation 后再 create/pause/resume，必须允许重跑。
- 决策与截图只存引用；报告卡片发送时再读，避免复制大图。
- 用户 `start/end` 与 agent `goal` 工具分权，且 start 卡本身不授予权限。

**证据**

- `extensions/goal/server.ts:33-114,148-246,253-298,300-376`
- `extensions/goal/refs.ts:4-57`；`delivery.ts:9-46`；`reminder.ts:16-100`
- `extensions/goal/web.tsx:27-37`；`cards.tsx:168-318`

### 2.7 `pause`

**职责与用户可见行为**

`pause` 是软暂停整个宿主：按 Pause 后正在执行的 bash/模型 response 自然结束，之后不再启动新任务，用户消息排队；不 kill 进程、不 abort stream。按 Play 后继续，且每个暂停时正在 turn 中的 run 会收到一条 `pause.note`。模型返回 429/“rate limit”/“too many requests” 时，扩展会在该 commit 的 publication 内立刻 `harness.hold()`，避免 Pi 的 2 秒重试撞限；默认不会自动恢复，用户可按 Play，或在设置里让它在 N 分钟后自动 Play。

**导出与契约**

- `PauseApi` token `pause`：`paused(): boolean`，供调度器外的定时器跳过 tick（`api.ts:4-9`）。
- `PauseDoc` kind `pause.state`，root conversation；actions token `pause`：`state`、`pause`、`play`、`autoPlay`；`pause`/`play`/`autoPlay` 在 `userActions`（`server.ts:501-510`，`refs.ts:59-73`）。
- 实现 messages 的 `messages.gate`（`Gate`）扩展点，`work(call, fn, signal)` 在暂停时等待 Play 并统计 in-flight（`server.ts:443-447`）。
- entries：`pause.note`（Play 后每条 held run 的琥珀分隔线）、`pause.limit`（rate-limit 卡片）、`pause.autoplay`（自动 Play 的分隔线）（`web.tsx:446-455`）。
- slots：`statusline.right` 的 Item/Play（order -3，phone 显示）、`composer.status` 的 Hint；提供 `ParkedRuns`（`ultimate.parked`）；commands `pause.pause` / `pause.play`；无 panel/surface（`web.tsx:446-472`）。
- events/reactors/settings：不定义新事件；`harness.subscribeCommits` 监听 assistant error entry，`Gate` 处理 in-task 模型调用；除 `api.ts` 提供的 `PauseApi` 外没有别的 API；`autoPlay` 是 pause doc 字段，不是 settings key。

**状态与持久化**

`PauseDocState = {paused, since?, runs?, limit?, manual?, autoPlay?, work?}`；`runs` 记录暂停时每个 conversation 的 `{task,input}`，`limit` 为 `{provider,model,error,at,conversationId}`。`host.resource` 保存跨 reload 的 `pause.flag`、`pause.queue`、`pause.gate`、`pause.autoplay`；`work` 是 gated 调用结束时自增的刷新计数器。无独立文件。

**UI 位置**

状态栏 `⏸ Pause`；有前景任务仍在跑时 `⏳ Pausing… N tasks running`（popover 列出 conversation、`what`、年龄）；安全后 `⏸ Paused · safe` + `▶ Play`；rate limit 显示 `⏸ Rate limited · provider` 与 popover 详情。composer 下方 `Paused — your message runs on Play`；transcript 三种 entry。⌘K Pause/Play 受 `when` 控制（`web.tsx:214-335,446-472`）。

**关键流程**

1. `pause` → `serial(hold)`：`harness.hold()`、`flag.paused=true`，在一个 commit 内写 `since` 和所有 `pi.generation`（pending/running/waiting/sleeping）中 `LiveDoc.run.taskId` 匹配的 `runs`；若已有 pause 则只补 `limit`/`manual`（`server.ts:200-239`）。
2. `play`：读 doc，对每个 recorded run 用 `noted()` 判断“同一 task 或同一首 input 仍继续”还是“已完成”；为前者/后者写 `pause.note`（requestId `pause.note:<since>`），然后清 doc、arm timer、`flag.paused=false`、`harness.release()`，并唤醒 gate 等待者（`server.ts:391-441`）。
3. rate limit：`subscribeCommits` 检查 assistant error entry 的 `rateLimited(...)`（HTTP 429 / “rate limit” / “too many requests”），设置 flag+hold，再 `serial(limited)`；`limited` 失败会 `release()` 并把 flag 复位；成功后写 `pause.limit` 卡（requestId `pause.limit:<since>`）。配额、usage-limit、billing 错误在 Pi 的 no-retry 列表里，不会被 `rateLimited()` 识别，因此直接结束 run，不进入暂停（`server.ts:332-362,470-496`，`lib/rate-limit.ts`）。
4. `autoPlay`：设置 1–1440 分钟或 null；`arm` 用 `resource` 持有 timer，`autoPlayAt` 只在 paused && limit && !manual && autoPlay 时计算；到点先写 `pause.autoplay` entry（requestId 以 since 去重），再 `play(host,true)`；limit 仍在会重新 pause，因此不会超过 grace period（`server.ts:242-325`）。
5. 前台任务统计 `running()` 合并 gate 调用与 `harness.inspect()` 的 running task，跳过 `PASSIVE`（`ultimate.automation-scheduler` 的 sleep、`ultimate.automation-run` 的 deliver、subagent reporter、messages board 等），因此等待型后台任务不会让 “Paused · safe” 永远不出现（`server.ts:60-72,140-181`）。

**失败与恢复**

`onOpen` 在 server 恢复调度前先 `serial` 读 doc 并 `harness.hold()`，所以重启后仍保持暂停；`card` 用 requestId 补发崩溃丢失的 limit 卡；`limited` 的 commit 失败会释放 hold；Play 的 note 用 pause start 作为 requestId，重试不重复；`manual` 的暂停永不自动 Play；自动 Play 计时器在进程外（scheduler 被 hold）且打开时按 doc 重新 arm；若 rate limit 耗尽 Pi 的 3 次重试，run 失败并再次暂停，watchdog 不应再 re-prompt。

**关掉它会发生什么**

Pause/Play 按钮、`pause.state`、`pause.note`/`pause.limit` 卡片和 `PauseApi` 消失；宿主不再能被软暂停，`update` 的后台 fetch、`cloud` 备份、`keep-warm` 的定时工作都失去 `paused()` 保护而照常运行；Messages 的 `messages.gate` 没有 provider，triage 等 in-task 模型调用立刻执行；automations 的 scheduler 继续正常 fire。

**复刻要点**

- `hold()` 必须在发现 rate limit 的 commit publication 内同步调用，早于 Pi 的重试 timer；这是唯一能阻止重试撞限的窗口。
- 暂停按 run 的第一条 input + generation task 双重识别；只按 task 会在 generation 换手后漏记。
- 任何 scheduler 外的 timer（autoPlay、备份、update）都必须读 `PauseApi`，否则暂停不“safe”。
- gate 的 in-flight 计数要 bump pause doc 的 `work`，让 footer 在前台工作结束时刷新。

**证据**

- `extensions/pause/api.ts:4-9`；`refs.ts:20-82`
- `extensions/pause/server.ts:21-96,118-181,200-362,368-510`
- `extensions/pause/web.tsx:39-58,214-335,437-472`
- `extensions/messages/api.ts`（`Gate`/`messages.gate`）；`extensions/cloud/server.ts:73,203-204`；`extensions/update/server.ts:121-128`；`extensions/keep-warm/server.ts:147-204`

### 2.8 `review`

**职责与用户可见行为**

`review` 是项目本地 Git diff 审阅面：左文件列表、右 diff 栈，用 `@pierre/diffs` 渲染，支持 split/unified、`+N −M · K files`、最近范围选择、GitHub DiffsHub 链接；手机上文件列表变下拉且强制 unified。用户点行号或 gutter `+` 开 inline 评论，草稿持久化；底部 `N comments pending · + note · Discard · Send review (N)` 把评论作为一条 `review.comments` 输入发给 standing agent 或最近会话；接收方 transcript 显示 ReviewCard。

**导出与契约**

- surface `review`（title `Review`、order 60、`ReviewSurface` 懒加载 `surface.tsx`）、command `review.open`、overlay `ReviewLink`、entry `review.comments`、`provide(Review, (spec)=>()=>openReview(spec))`（`web.tsx:26-43`）。
- actions token `review`：`diff {spec,conversation?}`、`ranges`、`recipient {spec}`、`send {conversation,spec,comments,note?}`；`send` 在 `userActions`（`refs.ts:59-84`，`server.ts:160-219`）。
- 浏览器 API：`ui.tsx` 再导出 `openReview`、`ReviewTarget` 与四个 action/refs 类型（`ui.tsx:1-5`）。
- 依赖：`host.need(WorkspacesApi)`（读 worktree index、`SubmissionLanded`）、`host.need(SubagentsApi).standing('ultimate')`；提供 `workspaces.review` point（`server.ts:22,119-158`，`workspaces/landing.tsx:74`）。
- entry `ReviewCommentsEntry`（`defineEntry('review.comments')`）的数据是 `{spec,comments,note?}`（`server.ts:19`，`types.ts:4-14`）。
- events/reactors/API/settings：不定义事件/reactor/API；无 `api.ts`、无 settings key；`send` 后单独 commit 发 `UserInputEvent`。

**状态与持久化**

没有 doc 或文件。草稿在 durable UI state：`useExtensionUiState('spec')` 保存当前 spec（默认 `uncommitted`），`'layout'` 保存 split/unified；`draftsKey(spec,conversation)` 生成 `drafts:<conversation|project>:<safe>`，spec 非 `[A-Za-z0-9.]` 字符转 `_<hex>_`，超过 140 字符用 `sha256-<hex>`；每个草稿只存 `{id,file,side,start,end,text}`，发送时才从屏幕 diff 读 excerpt。`limits.drafts = 96 KiB`，整体 UI state 上限 256 KiB（`drafts.ts:12-44`，`comments.ts:7-17,57-63`）。

**UI 位置**

全屏 Review surface（order 60）；`/?review=<spec>` 进入并在地址栏保留 `?review=`，`&file=&line=&side=old` 滚动并标记行；`openReview(spec,at?)` 供代码调用；`ReviewLink` overlay 常驻；selector 的数据来自 `ranges`（uncommitted、live `ultimate/*` branches、最近 10 次 landing、15 个 commit）；transcript 的 ReviewCard 在用户侧，每条 `file:line` chip 可跳回 Review；landing card、Activity、root landed list、branch 行 “Review changes” 都通过 `workspaces.review` point 打开（`link.tsx:23-85`，`card.tsx:14-81`，`server.ts:46-107`，`sidebar/rows.tsx:323-331`）。

**关键流程**

1. `diff`：`reviewDiff(where(...), spec)` 先 `git rev-parse --show-toplevel`，`sides()` 把 spec 解析为 `uncommitted`（HEAD 或空树；`uncommitted:<id>` 在对应工作树执行）、`branch:<name>`（target 的 merge-base）、`<a>...<b>`（merge-base）或 `<sha>`（第一父或空树），每个 ref 都过 `git rev-parse --verify --end-of-options`；`plain()` 拒绝空、`-` 开头和空白/NUL（`diff.ts:24-85,262-283`）。
2. 取 `--name-status -z` 与 `--numstat -z`，再取 patch；按 `diff --git` 切块并合并 type change 的同名两段；单文件 > 400 KiB 标 `tooLarge`，总量 > 8 MiB 后续文件也标 `tooLarge` 并 `truncated`；git 输出超过 16 MiB buffer 时全部列文件不带 hunk（`diff.ts:9-15,87-200`）。
3. `uncommitted` 额外 `git ls-files --others --exclude-standard -z`，未跟踪文件逐个 `git diff --no-index`；symlink 用 `linkPatch` 生成一行 target，路径/目标不可安全写 patch 时标 `symlink`；type change 标 `typeChanged`（`diff.ts:202-259`）。
4. 评论：点击/拖选行号 → 本地 `Drafts`；`send` 时 `excerptFor(parsed.get(file),comment)` 从屏幕 diff 取 excerpt，调 `SendAction`；server `checkReview` 校验（最多 50 条、text ≤4000、excerpt ≤40 行/8 KiB），`conversation.submit` 用 `whenBusy:'steer'`，entry kind `review.comments`，然后单独 commit 发 `UserInputEvent {kind:'review',length,device}`（`surface.tsx:497-526`，`comments.ts:71-100`，`server.ts:183-218`）。
5. 发送成功后只移除本次发送的 draft id（期间新增的保留），展示 `Sent to #id`；失败显示 `Not sent: …` 但草稿仍在（`surface.tsx:501-545`）。

**失败与恢复**

未知 ref、非法 spec、以 `-` 开头的片段直接报错；仓库缺失时 `ranges` 的 branch/commit 查询 catch 为空，selector 仍可手输；diff 超限截断而非失败；草稿超 96 KiB 时 `useDrafts` 返回 false 并保留屏幕文本，server 拒写时 SDK 弹 “UI state not saved”；`send` 只接受已存在 conversation，失败保留草稿；`recipient` 对未知 ref/仓库错误回退到 primary agent（`server.ts:152-157`）。

**关掉它会发生什么**

Review surface、`review.open`、`review.comments` 卡片渲染与 `workspaces.review` provider 消失；landing/branch 行退回普通 DiffsHub 链接或隐藏 “Review changes”；`send` action 也不再存在，已存在的 `review.comments` 条目仍留在 transcript 中，但接收方不再有卡片渲染（推断：无 entry renderer 时按默认条目显示）。

**复刻要点**

- spec 是纯文本协议，所有 Git 调用必须 `--end-of-options` 且拒绝 `-` 开头，避免参数注入。
- 草稿与 excerpt 分离：草稿只存位置和文字，发送时从当前 diff 读上下文，才能跨 reload 保持小而准。
- 发送必须用 `whenBusy:'steer'` 并保留未发送的新草稿；这是“用户输入”语义。
- 转义 `code()` 的反引号/控制字符和 `fence()` 的 fence 长度，是 reviewText 不被文件名破坏的关键。

**证据**

- `extensions/review/web.tsx:26-43`；`refs.ts:5-84`；`types.ts:4-14`；`ui.tsx:1-5`
- `extensions/review/server.ts:19-219`；`diff.ts:9-15,24-85,150-283`
- `extensions/review/comments.ts:7-17,25-28,57-100,140-178`；`drafts.ts:12-44`
- `extensions/review/surface.tsx:479-545`；`link.tsx:23-85`；`card.tsx:14-81`

## 3. 跨扩展协作

- **plan ↔ tasks**：`tasks/web.tsx` 直接 import `TaskChip`/`useTaskOf`（`tasks/web.tsx:25`），在任务图会话行显示 plan task；`plan` 通过 `ConversationTask` point 把自己的 chip 提供给 sidebar、subagents 等（`plan/web.tsx:817`）。`plan` 的 isolate 行读 `workspaces` 的 `InfoAction`（`plan/web.tsx:106-111`）。
- **plan ↔ lineage**：`plan/server.ts` 用 `lineage` 的 `Branch` 文档判断 fork 起点，并在 `beforeInput` 重置未回答分支的计划（`server.ts:14,152-160`）。
- **todos ↔ messages/questions/subagents**：面板直接读 `MessagesDoc` 的 waiting 消息（`todos/panel.tsx:43`），用 `waiting()` 和 `messages:open` 事件（`panel.tsx:239`），并用 `StandingAction` 找 @ultimate（`panel.tsx:69`）。
- **phase ↔ classify ↔ sidebar**：`phase/server.ts` 通过 `host.want(ClassifyApi)` 调 classify；`phase/web.tsx` 提供 `ConversationPhase`，sidebar 的 `rows.tsx:120`、`root.tsx:129`、`ultimate.tsx:30,76`、`lander.tsx:14`、voice-live 使用该 point。
- **automations ↔ goal**：goal 用 `AutomationsApi` 创建/暂停/恢复 `Goal reminder · goal N`（`goal/reminder.ts:28-100`）；automations 关闭时 goal 仍运行但没有 reminder（`goal/server.ts:300-303`）。
- **automations ↔ dream/activity**：dream 通过 `AutomationsApi` 创建“Dream before compaction”上下文自动化并消费 `automations.fired`（`dream/before-compaction.ts:25`，`dream/server.ts:26`）；activity 读 `Escalated`（`activity/feed.tsx:15`）。
- **pause ↔ messages/cloud/update/keep-warm**：pause 实现 `messages.gate`，让 Messages 的 triage 模型调用在暂停时等待（`pause/server.ts:443-447`）；`cloud`/`update`/`keep-warm` 用 `host.want(PauseApi)` 跳过工作（`cloud/server.ts:73`，`update/server.ts:121-128`，`keep-warm/server.ts:147-204`）；pause 还提供 `ParkedRuns` 给 sidebar/system/transcript（`pause/web.tsx:447`）。
- **review ↔ workspaces/subagents**：review 读 `WorkspacesApi.doc` 的 worktree index 和 `SubmissionLanded`（`review/server.ts:22,71,130`），用 `SubagentsApi.standing('ultimate')` 作默认收件人，并提供 `workspaces.review` point 给 landing card、sidebar branch 行（`workspaces/landing.tsx:74`，`sidebar/rows.tsx:323`）。
- **tasks ↔ transcript**：`tasks` 提供 `RunStart` point，transcript 用它显示运行时钟（`web/src/app/transcript.tsx:1289-1291`）。

## 4. 复刻顺序建议与风险

**建议顺序**（每步先能独立观察，再叠下一层）：

1. `todos`：最小的 doc + tool + panel + per-input note，先验证 conversation scope、`Standing` 和 durable UI。
2. `phase`：只消费 `classify`，练习“后台 task + memo + point”，不碰写入型核心状态。
3. `plan`：最大的 conversation doc/tool/浮层；先把 `TaskIndex` 投影和 receipt 做对。
4. `tasks`：纯投影面板，依赖 plan 的 chip；可验证 task graph 事件与 `startedAt`。
5. `pause`：独立但关键；在 automations 之前做，后续调试可随时冻结宿主。
6. `automations`：最后再上，需 subagents、messages、durable scheduler、process group、event reactor 全部就位。
7. `goal`：严格依赖 automations 的 reminder 收敛。
8. `review`：与其余解耦，可在任意阶段并行；单独验证 Git 与草稿 UI state。

**风险**

- **doc 语义**：`plan` 的 `history:'rewindable'` + `fork:'asOf'`、`TaskIndex` 的 root/latest、`todos` 的 root/latest 都不能互换；fork 后分支若继承错误计划，第一请求就会看到别人的任务。所有跨会话索引必须和主文档同事务写。
- **重放安全**：plan 的 `Receipt` + `api.memo`、automations 的 `ultimate.automation-receipt` + `previousPid`、goal 的 `goal.deliver` requestId 是行为契约，不是优化；缺一个就可能重复建 task、重复拉脚本或重复发卡片。
- **调度与暂停竞态**：automations 的 `plan→sleep→fire` 与 `pause.hold()` 共用 scheduler；sleep 只应算被动等待，否则暂停永远不 “safe”；rate-limit hold 必须在 commit publication 内完成。
- **进程监督**：脚本是任意可执行文件；Windows 需 shebang + Job Object + start-time 校验，POSIX 需 process group；pid 文件 handshake、`previousPid`、`stopProcess` 只杀 owned runner 三件事缺一不可，否则会误杀或漏杀。
- **事件重放与顺序**：event trigger 的 `sinceEvent`、`prepareFires` 先读后写、`fromOwnRun` 快照、context 按 commit 顺序评估，都是为了防止重复 fire / 事务内扫描顺序错误；实现时不要先写 task 再 scan。
- **UI state 预算**：review 单 spec 草稿 96 KiB，全部 durable UI state 只有 256 KiB；plan 的 `plan.panel`/`plan.open`、review 的 `spec`/`layout`、automations 的 `expanded` 都要按 extension 命名空间存，不能把大对象塞进一个 key。
- **安全边界**：review 的 spec 必须拒绝 `-` 开头并统一 `--end-of-options`；automations 的 project manifest 只在项目被选为 local/trusted 时发现；脚本 secrets 只注入命名环境变量，记录不保存值；goal 不提供 secrets/force push 等用户保留权限。
- **README 与源码漂移**：automations README 的 supervisor dashboard 状态行在本快照找不到实现（`server/services.ts:1-10` 注明 core 不再报告 service），复刻时以代码为准；`plan`/`goal` 的 README 与实现基本一致，但仍应以导出名为准。
