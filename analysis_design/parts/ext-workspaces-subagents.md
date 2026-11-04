# workspaces 与 subagents 分析笔记

## 1. 概览

这两个扩展共同构成 Ultimate 的“隔离执行 + 委派”底座：`workspaces` 把一个 conversation 变成可准备、可恢复的 Git worktree（isolate），并把提交串行化为 lander 队列，执行 merge → checks → fast-forward → push → 报告；`subagents` 把 bounded work 交给按 Markdown 定义配置的 child conversation，并提供 standing agents、fork、reporter/answer 去重与 Agents 配置界面。两者都是 core tier（各自 `api.ts` 的 `export const tier = 'core'`），是其他扩展可以直接 `need` 的基础服务；在扩展 API 上 `workspaces` 只依赖 conversations，`subagents` 依赖 workspaces 与 conversations。

| 名称         | 一句话职责                                                                  | 服务端入口                                          | 浏览器入口                      | 是否 core tier                          |
| ------------ | --------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------- | --------------------------------------- |
| `workspaces` | Git worktree 生命周期 + 同步/异步 landing + lander 队列与日志               | `extensions/workspaces/server.ts`（`order = -200`） | `extensions/workspaces/web.tsx` | 是（`extensions/workspaces/api.ts:49`） |
| `subagents`  | 子会话/常驻智能体的创建、消息、等待、停止、worktree land/discard 与定义管理 | `extensions/subagents/server.ts`                    | `extensions/subagents/web.tsx`  | 是（`extensions/subagents/api.ts:84`）  |

## 2. 逐扩展规格

### 2.1 `workspaces`

**职责与用户可见行为**

`workspaces` 给每个需要隔离的 conversation 分配 `<home>/worktrees/<conversationId>` 的独立 checkout 和 `ultimate/<home 哈希>-<id>` 分支；对话的工具因此在该目录运行，首个模型请求等待 preparation 完成。不能隔离时 `isolation` 返回 `{reason, empty}`，空目录可用 `setupGit` 做 `git init` 加空首提交；`isolation` 在可隔离且没有 lander 时调用 `standLander`，`setupGit` 在完成首提交后也调用它，因此首个 commit 不需要重启即可获得 lander。它同时提供两类落地：`workspace submit` 把干净的 tip 排入按 source 串行的 lander，由 lander 合并、执行检查、快进 target、按需 push 并回传结果；`workspace land` 是同步快速前进，不 rebase、不 push。用户可见的是 `workspace` 工具卡片、submit 状态与步骤、Info 面板的 Workspace 区、侧栏 lander 行，以及 root 中 lineage 的 landing note。

**导出与契约**

- 工具：`workspace`，`action` 为 `status` / `submit` / `land`；`submit` 必须带非空 `divergence`，且只有顶层 main 能 submit/land 自己的 workspace（`server.ts:259-299`）。
- actions：`github`、`progress`、`pending`、`create`、`isolation`、`setupGit`、`info`、`discard`、`stats`、`disk`；`setupGit` 列在 `userActions` 中（`server.ts:40,63-139`）。`progress {ids}` 最多 100 个 id；`pending {ids}` 含递归子代理；`disk` 一次测量复用一分钟（`refs.ts:17-35`，`workspaces.ts:496-518,1033-1057`）。`create {cwd?, title?}` 建 ownerless conversation 并返回 `{id}`；`github` 返回 `https://github.com/<owner>/<repo>` 或 null。`InfoAction` 返回 `WorkspaceInfo`（`ahead/tip/sourceTip/currentBranch/sourceBranch`），`ProgressAction`/`PendingAction` 返回 `KeptWork[]`，`StatsAction`/`DiskAction` 返回 `WorkspaceStats`/`WorkspaceDisk`，`LandResult`/`SubmitResult` 是工具结果形状（`types.ts:120-145`）。
- doc：`WorkspacesDoc = docRef<WorkspaceIndex>('ultimate.workspaces')`，`defineDoc` 为 `scope: 'conversation'`、`version: 4`、`history: 'latest'`、`fork: 'initial'`，只挂在 root conversation；`migrate` 兼容 `from < 3` 的旧结构与 v4 新增的 `steps/results`（`workspaces.ts:32-62`）。
- 事件：`workspaces.landed`（`SubmissionLanded`，`LandedData`；事件只带前 10 个 commits 和 `commitCount`、前 8 个 paths）和 `workspaces.check`（`CheckRan`，含 `passed|failed|flaky|timeout` 与 `ms`；每次 check 运行含 rerun/timeout，在记录结果的提交中发出）（`refs.ts:37-76`）。
- 持久化条目：lander conversation 中的 `ultimate.lander`（`LanderLog`）与 `ultimate.lander-ask`（`LanderAskEntry`）；submitter 中的报告输入 `workspaces.lander-report`（`lander.ts:40-42,1224`）。
- tasks：`workspaces.prepare`（`Preparation`）与 `workspaces.lander`（`Lander`）（`server.ts:246-248`，`workspaces.ts:314-436`，`lander.ts:491-1246`）。
- sections：`workspace_workflow`（每次请求前等待 `ready()` 并写入 workspace 路径/分支/提交指引）与 `lander_state`（lander conversation 专属，列出该 source 队列和最近 8 条结果）（`server.ts:300-341`）。
- hook：`ToolTask.beforeTool` 调用 `service.unavailable()` 和 `service.landerOwnsCheckout()`，不满足时 `{ block: reason }`（`server.ts:250-257`）。
- APIs：provided `workspaces`（`WorkspacesApi`）；同时实现 conversations 的 extension point `conversations.release`（`Release`）；wanted `workspaces.handoff`（`Handoff`，由 messages 提供）；needed `conversations`（`api.ts:12-49`，`server.ts:168-178`）。
- 其余导出：`WorkspaceConversation`、`useLanderQueue`（`data.tsx`）；`runningStep`/`superseded`/`inProgress`（`steps.tsx`）；`samePath`/`worktreePath`（`paths.ts`）；`setup`（`setup.ts`）；`LanderLog`/`LanderAskEntry`/`landerPath`/`landerCheckout`/`rematerializeLf`/`log`/`landerAgent`/`limitsFor`/`checkPids`/`sweepChecks`/`checkTemp`/`runLanderCheck`/`landerSettings`/`failurePrompt`/`createLander`（`lander.ts`）。
- server facet：`order = -200`、`docs = [Workspaces]`、`userActions = ['setupGit']`、`reloadOnSettings = true`（`server.ts:38-42`）。
- settings：`isolates.worktree.setup: string[]`；`lander.checks`（字符串或 `{command,timeout}`，数组表示并发组）、`lander.push`、`lander.deploy: {agent, paths}`（`setup.ts:9-41`，`lander.ts:328-383`）。`setup` 每条命令在 host shell 中以 `ULTIMATE_SOURCE` 指向源 checkout、2 分钟超时运行。

**状态与持久化**

`WorkspaceIndex` 的 `items` 保存 `{path,branch,base,source,target,state,error?,landed?}`，状态机为 `preparing|ready|failed|removed`；`queue` 保存 `QueueEntry`（`id, conversationId, source, target, tip, at, divergence, state: queued|landing, subject?, step?, steps, landed?, agent?`）；`landers` 是每个 source 的活动 taskId，`landerConversations` 是每个 source 的 lander conversation，`results` 保存最近 50 条结果（doc 由 Pi Durable 持久化到 SQLite；`types.ts:3-119`，`lander.ts:44,551-568`）。文件系统上还有 `<home>/worktrees/`、`<home>/lander/<sha256(source) 前 12 位>`、`<home>/lander-checks/*.pid`、`<home>/lander-tmp/`；`results` 超出 50 条即删最旧，`items` 的 `removed` 记录不删，下一次 `ready()` 会在同路径重建（`workspaces.ts:805-910,973-986`，`lander.ts:46-52,223-244`）。

**UI 位置**

`web.tsx` 注册 `workspace` 工具渲染器 `WorkspaceCall`，以及 entry 渲染器：`ultimate.lander → LanderLogEntry`、`ultimate.lander-ask → LanderAskEntry`、`workspaces.lander-report → LanderReport`，并拦截 `lineage.note` 中 `source === 'lander'` 的条目渲染 `LandingNote`（`web.tsx:109-122`）。Info 面板的 Workspace section 由 `extensions/info/web.tsx:428` 注册，内容来自 `panel.tsx` 的 `Workspaces` 与 `useWorkspacesMeta`（队列、当前 checkout、统计、磁盘）。侧栏的 lander 行由 `extensions/sidebar/lander.tsx:26-43` 读取同一个 index；本扩展自身没有 panel/slot/command。`landing.tsx` 导出 `Open`、`Subject`、`CommitCount`、`LandingCard`、`Review`（`workspaces.review` point）与 `useGithubRepo`；`ui.tsx` 再导出 `Open`、`CommitCount`、`Review`、`useGithubRepo`，供 sidebar/review 等浏览器端复用（`landing.tsx:19-265`，`ui.tsx:6-19`）。

**关键流程**

1. **准备**：`create(tx,id,cwd)` 校验 worktree 可隔离，计算路径与分支，写 `state: 'preparing'`，`configure(cwd)` 并创建后台 `workspaces.prepare`；`Preparation` 在 source 级 `serial` 锁内 `git worktree add`，再执行 `isolates.worktree.setup`，最后把状态提交为 `ready`（`workspaces.ts:314-436,925-952`）。
2. **submit**：校验 `divergence.trim()`、workspace `ready`、worktree 干净且仍在该分支；读取 tip、lander 路径、`lander` 定义、conversation `subject`；在一个事务内确认是顶层 main，取最新 entry id 作为 `at`，`landerIdle` 后 `ensureLander`，按 `conversationId + tip + queued` 去重，写 `queued` 日志并启动/复用 lander task；返回 `{id, position, lander, text}`（`workspaces.ts:717-783`）。
3. **lander**：`standLander` 幂等地为 source 创建/复用 `@lander` conversation（ownerless、label `lander`、cwd 为 lander checkout、standing 且关闭自动摘要），并用有效 `lander` 定义配置其 model/thinking/tools/instructions；`resume` 在 task 缺失时重启队列。`next` 取出该 source 最早的 queue entry，标记 `landing` 并写 `started`；`land` 每轮把 lander checkout 重置到 target tip，可选 fetch/merge `lander.push` 的远端，merge submit tip，执行 `setup` 和 `lander.checks`；检查失败先重跑一次，仍失败或 merge 冲突则交给 `onFailure`（`diagnose` 默认，`fix` 可修复一次），以 requestId `lander-agent:<id>:<attempt>` 向 lander conversation 写入 `ultimate.lander-ask` 并等待模型；`diagnose` 会 reset 后报告答案，`fix` 只有在 checkout 干净、无未完成 merge、且有基于失败 head 的新提交时才进入下一轮，否则按未落地报告；通过后 `git merge --ff-only`（target 已 checkout 时）或 `update-ref` 快进，记录 queue entry 的 `landed`，按需 push，最后 `report`（`workspaces.ts:238-265`，`lander.ts:496-1089`）。
4. **报告与部署**：`finish` 把结果写入 `results`、写 `ultimate.lander` outcome、在 `landed` 时发 `workspaces.landed`；随后 `report` 阶段向 submitter 提交 `workspaces.lander-report`。`report` 还检查 `lander.deploy`，匹配路径前缀时通过 `Handoff.send(..., 'lander-deploy:<id>')` 向 resident agent 发一条 `reply:false` 消息，不等待部署结果（`lander.ts:551-607,1140-1230`）。
5. **同步 land / 释放**：`land` 在 `serial` 内校验干净、target 已 checkout、workspace 分支未变，拒绝分叉并执行 `git merge --ff-only`；`release` 从最深层后代向上处理，只在无 uncommitted、无 unlanded、无 busy/descendant 时标记 `removed` 并 `finishRemoval`，失败则保留并记录 `reason`；`discard` 只移除干净 checkout 并保留分支（`workspaces.ts:571-716,973-986`）。

**失败与恢复**

准备失败只回滚自己创建的注册 worktree，保留输出尾部到 `error`（最多 4000 字符）；下一次工具调用通过 `unavailable → ready(..., true)` 重试，若失败但 checkout 仍有改动则保留并报告。被释放/中断的 checkout 会在下一次请求按同路径重建：有未落地分支则保留其 tip 作为新 base，否则从 target tip 开始；嵌套 isolate 先准备 source 父级。lander 用 `prepared`、`merged`、`check:*`、`fix-verdict:*` memos 保证崩溃后不重复合并/检查；queue entry 的 `landed` 在 fast-forward 的同一提交记录，后续 task 可跳过 merge/checks 直接推送并报告。本地已 land、push 失败仍以 `landed` outcome 加 `reason` 结束并发出 `workspaces.landed`；deploy 失败只写 warning step 和 notice，不改变 landed；没有 `lander` 定义时失败不调用模型，直接报 `reason`/`output`。`onOpen` 会先后台 `release` 已 concluded 的 conversations（失败 `notice`），并 `standLander`/`sweepChecks`/`resume`；定义目录变化（200ms debounce）重新 `standLander`，`onClose` 中止 release。`landerOwnsCheckout` 在 lander 正在 landing 某 submission 时阻止该 lander conversation 的普通工具调用，只有 requestId 以 `lander-agent:<submission>:` 开头的失败修复 run 例外。task fault 由 `subscribeCommits` 识别：旧代码 task fault 立即 `resume()`，当前代码 fault 等下一次 submit/open；`sweepChecks` 清理上次进程遗留的 check 进程与临时目录（`workspaces.ts:294-311,784-910`，`lander.ts:223-244,827-1088,1234-1245`）。

**关掉它会发生什么**

它是 core tier，正常不能被禁用；若从源码移除或 provider 缺失，`workspace` 工具、worktree 准备、lander 队列和 landing 全部消失；`subagents` 的 `isolate: "worktree"` 会因 `workspaces.create` 缺失而无法启动，`lineage` 的 isolated branch、`self` 的 restart 前置检查、`watchdog` 的队列读取也会失去依赖（推断：`host.need` 会报缺失 provider）。`workspaces.create` 仍保留 `extensions().some(name === 'workspaces' && enabled)` 的防御性检查（`workspaces.ts:925-931`）。

**复刻要点**

- 一个 root doc 承载全部 worktree/queue/lander/结果状态；不要把 landing 状态拆进 conversation 元数据，否则重建与卡片读取会分叉。
- “准备”和“落地”都必须是 durable task + memo，且在 source 级串行；任何目录删除都不能 force，先确认注册关系和当前分支 tip。
- lander 的模型只在失败时介入，正常路径全部是代码；`onFailure` 的 `diagnose|fix`、单次 fix、3 次 target 移动重试、push 拒绝重试一次，是行为契约而非优化。
- 日志要同时写两处：lander conversation 的 `ultimate.lander`（完整、无模型消息）与 submitter 的 `workspaces.lander-report`（卡片）；`results` 只留 50 条。
- UI 统一用 `LandingCard`/`Subject`/`CommitCount`，否则 lander 日志、submitter 与 root note 三处会出现不一致。

**证据**

- `extensions/workspaces/api.ts:12-49`（`WorkspaceService`、`WorkspacesApi`、`Handoff`、core tier）
- `extensions/workspaces/refs.ts:14-76`（doc/actions/events）
- `extensions/workspaces/types.ts:3-145`（`WorkspaceIndex`、`QueueEntry`、`LanderOutcome` 等）
- `extensions/workspaces/server.ts:38-42,63-139,166-178,196-245,246-341`
- `extensions/workspaces/workspaces.ts:32-62,314-436,571-783,784-910,925-1057`
- `extensions/workspaces/lander.ts:40-153,250-383,474-1245`
- `extensions/workspaces/setup.ts:9-41`；`paths.ts:7-19`
- `extensions/workspaces/web.tsx:109-122`；`log.tsx:497-554`；`landing.tsx:74,96-135,186-265`；`panel.tsx:26-57`
- `extensions/info/web.tsx:428`；`extensions/sidebar/lander.tsx:26-43`

### 2.2 `subagents`

**职责与用户可见行为**

`subagents` 把“有界执行/侦察”做成独立 conversation：`subagent start` 按定义创建 child（可选 `background`、`fork`、`isolate`），foreground 直接返回答案，background 返回 child id；`message`/`wait`/`stop`/`list` 管理生命周期，`land`/`discard` 管理 worktree child（`land` 要求 child 干净且空闲，source 的无关脏文件不阻塞；`discard` 只移除干净 checkout 并保留分支）。它同时提供 resident（standing）agent 与 Markdown 定义（内置 `agents/`、`~/.ultimate/agents/`、项目 `.ultimate/agents/`），child 的 instruction/report 以带 sender/source 的卡片进入 transcript，而不是普通用户消息。

**导出与契约**

- 工具：`subagent`，`action` 为 `start|message|wait|stop|list|land|discard`；参数 `agent,task,background,fork,id,text,steer,isolate`；`replay: 'safe'`，结果 details 带 `conversationId,background?,yielded?,answerId?`（`server.ts:865-891,892-1088`）。`createChild` 默认 `excludeTools:['subagent']`/`excludeExtensions:['subagents']`，只有 definition 的 `tools` 显式含 `subagent` 才开放子委派；definition 的 `summaries === false` 会让新 child 关闭自动摘要（`children.ts:66-83`，`server.ts:1002-1003`）。
- actions：`standing {name}`、`definitions`、`definition {name}`、`saveDefinition`、`deleteDefinition`（`refs.ts:89-112`，`server.ts:371-525`）。
- docs：`Subagents`（`ultimate.subagents`，per-conversation，`agents`/`actions`）、`Standing`（`ultimate.standing-agents`，root，`{name: conversationId}`）、`Profile`（`ultimate.agent-profile`，per-conversation，`{definition?}`）（`api.ts:15-69`）。
- 事件：`subagents.started`（`Started`，本扩展发 `child|standing`，`branch` 由 lineage 发；携带 `{id,agent,model?,thinking?,parent?}`）（`refs.ts:76-83`）；浏览器总线事件 `subagents:open-definition`、`subagents:definition-closed`、`subagents:source`，以及核心 `ultimate:reveal-entry`（`definitions.tsx:158-166`，`messages.tsx:19-27`）。
- tasks：`ultimate.subagent-anchor`（`Anchor`）和 `ultimate.subagent-reporter`（`Reporter`）；hook `GenerationTask.afterTools`；sections `subagent_state`、`subagents`（`server.ts:66-79,103-269,772-862`）。
- APIs：provided `subagents`（`SubagentsApi`，`residents/standing/createChild`）；实现 models 的 `Pin` point；needed `conversations`、`workspaces`（`api.ts:71-84`，`server.ts:551-608`）。
- entries：`subagents.instruction`、`subagents.report`（`server.ts:131-140,235-244`）。
- 其余导出：`Invalid`/`Discovery`/`Shown`/`DefinitionFields`（`refs.ts`）；`Tag`/`Heading`/`useRefresh`（`parts.tsx`）；`sourceLabel`（`definitions.tsx`）；`Field`/`StandingField`/`SummariesField`/`Segmented`/`thinkingLevels`/`ModelField`/`ToolsField`/`InstructionsEditor`/`inputClass`（`fields.tsx`）；`AgentMessages`/`AgentInput`/`AgentInbox`（`messages.tsx`）；`talkToUltimate`/`openAgentSource`（`ui.tsx`）；`landing`（`landing.ts`）；`AgentOrigin`（`message-types.ts`）。
- server facet：`docs = [Subagents, Standing, Profile]`、`reloadOnSettings = true`（`server.ts:65,350`）。
- 设置：没有 `.ultimate/settings.json` 键；定义 frontmatter 支持 `name,description,resident,isolate,model,thinking,tools,denyTools,onFailure,fast,summaries,addTools`，overlay 用 `addTools` 合并（`refs.ts:15-33`；README 第 17 行）。`Definition` 含 `source/path/model/thinking/tools/addTools/denyTools/isolate/resident/onFailure/fast/summaries/overlays`；`Shown` 另带 `invalid/source/path/raw/files`；表单保存不直接接受 `addTools`，已有 overlay 时由 `saveOverlay` 写（`refs.ts:15-56`，`server.ts:504-516`）。

**状态与持久化**

`Subagents` doc 以 child id 为 key 保存 `{conversationId,agent,background,reported}`，以 `callId` 为 key 保存 action `{conversationId,reporter,answer?,status?}`；status 依次可为未设置（投递中）、`done`、`unanswered`、`interrupted`、`failed`、`given-up`（final）。`reported` 是已交付的 assistant entry id，`answerRequest(answer)` 即 `subagent-answer:<id>` 保证跨重启不重复交付。`Standing` 在 root 保存 `{name: id}`；`Profile` 记录定义名；三个 doc 都是 `history: 'latest'`、`fork: 'initial'`，由 Pi Durable 持久化到 SQLite。Reporter task 是实际投递/等待的 durable 单元；`Anchor` 让 child 归属一个独立的后台 task，父对话停止不会停 child。Retention：除 standing 退休外没有显式清理，随 conversation/doc/task 存储保留；standing 定义消失时由 `pruneRetired` 删除 `Standing` 项、`label` 和 standing 标记（`api.ts:15-69`，`refs.ts:76-86`，`server.ts:561-592,663-741`）。

**UI 位置**

`web.tsx` 注册：panel `{id:'agents', title:'Agents', icon:NetworkIcon, order:3}`；tool `subagent → SubagentCall`；entries `subagents.instruction`/`subagents.report → AgentInput`；inbox `AgentInbox`；slots `overlay: [DefinitionDialog, LandOnUltimate]`、`header.right: [AgentMessages]`；commands `subagents.ultimate`（`mod+0`，`Talk to @ultimate`）与 `subagents.open`（打开 agents panel）（`web.tsx:328-347`）。`SubagentCall` 用 `details.background`/`details.yielded` 显示 `bg`、`wait yielded`，并从 root workspace doc 读取 child 的 `IsolateBadge`；`ChildList` 渲染 `list` 的 JSON，`Landed` 渲染 `land`/`discard` 的 `LandResult`。`DefinitionDialog` 的 id 是 `subagents.definition`，UI 状态 key 是 `definition`；`LandOnUltimate` 在没有选中 conversation 时打开 `@ultimate` 或创建它（`definitions.tsx:44-45,154-177`，`web.tsx:84-326`）。

**关键流程**

每轮模型请求前，`subagent_state` 只提醒仍运行的 child 与待投递输入；`subagents` section 在工具包含 `subagent|branch|automation` 时列出可用定义（`server.ts:821-862`）。

1. **start**：发现定义并校验必须存在、且其显式 `tools` 是父工具的子集；解析 `isolate`（参数覆盖定义）；`fork` 时从 `conversation.viewState()` 找到当前 assistant 调用的前一个 entry 作为 `forkAt`（无历史则报错）。事务内 `requestSummary(reason:'spawn')`、创建 `Anchor` task、`createChild`（owner 为 anchor task）、记录 `state.agents[id]`；若隔离，`workspaces.create` 并把 checkout 路径/分支/“commit, never push”指令追加到定义 instructions；再创建 `Reporter` 并记录 action（`server.ts:926-1041`）。
2. **前台/后台**：background 立即返回 `Started subagent <id>`；foreground 调 `waitInterruptibly`，若父 inbox 出现 steer 则返回 `Wait yielded ...` + `details.yielded:true`，child 继续跑；否则返回 reporter 的答案、`Returned model:` 和 `details.answerId`（`server.ts:287-347,1042-1088`）。
3. **message / wait / stop**：message 复用同一事务路径，只创建 Reporter，`steer:false` 时 `followUp` 否则 `steer`；wait 等待该 child 的所有 reporter，读取最新 `AssistantEntry` 并标记 `reported`；stop 先 memo `stopTarget` 捕获 run/reporters/watchdog，再 abort 这些 task、取消 queued submission、循环 abort 捕获到的 run，最后只报告 worktree 中 staged/unstaged/untracked 路径，不提交、不删除（`server.ts:1092-1217`）。
4. **reporter 与恢复**：Reporter 在 child 上 `submit({entry:'subagents.instruction', whenBusy: steer?'steer':'followUp', requestId:'subagent:<taskId>'})`，完成后把答案写成父对话的 `subagents.report`（`whenBusy:'steer'`, requestId `subagent-answer:<answer>`）；初始 input 带 `answer` 时直接进入 `report` 阶段，这是 `recover()` 补交的路径。`model_error`/`no_model` 静默结束并标 action `failed`，由 watchdog 负责重试/失败卡；`recover()` 扫描 done submission，处理 one-way `board.message(reply:false)`、`board.reply` 和失败后的手动继续/`watchdog-retry:`，原子地创建 Reporter 并记 `reported`（`server.ts:103-269,663-741`）。
5. **standing**：`standing(name)` 只接受 `resident: true`；新 conversation 用 `hostDefaultModel` + root thinking，已有 conversation 保留自己的 model/thinking（定义 pin 时覆盖）；cwd 固定为 `host.projectRoot`，忽略定义里的 `isolate`；metadata 写 title `@name`、label `agent`；每次刷新都 `configure`、`setAutomaticSummaries(false)`、`setStanding(true)`、写 `Profile.definition`，只有新建时才发 `Started(kind:'standing')`；定义消失后由 open 或下一次 `standing` 调用触发 `pruneRetired`，且只有“所有定义都能解析”时才真正退休（`server.ts:561-659`）。
6. **定义编辑**：`definitions` 返回定义（去掉 instructions）、parse errors、main model/tools、user/project 保存目录和 project setup 状态；`saveDefinition` 严格校验 frontmatter，已有 overlay 时 `saveOverlay`，否则 `saveDefinition`；`create` 拒绝重名（`server.ts:383-523`，`definitions.tsx:251-630`）。

**失败与恢复**

child 无文本、`stopReason` 为 `aborted`/`error` 都算“未回答”：reporter 发 `[subagent <id> failed: ended its turn without an answer]`，foreground/wait 返回可继续提示；provider 临时错误 60 秒后重试一次，持续或非临时失败由 watchdog 以 `watchdog.failure` 报告，action 到 `given-up`；成功的 `watchdog-retry:` 输入按普通 report 恢复（README 第 10 行；`server.ts:172-181`）。父 `stop` 先 abort reporter，因此保持静默；child 自己停止则 action 标 `interrupted`，之后用户 `continue` 或父的一次 one-way message 产生的答案由 `recover()` 补交。`afterTools` 对成功 tool result 的 `answerId`/`subagentAnswers` 删除对应 queued inbox 报告并结算 `subagent-tool-delivered`，避免“工具已返回 + reporter 又发一遍”。定义解析失败只列出错误、不退休现有 standing；`start` 时定义工具不在父工具集内会直接拒绝（`server.ts:80-102,103-269,772-818`）。

**关掉它会发生什么**

core tier，正常不能关闭；若移除，`subagent` 工具与 Agents 面板消失，standing agent 无法创建/刷新，`messages`、`automations`、`onboarding` 等需要 `SubagentsApi`/`Subagents` 的扩展会缺 provider；依赖 `subagents.started` 的 system/activity 也失去事件来源（推断：core 删除属于破坏性改动）。

**复刻要点**

- child 归属 `Anchor` task 而不是父 run；前台等待只是“等待风格”，不能把 child 生命周期绑在父 run 上。
- 每个 start/message 必须有 Reporter task，requestId 用 `subagent:<taskId>`，答案交付用 `subagent-answer:<entryId>`；`reported` 与 `afterTools` 收据是防重复的两道闸。
- `Subagents` doc 的 actions key 用 `callId`，这样 replay 能返回同一结果；stop 必须先 memo 捕获身份再 abort。
- 定义发现/overlay 的保存要原子写，standing 刷新要在一个事务内完成；standing 退休必须等所有定义都可解析，否则一个拼写错误会误删。
- fork 只复制父对话到调用前一个 entry，且 child 的 doc 按 fork policy 复制；不要复制 `ultimate.subagents` 索引。

**证据**

- `extensions/subagents/api.ts:15-84`（三个 doc 与 `SubagentsApi`）
- `extensions/subagents/refs.ts:15-112`（`Definition`、actions、`Started`、`StandingAction` 等）
- `extensions/subagents/children.ts:23-85`（`started`、`createChild`）
- `extensions/subagents/server.ts:66-79,103-269,287-347,350,371-525,561-659,663-767,772-862,865-1219`
- `extensions/subagents/web.tsx:328-347`；`definitions.tsx:44-45,154-177,251-630`
- `extensions/subagents/fields.tsx:45-87,296-375`；`messages.tsx:14-181`
- `extensions/subagents/ui.tsx:12-28`；`landing.ts:6-13`

## 3. 跨扩展协作

| 调用方                                      | 被调用方 / 契约                                                                                                    | 用途                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subagents`                                 | `WorkspacesApi.create/get/land/discard/git`                                                                        | isolated child 的 worktree 创建、状态徽章、`land`/`discard`、父 checkout dirty 警告（`subagents/server.ts:958-962,1017-1026,1042-1044,1165-1184`）                               |
| `lineage`                                   | `WorkspacesApi.create`、`get`、`SubmissionLanded` reactors                                                         | 创建 isolated branch；`conclude-landed`、`landing-notes`、`memorize` 在 landing 后收尾/写 root note（`lineage/server.ts:943,1443-1503`）                                         |
| `messages`                                  | `Handoff` provider、`SubagentsApi.residents/standing`、`Subagents`/`Standing` docs                                 | lander 的 deploy 一次性消息由 messages 实现；地址簿解析 `@name`、lander 与 child（`messages/server.ts:87-90`，`messages/addresses.ts:22-49`）                                    |
| `automations`                               | `SubagentsApi.createChild/standing`；`workspaces.landed`/`workspaces.check` 触发                                   | 定时/事件 run 复用定义创建 child，standing 目标解析；事件触发器（`automations/triggers.ts:17-32`，`automations/server.ts:224`）                                                  |
| `review`                                    | `Review` point（`workspaces.review`）、`SubmissionLanded`、`WorkspacesApi.doc`                                     | 打开 `<base>...<sha>` 的 review；landing 列表（`review/web.tsx:42`，`review/server.ts:22,71,130`）                                                                               |
| `info` / `sidebar` / `status-line` / `plan` | `Workspaces`/`useWorkspacesMeta`、`useWorkspaceIndex`、`useWorkspaceConversations`、`ProgressAction`、`InfoAction` | Info 的 Workspace section、侧栏 lander 行/in-flight 提示、计划里的 workspace 状态（`info/web.tsx:428`，`sidebar/lander.tsx:26-43`，`status-line/web.tsx:21`，`plan/web.tsx:40`） |
| `system` / `activity`                       | `subagents.started`、`workspaces.landed`/`workspaces.check`                                                        | 运行记录中的 agent/model/kind/parent；活动流事件（`system/server.ts:246-258`，`activity/feed.tsx:18`）                                                                           |
| `self` / `onboarding`                       | `WorkspacesApi.get/git`、`IsolationAction`、`setupGit`、`SubagentsApi.standing('ultimate')`                        | restart 前要求已 land；首次 Git setup 与 @ultimate 入口（`self/server.ts:49-56`，`onboarding/server.ts:340`）                                                                    |
| `watchdog`                                  | `WorkspacesApi.doc` 的 queue                                                                                       | 有 landing 队列的 conversation 不触发 idle 提醒（`watchdog/idle.ts:26-27`）                                                                                                      |

补充：`workspaces` 的 `Handoff` 是由 messages `implement` 的 extension point，`send(from,{to,text,reply:false},requestId,ctx)` 以 sender-scoped receipt `lander-deploy:<submission>` 原子提交，崩溃重放不会重复发送；workspaces 只 `want`，因此不反向依赖 messages。`subagents` 的 `Pin` 是 models 的 point，它只实现、不拥有。两者都不是 reactor 扩展：`workspaces` 用 `subscribeCommits` 监听 Pi task fault，`subagents` 用 `subscribeCommits` 监听 submission 记录（`workspaces/server.ts:206-223`，`subagents/server.ts:747-767`，`lander.ts:1174-1190`）。

## 4. 复刻顺序建议与风险

### 4.1 顺序

1. 先做 `lib/git.ts`、`lib/shell.ts`、`lib/process-group.ts`、`lib/exec.ts` 与 `lib/agents.ts`：worktree、shell、检查进程容器、定义解析是所有上层行为的地基。
2. 做 `workspaces` 的 doc + `WorkspacesApi` + `paths/setup` + `Preparation` + `create/ready/land/discard/release`；先用假 lander 验证 worktree 创建、dirty 拒绝、保留未落地分支、removed 重建。
3. 加 `lander` task：先 merge/ff/记录 `landed`，再加 checks、memo、`workspaces.check`/`workspaces.landed`，最后加 `onFailure` 与 deploy handoff；用故障注入验证崩溃窗口。
4. 做 `subagents` 的 `Subagents/Standing/Profile` doc、`createChild`、`subagent` 工具、Reporter 与 `recover()`；先让 foreground 单 child 跑通，再加 background/yield/stop/receipt。
5. 加 standing、定义 actions 与 Agents UI；最后接 fork、`isolate: worktree`、`land`/`discard`。
6. 最后按依赖顺序接 `lineage`（landing note/conclude）、`messages`（Handoff/board）、`automations`（triggers/standing）、`review`（Review point）、`sidebar/info/status-line/plan`（浏览器消费者）与 `onboarding`（setupGit）。

验收至少覆盖：① 创建后 setup 失败，修复 PATH 后同一对话的下一次工具调用自动重试并可用；② submit 在 lander 崩溃后从 `prepared`/`landed` 继续，且不会二次 merge 或二次 push；③ 父对话 stop 不会停 child，只有 `stop {id}` 会停并列出未提交文件；④ lander 日志、submitter 报告、root landing note 三处卡片一致。

### 4.2 风险

- **lander 的崩溃窗口**：`prepared`、`merged`、check、`fix-verdict` 四个 memo 与 queue entry 的 `landed` 必须按源码顺序写入；少一个就会重复 merge、重复检查或重复推送。`finish` 必须在同一事务里移出 queue、写 results、写 outcome 日志并发出 `workspaces.landed`，随后才进入 `report` 向 submitter 投递；否则 UI 与恢复逻辑会分叉。
- **source 串行与删除安全**：`serial(source)` 只覆盖本进程；README 明确说没有跨进程 landing 锁（推断这是已知限制）。删除永远不能 force，`finishRemoval` 要先验证 `HEAD` 等于记录的分支 tip，否则会丢掉用户改动。`release` 的祖先/后代保留是最容易回归的部分：一个 kept descendant 必须连带 kept 其所有 ancestors，且 `removed` 记录在并发 recreate 时必须由同一 source 队列串行（`workspaces.ts:571-647`）。
- **检查进程容器**：`runLanderCheck` 依赖 POSIX process group 或 Windows Job Object（`lib/process-group.ts`），watchdog 2 分钟无输出/10 分钟总计、`timeout` 同时压低两者；移植到没有这些能力的运行时会导致子进程泄漏。
- **README 与实现漂移**：`workspaces/README.md` 第 108 行说 lineage 对 `workspaces.check` 写 landing note，但当前 `extensions/lineage/server.ts` 只订阅 `SubmissionLanded`；`workspaces.check` 的实际消费者是 `automations/triggers.ts:29`。复刻时以代码为准，别把 README 当作契约。
- **subagent 交付去重**：`reported`、`subagent-answer:<entryId>`、`afterTools` 的 `subagent-tool-delivered` 三者缺一不可；尤其 `recover()` 对 `interrupted`/`unanswered`/`failed`/`given-up` 与输入 entry 顺序的判断，最容易在重放时重复或丢报告。
- **standing 退休**：`pruneRetired` 只在 `errors.length === 0` 时删条目；如果为了“清理”提前退休，一个临时 parse error 就会把 standing conversation 变成普通会话。
- **fork 成本与 doc policy**：fork 复制父上下文，成本高于 fresh child；`ultimate.subagents`/`Profile` 从 `initial` 开始，`pi.agent`/`codemode.store`/`ultimate.ui` 按 `asOf` 复制。复刻时若把 child 的 `ultimate.ui` 当 root UI 读，会污染 Agents 展示（README 已明确只有 root 的 UI doc 被 web 读取）。
- **UI 语义**：`LandingCard` 的 `tone`（landed/pushFailed/failed）、`StatusChip` 的 `queued #N`/`landing`/`Not landed`、`Steps` 的折叠与 `full log in #<lander>` 是用户可感知契约；只做 Markdown 输出会被判为未复刻。
