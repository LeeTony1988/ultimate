# 上下文与记忆组（Context & Memory）分析笔记

## 1. 概览

这一组解决"@ultimate 记得什么、看到什么、怎样把记忆带回来、又怎样把一次会话的收获沉淀下去"：`context` 把一次上下文开始时模型真正收到的系统提示、工具声明与注入内容逐项拆开给用户看；`recall` 在长上下文里按语义把项目记忆重新插回输入之后；`dream` 把"复盘 → 提案 → 决策 → 换章"做成有日志、有闸门、可回滚的工作流；`side-chat` 提供可丢弃或可回灌的临时副本；`keep-warm` 用独立定时器续上 Claude 的一小时 prompt cache；`questions` 把 @ultimate 的提问变成可键盘操作的答案卡，并把答案变成一条普通回复；`classify` 是唯一的外部模型能力（TypeSafe Jev），目前只服务 `recall`。七者都不是 core tier：目录内没有任何 `api.ts` 声明 `export const tier = 'core'`，`questions` 只是依赖 core 的 `messages`。

| 名称      | 一句话职责                                                                | 服务端入口                               | 浏览器入口         | 是否 core tier |
| --------- | ------------------------------------------------------------------------- | ---------------------------------------- | ------------------ | -------------- |
| context   | 首个输入之上的上下文预算头；`pi.system`/`pi.reset`/`pi.compaction` 的渲染 | 无 `server.ts`（纯浏览器）               | `web.tsx` 默认导出 | 否             |
| recall    | 当消息确实需要时，把命中的项目记忆以完整正文插在输入之后                  | `server.ts` → `recall(host)`             | `web.tsx` 默认导出 | 否             |
| dream     | 梦境会话、六趟 pass、日志与提案、内置自动化、章节（chapter）切换          | `server.ts` → `dream(host)`              | `web.tsx` 默认导出 | 否             |
| side-chat | @ultimate 的临时无主副本：派生、丢弃、总结回灌                            | `server.ts` 默认导出                     | `web.tsx` 默认导出 | 否             |
| keep-warm | 空闲时每分钟检查并 ping 一次，续上 Claude 一小时缓存                      | `server.ts` → `keepWarm(host)`           | `web.tsx` 默认导出 | 否             |
| questions | 消息上的问题卡：回答 / 忽略，答案落成一条用户回复或便条                   | `server.ts` → `questionsExtension(host)` | `web.tsx` 默认导出 | 否             |
| classify  | TypeSafe Jev 的结构化判定（choice / noul / score）                        | `server.ts` → `classify(host)`           | 无 `web.tsx`       | 否             |

## 2. 逐扩展规格

### 2.1 context

**职责与用户可见行为**：在会话第一条记录上方显示一条安静的头：agent 名、模型与思考级别、`N sections · N tools`、预算条和总 token；展开后是定义路径、逐段系统提示、每个工具的说明与 schema、以及上下文开始前注入的内容（memory brief / tally / compaction summary / 继承历史），各带 token 与占比。之后的上下文起点（compaction、reset）在自己的卡片下再显示一份；中途的 `pi.system` 变成可展开的 diff 标记。

**导出与契约**：`breakdown.ts` 是纯模型，导出类型 `Section`/`Tool`/`Prompt`/`Injected`/`Breakdown`/`SectionChange`/`ToolChange`/`Diff`，函数 `systemOf`、`startsContext`、`removesAll`、`toolTokens`、`promptAt`、`opensContext`、`breakdownAt`、`diffAt`、`modelLine`、`ownStart`。`web.tsx` 默认导出 `defineWebExtension({ slots: { 'transcript.start': [Start] }, entries: { 'pi.system': SystemEntry, 'pi.reset': ContextStart, 'pi.compaction': ContextStart } })`。无 tools、actions、docs、events、reactors、apis、settings keys。

**状态与持久化**：不写任何文档；完全由 `useTranscript()` 的条目重放。token 用 Pi 的 `estimateTextTokens` 估算（3.5 字符/token），图片按 4800 字符计（界面写"约 1.4k"）。`promptAt` 从最近的 reset/compaction 起回放 `pi.system` 的 `sections`（`null` 删除、赋值追加）与 `toolsRemoved`/`toolsAdded`；go-back 用 `setAsideIds` 排除被搁置的补丁。

**UI 位置**：槽 `transcript.start`；三个 entry 渲染器。展开态用 `Collapsible`；diff 标记用 `useFold(id)` 保存开合。

**关键流程**：(1) `Start` 用 `ownStart(entries, id)` 找当前会话第一条自己的条目，`ContextAt` 调 `breakdownAt`。(2) `breakdownAt` 把 reset/compaction 当作 `start`；若其 `model[0]` 是 user 则按 `data.lineage.brief|tally` 标为 memory brief / tally，否则 handoff；没有 start（fork）则 `inherited()` 汇总源会话从上次上下文起点到本 fork 首条的历史。(3) `firstSystem` 找起点后第一个 `pi.system`；`removesAll` 的补丁与其后的重加合并为同一次。(4) `promptAt` 重建 sections/tools，求和得 `tokens.prompt`、`tokens.tools`、`tokens.injected`、`total`。(5) 首个 `pi.assistant` 记录 provider/model/thinking，`modelLine` 在尚无回答时退回会话配置并标 `configured`。(6) `SystemEntry` 对"开启上下文的补丁"和 remove-all 前的补丁返回 `null`，其余渲染 `system prompt · N sections · N tools · ±tokens`，展开为 `diffAt` 的增/改/删与全文。

**失败与恢复**：没有 `pi.system` 时 `ContextAt` 不渲染；条目索引找不到时退回核心渲染；损坏的补丁只是少一段，不影响运行。README 声称的 `Reloaded`/`Restarted` 标记在 `web.tsx` 中不存在（在 `extensions/` 内搜索无命中），属文档滞后（推断）。

**关掉它会发生什么**：`transcript.start` 不再有头，三个 `pi.*` 条目退回核心默认渲染，diff 与预算可视化全部消失，不影响模型请求。

**复刻要点**：这是纯派生视图，只读条目，不读 settings/provider headers/secrets；remove-all 折叠是对 Pi 条目顺序的隐式耦合（源码首行注释声明为上游临时方案）。`inherited()` 对 compaction 的 `head` 处理最易错。

**证据**：`extensions/context/breakdown.ts:36-46,67-80,91-120,130-146,148-155,186-211,218-259,265-309,315-334`；`extensions/context/web.tsx:47-59,62-81,264-367,377-400,482-504,506-509`。

### 2.2 recall

**职责与用户可见行为**：@ultimate 的上下文至少 20% 满之后，每条新输入（用户 `pi.user` 或分支 `board.message`，以及 triage 报告的 `board.wake`）先问一次 classify："哪条项目记忆正好适用于这条消息？"最多取 3 条概率 ≥ 0.25 的记忆，把全文插到输入之后。检查期间用户气泡边缘跑一圈光带；命中后气泡下缘飞入记忆 chip，点开 Memory 面板对应记忆；没命中什么都不显示。

**导出与契约**：`server.ts` 导出 `FROM_PERCENT = 20`、`THRESHOLD = 0.25`、`Recall`（doc，kind `recall.state`，version 1，`scope: 'conversation'`，`history: 'latest'`，`fork: 'initial'`，`checkpointWhen: () => false`）、`docs = [Recall]`、`recallQuestion(memories)`、`recallText(picked)`，默认导出 `recall(host)`。`types.ts` 导出 `RECALL_ENTRY = 'recall.memories'` 与 `Recalled { input, root, memories: [{slug,line,confidence}] }`。`refs.ts` 导出 `RecallDoc` 与 `RecallState { pending?, last? }`。依赖声明：`host.want(ClassifyApi)`、`host.need(LineageApi)`；不提供 api，无 reactor，无 tools/actions/settings。

**状态与持久化**：`recall.state` 记 `pending`（正在检查的输入条目 id）与 `last`（已检查的最新输入 id）；`recall.memories` 条目带一条 user-role 模型消息（`recallText`）和 `Recalled` 数据，作为会话历史持久化。无独立 SQLite/文件。README 提到的 `injected`（每条记忆最近被召回的 token 位置）在 `refs.ts`/`server.ts` 中并不存在，改用实时上下文扫描 `recentlyRecalled`（推断：文档残留）。

**UI 位置**：`userBubble` 贡献 `RecallBubble`；`entries: { 'recall.memories': () => null }`（内容不进 transcript）。chip 经 `useOpenMemory()` 打开 Memory 面板。

**关键流程**：(1) `GenerationTask.beforeRequest` 先确认 `Standing.ultimate === conversationId`，否则不工作。(2) 取实时 `context()`，`findLast(isInput)` 得输入；`messageOf` 只认 `pi.user`/`board.message`，`board.wake` 则回找其指向的 `board.message`。(3) `state.last >= input.id` 表示这条输入已问过；重启后重发的请求若存储的回忆恰是上下文最后一条且 `request.messages.length < view.messages.length`，只把该条模型消息补回请求。(4) 读 `ContextUsageDoc` 与 `lineage.memoriesOf(id)`；无 token/百分比 < 20/无记忆时只写 `last` 并返回。(5) 写 `pending = message.id`，调 `classify.ask({state: {from, message: textOf(...).slice(0,4000)}, questions: {memory: recallQuestion(memories)}}, AbortSignal.any([ctx.abortSignal, AbortSignal.timeout(3000)]))`。(6) 在 `0.3 × window` token 范围内扫最近 `recall.memories` 得到 `recent`，过滤 `p >= 0.25`、未在 recent、按概率降序取 3，写 `recall.memories` 并返回 `{ messages: [...request.messages, recalled] }`。

**失败与恢复**：provider 错误或 3 秒超时被吞掉（注释称 "advisory"），run 保持原样；`ctx.abortSignal` 已中止时先在 `BACKGROUND_CONTEXT` 清 `pending` 再抛出，避免气泡常亮；重启后因 `last` 已写不再重问。

**关掉它会发生什么**：没有光带、没有 chip、没有任何 `recall.memories` 条目；系统提示完全不变，模型只是少了这段记忆。classify 关闭（无 `TYPESAFE_API_KEY`）时 `host.want` 返回 `undefined`，recall 静默不工作。

**复刻要点**：插入位置必须在输入之后，否则破坏 prompt 前缀缓存；必须先提交文档再追加条目，并在同一事务中删 `pending`；"最近已召回"基于实时上下文而非持久计数，compaction 后失效。

**证据**：`extensions/recall/server.ts:26-41,44-54,71-107,115-219`；`extensions/recall/refs.ts:4-12`；`extensions/recall/types.ts:2-12`；`extensions/recall/web.tsx:14-56,58-99,101-105`。

### 2.3 keep-warm

**职责与用户可见行为**：@ultimate 使用 `claude-code` 时，空闲 55–60 分钟且用户 8 小时内出现过，就发一次极小请求重放它的上下文，读中缓存从而续期一小时；下一次真实提问便整段命中缓存。状态栏的 `warm` chip 显示暖/冷/关闭与失败（琥珀/暗/红），弹层有开关、"Warm until 14:52"/"Cold since …"、下一次 ping 或为什么没有、上次 ping 的读写量。

**导出与契约**：`due.ts` 导出 `TTL = 60*60_000`、`LEAD = 55*60_000`、`IDLE_STOP = 8*3600_000`、`Activity`、`due(activity)`。`refs.ts` 导出 `Ping`、`WarmDocState`、`WarmState`、`WarmDoc`（`keep-warm.state`）、`StateAction`（`keep-warm.state`）、`SetAction`（`keep-warm.set`）。`server.ts` 导出 `State` doc、`docs`、`cached(message, model)`、`open(paused, lastRequest, now)`、`actions { state, set }`、`userActions = ['set']`。无 tools、无对外 events/reactors（仅一个 `user-input` 内部 reactor 更新 `inputAt`）；不提供 api；无 settings key（是否开启存文档）。

**状态与持久化**：`keep-warm.state` 在 conversation 1：`{ off?, inputAt?, last?, pings? }`，`last` 是 `{at, model, read?, write?, error?}`，`checkpointWhen: () => false`。状态全部在 SQLite 文档里；定时器与并发标记用 `host.resource('keep-warm.timer')`，随 facet 重载保留。

**UI 位置**：`statusline.right`，`{ component: Chip, order: -1 }`；chip 的 `data-keep-warm` 为 `warm|cold|off`。

**关键流程**：(1) 模块加载时 `setInterval(TICK = 60_000)`，用 `shared.running ??= tick(host)` 防重入；`host.onClose` 清定时器并等待在飞的 tick。(2) `tick` 先查 `PauseApi.paused()`，读文档 `off`，`activity()` 要求 @ultimate 存在且 `agent.model.provider === 'claude-code'`；`answeredAt` 分页扫条目，找一小时内最新一条 `cached()` 助手消息；`lastRequest = max(answered, 成功的 last.at)`，失败 ping 作为 `failedAfter`。(3) `due()`：`lastRequest`、`inputAt` 齐备；`failedAfter >= lastRequest` 则停；年龄在 `[LEAD, TTL)`；`now - inputAt < IDLE_STOP`。(4) `ping()` 取 `context().messages`，若无 `You are conversation #N.` 则前置，再追加 `QUESTION`；再次 `open()`；`claim()` 在一个提交里校验 `!off`、`doc.last?.at === previous`、`LiveDoc.run` 为空，然后写 `{error:'interrupted'}` 并 `pings++`；再查一次 `open()`。(5) `modelRuntime.streamSimple(model, {messages}, {reasoning?, signal: AbortSignal.timeout(180_000)})`，不传 `sessionId`（一次性 Claude Code 进程）。(6) `record()` 同一次提交写 `last` 并用 `ConversationsApi.accountResponse` 把 usage 计入 @ultimate；失败也记录，从而在下一次真实请求前不再重试。

**失败与恢复**：任何异常都在 `record` 中变成 `last.error` 并阻断后续 ping，直到 @ultimate 有更新的请求；`tick` 的整体异常 `host.notice('Keep warm: …')`；崩溃时"已记 interrupted"使该次算失败而不是重试。

**关掉它会发生什么**：`set({on:false})` 写 `off: true`，不再 ping；一小时后缓存自然变冷，下次问答重新写整段上下文。chip 变暗，弹层显示 Off。

**复刻要点**：定时器必须在任务调度器之外（暂停会挂起调度器）；必须在发送前最后一次校验暂停/缓存时限/无 run，否则会和真实请求抢缓存；usage 必须并入会话账本，否则状态栏花费少算。

**证据**：`extensions/keep-warm/due.ts:4-29`；`extensions/keep-warm/server.ts:28-43,52-57,63-101,107-137,143-200,202-232,234-279`；`extensions/keep-warm/web.tsx:16-30,36-98,100-102`。

### 2.4 questions

**职责与用户可见行为**：@ultimate 用 `message { to:'user', text, questions }` 提问，消息下方出现答案卡。一个问题展开、其余折叠为"1b drop them / 未回答"一行，圆点显示进度；支持 `choice`/`multi`/`confirm`/`scale`/`text`，选项自带"Something else…"内联输入、Markdown `preview` 侧栏、"my pick" 推荐标记；底部永远有备注框（可单独 "Send note"）；"Accept picks" 一次接受所有仍开放的推荐；发送后有 3 秒 Undo 窗口，随后卡片定格为已发送摘要。桌面端 1–9/字母选择、↑↓ 切题、Enter 取推荐或前进、⇧Enter 接受全部并发送、`/` 聚焦备注、Esc 清除/退出/撤销。

**导出与契约**：`server.ts` 导出 `answerText(answers, questions, note?)`、`userActions = ['answer','dismiss']`、`actions { answer, dismiss }`，默认导出 `questionsExtension`（仅 `host.need(MessagesApi)`）。`refs.ts` 导出 `Answer`、`AnswerAction`（`questions.answer`）、`DismissAction`（`questions.dismiss`）。`ui.tsx` re-export `waiting`。`open.tsx` 导出 `waitsOnUser`、`openQuestions`、`waiting`、`newestAsked`、`keyCard`；`state.tsx` 导出 `Choice`、`Draft`、`choices`、`keyOf`、`choiceForKey`、`pickIndices`、`pickDraft`、`answerOf`、`picks`、`answered`、`position`；`question.tsx` 导出 `brief`、`QuestionItem`；`card.tsx` 导出 `MessageQuestions`。无自有 doc，也不提供 api 或 reactor（只消费 `MessagesApi`）。

**状态与持久化**：问题存在 `messages` 的 `Message.questions` 上（`extensions/messages/api.ts` 的 `Question` 类型），本扩展不落盘；卡片草稿只在组件 state，刷新即丢（推断：设计如此）。打开条件统一为 `to === 'user' && reply && state === 'delivered'`。

**UI 位置**：通过 `messages` 的 `MessageAnswers` 点提供 `MessageQuestions`；命令 `questions.open`（"Show open questions"）打开 `todos` 面板；`questions.asked`/`questions.answers` 两个退役 entry 渲染为 `null`。To-dos 页顶部的等待列表由 `messages` 的 `openQuestions` 提供。

**关键流程**：(1) 工具边界 `extensions/messages/questions.ts` 的 `checkQuestions` 校验：非空、文本/ref 唯一、choice/multi ≥2 个标签与 key 唯一、scale 升序且 ≤10 级；不适用字段被丢弃。(2) 卡片 `send()` 先进入 `phase:'undo'`，`setTimeout(fire, 3000)`；离开页面时 `flush()` 直接发送，只有 Undo 撤回。(3) `answer` action 在一个提交里按 `messageId` 找消息、要求仍 open、校验 answers 无重复且都属该消息，`answerText` 生成 `1a. Topic: label`、`2a,c. Topic: a, c`、`3: text`、无 ref 时 `Topic: answer`，备注追加 `Note: …` 或独立成段。(4) 调 `MessagesApi.answer(messageId, reply, ctx, device)` 投递为带 `re` 的普通用户回复。(5) `dismiss` 直接 `MessagesApi.dismiss`，一条单向便条、不启动 sender 的 run。

**失败与恢复**：action 抛错显示在卡片 `role="alert"`；`sending` 失败回到 `answering` 并保留草稿；消息已关闭时服务端拒绝；并发回答由 messages 的准入在同一事务里保证只有一条回复。

**关掉它会发生什么**：问题仍被 `message` 工具接受并存在消息上，但没有卡片、没有 `MessageAnswers`、没有 `questions.open` 命令；用户只能当普通消息回复，问题保持 `delivered`（推断）。

**复刻要点**：`answerText` 的编号是契约，别把 UI 标签直接拼给模型；"一次只开一题"与"最新卡独占全局键"（`keyCard`）须同时实现；发送窗口可撤销且离页即发。

**证据**：`extensions/questions/server.ts:9-11,22-55,57-108`；`refs.ts:7-26`；`web.tsx:5-19`；`card.tsx:26,42-46,52-78,91,221-359,393-440`；`question.tsx:180-189,195-377`；`state.tsx:25-95`；`open.tsx:14-35`。

### 2.5 side-chat

**职责与用户可见行为**：在 @ultimate 的输入框按 Tab（或点 Normal/Side chat 开关）进入侧聊模式，Enter 派生一个临时副本；主会话左移、缩放 0.88 变暗但继续流式输出，副本以纸片从右侧（手机从底部）推入，顶部有"forked from @ultimate at HH:MM · knows everything up to here"的切口。副本固定标题 `Side chat`、关闭自动摘要；结束只有两条路：Discard（无副作用时才可）或 Summarize & inject（摘要写回主会话，不唤醒它）。

**导出与契约**：`refs.ts` 导出 `SideChat`、`SideChatIndex`、`SideChatSummary`、`SideChatDoc`（`sidechat`）、`SideChatsDoc`（`sidechat.index`）、`OpenAction`/`DiscardAction`/`InjectAction`（`side-chat` 的 `open`/`discard`/`inject`）。`logic.ts` 导出 `TabKey`、`togglesSideMode`、`openSides`、`frontSide`、`Ending`、`createEndings`、`endings`。`server.ts` 导出 `Side`、`Index`（内部 `sidechat.ending`）、`docs`、`userActions = ['open','discard','inject']`、`actions`、`endTask(host)`、`tracksEffect`、`sideReminder`。`ui.tsx` 导出 `OpenAction`、`SideChatsDoc`、`useSideChatFront`（UI state `ext.side-chat.front`）。hooks：`GenerationTask.beforeInput`、`ToolTask.beforeTool`；tasks：`side-chat.start`、`side-chat.end`；运行时 `need(ConversationsApi)`；无 reactor、不提供自有 api。

**状态与持久化**：每个 fork 上的 `sidechat`：`{of, at, effects, ended?}`，空文档表示不是侧聊；主会话上的 `sidechat.index`：`{sides:[{id, at, openedAt, ended?}]}`，保留已结束项供浏览。两者都 `fork: 'initial'`（不被再次 fork 继承）。结束进度在同会话的 `sidechat.ending`（`{mode?, task?, introduced?}`）。

**UI 位置**：`composer` 包裹主输入框（模式开关、Tab、`ComposerRedirect`）；`conversation.overlay` 的 `Stage` 做景深与纸片；`entries: { 'sidechat.summary': SummaryCard }`；侧栏点 `UnderUltimate`（开的侧聊行）与 `Unlisted`（所有侧聊 id 不进分支/Earlier/Concluded）。

**关键流程**：(1) `open` 校验调用者是 @ultimate 且自身不是侧聊；`lastAnswer` 用 `scanSubmissions({status:'done'})` 找最大的 `input.answer`（不是最新 assistant，也不是 GenerationTask）；`closingEntry` 若该答案还带未回填的 `toolCall`，向后扫到匹配 `toolResult`，避免副本继承悬空工具调用。(2) 一个提交内 `forkConversation(main, at, {ownership:{kind:'ownerless'}})`，写 `sidechat`、metadata `{title:'Side chat', label:'side-chat'}`、`setAutomaticSummaries(false)`、index 追加，并创建 `side-chat.start` 任务（`requestId: sidechat:open:<id>`）。(3) `beforeInput` 首次注入 `sideReminder`（kind `conversations.identity`，隐藏）；`beforeTool` 在工具执行**之前**提交 `effects = true`（`tracksEffect`：branch/message/note/notify/remember/setup/restart/edit/write、todo add/done、除 list/runs/log 外的 automation）。(4) `end` 在一个提交里建 `side-chat.end` 任务（inject 需 `summaryModel()`），`stop` 阶段 abort + `waitForIdle`，`summarize` 阶段只取 `at+1` 之后、排除 `pi.system` 的条目，`askSummaryModel` 结果用 `runtime.memo('source'|'response')` 记忆化。(5) inject 用 `conversation.submit({type:'write', requestId: 'sidechat:summary:<id>', entry:{kind:'sidechat.summary', data, model:[user 文本]}})` 写入主会话，再在一个提交里 `concludeIn`、写 `ended` 与 index。(6) 模型失败且未准入时清 `mode/task/ended`，副本可继续输入并重试。

**失败与恢复**：注入失败显示模型错误并变成 "Retry summary"，绝不退回纯文本；写准入后崩溃复用 memo 与去重 write 收尾；`effects` 粘性先写，工具失败也锁死 Discard；结束/结束中的副本在服务端拒绝输入与工具。

**关掉它会发生什么**：无 Tab 模式、无副本；已存在的侧聊退化为带 `label: 'side-chat'` 的普通会话（推断：`branchOf` 仍指向主会话，会重新出现在树里）。

**复刻要点**：fork 边界必须来自 settled `SubmissionRecord.answer`，不是 assistant 或 summary；必须继承全部工具（含 compact），否则 system prompt 变化破坏缓存前缀；`lib/acting-as.ts` 让核心按 kind 读文档。

**证据**：`extensions/side-chat/refs.ts:4-30`；`server.ts:21-49,53-102,111-147,149-169,171-292,294-347,350-402`；`web.tsx:115-194,221-332,335-439,462-494,499-559`；`logic.ts:18-81`；`lib/acting-as.ts`。

### 2.6 dream

**职责与用户可见行为**：用户按 Dream（Memory 面板头或 ⌘K "Dream…"），@ultimate 先写 handoff，然后起一个 dream 分支跑六趟 pass（memory/failures/tools/corrections/codify/project），产出三条 `learned`、一篇 Markdown 日志和最多 40 条提案；用户与 @ultimate 逐条决定（approve→分支、apply、reject、landed+sha）。会话在日志归档且所有提案落定后自动结束；此后可 Fall asleep 把记忆与未完成工作带进新 chapter，旧 chapter 原样留在磁盘并可切回。内置 "Dream before compaction"（context > 70% of @ultimate）与 "Dream after a pause"（> 50% 且 idle 8h）会自动触发。

**导出与契约**：`server.ts` 导出 `Sessions`（kind `dream.sessions`，version 3，`migrate` 把 `afterCompaction`→`beforeCompaction`、旧会话补 `project` pass）、`docs = [Sessions, SeedState, BuiltInDoc, PauseDoc]`、`userActions = ['start','end','asleep','switch']`、`actions`（`chapters`、`switch`、`asleep`、`start`、`handoff`、`end`、`pass`、`journal`、`decide`、`stats`）、`startSession`、`reportPass`、`fileJournal`、`decide`、`landed`、`journalText`、`toolStats`、`askHandoff`、`startDreamIn`，默认导出 `dream(host)`。`refs.ts` 导出全部 action ref 与 `DreamDoc`、`Session`、`Proposal`、`Journal`、`Sleep`、`Waiting`、`BeforeCompaction`、`Handoff`、`ToolStats`。`types.ts` 导出 `Seed`、`PASSES`、`PassName`、`busyElsewhere`、`pinnedOf`、`sleepLeads`、`STAGES`、`DreamStep`、`stepOf`、`progress`。`before-compaction.ts` 导出 `AUTOMATION_NAME`、`CONDITION`、`PAUSE_NAME`、`PAUSE_CONDITION`、`BuiltInDoc`、`PauseDoc`、`DREAM_WAIT_MS`、`DREAM_LOOK_MS`、`HANDOFF_WAIT_MS`、`HANDOFF_ASK`、`ASLEEP_AFTER`、`HANDOFF_CHARS`、`asleepAfter`、`hoursOf`、`changes`、`ensureAutomation`、`compactionSummary`、`Origin`、`compactionDream`。`seed.ts` 导出 `SeedState`、`buildSeed`、`writeSeed`、`applySeed`；`gate.ts` 导出 `BRIEF_BUDGET = 6000`、`gate`；`delivery.ts` 导出 `deliverTask`、`deliver`。settings：`dream.asleepAfter`（project 覆盖 user，默认 5）。tasks：`deliverTask(host)`、`Wait`、`Retired`、`Settle`；reactors：`ultimate-started`、`landed`、`after-compaction`；依赖：`CloudApi`、`InstanceApi`、`AutomationsApi`、`LineageApi`、`Standing`、`Started`、`SubmissionLanded`、`ConversationsApi`。

**状态与持久化**：`dream.sessions`（conversation 1）持 `{next, sessions, waiting?}`；每会话含 `passes`、`journal`、`proposals`、`sleep`、`handoff`、`beforeCompaction`、`endedAt`。`dream.seed` 记录 `{applied?, automations: string[]}`；`dream.after-compaction` 记第一个内置自动化的 id/删除（version 2 迁移），`dream.after-pause` 记第二个。文件侧：`<home>/chapters.json`、`pending-chapter.json`、`chapters/<name>/seed.json`；后续 chapter 的 `state.sqlite`/`trace.sqlite`。会话条目 `dream.handoff|started|journal|chapter|settled` 落在 @ultimate 会话。

**UI 位置**：`entries` 五个卡（handoff/started/journal/chapter/settled）；`slots.sidebar.top`（`OlderChapterBanner` -30、`DreamSection` -25）；`statusline.right`（`DreamStatus` phone、`TimeToDream`、`OlderChapterStatus`）；`overlay`（DreamDialog/JournalDialog/ChaptersDialog/SwitchVeil/WakeUp）；命令 `dream.open`、`dream.chapters`；`provides: [provide(MemoryHeader, useDreamButton)]`。状态栏五个月相表示 handoff/dreaming/deciding/settled/asleep。

**关键流程**：(1) `start`→`askHandoff`：`refuseBusy` 后 `compaction.request()` 在一提交内建 `dream.handoff-wait` 任务、写 `waiting`、给 @ultimate 投递 `dream.handoff`（用户按钮为 input，自动化触发为 write，避免第二个 run）。(2) `Wait` 每 15s `look()`：超 2h 标 `gaveUp` 并 `LineageApi.leaveNote`（requestId `dream.handoff-wait:<task>`），自动化被暂停/删除或已有会话/睡眠/换章则结束；handoff 到位或满 30 分钟且无其它顶层会话在跑时 `delete waiting` 并 `startDreamIn`。(3) `startDreamIn` 校验 @ultimate 与空闲，`startSession`，投递 `dream.started`（`dream.deliver`，requestId `dream.started:<N>`，busy 时 followUp），提示 dream 分支按 DREAM.md 起六趟 pass；首个 `pass` 报告者成为 `dreamer`。(4) `journal` 校验恰好 3 条 `learned`（各 ≤200 字）、正文 ≤20000、提案 id 匹配 `/^[a-z0-9][a-z0-9-]{0,47}$/` 且唯一，只写一次，随后 `dream.journal` passive write 进 @ultimate，`settle()` 结算。(5) `decide`：`approved` 必须带 `branch`；`landed` 只能从 approved+branch 转，`sha` 需 7–40 位十六进制；每条可带一行 `reason`（hands-off goal）。(6) reactor `landed` 监听 `SubmissionLanded`，把同分支的 approved 提案批量标 landed 并 settle；settle 触发 `dream.settled` 任务，按 `changes() >= asleepAfter` 或 pause 决定 `stay`（write）或 `ask`（input）。(7) `asleep`：`admitSleep` 要求有日志、无 open/approved、无其它忙会话、名字合法且未占用；`fallAsleep` 依次 `seeding`（`buildSeed`）→`checking`（`gate` 在临时 home 写 seed、`requestChapter`、`InstanceApi.start` 真启动、用 `postAction` 读 `lineage.memory`/`todos`/`dream.seed`/Standing 并等 10s 的 `dream.chapter`，失败重建一次）→`backing up`（`CloudApi.backup()`，缺失/关闭记录 skipped，配置了却失败则中止）→再 `idle`→`switching`→`writeSeed`+`restartChapter`。(8) `switch` 只做 `requestChapter`+restart，不建 seed、不备份；`onOpen` 的 `settleSleep` 把被重启打断的 `seeding/checking/backing up` 标 failed，把已存在目标 chapter 的 `switching` 标 asleep。(9) 打开时 `applySeed` 一次提交写入记忆、待办、问题（转为 user-owned 待办）、脚本重建待办，并投递 `dream.chapter`；随后按名字幂等重建 automations。

**失败与恢复**：gate 两次失败停在当前 chapter；备份失败中止；重启失败删 `pending-chapter.json` 并记 `failed`，seed 保留可重试；handoff 等待失败会重试留便条（requestId 去重）；模型/进程崩溃后 `dream.deliver` 与 requestId 保证不重复投递。内置自动化被删除会被记住（`deleted`），被暂停则下次建出来即 pause。

**关掉它会发生什么**：Dream 按钮、状态栏、章节对话框全部消失；已存在的 dream 会话文档仍在但无人推进；两个内置自动化仍由 automations 触发（它们不是 dream 的调度器），会给 @ultimate 投递 fired 输入却无人接手（推断：应同时暂停/删除）。

**复刻要点**：这是本组风险最高的扩展。顺序必须是"state 与投递同提交"，所有耗时步骤（gate、backup）都在事务外并把阶段写回 `sleep`；切章必须走日志（pending-chapter.json）并由 host 在打开存储前完成，否则重启即丢；六趟 pass 与提案 id 是 DREAM.md/agent 的契约；seed 必须能在一个提交内应用且幂等。

**证据**：`extensions/dream/server.ts:55-96,144-165,168-225,231-271,274-321,355-407,413-446,448-536,542-588,594-671,684-724`；`before-compaction.ts:35-54,61-114,120-160,162-215,221-253,260-363,374-428,436-524`；`seed.ts:19-37,179-297`；`gate.ts:17-113`；`delivery.ts:19-65`；`refs.ts:93-170`；`types.ts:9-178`；`web.tsx:31-153`；`journal.tsx:44-167,176-244,274-311,359-419,444-502`；`sleep.tsx:46-175,224-303`；`chapters.tsx:28-118,124-257,262-401,455-502`；`morning.tsx:44-117`；`pinned.tsx:10-59`；`modal.tsx:14-74`；`sidebar.tsx:29-131`。

### 2.7 classify

**职责与用户可见行为**：给其他 server facet 提供廉价的类型化判断，无工具、无提示、无 UI；默认关闭，启用后在 Secrets 面板（⌘K → Secrets）填 `TYPESAFE_API_KEY`。

**导出与契约**：`api.ts` 导出 `ClassifyQuestion`（`choice`/`noul`/`score`，各带 `instructions` 与 `criteria`）、`ClassifyAnswer`、`ClassifyResult { model, answers, usage.inputTokens }`、`ClassifyService.ask({state, questions}, signal)`、`ClassifyApi`（`defineApi<ClassifyService>()('classify')`）。`choice` 答案含 `choice/confidence/probabilities`，`noul` 是 0–1 的概率，`score` 含 `score/confidence/probabilities/legend`。`server.ts` 导出 `secrets = [{name:'TYPESAFE_API_KEY', url:'https://console.typesafe.ai/keys'}]` 与默认 `classify(host)`（`host.implement(ClassifyApi, service)`）。

**状态与持久化**：无文档、无缓存、无重试（调用方负责持久记忆化）。

**UI 位置**：无。

**关键流程**：(1) `ask` 用 `readSecret(host.userHome,'TYPESAFE_API_KEY')`，缺失即抛指引错误。(2) `POST https://api.typesafe.ai/v1/systemone`，body `{model:'jev-1.14.0', ...request}`，Bearer，转发 `signal`。(3) 非 2xx 抛 `TypeSafe <status>: <body 前 1000 字>`；响应须有字符串 `model`、对象 `answers`/`usage` 与数字 `usage.input_tokens`。(4) 逐题校验 `answers[id].type === question.type`。(5) 返回 `{model, answers, usage:{inputTokens}}`。

**失败与恢复**：错误交给调用方；`recall` 用 3 秒超时并降级为不召回。

**关掉它会发生什么**：`host.want(ClassifyApi)` 为 `undefined`，`recall` 静默不工作，其它扩展不受影响。

**复刻要点**：模型版本必须钉死（别名漂移，阈值按版本调）；必须校验答案类型；不要在此层重试/缓存，否则破坏调用方的超时与去重。

**证据**：`extensions/classify/api.ts:9-42`；`extensions/classify/server.ts:7-13,19-64`。

## 3. 跨扩展协作

- **recall 的依赖面**：`want(ClassifyApi)`（可选，缺失即静默）、`need(LineageApi).memoriesOf(id)` 取根记忆与 `root`、`ContextUsageDoc`（conversations 维护的 `conversations.context`）判断 20% 与窗口；`Standing.ultimate`（subagents）确认只服务 @ultimate；浏览器端读 `RecallDoc` 并用 lineage 的 `useOpenMemory` 打开 Memory 面板。
- **questions ↔ messages**：问题由 `message` 工具声明、`extensions/messages/questions.ts` 校验并存在 `Message.questions`；本扩展的 `answer`/`dismiss` 调 `MessagesApi.answer`/`dismiss`，由 messages 在同一事务里验证消息仍 open 并投递（`user.input` 事件）；messages 每次开跑用 `openQuestionsNote` 把未答问题列给 asker；卡片通过 `MessageAnswers` 点挂载，`MessagesDoc` 读取问题。
- **keep-warm ↔ conversations/pause/subagents**：`ConversationsApi.accountResponse` 记账、`PauseApi.paused()` 跳过、`Standing` 找 @ultimate、`UserInputEvent` 更新 `inputAt`、`LiveDoc` 判 run。
- **side-chat ↔ conversations/subagents/lib**：`summaryModel`、`askSummaryModel`、`accountResponse`、`concludeIn`、`setAutomaticSummaries`；`Standing` 判 @ultimate；`lib/acting-as.ts` 让 messages/lineage/automations 等按 `sidechat` kind 以 main 身份行动，核心对 side-chat 零依赖。
- **dream ↔ 几乎全仓**：`Standing`（@ultimate）与 `Started`（@ultimate 启动后补建自动化）、`AutomationsApi` + `Fired`（内置触发器）、`SubmissionLanded`（提案落地）、`CloudApi`（换章前备份）、`InstanceApi`（gate 起临时实例）、`LineageApi`（`Roots`、`leaveNote`）、`Messages`（把未答问题搬进 seed 的待办）、`Roots`/`lineage.memory`（seed 记忆）、`todos`（seed 待办）、`lib/chapters.ts`（章节文件与切章日志）、`side-chat`（早晨卡的 awake 检查用 `OpenAction`/`SideChatsDoc`/`useSideChatFront`）。
- **context**：只读条目；浏览器端借 `subagents.DefinitionAction` 显示 agent 定义、借 conversations 的 `ConversationSummary.label/title` 推断身份，不写任何东西。

## 4. 复刻顺序建议与风险

**顺序**：1) `classify`（无依赖，先把 key/错误契约做对）；2) `questions`（依赖 core messages，独立可测）；3) `context`（纯前端派生，先建立"条目即真相"的读模型）；4) `keep-warm`（独立定时器 + 账本，风险可控）；5) `recall`（依赖 classify/lineage/conversations，且要处理重启重放）；6) `side-chat`（fork 边界、effects、注入任务三块，依赖 conversations）；7) `dream`（依赖 automations/instance/cloud/lineage/subagents/side-chat，最后做）。

**风险**：`dream` 的切章是唯一会重启进程并换数据库的路径，`pending-chapter.json`、`settleSleep`、gate 的一次重建、seed 幂等四者任一错都会造成"数据看起来丢了"；`side-chat` 的缓存前缀要求（继承全部工具、身份说明用隐藏 entry）很容易被"优化"破坏；`keep-warm` 花的是用户的钱且与真实请求共享缓存，必须在发送前最后一刻校验；`recall` 的 README 与实现已漂移（`injected`、`Reloaded`/`Restarted` 文案），复刻应以源码为准；`context` 的 remove-all 折叠依赖 Pi 的条目顺序，属显式上游耦合；`questions` 的 `answerText` 编号格式与 `keyCard` 的全局键归属是行为契约，别只做视觉；七个扩展都非 core，必须在 `extensions.disable` 下干净降级（仓库有 `test/e2e/disable-each.test.ts` 做全量校验）。
