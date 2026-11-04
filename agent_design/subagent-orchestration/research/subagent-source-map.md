# Ultimate 子 agent 编排机制：证据地图

- 基线：`3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（工作树 `dev/lxy`，仅新增 `agent_design/`）。
- 用途：为复刻 spec 提供 `path:line` 证据，不是最终文章。
- 标注：未标 `推断:` 的句子均为代码/文档事实；`推断:` 为由代码结构推出、但无直接实现语句的结论。
- 行号均取自当前文件（`extensions/subagents/server.ts` 共 1222 行）。
- 缩写：`server.ts` = `extensions/subagents/server.ts`；`workspaces.ts` = `extensions/workspaces/workspaces.ts`；`api.ts`（subagents 节）= `extensions/subagents/api.ts`；`types.d.ts` = `node_modules/@earendil-works/pi-durable/dist/types.d.ts`；其余首次出现给全路径，表格内沿用同一缩写。

## 1. 模块地图

| 文件                                  | 职责                                                                | 对外契约 / 调用方                                                                  |
| ------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `extensions/subagents/server.ts`      | 子 agent 工具、Reporter 任务、等待、恢复、提示段落、定义浏览        | `subagent` 工具（865-1221）；`SubagentsApi` 实现（608-659）；`Pin` 实现（595-607） |
| `extensions/subagents/api.ts`         | 导出 `Subagents`、`Standing`、`Profile` 文档与服务类型              | `SubagentsApi`：`residents`、`standing`、`createChild`（71-83）                    |
| `extensions/subagents/children.ts`    | 统一的子会话创建（定义→agent 配置、fork、元数据、Profile）          | `createChild`（46-85）、`started`（23-40）                                         |
| `extensions/subagents/refs.ts`        | 浏览器安全契约：`Started` 事件、`StandingDoc`、定义读写 action      | `Started`（76-83）；`StandingDoc`（86）                                            |
| `extensions/workspaces/workspaces.ts` | worktree 记录、准备、land、submit、discard、释放                    | `WorkspacesApi`（`api.ts:12-31`）                                                  |
| `extensions/workspaces/server.ts`     | 注册服务、`workspace` 工具、`workspace_workflow` 段落、工具前 block | `server.ts:171-178、250-257、259-298、328-340`                                     |
| `extensions/workspaces/setup.ts`      | 运行 `isolates.worktree.setup`                                      | `setup()`（15-40）                                                                 |
| `extensions/lineage/server.ts`        | 分支 fork、树根、tally、记忆、通知、结论                            | `LineageApi.branch`（`api.ts:39-65`）；`startBranch`（867-884）                    |
| `extensions/messages/server.ts`       | `message` 工具、`branch` 工具、Messages 服务与扩展接线              | `MessagesApi`（91-144）；`message` 工具（188-269）                                 |
| `extensions/messages/delivery.ts`     | `board.delivery` 任务的 deliver/reply 两阶段                        | `tasks: [delivery(host), route(host)]`（`server.ts:147`）                          |
| `extensions/messages/branch.ts`       | 启动 lineage 分支并发首条消息                                       | 64-103                                                                             |
| `extensions/plan/refs.ts`             | 计划台账与 child→task 根索引                                        | `TaskIndexDoc`（41-42）                                                            |
| `extensions/tasks/*`                  | 任务图 UI 数据与 `started` 时间                                     | `StartedAction`（`refs.ts:4-6`）、`started` 实现（`server.ts:12-20`）              |
| `extensions/system/*`                 | 事件+调用轨迹、lanes/hierarchy/spawn 推断                           | `lanes`（README 9-11）                                                             |
| `extensions/watchdog/server.ts`       | 供应商错误重试与 `given-up` 标记                                    | `watchdog.failure`（192-274）                                                      |
| `extensions/automations/scheduler.ts` | automation run 复用 `createChild`                                   | 62-75                                                                              |
| `lib/agents.ts`                       | 定义发现、overlay 合并、`definitionAgent`                           | 115-160、300-317、331-420                                                          |
| `server/api.ts`                       | conversations/tasks SSE、会话 abort                                 | 157-265、266-346、578-597                                                          |

## 2. 核心数据结构

### 2.1 `Subagents` 文档（`extensions/subagents/api.ts:15-47`）

| 字段      | 类型                                                                                           | 解释                                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents`  | `Record<string, {conversationId, agent, background, reported}>`                                | 键是子会话 id 的字符串；`agent` 是定义名；`background` 记录 start 时的等待风格，决定后续 message 是否前台等待（1046-1048）；`reported` 是已投递过的 answer entry id 列表（157-159、1207） |
| `actions` | `Record<string, {conversationId, reporter, answer?, status?}>`                                 | 键是**工具 callId**（981、1039），因此一次 start/message 一条；`reporter` 是该次投递的 durable task id；`answer` 是子会话的 assistant entry；`status` 见 2.2                              |
| 文档属性  | `scope: 'conversation'`、`history: 'latest'`、`fork: 'initial'`、`checkpointWhen: () => false` | 索引属于父会话；fork 时子索引清空（README 68）                                                                                                                                            |

### 2.2 action `status` 状态词（`api.ts:31-36`）

| 值            | 含义                                  | 写入点                                  |
| ------------- | ------------------------------------- | --------------------------------------- |
| 未设置        | 正在投递（deliver 阶段）              | 初始（117-120）                         |
| `done`        | 子会话给出了答案                      | 155-156、734-739                        |
| `unanswered`  | 被**父**停止（reporter 被 abort）     | 259-267                                 |
| `interrupted` | 在**子会话自己的**会话里被停止        | 186-188                                 |
| `failed`      | 供应商错误（watchdog 持有）或投递异常 | 175-181、191-199                        |
| `given-up`    | watchdog 已报告、不再重试（终态）     | `extensions/watchdog/server.ts:259-267` |

### 2.3 `Standing`（`api.ts:50-58`）与 `Profile`（`api.ts:61-69`）

- `Standing`：`{ [name]: ConversationId }`，写在 `ROOT_CONVERSATION_ID`；`checkpointWhen` 恒 false。
- `Profile`：`{ definition?: string }`，子会话（含 automation run）与常驻 agent 记录“我按哪个定义配置”；`Pin` 优先读它，读不到再用 `host.metadata.label`（595-607）。
- `summaries: false`：`createChild` 会为该会话关闭自动摘要（`children.ts:82-83`）；standing 无论如何都关闭（651）。

### 2.4 `Started` 事件（`extensions/subagents/refs.ts:76-83`）

`{ id, agent, model?, thinking?, parent?, kind: 'child'|'standing'|'branch' }`；`parent` 取 `conversation.owner?.conversationId ?? conversation.parent?.conversationId`（`children.ts:31`）；`model` 为 `provider/modelId`（`children.ts:36`）。child 由 `started(..., 'child')` 发出（1010），standing 仅新建时发出（655），branch 由 lineage 发出（`lineage/server.ts:976-983`）。

### 2.5 Task 记录（Pi Durable，`node_modules/@earendil-works/pi-durable/dist/types.d.ts:587-627`）

| 字段                                         | 解释                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `id` / `conversationId` / `kind` / `version` | 任务身份与定义版本                                                                |
| `input`                                      | 原始输入，Reporter 的 `{conversationId,text,steer,sourceEntry?,answer?}` 即存于此 |
| `owner?`                                     | 父任务；子会话的 owner 常是 Anchor（995）                                         |
| `background`                                 | **被排除在普通 idle 等待、会话 abort 与级联之外**（602-603）                      |
| `state.status`                               | `pending/running/waiting/sleeping/completing/terminal`（547-585）                 |
| `state.checkpoint`                           | Reporter 用它保存 `phase:'report'`、`report`、`answer`（163-170）                 |
| `startedAt` / `endedAt` / `restarts`         | UI 与崩溃循环保护用                                                               |

Anchor 任务：`initial: () => ({phase:'done'})`，`done` 阶段立即 terminal（66-79），只作为“独立后台所有者”存在。

### 2.6 Inbox（`node_modules/@earendil-works/pi-durable/dist/harness/inbox.d.ts:4-20`）

`InboxState = { items: InboxItem[] }`；`InboxItem = {id, mode:'steer'|'followUp', content, entry?} | {id, mode:'write', entry}`。本仓库用它做三件事：等待让位（`server.ts:303-309`）、忙碌判定（`workspaces.ts:437-441`）、工具回执后清队列（`server.ts:795-799`）。

### 2.7 Submission（同前 `types.d.ts:431-493`）

`{id, conversationId, requestId?, type:'input'|'write', status:'queued'|'placed'|'done'|'unanswered', entry?, answer?, reason?}`。Reporter 的幂等、恢复扫描、stop 撤回都建立在 `requestId` 上。

## 3. 生命周期（精确步骤）

### 3.1 start

1. 工具入口先查 memo `result`，有则直接返回（893-896）；工具声明 `replay:'safe'`（869-870）。
2. 读父会话 `Subagents` 快照（897-900）；`start` 跳过“必须是本会话 child”的守卫（912-916）。
3. 校验 `task` 非空（927-931）；取父 agent（932）；用 `index.actions[api.callId]` 判断是否重放（933）。
4. 仅在全新 start 时 `discoverAgents`（934-944）；未知定义报错并列出可选名（945-949）；定义 `tools` 必须是父工具子集（950-955）。
5. 计算 `isolated`：`args.isolate ?? definition.isolate ?? 'none'`（956-957）；若父工作区脏，附警告（958-962）。
6. 从 task input 取调用方 assistant entry（963-966）；`fork: true` 时 forkAt=该 assistant 的**前一个** entry（967-977）。
7. `model = conversations.summaryModel()`（978），供 spawn 摘要刷新。
8. **一个事务内完成全部创建（979-1041）**：
   - 幂等：`state.actions[api.callId]` 已存在则原样返回（981）；
   - `requestSummary(..., reason:'spawn', answer: assistant, agent, task)`（984-989）；
   - 创建后台 Anchor（990-993）；
   - `createChild`：owner=Anchor、定义、`excludeTools/excludeExtensions`（未显式列 `subagent` 则去掉）、可选 fork、cwd（994-1008）；
   - `started(...,'child')`（1010）；写 `state.agents[child.id]`（1011-1016）；
   - 隔离区：`workspaces.create` + 覆盖 instructions 追加隔离说明（1017-1026）；
   - 创建 Reporter，`text`、`steer: args.steer !== false`、`sourceEntry: assistant`（1028-1037）；
   - 写 `state.actions[api.callId] = {conversationId, reporter}`（1038-1040）。
9. 事务后读 workspace 生成 `Isolate:/Branch:` 文案（1042-1045），解析 background（1046-1048），`api.details`（1049）。
10. background 立即返回 id（1050-1054）。
11. foreground 调 `waitInterruptibly(..., idle=false)`（1055-1062）；让位则返回 `Wait yielded…` + `details.yielded`（1063-1067）。
12. 否则读回 action（1068-1070）、answer entry（1071-1074），返回 `replyText` + `details.answerId`（1075-1087）。

### 3.2 message

复用 3.1 的 1-3 与 8-12，但：`text=args.text`（927）；**不解析定义**（`definitions` 仅 start 且非重放时获取，934-944）；`conversationId=args.id`（982）；Reporter 仍新建并默认 `steer:true`（1028-1037）；是否前台等待看 `index.agents[...].background`（1046-1048），而不是本次 `args.background`。

### 3.3 wait

1. `id` 守卫（912-916）；`details`（1089-1091）。
2. 收集该 child 的全部 reporter（1188-1190）。
3. `waitInterruptibly(..., idle=true)`（1191）：额外要求子会话没有 `LiveDoc.run`（312）。
4. 让位则返回“Wait yielded…”（1192-1195）。
5. 完成时扫该会话全部 entry，取**最新** AssistantEntry（1196-1204）；把它加入 `reported`（1206-1207）。
6. 返回 `replyText` + `answerId`（1210-1217）。

### 3.4 stop

1. 快照 `LiveDoc`（当前 run 的 taskId/inputs）与 `Subagents`（1094-1095）。
2. 扫父会话全部 `watchdog.failure` 任务，筛出 `input.conversation===id`，记下 `{task, request:'watchdog-retry:<failedTask>'}`（1096-1116）。
3. 把 `{run, inputs, watchdogs, reporters}` 写进 `api.memo('stopTarget')`（1117-1128）——重放时只动这批身份。
4. 依次 abort 并等待所有 reporter 与 watchdog 任务（1129-1137）；reporter 的 abort 阶段把 action 置 `unanswered`（259-267）。
5. 按 requestId 查 `subagent:<reporter>` 与 `watchdog-retry:<failedTask>` 的 submission，`queued` 的撤回（1138-1148）。
6. 循环 abort 当前 run，直到 run 与捕获的 taskId/inputs 不再相交（1149-1163）。
7. 若 child 有 ready 的 workspace，用 `git diff --cached/--diff/--ls-files -z` 汇总未提交文件（1165-1182）。
8. 返回 `Stopped <id>.` 与 `Left uncommitted in <path>: …`；**不提交、不删除**（1183-1186）。

### 3.5 list

读 `index.agents`，为每行补 `workspace` 与 `busy`（`LiveDoc.run !== undefined`），去掉 `reported` 后 JSON 返回（901-911）。

### 3.6 land

1. 工具层：`land/discard` 用 `api.memo('workspace-operation')` 防重放半途（917-925）。
2. `workspaces.land(id)`：无记录报错（650）；`serial(source)` 串行化（651）；`idle(id)`（654）；记录必须 `ready`（655）；worktree 必须干净（656-657）；源 checkout 必须停在 target 分支（658-661）；worktree HEAD 必须是记录的分支（662-663）。
3. 取 tip/head（664-665）；若 tip 已是 head 祖先 → `Nothing to land.`（666-676）；否则要求 head 是 tip 祖先，即纯快进，否则报“Target moved or diverged”（677-686）。
4. 计算 commits/files/needsRestart（687-700）；`git merge --ff-only`（701）；组装结果（702-709）。
5. 在根 `Workspaces` 文档记 `items[id].landed = tip`（711-713）。**从不 rebase、从不 push**（README 88）。

### 3.7 discard

`idle(id)`（974）；无记录报错（976）；`preparing` 拒绝（977）；若未 removed，`git worktree remove <path>`（979-980），记录 `state='removed'`（981-983），**保留分支**（985）。代码未显式检查脏工作区；`git worktree remove` 不带 `--force`（980）。`推断:` 脏/未跟踪文件由 Git 自身拒绝，故 README 的“clean”由 Git 保证而非本函数。

### 3.8 事务 / memo / requestId 位置汇总

| 类别      | 位置                          | 作用                                                                                             |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| commit    | `server.ts:979-1041`          | start：child、Anchor、reporter、action 一次落盘，隔离时还有 workspace；message：reporter、action |
| commit    | `server.ts:148-190`           | deliver 结算：action 状态、answer、`reported`、checkpoint                                        |
| commit    | `server.ts:228-251`           | report 向父提交（`whenBusy:'steer'`）                                                            |
| commit    | `server.ts:711-713`           | land 记录 `landed=tip`                                                                           |
| memo      | `server.ts:893-896`           | 工具结果，重放直接返回                                                                           |
| memo      | `server.ts:918-920`           | `land/discard` 的 `workspace-operation` 半途保护                                                 |
| memo      | `server.ts:1117-1128`         | `stopTarget`：run/inputs/watchdogs/reporters                                                     |
| requestId | `server.ts:143`               | `subagent:<reporterTaskId>`，父→child 输入                                                       |
| requestId | `server.ts:247-248`           | `subagent-answer:<answer>` / `subagent-report:<task>`，child→父报告                              |
| requestId | `watchdog/server.ts:217、246` | `watchdog-retry:<failedTask>` / `watchdog-report:<failedTask>`                                   |

## 4. Reporter 投递

### 4.1 状态机

| 起点      | 条件                                   | 结果                                                                                  | 证据             |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| `deliver` | 初始 `answer===undefined`              | 给 child 提交 input                                                                   | 117-120、127-147 |
| `deliver` | `done` 且有新 answer                   | `action.status=done`，push `reported`，checkpoint→`report`，report=带模型名的答案文本 | 155-170          |
| `deliver` | answer 已在 `reported`                 | checkpoint→`report`，**无 report 文本**                                               | 157-158          |
| `deliver` | `unanswered` 且 `model_error/no_model` | `action.status=failed`，无 report（交 watchdog）                                      | 175-181          |
| `deliver` | `unanswered` 且非 aborted              | 状态不改，report=失败原因                                                             | 182-185          |
| `deliver` | `unanswered` 且 aborted                | `action.status=interrupted`，静默                                                     | 186-189          |
| `deliver` | 抛异常且非父级 abort                   | `action.status=failed`，report=错误消息                                               | 191-208          |
| `report`  | 有 report                              | 向父提交 `subagents.report`，`whenBusy:'steer'`                                       | 210-251          |
| `report`  | 无 report                              | 直接 terminal，不提交                                                                 | 212、253-256     |
| 任意      | task abort                             | `action.status=unanswered`，terminal                                                  | 259-267          |

### 4.2 去重键

| 键                                                             | 作用域                             | 位置                          |
| -------------------------------------------------------------- | ---------------------------------- | ----------------------------- |
| `subagent:<reporterTaskId>`                                    | 父→child 的投递输入                | `server.ts:143`               |
| `subagent-answer:<answerEntryId>`                              | 父会话的报告输入（成功答案）       | 247-248、793                  |
| `subagent-report:<reporterTaskId>`                             | 父会话的报告输入（失败报告）       | 247-248                       |
| `subagent-tool-delivered`                                      | 合成 receipt：工具已把答案交给模型 | 800-814                       |
| `actions[callId]`                                              | 一次工具调用的 child/action 幂等   | 981、1039                     |
| `agents[].reported`                                            | 已投递 answer 集合                 | 157-159、676、733、1207       |
| `watchdog-retry:<failedTask>` / `watchdog-report:<failedTask>` | watchdog 重试/报告                 | `watchdog/server.ts:217、246` |

### 4.3 跨重启恢复（`server.ts:663-767`）

- 只处理 `type==='input'`、`status==='done'`、且 requestId **不以** `subagent:` 开头的 submission（664-669）。
- 由 `child.owner.conversationId` 找父（671-673）；父索引里没有该 child 或 answer 已报告则退出（675-676）。
- 识别“父发来的一次性 message / 父对子提问的 reply”（684-689），以及“同一回答已被待定 reporter 处理”（690-697），避免重复路由。
- 若最后一条 action 不是 `unanswered/failed/given-up/interrupted` 则退出；并校验失败 submission 的顺序（698-719）。
- 新建一个 `answer` 已设置的 Reporter（初始即 `report` 阶段），同事务 push `reported` 并写 `actions['subagent-answer:<answer>']`（720-739）。
- `onOpen` 先扫历史 done submission（761-766），并订阅 commit 流（751-760）；`recovery` Promise 串行化（754-758），`onClose` 等待它（742-746）。

### 4.4 崩溃点

1. **commit 之前崩**（979-1041 未提交）：无 child、无 reporter、无 action；工具重放会新建一个 child。无残留。
2. **commit 之后、deliver 提交 input 之前崩**：child/reporter/action 均已持久化；重放 deliver 用同一 `subagent:<taskId>` 提交一次（143）。
3. **input 已 placed、settle commit 之前崩**：deliver 重跑；`推断:` `submit` 按 requestId 返回同一 submission，`reported` 的 push 与 checkpoint 同事务，重复被 157-158 拦住。
4. **checkpoint 已写 report、report 阶段未跑时崩**：任务从 `report` 恢复；父输入按 `subagent-answer:<answer>` 去重（247-248）。
5. **父输入已提交、terminal 之前崩**：report 重跑；`推断:` 同一 requestId 返回既有 submission，不会二次投递，随后 terminal（253-256）。
6. **子会话已产出 answer、任何 reporter 动作之前崩**：`onOpen` 扫描到 done submission，新建 answer reporter（723-732）；原 reporter 若也恢复，会因 `reported` 命中而静默（157-158、676）。
7. **stop 中途崩**：`stopTarget` memo 已保存 run/inputs/watchdogs/reporters（1117-1128），重放只 abort 这批身份；子会话后续重用不受影响。
8. **land 的快进已执行、`landed` 记录前崩**：重放时 tip 已是 head 祖先，返回 `Nothing to land.`，但仍写 `landed=tip`（666-676、711-713）。`推断:` 结果文案会退化为“无事可做”，但分支状态正确。
9. **workspace 准备中被杀**：`Preparation` 任务与新输入都会重跑 setup；setup 命令必须可重复（`workspaces/setup.ts:15-40`、README 19）。
10. **父会话被 Web Stop**：父的非后台任务被 abort（`server/api.ts:583-588`），reporter 是 conversation-owned + background（1036），不会被级联；其后续 report 仍会 steer 父（246）。

## 5. 并发与竞态

### 5.1 steer vs follow-up

- Reporter 向 child 提交时 `whenBusy: steer ? 'steer' : 'followUp'`（142）；默认 `args.steer !== false`，即默认 steer（1033）；显式 `steer:false` 才是 follow-up。
- Pi 的边界规则：postTools 放 steer，final 放 follow-up（`inbox.d.ts:44-51`），所以 steer 在本轮工具边界插入，follow-up 等本轮结束。
- 向父的报告恒为 `whenBusy:'steer'`（246），所以子答案能打断父的等待/当前轮。
- `wait` 只被 `mode==='steer'` 的 inbox 项唤醒（303-309），follow-up 不唤醒；这正对应 README 6“Follow-ups do not wake waits”。

### 5.2 wait yield

`waitInterruptibly` 先 `commit(tx.doc(InboxDoc))` 确保 inbox 文档存在（294-296），再 `withCancel` 建局部取消域（297），watch inbox（298-309）。`ready()` 要求：若 `idle` 则 child 无 run（312）；每个 reporter 要么 terminal，要么处于 `report` 阶段（313-324）。`completion()` 等 reporter + child idle（326-329）。`Promise.race` 中若 steer 先到，先 `ready()` 复查：已就绪则仍取答案，否则返回 false 让位（331-342）。`finally` 必定取消 watcher（343-346）。

### 5.3 stop 与 reporter

stop 先 abort reporter（1131-1137），所以 reporter 的 abort 处理器把 action 置 `unanswered`（259-267），父看不到“失败”卡片——这是“父 stop 静默”的机制。随后才 abort 子会话的 submission 与 run（1138-1163）。若 reporter 已 terminal（答案已投递），stop 不会回滚 action。

### 5.4 父停止

Web/API 的会话 abort 只 abort `conversationId===会话 && !owner && !background` 的任务（`server/api.ts:583-588`）。Anchor 是 conversation-owned 且 `background:true`（990-993），child 的 owner 是 Anchor（995），且 Pi 明确把 background 任务排除在会话 abort 与级联之外（`types.d.ts:602-603`）。`推断:` 因此父停止只终止父的前台工具调用，child 继续运行；其 reporter 也存活，答案会在父下次运行时以 steer 送达。父的 tool result 会丢失，但答案不会丢。

### 5.5 子停止

子会话自己的 abort 让 reporter 的 `settled` 变成 `unanswered/aborted`，deliver 走 186-189 置 `interrupted` 并静默；之后若有人（用户 `continue`、父 message）让子会话产出新答案，`recover` 会把最后 action 视为 interrupted 并补投（698-719、723-739）。这与 README 12 一致。

### 5.6 嵌套

`Subagents` 是 conversation-scoped（`api.ts:43`），每个子会话有自己的索引；只有当定义显式列 `subagent` 时才保留工具与扩展（1002-1003、README 32），因此嵌套是“每个父各自记账”，没有全局树。

## 6. 隔离区

| 主题          | 事实                                                                                                   | 证据                                |
| ------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 记录          | `{path, branch, base, source, target, state:'preparing'/'ready'/'failed'/'removed', error?, landed?}`  | `workspaces/types.ts:3-12`          |
| 路径          | `<home>/worktrees/<conversationId>`                                                                    | `workspaces.ts:938`                 |
| 分支          | `ultimate/<sha256(home) 前 6 位>-<id>`                                                                 | `workspaces.ts:939`                 |
| base          | 创建时源 checkout 的 `HEAD`                                                                            | `workspaces.ts:940`                 |
| 创建          | 先 `isolatable(cwd)`；同会话只允许一个；写记录、configure cwd、起 `Preparation` 任务                   | `workspaces.ts:925-952`             |
| 子 agent 指令 | 在定义 instructions 后追加“只在 path/branch 工作、提交、不 push”                                       | `subagents/server.ts:1017-1026`     |
| setup         | 读 `isolates.worktree.setup`；宿主 shell；`ULTIMATE_SOURCE`；120s 超时；stdin 关闭                     | `workspaces/setup.ts:15-40`         |
| 嵌套          | 按 `workspace.path === record.source` 找父；先 ready 父，父失败则抛错                                  | `workspaces.ts:813-821、886-893`    |
| 重建          | removed/缺失时重建；已有未合并分支则保留分支 tip 为新 base                                             | `workspaces.ts:801-899`             |
| land 前置     | idle（无 run、无 queued input）、`ready`、worktree 干净、源在 target 分支、worktree 在记录分支、可快进 | `workspaces.ts:437-441、648-686`    |
| discard 前置  | idle、非 preparing；删除 worktree，记录 removed；保留分支                                              | `workspaces.ts:973-986`             |
| 非沙箱        | 仅 cwd 隔离，绝对路径仍可触达其他 checkout                                                             | `extensions/subagents/README.md:90` |

## 7. 分支 / 常驻 / automation / review team 与 child 的复用与差异

| 维度         | subagent child                           | lineage branch                                                                             | standing agent                     | automation run                                      | review team                                                      |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| 创建入口     | `subagent start`（979-1041）             | `messages.branch` → `LineageApi.branch`（`branch.ts:64-77`；`lineage/server.ts:867-1011`） | `SubagentsApi.standing`（617-658） | `createChild` via scheduler（`scheduler.ts:62-75`） | reviewer 定义内再起普通 `subagent`（`agents/reviewer.md:11-16`） |
| 所有权       | child owner = Anchor task（995）         | ownerless（`lineage/server.ts:926`）                                                       | ownerless（643）                   | owner = run task（63）                              | 同 child                                                         |
| fork         | 可选 `fork:true`（967-1006）             | 总是 fork 源（926）                                                                        | 不 fork（新建，643）               | 不 fork（`createChild` 无 fork）                    | 不 fork                                                          |
| 定义记录     | `Profile.definition`（`children.ts:81`） | 无 Profile；`metadata.label='coordinator'`（`branch.ts:85`）                               | `Profile.definition`（653）        | `Profile.definition`（若给了 profile）              | 同 child                                                         |
| 索引         | 父 `Subagents.agents`（1011-1016）       | 无                                                                                         | 根 `Standing`（645）               | 父 `Subagents` **无**记录                           | 父 `Subagents` 有                                                |
| 首次投递     | Reporter（1028-1037）                    | Messages `board.message` reply:true（`branch.ts:90-103`）                                  | 无                                 | run task 自己 await（`scheduler.ts:96+`）           | reviewer lead 汇总                                               |
| 后续答案路由 | Reporter + recover（663-741）            | `route` 任务（`messages/README.md:129-139`）                                               | 无                                 | run task                                            | reviewer lead 的最终答案                                         |
| 工作区       | 可选 `isolate`（956-957）                | 默认 isolated（`branch.ts:69`；`lineage/server.ts:943`）                                   | cwd=项目根，无 workspace（648）    | 无 workspace；cwd 沿用 run 会话（72）               | 取决于 reviewer 定义（默认无）                                   |
| Started kind | `child`（1010）                          | `branch`（976-983）                                                                        | `standing`（655）                  | `child`（`children.ts:28`）                         | `child`                                                          |
| 生命周期     | 父 stop 不影响                           | 顶层，独立                                                                                 | 常驻，定义消失则退休（561-591）    | abort run task 级联会话（README 42）                | 同 child                                                         |

补充关系：

- 树的根是 `lineage.roots`（`lineage/api.ts:13-21`，初始 `[1]`）；`rootOf` 沿 owner（subagent）与 fork source（branch）向上找（`lineage/server.ts:225-234`）。
- branch 是 ownerless 的 fork（`lineage/server.ts:926`），不在 `Subagents` 索引里，也永远不是 subagent（`AGENTS.md:25`；`lineage/README.md:9-10`）；它的首条消息由 Messages 以 reply:true 投递（`messages/branch.ts:90-103`）。
- standing 也是 ownerless、不 fork（`server.ts:643`），因此不属于任何 lineage 树（`lineage/README.md:191-193` 说明 `branchOf` 对根、owned 会话与树外会话返回 undefined）。

## 8. 失败矩阵

| 原因                                                     | 检测点                       | Reporter 行为              | 父可见文案                                                                                                | 恢复动作                                                |
| -------------------------------------------------------- | ---------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 未知定义                                                 | 946-949                      | 未创建                     | 工具错误 “Unknown agent…”                                                                                 | 传有效名                                                |
| 定义工具超出父工具                                       | 950-955                      | 未创建                     | 工具错误 “Definition tools must be a subset…”                                                             | 改定义                                                  |
| 供应商 `model_error/no_model`                            | 175-181                      | 置 `failed`，静默          | 暂无；watchdog 卡片                                                                                       | watchdog 60s 后重试一次；成功后 recover 投递（699-719） |
| watchdog 放弃                                            | `watchdog/server.ts:259-267` | 置 `given-up`              | `watchdog.failure` 卡片（error/last step）                                                                | 人工 message 子会话                                     |
| 子轮 `done` 但无文本 / `stopReason` 为 `aborted`/`error` | 84-97、155-170               | `reportText` 失败文本      | `[subagent # failed: ended its turn without an answer]`；前台 `Subagent # ended… Message it to continue.` | 手动 message                                            |
| 子轮 `unanswered` 且 `reason==='aborted'`                | 186-188                      | 置 `interrupted`，静默     | 无                                                                                                        | 下次输入由 recover 补投                                 |
| 父 Stop                                                  | 259-267                      | 置 `unanswered`，静默      | 无                                                                                                        | 父下次运行可 message/wait                               |
| 投递抛异常                                               | 191-208                      | 置 `failed` + report       | `Failed: <message>`                                                                                       | 检查子会话后重发                                        |
| workspace setup 失败                                     | `workspaces.ts:784-799`      | 子工具被 block，答案可解释 | 子答案文本                                                                                                | 修因后下一次工具调用自动重试                            |
| land 脏/分叉                                             | `workspaces.ts:656-686`      | 工具错误                   | 工具结果错误文本                                                                                          | 子会话提交或合并 target 后重试                          |
| discard 时忙                                             | 437-441、973-977             | 工具错误                   | 错误文本                                                                                                  | 等 idle                                                 |
| 任务 crash-loop                                          | `tasks/README.md:3`          | Pi 置 parked               | Tasks 面板计数 + Retry                                                                                    | 用户 `retry {id}`                                       |

## 9. UI 可观测性

### 9.1 现有字段能重建什么

| 数据源              | 可见内容                                                     | 证据                                               |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `Subagents` 文档    | child 列表、定义名、background、每次 action 的 status/answer | `api.ts:15-47`；`list`（901-911）                  |
| `metadata`          | label（定义名/label）、title（任务摘要）                     | `children.ts:76-80`                                |
| `LiveDoc.run`       | 仅“当前是否在跑”与 run 的 taskId/inputs                      | 906-907、1094                                      |
| `Workspaces` 文档   | path/branch/base/state/landed、队列与结果                    | `types.ts:3-12、98-119`                            |
| `plan.tasks`        | child → `{coordinator, epic, key, title, status}`            | `plan/refs.ts:31-42`                               |
| `subagents.started` | id/agent/model/thinking/parent/kind                          | `refs.ts:76-83`                                    |
| `tasks` SSE         | 任务树、owner、background、status、startedAt                 | `server/api.ts:157、231、307`；`tasks/README.md:5` |
| `system lanes`      | 调用轨迹、lanes、父链、spawn 推断                            | `system/README.md:9-11`                            |

### 9.2 缺口

1. **spawn 调用身份**：`Started` 没有 `callId/entryId`，System 只能从 event context 的 `parentCall` 推断，否则取父最后一次 `subagent/branch/message` 调用（`system/README.md:10`）。
2. **action 时间线**：`status` 是单值，无 `at`、无重试次数、无状态历史（`api.ts:25-37`）。
3. **等待/让位事件**：`details.yielded` 只在工具结果里，未持久化成可查询记录（1063-1067）。
4. **待投递队列**：Inbox 只保存尚未放置的输入，交付即移出；收件会话的 composer 能显示自己的待处理行（`extensions/subagents/README.md:46-48`），但没有跨 child 的聚合或历史视图（`inbox.d.ts:4-20`）。
5. **Reporter 阶段**：UI 只拿到 reporter taskId；`tasks` 图有任务状态，但没有把 `phase/checkpoint` 映射成投递语义（1028-1037）。
6. **失败原因**：`failed/unanswered` 不带 error/reason 字段；原因只在 reporter checkpoint 或 watchdog 卡片里（175-208）。
7. **token/成本**：`Subagents` 不记录 usage，无法按 child 聚合（`api.ts:15-47`）。
8. **工具调用**：只有被展示会话的 `pi.live`（`tasks/README.md:5`），没有按 child 的调用列表接口。
9. **模型/思考变更史**：`Profile` 只存定义名；`Started` 只是创建时快照（`refs.ts:76-83`）。
10. **分支的 agent 名**：branch 的 `Started.agent` 固定为 `'branch'`（`lineage/server.ts:978`），定义名只在 `metadata.label='coordinator'`（`branch.ts:85`），单看事件无法还原分支用哪个定义。
11. **隔离区与计划关联**：Workspaces 与 plan.tasks 各自成表，没有统一的 child 行。

### 9.3 建议新增的只读视图模型

| 视图                  | 字段                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SubagentRow`         | `conversationId, parentId, kind, agent, label, title, model?, thinking?, phase: starting/running/waiting/idle/terminal, startedAt, endedAt?, spawn:{callId, entryId, at}, workspace?, plan?, reporter?` |
| `SubagentActionRow`   | `callId, action, targetId, status, at, reporterTaskId, requestId, answerId?, error?`                                                                                                                    |
| `SubagentQueueRow`    | `conversationId, itemId, mode: steer/followUp/write, sender, text, queuedAt`                                                                                                                            |
| `SubagentDeliveryRow` | `reporterTaskId, childId, parentId, phase: deliver/report, answer?, deliveredAt?, dedupeKey`                                                                                                            |
| `SubagentLane`        | `conversationId, parentId, run:{start,end?,ok,calls[]}, messages[]`（可直接复用 `system.lanes` 的契约）                                                                                                 |

## 10. 复刻难点 TOP 10

| #   | 难点                           | 错误做法                               | 正确做法                                                                                              | 验证方法                                                                   |
| --- | ------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | start 的原子性                 | 先建 child、再建 reporter、再写索引    | 单事务写 Anchor+child+workspace+reporter+action（979-1041）                                           | 在事务前后杀进程；同一 callId 重放只产生一个 child                         |
| 2   | 前台只是等待风格               | 让工具任务拥有 child，父停即子停       | child 归后台 Anchor（990-996）；`background` 排除会话 abort（`types.d.ts:602-603`）                   | 父 Stop 后 child 仍跑，父下次输入收到 report                               |
| 3   | 答案只投一次                   | 在工具调用里直接 await 并写父消息      | durable Reporter + requestId + `reported` + 恢复扫描（143、247-248、663-741）                         | 答案产生后杀进程重启，父输入恰好一条                                       |
| 4   | 失败分类                       | 只有 `failed`                          | 区分 `failed/given-up/interrupted/unanswered`（`api.ts:31-36`）                                       | 分别制造供应商错误、watchdog 放弃、子 Stop、父 Stop                        |
| 5   | wait 让位竞态                  | 简单 `await`，steer 丢失或误返回旧答案 | `Promise.race` + `ready()` 复查 + `finally` 取消 watcher（331-346）                                   | 等待中向父 steer，确认返回 `yielded` 且 child 继续                         |
| 6   | stop 的身份捕获                | abort 时重新读 live run                | `memo('stopTarget')` 捕获 run/inputs/watchdogs/reporters（1117-1128）                                 | stop 后让 child 重新跑，再重放 stop，确认不误杀新 run                      |
| 7   | 工具回执与报告去重             | 认为“工具已返回”就等于模型已看到       | `afterTools` 用 `details.answerId/subagentAnswers` 写 `subagent-tool-delivered` 并清 inbox（772-818） | codemode 批量答案后检查父 inbox 为空、无重复报告                           |
| 8   | 隔离区不是沙箱                 | 假设 chroot/容器；忽略嵌套             | cwd 隔离、嵌套先 ready 父、land 只快进（`workspaces.ts:801-899、648-716`）                            | 嵌套 worktree 创建 + 脏工作区 land 被拒                                    |
| 9   | 定义覆盖语义                   | 同名文件后者整体替换                   | 后者覆盖设置；`addTools` 是 overlay，追加 body 与工具（`lib/agents.ts:300-317、349-420`）             | 写一个 `addTools: []` overlay 只改 model，确认 instructions 仍来自 base    |
| 10  | 常驻/automation 复用同一创建器 | 各自复制一套配置逻辑                   | 统一走 `createChild` + `definitionAgent`（`children.ts:46-85`；`scheduler.ts:62-75`）                 | 同一 profile 分别起 child 与 automation run，比较 model/tools/instructions |

## 11. 证据索引（REQ 候选）

| REQ        | 要求                                                                              | 证据                                                                               |
| ---------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| REQ-SUB-01 | 一次 start 在一个事务内创建 child、anchor、reporter、action（隔离时含 workspace） | `extensions/subagents/server.ts:979-1041`                                          |
| REQ-SUB-02 | child 归独立后台 anchor，父停止不级联                                             | `server.ts:990-996`；`pi-durable/dist/types.d.ts:602-603`；`server/api.ts:583-588` |
| REQ-SUB-03 | 每次 start/message 一条 action，按 callId 幂等                                    | `server.ts:933、981、1038-1040`                                                    |
| REQ-SUB-04 | reporter 输入按 `subagent:<task>` 去重                                            | `server.ts:143`                                                                    |
| REQ-SUB-05 | 成功答案按 `subagent-answer:<entry>` 去重                                         | `server.ts:247-248、793`                                                           |
| REQ-SUB-06 | 失败报告按 `subagent-report:<task>` 去重                                          | `server.ts:247-248`                                                                |
| REQ-SUB-07 | 答案只投一次，跨重启                                                              | `server.ts:155-170、663-741、761-766`                                              |
| REQ-SUB-08 | 供应商错误交 watchdog，成功重试仍作为普通报告                                     | `server.ts:175-181、699-719`；`watchdog/server.ts:199-222`                         |
| REQ-SUB-09 | 父 stop 静默、子 stop 记为 interrupted                                            | `server.ts:186-188、259-267`                                                       |
| REQ-SUB-10 | wait 可被 steer 让位，follow-up 不唤醒                                            | `server.ts:298-309、331-342`                                                       |
| REQ-SUB-11 | 前台 start/message 与 wait 返回答案或 `yielded`                                   | `server.ts:1050-1087、1188-1217`                                                   |
| REQ-SUB-12 | stop 捕获 run/inputs/watchdogs/reporters 并只 abort 这些                          | `server.ts:1094-1163`                                                              |
| REQ-SUB-13 | stop 只报告未提交文件，不提交/删除                                                | `server.ts:1164-1186`                                                              |
| REQ-SUB-14 | land 只做 fast-forward，要求 idle/clean/ready                                     | `workspaces.ts:648-716`；`server.ts:917-925`                                       |
| REQ-SUB-15 | discard 删除 checkout、保留分支（脏 checkout 由 `git worktree remove` 拒绝）      | `workspaces.ts:973-986`                                                            |
| REQ-SUB-16 | 隔离区路径/分支/base 规则                                                         | `workspaces.ts:938-940`                                                            |
| REQ-SUB-17 | setup 命令可重复、宿主 shell、120s                                                | `workspaces/setup.ts:15-40`                                                        |
| REQ-SUB-18 | 定义发现顺序 builtin→user→project，project 需信任                                 | `lib/agents.ts:331-343、349-420`                                                   |
| REQ-SUB-19 | overlay 只覆盖设置、追加 body/工具                                                | `lib/agents.ts:300-317、375-400`                                                   |
| REQ-SUB-20 | child 默认无 `subagent` 工具，定义显式列出才保留                                  | `server.ts:1002-1003`；`docs/subagents.md:7`                                       |
| REQ-SUB-21 | `subagents.started` 在创建事务内发出                                              | `refs.ts:71-83`；`children.ts:23-40`；`server.ts:1010`                             |
| REQ-SUB-22 | standing 新建才发 Started，刷新只重配                                             | `server.ts:642-655`                                                                |
| REQ-SUB-23 | automation run 复用 `createChild`                                                 | `automations/scheduler.ts:62-75`；`automations/README.md:40-42`                    |
| REQ-SUB-24 | 计划台账通过 child 关联任务                                                       | `plan/refs.ts:31-42`；`plan/server.ts:84-113`                                      |
| REQ-SUB-25 | UI 任务树以 owner 关系呈现 child                                                  | `tasks/README.md:1`；`server/api.ts:157、231、307`                                 |
| REQ-SUB-26 | 生成树/lane 的 parent/spawn 推断                                                  | `system/README.md:9-11`                                                            |

## 附录 A：文档与代码冲突（供 spec 决策）

1. `extensions/subagents/README.md:88` 说 land 要求“Both checkouts must be clean”。代码只检查 **child worktree** 干净（`workspaces.ts:656-657`）；源 checkout 的无关脏文件明确不阻塞（`workspaces/README.md:39`），`git merge --ff-only` 只在真正重叠时拒绝（701）。**冲突**。
2. 同处说 discard “removes only a clean … checkout”。代码没有显式 clean 检查（`workspaces.ts:973-986`），只依赖 `git worktree remove` 不带 `--force`（980）。`推断:` 由 Git 拒绝脏 checkout，而非本函数。
3. `extensions/subagents/README.md:1` 把 start 参数写成 `{agent, task, background?, fork?}`，实际 schema 还接受 `isolate` 与 `steer`（`server.ts:871-891`）；`docs/subagents.md:7` 也只说“isolated implementation”，没有列出参数。
4. `lineage/README.md:12` 说 `lineage.branch` 只存 `{from, at, intent}`，代码还写 `brief: true`（`lineage/server.ts:947-952`；`lineage/api.ts:24`）。文档滞后。
5. `extensions/subagents/README.md:29-30` 说 branch 的 `Started` 事件带“the agent the fork kept”，但 lineage 实际写死 `agent: 'branch'`（`lineage/server.ts:976-980`），不是定义名；`refs.ts:71-74` 又说 `agent` 可以是“definition or label”，两种说法不完全一致。`推断:` 因此 System lanes 对分支只会显示 `branch`，看不到 `coordinator`。
