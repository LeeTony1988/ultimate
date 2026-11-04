# 10 · 内置扩展目录（53 个）

> 本章是逐扩展的产品/技术规格汇总。每个扩展的详细笔记在 `parts/ext-*.md`，此处给出总览、分层、跨扩展协作与逐项规格。
> 全部内置扩展默认开启，除 `defaultOff` 列出的 8 个（`cloud, parallel, tailscale, health, classify, phase, sounds, voice-live`）。

## 1. 分层与核心层

**Core tier（15 个，永不禁用）**：`agent`、`coding-tools`、`conversations`、`documents`、`lineage`、`messages`、`models`、`notices`、`onboarding`、`prompt`、`secrets`、`sidebar`、`subagents`、`theme`、`workspaces`。

依赖层次（低 → 高，`docs/extensions.md`）：

```
1  prompt  coding-tools  documents  notices  secrets  theme
2  models
3  conversations
4  workspaces
5  subagents
6  lineage
7  messages
8  onboarding  agent
9  sidebar
可选层：plan tasks todos phase automations goal pause review
        context recall dream side-chat keep-warm questions classify
        status status-line health info setup update instance watchdog system debug activity codemode self
        cloud tailscale browser voice voice-live parallel claude-code fast sounds splash
```

## 2. 扩展总表

> "一句话职责"取自各扩展 README 首段；详细契约见后文与 `parts/`。

| 扩展          | 职责                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| activity      | The right panel's Activity tab: what happened in the project, newest first, from the durable event log.                                                          |
| agent         | The built-in Agent surface: the conversation in a centred column, with the sidebar and the right panel beside it.                                                |
| automations   | Durable schedules, domain events, context thresholds and supervised scripts, with actions that start prompt runs or wake subscribed conversations.               |
| browser       | Prefer ego-browser (ego-lite) for browsing and browser-based testing.                                                                                            |
| classify      | Classify provides typed judgments from TypeSafe's Jev System One model to other server facets.                                                                   |
| claude-code   | Claude Code is an experimental provider that uses the external CLI login, with a setup panel and no in-app OAuth flow.                                           |
| cloud         | Cloud Encrypted project backups in the user's cloud, inert until configured.                                                                                     |
| codemode      | Run an async JavaScript function body in a fresh QuickJS/WASM sandbox.                                                                                           |
| coding-tools  | Commits made through the shell tool (`bash`, or `powershell` on Windows) carry an `Ultimate-Conversation: <id>` trailer via process-local Git config hooks; c... |
| context       | What the model saw before a conversation's first input: a quiet header above it names the agent, its model and the estimated token budget, and opens to the a... |
| conversations | What each conversation is about: titles, summaries, features and reply summaries, the overview the sidebar reads, and concluding and resuming conversations.     |
| debug         | A read-only `debug` tool for finding out why something did or did not happen in the running Ultimate, and for following one chain of work across extensions.     |
| documents     | Show the shown conversation's extension documents in the right panel, each through its extension's renderer or as JSON.                                          |
| dream         | Dream: a working session in which Ultimate processes what it learned, like people do while they sleep.                                                           |
| fast          | Fast mode runs the OpenAI models named in `fastModels` on the priority service tier, about twice the output speed.                                               |
| goal          | Hands-off goals: put @ultimate on a goal and go away; it decides what it would otherwise ask you, records each decision with its reason, and leaves a report.    |
| health        | Tracks whether each model provider works on this machine, from every real response, and reports a failing one to the `setup` status-line item.                   |
| info          | What this Ultimate runs on, in the right panel's Info tab: the shown conversation's workspace (its checkout, the lander queue and every checkout counted, fro... |
| instance      | Run an on-demand second Ultimate to test core changes before restarting the shared host, or, in another project, to check that project's `.ultimate/` extensi... |
| keep-warm     | Keeps @ultimate's Claude prompt cache warm while you are away for a while, so your next message reads the whole conversation from the cache instead of writin... |
| lineage       | A project is a forest of conversation trees.                                                                                                                     |
| messages      | Messages Durable messages between conversations, standing agents and the user.                                                                                   |
| models        | Model, thinking, and login, as Pi does them: a model button and a thinking-level button in the composer toolbar, a searchable model picker grouped by provide... |
| notices       | Notices as small toasts centred under the header, so they never cover the sidebar or an open right panel: what the server reports with `notice` events (a fai... |
| onboarding    | Inline setup choices, the first-run prerequisites, and the Extensions panel that turns extensions on and off live.                                               |
| parallel      | Search the public web and fetch clean page content with parallel.ai through `web_search` and `web_fetch`.                                                        |
| pause         | Pause the whole Ultimate host and continue it with Play.                                                                                                         |
| phase         | Phase Working-phase labels, classified by Jev after each tool round.                                                                                             |
| plan          | Keep epics and tasks in a durable conversation ledger, with open work visible in the prompt.                                                                     |
| prompt        | Ultimate's system prompt: coding guidelines, project context, skills, and the source reload layers.                                                              |
| questions     | Questions Answer cards for @ultimate's questions to the user.                                                                                                    |
| recall        | Recall Recall brings a project memory back to @ultimate when a message calls for it, deep in a long context where the memory index from its start has faded.     |
| review        | The Review surface: the project's local Git diffs, its files on the left and their changes on the right, rendered with `@pierre/diffs` in Ultimate's fonts an... |
| secrets       | Manage user-global secrets through metadata-only server actions, shared by every Ultimate project.                                                               |
| self          | Ultimate's awareness of its own code: the replay-safe `restart` tool requests a type-checked core swap from the supervisor (`pnpm start`).                       |
| setup         | What isn't set up on this machine, and what that costs: one status-line item, `⚠ N setup issues`, shown only while something warns.                              |
| side-chat     | Side chats are temporary, ownerless copies of the standing @ultimate conversation.                                                                               |
| sidebar       | The Agent surface's sidebar and, on phones, the title bar's @ultimate button: talk to @ultimate, see each root's tree with what is in flight and what landed,... |
| sounds        | Sounds Short, soft notification sounds when @ultimate talks to you: a question (needs input), a finished answer, or a failed run.                                |
| splash        | Ultimate opens with its name: the ULTIMATE wordmark draws itself over the whole window while the app loads, and the app comes up once the page is ready.         |
| status        | One compact, read-only summary of this Ultimate for dashboards that poll several instances: the clone's commit, failed runs, provider health, open questions ... |
| status-line   | The line under the composer (`composer.status`) shows the conversation's cwd/workspace and git branch, `↑input ↓output R cacheRead W cacheWrite`, cache hit r... |
| subagents     | Delegate bounded work with `subagent`: `start {agent, task, background?, fork?}`, `message {id, text, steer?}` (steers a busy child unless `steer: false` que... |
| system        | One stream of everything Ultimate records: durable events (`host.eventLog`) and the call trace (`host.trace`: service, action, reactor, tool and model calls)... |
| tailscale     | Expose Ultimate over Tailscale HTTPS, admitting only explicitly allowed Tailscale logins.                                                                        |
| tasks         | The live durable task graph in the right panel's Tasks tab: every conversation with live work, its tasks as a tree by owner (generation → tool calls → the co... |
| theme         | The "Toggle light and dark theme" command in the palette.                                                                                                        |
| todos         | To-dos The project's short list of open loops, each owned by the user or @ultimate.                                                                              |
| update        | Update Keeps the Ultimate clone the host runs from (`host.ultimateRoot`, the `<self>` block's "Ultimate (running host)") current with its `origin`, by fast-...  |
| voice         | Voice input: a mic button beside Send records speech and puts its transcript into the draft at the cursor, unsent.                                               |
| voice-live    | Live voice pairs GPT-Live's audio with a fast Luna agent that decides what to pass to @ultimate.                                                                 |
| watchdog      | Reports failed runs to their subagent owner or @ultimate, and reminds @ultimate about open branches idle for more than 30 minutes (two hours while the branch... |
| workspaces    | Workspaces An isolated conversation gets its own Git checkout.                                                                                                   |

## 3. 按功能域分类

### 3.1 会话与运行时骨架

`agent`（Agent surface）、`prompt`（系统提示）、`coding-tools`（读写编辑/shell）、`models`（模型/登录/思考）、`conversations`（标题/摘要/结束）、`documents`（文档面板）、`notices`（toast）、`theme`（明暗）、`secrets`（密钥）。

### 3.2 树、协作与落地

`lineage`（root/branch/tally/memory）、`messages`（跨会话消息/branch/note）、`subagents`（子智能体/常驻）、`workspaces`（worktree/lander）、`sidebar`（侧栏/@ultimate）、`onboarding`（首启/setup 卡/扩展面板）、`self`（restart 工具与热替换 UI）。

### 3.3 计划与执行

`plan`（epic/task）、`tasks`（任务图面板）、`todos`（待办）、`questions`（回答卡）、`automations`（调度/脚本/事件/阈值）、`goal`（离线目标）、`pause`（暂停）、`watchdog`（失败/闲置提醒）、`review`（Git 评审 surface）。

### 3.4 上下文与记忆

`context`（上下文头）、`recall`（记忆召回）、`dream`（睡眠式复盘/分卷）、`side-chat`（侧聊）、`keep-warm`（缓存保温）、`compact`（由 conversations 提供）、`classify`（Jev 分类）、`phase`（阶段标签）。

### 3.5 观察与运维

`status`（单次健康摘要）、`status-line`（底部状态行）、`health`（provider 健康）、`info`（Info 面板）、`setup`（setup 问题）、`update`（自更新）、`instance`（第二实例）、`system`（事件+trace 流）、`debug`（只读诊断工具）、`activity`（Activity 面板）、`codemode`（JS 沙箱与 `ultimate.*` 自省 API）。

### 3.6 外部集成与体验

`cloud`（加密备份）、`tailscale`（tailnet 暴露）、`browser`（浏览器工具）、`voice`（语音输入）、`voice-live`（实时语音）、`parallel`（web_search/web_fetch）、`claude-code`（provider）、`fast`（优先级队列）、`sounds`（提示音）、`splash`（启动字标）。

## 4. 横向模式（所有扩展共有的"形状"）

1. **每个扩展都有 `README.md`**：第一段是面板里显示的一句话摘要，随后是完整语义。
2. **server facet 导出**：`default`（对象或 `(host)=>Extension`）、`actions`、`userActions`、`pollActions`、`docs`、`secrets`、`reloadOnSettings`、`order`。
3. **web facet 导出**：`defineWebExtension({ slots, panels, surfaces, tools, toolLines, entries, inbox, composer, link, messageActions, messageDetails, answerLabels, userBubble, compact, intro, documents, commands, provides })`。
4. **契约三件套**：`api.ts`（服务端服务/文档 token）、`refs.ts`（浏览器 doc/action/event）、`ui.tsx`（供其他扩展浏览器代码使用）。
5. **状态**：扩展文档（`defineDoc`）+ 少量文件（`~/.ultimate/*`、项目 `.ultimate/*`）；不用全局变量存业务状态。
6. **事件**：`<extension>.<event>`；每个事件都是历史，要少而小。
7. **UI 位置**：slot / panel / surface / command / status item / entry renderer / tool renderer / document renderer。

## 5. 跨扩展协作骨架

```
prompt ──uses Standing──> subagents
models ──login-changed──> health
conversations ──trees/release points──> lineage
workspaces ──handoff point──> review/lander
lineage ──branched/rooted──> conversations (title generation)
messages ──branch tool──> lineage + subagents
subagents ──started──> sidebar/status
automations ──fired──> subagents/goal/dream
pause ──ParkedRuns/messages.gate──> sidebar/transcript/messages
tasks ──RunStart──> transcript
codemode ──MessageReference──> transcript
```

（完整的 provider/consumer 关系见各 `parts/ext-*.md` 的"跨扩展协作"节。）

---

# 附录 A：逐组详细规格

以下内容由并行分析产出，按组拼接；每组包含该组每个扩展的职责、契约、状态、UI、流程、失败模式、复刻要点与证据索引。

## A.1 Core 原语组（prompt / coding-tools / documents / notices / secrets / theme / agent）分析笔记

### 1. 概览

这组七个扩展构成 Ultimate 的 core-tier 原语层：把"一次对话运行所需的底座"固定下来——系统提示词与热重载提示（prompt）、Pi 的读写编辑与 shell 工具及其转录渲染（coding-tools）、把扩展文档变成可见面板（documents）、服务端与浏览器提示条（notices）、用户级密钥（secrets）、明暗主题命令（theme），以及内置 Agent surface（agent）。前六个几乎不依赖业务层（`prompt` 只读 `subagents` 的 `Standing` 文档 token），可以独立复刻与验证；`agent` 用 SDK 原语拼出主界面，是最小 surface 样例，也是整个 UI 的装配点。七个 `api.ts` 都是 `export const tier = 'core'`，`extensions.disable` 关不掉它们（`shared/extension-api.ts:55` 的 `coreTier` 正则被 discovery 读取）。

| 名称         | 一句话职责                                                           | 服务端入口                                                                       | 浏览器入口                                                | 是否 core tier |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------- |
| prompt       | 组装系统提示词，并在输入上放 build/instructions/docs 变更提示        | `extensions/prompt/server.ts`（default、`docs`、hooks）                          | `extensions/prompt/web.tsx`（entry `prompt.build`）       | 是             |
| coding-tools | Pi 的 read/write/edit/shell 工具、超时与取消、Git 提交事件、转录渲染 | `extensions/coding-tools/server.ts`（default、`actions`、`docs`、`userActions`） | `extensions/coding-tools/web.tsx`（tools/toolLines）      | 是             |
| documents    | 右侧 Documents 面板：把各扩展导出的会话文档渲染出来                  | 无（仅 `api.ts`）                                                                | `extensions/documents/web.tsx`（panel + command）         | 是             |
| notices      | 服务端/浏览器提示作为顶部居中小 toast                                | 无（仅 `api.ts`）                                                                | `extensions/notices/web.tsx`（overlay）                   | 是             |
| secrets      | 用户全局密钥的元数据式管理，值不回传                                 | `extensions/secrets/server.ts`（default、`actions`、`userActions`、`store.ts`）  | `extensions/secrets/web.tsx`（panel + command + overlay） | 是             |
| theme        | 调色板里的明暗主题切换                                               | 无（仅 `api.ts`）                                                                | `extensions/theme/web.tsx`（command）                     | 是             |
| agent        | 内置 Agent surface：会话 + 侧栏 + 右栏 + 状态线，及其全局命令        | 无（仅 `api.ts`）                                                                | `extensions/agent/web.tsx`（surface + commands）          | 是             |

### 2. 逐扩展规格

#### 2.1 prompt

**职责与用户可见行为。** 它负责两件事：一是把 Ultimate 的身份、原则、自我认知、工具指引、项目上下文（`AGENTS.md` 等）、技能列表、被关闭的 building blocks、环境与 cwd 组成系统提示词；二是在运行的首个输入上按需附一条 `prompt.build` 备注，告诉模型"构建变了、你的指令重放了、Ultimate 的文档改了、期间落地了哪些分支"。用户可见的是转录里一条安静分隔线：`↻ Reloaded · <branch> #N · …`，否则 `↻ Reloaded · build a → b` 或 `↻ Instructions changed · …`，悬停显示完整文本（`extensions/prompt/web.tsx:38-68`）。@ultimate 的定义文件变更会在 `beforeInput` 里被重新 `configure`，因此手打输入也能拿到最新的 `agents/ultimate.md`。

**导出与契约。** `server.ts` 导出 `order = -100`（使本扩展的 section 排在其他扩展之前）、`docs = [SeenBuild]`、`buildNote(build, seen, landed)`、`landings(cwd, from, to, conversations)`、`instructionNote(changes)`、default `prompt(host)`。`refs.ts` 导出 `Landing`（`conversation?`、`title`、`sha`）与 `BuildNote`（`from?`、`to?`、`landed?`、`instructions?`、`docs?`）。浏览器 default 注册 `entries: { 'prompt.build': Note }`。**tools：无；actions：无；events/reactors：无；apis provided：无；needed：无**（运行时只导入 subagents 的 `Standing` 文档 token，`server.ts:22,151`）。**settings keys：无**（仅在 `building_blocks` 里向 agent 描述 `extensions.enable` 与两个 settings.json 路径）。

**状态与持久化。** 唯一文档 `prompt.build`：`scope: 'conversation'`、`history: 'latest'`、`fork: 'current'`、`checkpointWhen: () => false`、`initial: () => ({})`，值 `{ id?, head?, files? }`（`server.ts:31-39`）。`id` 是本进程 build id；`head` 是 clone 的 `HEAD`；`files` 是路径→sha256 前 16 位（`digest`，`server.ts:106`）。没有 SQLite 或自有文件；保留策略由文档语义决定（只留最新值）。

**UI 位置。** 仅 entry 渲染器，无 slot/panel/surface/command/status item；`named = 2`，最多点名两个 landing，其余折叠成 `+N more`（`web.tsx:10,57-63`）。

**关键流程。** 1) `GenerationTask.beforeInput` 取 `host.build()` 与 `SeenBuild`（`server.ts:218-224`）。2) `instructionChanges`：若 `Standing['ultimate']`（根会话文档）不等于本会话则跳过；否则 `discoverAgents` 找 `ultimate`，若 `AgentDoc.instructions` 与定义不同则 `configure(tx, conversationId, { instructions })`；随后给 `cloneDocs`（`AGENTS.md`、`docs/*.md`、`agents/*.md`）、`loadProjectContextFiles({ cwd: projectRoot, agentDir: ~/.ultimate })`、定义自身与 overlays 计算哈希；首轮只记录，之后比较新增/修改/删除（`server.ts:144-197`）。3) build 变化时用 `landings()`：`git log --first-parent -n 200`，从 `Ultimate-Conversation` trailer 或 subject 的 `from #N` 得 conversation，沿 `parentConversationId` 归并到 owner 分支，按分支去重，标题取 `shortTitle`，否则用 subject（`server.ts:68-104`）。4) 拼 `Build changed: <old> → <new> · generation N · changed: … · landed: …` 与 `instructionNote`，作为 `kind: 'prompt.build'` 的 entry 返回，`model` 是一条 user 文本（`server.ts:242-260`）。5) 浏览器 `Note` 读 `entry.data` 渲染分隔线，hover 用 `entry.model[0].content`。

**失败与恢复。** `git rev-parse` 失败（不在 Git 仓库）时没有 head，也就没有 landings；`landings` 失败被 `.catch(() => [])` 吞掉（历史被改写时旧 commit 不在 clone）；被删文件以空串哈希计为 changed 并显示 `(removed)`；`seen` 已不在 20 条 build history 内则 `since < 0`，不列 changed；新会话首轮静默；fork 继承父文档（`fork: 'current'`）。指令重放只对主 agent，其他 agent 保持启动时的指令。

**关掉它会发生什么。** core 层不可被设置关闭。若移除或加载失败：没有身份/原则/工具指引/项目上下文/技能/环境/cwd 这些 section，没有 build 与 instructions 提示，@ultimate 的定义热更新不再对手打输入生效（Messages delivery 仍会刷新，推断）。

**复刻要点。** 系统提示词必须跨构建稳定，否则每次热重载都会重写整个 prompt cache——这正是"变更放输入 entry、不放 section"的原因；`prompt.build` 既是 entry kind 又是文档 kind，二者同名但不是同一物；哈希键用绝对路径，才能把项目的 `AGENTS.md` 与 clone 的分开；landing 归并靠 `parentConversationId` 链，不是靠分支名；`order = -100` 是扩展安装排序，不是 section 内排序。

**证据。** `README.md:1-23`；`api.ts:2`；`refs.ts:4-20`；`server.ts:25`（order）、`31-40`（文档）、`46-61`（buildNote）、`68-104`（landings）、`109-125`（cloneDocs）、`144-197`（instructionChanges）、`200-209`（instructionNote）、`218-262`（beforeInput）、`264-374`（九个 section）；`web.tsx:10,38-72`。

#### 2.2 coding-tools

**职责与用户可见行为。** 注册 Pi Durable 的 `read`、`write`、`edit` 与 shell 工具（Windows 上是 `powershell`，其余 `bash`），并为它们提供转录卡片：read 是带行号的高亮摘录（`SKILL.md` 显示为 skill）、write 显示大小与流式内容、edit 是带新旧行号的 unified diff、shell 是带流式输出/退出状态/耗时的终端卡。每次 shell 调用都用进程内 Git 配置注入 hook：`prepare-commit-msg` 写入 `Ultimate-Conversation: <id>` trailer，`post-commit`/`post-applypatch`/`post-merge`/`post-rewrite` 把提交记到本次调用的临时日志，调用结束（即使失败或超时）解析日志并发出 `coding-tools.committed` 事件。shell 卡可取消；`interruptible: true` 的等待命令会被排队中的 steer 提前结束。

**导出与契约。** `refs.ts`：`CancelledDoc`（`docRef('coding-tools.cancelled')`）、`CancelAction`（`actionRef('coding-tools','cancel')`，`{ callId } → null`）、`Committed`（事件 `coding-tools.committed`，字段 `conversation`、`sha`、`parents`、`repo`、`worktree?`、`branch?`、`subject`、`rewrittenFrom?`）。`api.ts` re-export `Committed` 并声明 `tier = 'core'`；`ui.tsx` 同样 re-export 给其他扩展的浏览器代码。`server.ts` 导出 `prepareBash(execution, api, log?)`、`changes(command)`、`docs = [Cancelled]`、`userActions = ['cancel']`、`actions = { cancel }`、default `codingTools(host)`。**tools：** `createReadTool()`、`createWriteTool()`、`editTool()`（在 Pi 描述后追加两条恢复提示）、`shellCall`（Pi shell 工具 + `interruptible` 布尔参数）。**actions：** 仅 `cancel`（user-only）。**docs：** `coding-tools.cancelled`。**events：** `Committed`。**reactors：无；apis provided/needed：无；settings keys：无**（读环境变量 `ULTIMATE_BASH_TIMEOUT`，默认 600 秒）。

**状态与持久化。** `Cancelled` 文档：`{ calls: Record<callId, number> }`，conversation scope、`history: 'latest'`、`fork: 'initial'`、`checkpointWhen: () => false`（`server.ts:106-115`）。提交事件是持久事件日志的一部分；临时 hook 日志在 `tmpdir()` 下每调用一个 `ultimate-commits-<uuid>.log`，结束即删。取消标记不在调用结束时自删，而由下一次 cancel 清掉已结束的条目（`server.ts:200-203`）。

**UI 位置。** 无 panel/surface/command；`tools` 注册 `read`、`write`、`edit`、`bash`、`powershell`，`toolLines` 注册同名短行（`web.tsx:491-500`）。shell 卡头的 `×` 只在 `running` 时出现（`CancelCall`，`web.tsx:370`）。

**关键流程。** 1) 调用 `shellCall.execute`：先校验 `interruptible` 命令不含变更动作（`changes()` 识别 `git push|commit|merge` 与独立的 `install`/`migrate` 词），否则直接抛错要求拆分。2) 生成临时日志，用 `shell.create({ prepare })` 注入 hook 环境（`GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`，键 `hook.ultimate-<event>.event|command`），再执行。3) `untilStopped`：确保 `Cancelled` 文档存在，`watchDoc` 它；`interruptible` 时同时 watch `InboxDoc`；用 `withCancel` 包住执行。4) 取消或 steer 命中时 `cancel(Error)`，捕获后返回 `retainedOutput` + 末行 `[Cancelled by the user after 5m 09s; …]` 或 `[Interrupted by a steering message after Ns; …]`，`exitCode: 130`，调用本身算成功。5) `finally` 里 `madeCommits` 解析日志：只认 `commit`/真实 `merge`（ORIG_HEAD 是合并前 HEAD，排除 fast-forward 与 squash），`rewrite` 只给同次调用里已记录的 commit 补 `rewrittenFrom`；按 git common dir 分组，用 `git log --no-walk=unsorted` 补 parents/subject，逐个 `host.emit(tx, Committed, …)`。6) 浏览器侧 `edit` 优先 `details.patch`（`parsePatch`），否则 `details.diff`（`parseDisplayDiff`），流式时用 `editRows(args.edits)`。

**失败与恢复。** 每个 hook 命令以 `|| true` 结尾，绝不使提交失败；事件在命令结束后、工具结果结算前单独提交，提交失败只 `console.error`，命令结果照常返回；提交与事件之间崩溃会丢事件但 trailer 仍在；取消不存在的调用抛 `That shell call is not running`；重启会终止运行中的调用，Pi 将其恢复为 interrupted；未显式 `timeout` 时 wrapper 注入默认值，并把 Pi 的 `Command timed out after … seconds` 改写成 `Tripwire: … Pass timeout for longer commands.`；`ULTIMATE_BASH_TIMEOUT` 非正或非有限会抛错。

**关掉它会发生什么。** 没有 read/write/edit/shell 工具，agent 无法读写文件或执行命令；没有 shell 卡及其取消按钮；没有 `coding-tools.committed` 事件与 trailer，lineage 的 rewind 与侧栏的提交刷新失去来源；`coding-tools.cancelled` 文档不再导出。

**复刻要点。** 提交记录必须走"每次调用独立日志 + 结束统一收取"，不能用仓库里的 hook 文件（会污染用户仓库）；事件要在工具结果之后单独提交，才能带 trace 且不受结果结算影响；`merge` 判定要用 ORIG_HEAD 与 parents[0] 双条件；`branch` 在 rebase 的 detached HEAD 下必须缺省；取消标记要持久化，否则扩展重载后取消不到旧调用；`interruptible` 必须在工具 schema 里并从传给基础工具的 args 中剥离。

**证据。** `README.md:1-31`；`refs.ts:6-28`；`api.ts:2`；`ui.tsx:2`；`server.ts:33-46`（edit 描述与默认超时）、`57-86`（hooks/prepareBash）、`89-100`（changes）、`106-115`（Cancelled）、`133-182`（untilStopped）、`184-207`（cancel）、`222-280`（madeCommits）、`282-326`（shellCall）、`327-350`（tools/wraps）；`web.tsx:48-51,53-116,134-232,234-247,259-298,301-323,325-443,491-500`；`bash-command.tsx:4-28,114-175`；`diff.tsx:5-61,77-142`。

#### 2.3 documents

**职责与用户可见行为。** 右侧面板新增 Documents 标签：列出当前会话里所有服务端 facet 通过 `docs` 导出的文档 kind。注册了渲染器的 kind 排在前面、默认展开，用扩展给的标题与图标；其余按 kind 名排序、显示为 JSON 树并默认折叠。每个渲染器包在 `ExtensionBoundary` 里，渲染器抛错只坏它自己，下方仍显示 JSON。它不编辑任何文档。

**导出与契约。** 只有 default web 扩展：`panels`（`id: 'documents'`、`title: 'Documents'`、`icon: FileStackIcon`、`order: 4`）与 `commands`（`documents.open`，标题 `Show the conversation's documents`，`context.openPanel('documents')`）。`api.ts` 仅 `tier = 'core'`。**tools/actions/docs/events/reactors/apis/settings keys：全无**（纯读）。

**状态与持久化。** 不写业务文档，只把每个 kind 的折叠状态存进扩展 UI state：`useExtensionUiState<Record<string, boolean>>('open', {})`，落为 `ext.documents.open`（`web.tsx:89`）。文档本身由各扩展的 `docs` 定义，服务端在 SSE 订阅时用 `tx.doc(token, id)` 创建缺失文档的初值（`server/api.ts:284-286`），所以面板打开即"物化"所有 kind。

**UI 位置。** 右栏 panel `documents`（order 4）；命令 `documents.open`；无 slot/surface/status item。

**关键流程。** 1) `useSystem()` 取 `system.extensions`，flatMap 出 `{ kind, owner }`；`useDocumentRenderers()` 得 kind→renderer（后者胜）。2) 排序：有渲染器优先，其次 `kind.localeCompare`。3) 每个 kind 一个 `Document`，`useDocKind(kind)` 订阅；`value` 未到或没有会话时渲染 `null`。4) 展开状态取 `folds[kind] ?? renderers.has(kind)`。5) 有渲染器则 `<ExtensionBoundary extension={renderer.extension} fallback={<Json/>} key={renderer.extension} version={renderer.version}>`，否则 `<JsonTree open={1}/>`；空对象显示 `empty`。6) 头部右侧：有渲染器显示 kind，否则显示 owner。

**失败与恢复。** 未知 kind 由服务端发 `Unknown extension document: <kind>` warning notice（`server/api.ts:308-309`）；渲染器抛错由 `ExtensionBoundary` 显示错误卡并回退 JSON，其他文档不受影响；`system` 尚未到达时列表为空且不显示空态文案。

**关掉它会发生什么。** 面板与 `documents.open` 命令消失；文档仍然存在并可被各自的 UI 读取，但用户失去统一查看入口。

**复刻要点。** kind 列表来自 `system.extensions[].server.docs` 而不是前端注册表，因此新扩展只要导出 `docs` 就自动出现；排序必须"有渲染器优先"；折叠状态要用 `useExtensionUiState` 而不是 `useState`；`ExtensionBoundary` 要传 `extension`（同时作 key）与 facet 的 `version`，热重载后按新版本重挂载。

**证据。** `README.md:1-3`；`api.ts:2`；`web.tsx:17-21,27-78,84-133,135-152`；`server/api.ts:284-286,308-309`。

#### 2.4 notices

**职责与用户可见行为。** 把服务端 `notice` 事件（对话刷新失败、未知文档等）和浏览器自己 `notify` 的提示（命令失败、UI 状态保存失败）显示为 header 下方居中的小 toast，不遮挡侧栏或右栏。info 5 秒、warning 9 秒、error 15 秒后淡出；悬停时全部保留；每条可手动关闭；同时最多显示最后四条。

**导出与契约。** 只有 default web 扩展：`slots: { overlay: Toasts }`。`api.ts` 仅 `tier = 'core'`。**tools/actions/docs/events/reactors/apis/settings keys：全无**；消费 SDK 的 `useNotices()` 与 `Notice` 类型（`shared/protocol.ts:164-167`）。

**状态与持久化。** 无持久化。`dismissed` 是组件内 `Set<number>`，`hovered` 是布尔；notice 本体在浏览器 store 里最多留 50 条（`web/src/sdk/store.ts:200-206`），重载即失。

**UI 位置。** `overlay` slot；`role="status"`，`fixed top-12 left-1/2 z-40 w-80`，`divide-y` 列表，error/warning 有浅色底。

**关键流程。** 1) store 收到 SSE `notice` 或 `notify()` 调用，追加 `{...Notice, id: ++noticeId, at: Date.now()}`并裁到 50 条。2) `Toasts` 用 `useNotices()` 读取；`live` 表示尚有未过期者，`useNow(500, live && !hovered)` 只在需要时每 500ms 重算。3) 过滤：未被 dismiss 且（悬停中或 `now - at < lifetime[level]`）。4) `slice(-4)` 取最后四条渲染；图标与色调按 level 映射；关闭按钮写 `dismissed`。

**失败与恢复。** 没有服务端确认或重试；notice 仅存在于当前标签页，刷新丢失。

**关掉它会发生什么。** 服务端与浏览器提示都不可见；store 仍记录，其他 UI 仍可读取，但用户看不到失败反馈（包括 surface 崩溃提示）。

**复刻要点。** 用 `overlay` 而不是 `statusline`，才能浮在 header 下且不挤布局；计时只在有 live notice 且未悬停时启动，避免每 500ms 空转；`slice(-4)` 在过滤后取，保证最新四条；dismiss 用 id 而非索引。

**证据。** `README.md:1-3`；`api.ts:2`；`web.tsx:7,15-27,30-61,63`；`web/src/sdk/store.ts:200-206,426-432`。

#### 2.5 secrets

**职责与用户可见行为。** 管理用户全局密钥：值存 `~/.ultimate/secrets.json`（POSIX 上 0600、目录 0700；Windows 继承用户 profile ACL），所有项目共享。面板列出"被启用扩展声明"与"已存储"的密钥：名称、描述、`needed by <extensions>`（或 `no enabled extension needs it`）、`Get a key` 链接、`set · 5m ago` 或 `missing`。可以 Add/Replace（密码框、显示切换、Enter 保存、Escape 取消，值只存在组件 state 并在保存后清空）、Delete（先确认，焦点在 Cancel）。结果只含元数据，值从不回传。

**导出与契约。** `api.ts`：`SecretsService = { set(name, value): Promise<Written> }`、`SecretsApi = defineApi<SecretsService>()('secrets')`、`tier = 'core'`；供其他扩展的 user-only 流程写密钥（cloud 已用）。`refs.ts`：`Secret`（`name`、`description?`、`url?`、`declaredBy`、`set`、`updatedAt?`）、`Written`（`name`、`set`、`updatedAt?`）、`ListAction`（`null → Secret[]`）、`SetAction`（`{ name, value } → Written`）、`DeleteAction`（`{ name } → Written`）。`server.ts`：`userActions = ['set', 'delete']`（list 不限制）、`actions = { list, set, delete }`、default 注册 `SecretsApi` 并加 `secrets` prompt section。**tools：无；docs：无；events：无；reactors：无；settings keys：无**（密钥是独立存储，不受项目状态与 `ULTIMATE_HOME` 影响）。

**状态与持久化。** `store.ts` 的 `writeSecret(userHome, name, value?)`：校验名称 `^[A-Z][A-Z0-9_]*$` 与值（非空、≤16 KiB、无 NUL/CR/LF）→ `mkdir ~/.ultimate` 0700 并 `chmod` → `acquireLock('secrets.json.lock', { pid }, 120000)` → `readStore`（`O_NOFOLLOW`，POSIX 拒绝 `mode & 0o077`，逐项校验）→ 写/删 `{ value, updatedAt: ISO }` → `writeJson(..., { mode: 0o600 })`（临时文件 + fsync + 原子 rename）→ 返回 `{ name, set, updatedAt? }`。`lib/secrets.ts` 另有 `readSecret` / `secretMetadata` 供其他 facet 只读。

**UI 位置。** panel `id: 'secrets'`、`title: 'Secrets'`、`icon: KeyRoundIcon`、`order: 9`、`tab: false`（只在被打开时出现在标签行）；command `secrets.panel`（`Secrets…`）；`overlay` slot 放 `Opener`，监听浏览器事件 `secrets:open` 并 `openPanel('secrets')`，把 `{ name }` 暂存到模块级 `requested`，等列表到达后打开该行的编辑态。

**关键流程。** 1) `list`：遍历 `host.extensions()`，跳过未启用或 `server.error` 的；合并 `server.secrets` 声明并累加 `declaredBy`；叠加 `secretMetadata`（`set: true`、`updatedAt`）；按名称排序。2) `set`：UI `api.action(SetAction, { name, value })` → 校验 → `writeSecret` → 清空输入、`events.emit('secrets:changed', { name })`、关闭表单；`delete` 同路径但无 value。3) `useSecrets` 在挂载时读一次，之后在 `system.extensions` 的 name/enabled/server.secrets 签名变化时、和 `secrets:changed` 时重读（`loadedAt` 变化被刻意排除，避免每次热重载全 tab 齐刷）。4) 行状态：`missing()` 统计 `!set && declaredBy.length > 0`，面板头显示 `N missing` 或 `all set`。5) `setup` 的 status-line 在缺密钥时给修复按钮，通过 `secrets:open` 打开对应行。

**失败与恢复。** 名称/值非法、存储权限不安全（提示 `chmod 600 ~/.ultimate/secrets.json`）、JSON 损坏（`Invalid secret store; repair … or remove it`）、锁超时都会以 action 错误显示在面板内联文本里；写入失败保留表单并允许重试；读取时 `ENOENT` 视为空存储。值不会出现在文档、notice、日志或 trace 中。

**关掉它会发生什么。** 面板、`Secrets…` 命令与三个 action 消失，已声明的密钥无法再设置；`SecretsApi` 缺失会让 `host.need(SecretsApi)` 的 cloud 报 `cloud needs secrets, which no enabled extension provides`（扩展诊断）；voice/voice-live/parallel/setup 的 `secrets:open` 没有接收方。

**复刻要点。** 写入必须"锁 + 读 + 原子写"三件套，否则多进程会互相覆盖；文件名与 mode 是契约（0600/0700），POSIX 必须拒绝不安全权限；`list` 要合并"声明"与"已存"两侧，才能显示 missing 与 orphan；面板不要用 `<form>`、字段用 `autoComplete="one-time-code"` 并带 `data-1p-ignore` 等，避免浏览器密码管理器；`userActions` 必须包含 set/delete，防止 agent 通过 codemode 写密钥。

**证据。** `README.md:1-20`；`api.ts:5-11`；`refs.ts:8-27`；`server.ts:10-22,23-66`；`store.ts:9-27`；`lib/secrets.ts:7-63`；`lib/json-file.ts:41-65`；`web.tsx:44-65,90-184,186-233,237-332,334-400,402-422`。

#### 2.6 theme

**职责与用户可见行为。** 调色板里的 `Toggle light and dark theme` 命令，把当前浏览器切换到另一套主题。主题是每个浏览器的偏好，不写入项目或会话。

**导出与契约。** 只有 default web 扩展：`commands: [{ id: 'theme.toggle', title: 'Toggle light and dark theme', group: 'Ultimate', run: (context) => context.setTheme(getState().ui.theme === 'dark' ? 'light' : 'dark') }]`。`api.ts` 仅 `tier = 'core'`。**tools/actions/docs/events/reactors/apis/settings keys：全无**。

**状态与持久化。** 无服务端状态。当前主题在 `getState().ui.theme`；`web/src/sdk/client.ts:35` 从 `localStorage['ultimate.theme']` 初始化，`:99-104` 每次变更写回、切换 `document.documentElement.classList.toggle('dark', …)` 并更新 `theme-color` meta。

**UI 位置。** 仅命令（group `Ultimate`），无 panel/surface/slot/status item。

**关键流程。** 读 `getState().ui.theme` 取反 → `context.setTheme(next)` → `store.setUi({ theme })` → client 把 `dark` class 与 `theme-color` meta 应用到 `<html>`，并写回 localStorage，刷新后保持。

**失败与恢复。** 无服务端调用，不存在部分失败。

**关掉它会发生什么。** 调色板里没有主题切换命令；已保存的 `ultimate.theme` 仍会被 client 应用，主题本身照常工作，只是无法从 UI 切换。

**复刻要点。** 主题属于浏览器而不是会话，必须用 localStorage + `dark` class；命令要显式放在 `Ultimate` 组；`setTheme` 是 SDK `UltimateActions` 的契约，不要自己操作 DOM。

**证据。** `README.md:1-2`；`api.ts:2`；`web.tsx:3-12`；`web/src/sdk/client.ts:35,99-104`；`web/src/sdk/actions.ts:139`。

#### 2.7 agent

**职责与用户可见行为。** 内置的 Agent surface，也是 home surface：中间一列 `Header` + `Conversation`，左侧 `Sidebar`，右侧 `Panels`，底部 `StatusLine`。它只由 `@/sdk` 原语组成，因此同时是最小的 surface 示例；用户可以把整个文件夹复制到 `~/.ultimate/extensions/agent/` 或项目的 `.ultimate/extensions/agent/` 覆盖它。它还提供四个全局命令：停止运行（`agent.stop`，Escape，输入框里也生效）、压缩上下文（`agent.compact`）、聚焦输入框（`agent.composer`）、回到主会话（`agent.main`）。

**导出与契约。** default web 扩展：`surfaces: [{ id: 'agent', title: 'Agent', icon: MessagesSquareIcon, description: 'The conversation, with panels beside it', component: Agent }]` 与 `commands`（统一 `group: 'Ultimate'`）。`api.ts` 仅 `tier = 'core'`。**tools/actions/docs/events/reactors/apis provided/needed/settings keys：无**；但运行时 import lineage 的 `CompactAction` 与 `getRoots`（`web.tsx:13`），这是它唯一的外部耦合。

**状态与持久化。** 无自有状态。surface id 存在 shell UI state 的 `shell.surface`；会话本身由 core 持久化。

**UI 位置。** surface `agent`（home）；无 panel/slot/status item。命令在任何 surface 都可用（facet 级贡献，不属于 surface）。

**关键流程。** 1) 启动时 `resolveSurface` 在无选择时落到 `HOME = 'agent'`；`surfaceItems` 把 Agent 排第一（`web/src/sdk/registry.ts:386-418`）。2) `Agent` 渲染五个原语。3) `agent.stop`：`when: getConversation(id).busy`，`run: api.abort(context.conversationId)`。4) `agent.compact`：若当前会话是 root（`getRoots()?.includes(id)`）则 `api.action(CompactAction, { id })`（lineage 只接受 tally 并给它 root 的摘要焦点），否则 `api.compact()`。5) `agent.composer`：root 上隐藏，其余 `context.focusComposer()`。6) `agent.main`：`conversationId !== 1` 时 `context.switchConversation(1)`。

**失败与恢复。** surface 抛错由 `SurfaceBoundary` 捕获，回退到列表中的下一个 surface；Agent 自己也失败时渲染 `Frame`（裸 `Header`/`Conversation`/`StatusLine`，`App.tsx:35-43,102-112`），并给 warning notice：`The Agent surface is not installed, so a bare conversation shows.`；命令的 `when` 抛错只会隐藏该命令并上报，不会拖垮调色板（`registry.ts:424-435`）。

**关掉它会发生什么。** 没有 home surface：选择的面板失败或无选择时落到裸 `Frame`，用户仍能对话并求助，但失去侧栏与右栏；四个命令（stop/compact/composer/main）一起消失。

**复刻要点。** surface 组件必须只用 SDK 原语，保证被复制覆盖时仍能编译；`id: 'agent'` 是全局保留 id（`HOME`）；命令要放 `group: 'Ultimate'` 且 `agent.stop` 需要 `whileTyping: true` 才能在输入框里响应 Escape；root 的 compact 必须走 lineage 的 `CompactAction`，否则 tally 语义丢失；`agent.composer` 在 root 上要隐藏。

**证据。** `README.md:1-12`；`api.ts:2`；`web.tsx:15-30,36-67,69-80`；`web/src/sdk/registry.ts:386-418,424-435`；`web/src/app/App.tsx:35-43,102-112,158-169`。

### 3. 跨扩展协作

| 调用方       | 被调用方                                         | 通道                                                                                                                               |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| prompt       | subagents                                        | 运行时读 `Standing` 文档（`subagents/api.ts:50`）判断当前会话是否是 @ultimate；`ROOT_CONVERSATION_ID` 取根                         |
| prompt       | 所有启用的 server facet                          | `host.extensions()` 读 `enabled`/`readme`，在 `building_blocks` 里列出被关闭的扩展；`host.build()` 读 build id/history/generation  |
| prompt       | conversations（浏览器）                          | `prompt/web.tsx` import `ConversationRef` 渲染 landing 链接；`switchConversation` 打开分支                                         |
| coding-tools | lineage                                          | `lineage/rewind.ts:24` import `Committed`，`:217-220` 用事件日志回放提交                                                           |
| coding-tools | sidebar                                          | `sidebar/root.tsx:15` import `Committed`，`:266` 用 `useEvents` 触发刷新                                                           |
| coding-tools | documents                                        | 导出 `coding-tools.cancelled`，Documents 面板以 JSON 展示（无自定义渲染器）                                                        |
| prompt       | documents                                        | 导出 `prompt.build`，同样以 JSON 展示；其用户可见形态是 prompt 自己的 entry 渲染器                                                 |
| documents    | 所有 server facet                                | 读 `system.extensions[].server.docs`；订阅时由 `server/api.ts:284-286` 创建文档                                                    |
| documents    | 所有 web facet                                   | `useDocumentRenderers()` 收集 `documents: [{ kind, title, icon, component }]`，后注册者胜                                          |
| notices      | server core / 所有扩展                           | 消费 SSE `notice`（`api.ts` 的未知文档警告、扩展加载诊断等）；浏览器侧 `store.notify` 用于命令失败、surface 回退                   |
| secrets      | classify / cloud / parallel / voice / voice-live | 这些 facet 的 `server.secrets` 声明（名称、描述、url）汇入 `list`                                                                  |
| secrets      | cloud                                            | `host.need(SecretsApi).set(name, value)` 写 `ULTIMATE_CLOUD_TOKEN` / `ULTIMATE_CLOUD_SNAPSHOT_KEY`（`cloud/server.ts:13,183,205`） |
| secrets      | parallel / voice / voice-live / setup            | 浏览器 `events.emit('secrets:open', { name })` 打开面板；`secrets:changed` 让它们重读状态                                          |
| secrets      | setup                                            | status-line 的 missing-secret 警告与修复按钮（`setup/web.tsx:26-40,92`）                                                           |
| agent        | lineage                                          | `CompactAction` 与 `getRoots`；root 走 tally compact                                                                               |
| agent        | SDK registry / 各扩展                            | `Sidebar`、`Panels`、`StatusLine` 等原语内部由 sidebar/其他 facet 填充 slot                                                        |

### 4. 复刻顺序建议与风险

**建议顺序。** 1) 先做 `theme` 与 `notices`（纯浏览器、零依赖），验证命令/overlay/slot 注册链路；2) 做 `documents`（只读 system info 与文档流），确认 `useDocKind` 的"订阅即创建"语义；3) 做 `secrets`（actions + store + panel + overlay 事件），因为其他扩展会通过 `SecretsApi` 与 `secrets:open` 依赖它；4) 做 `coding-tools`（工具注册、shell 包装、hook 提交日志、事件、渲染器），这是 agent 能不能干活的关键；5) 做 `prompt`（九个 section、`beforeInput`、build/landing/instruction 备注），此时才需要 `Standing` 与 `discoverAgents`；6) 最后做 `agent`，把 SDK 原语拼成 home surface 并接上 lineage 的 compact。若按依赖图施工，`prompt` 的 `Standing` 导入意味着它实际上要排在 `subagents` 的 doc token 之后，与文档中"prompt 属第 1 层、standalone"的表述不完全一致。

**风险。** ① `prompt` 的 system prompt 一旦包含易变内容就会毁掉 prompt cache，必须坚持"变更进输入 entry"；`beforeInput` 是 Pi Durable 1.4.0 的补丁钩子，升级 Pi 是首要回归点。② `coding-tools` 依赖 Pi 内部未类型化的 `details.patch`/`details.diff`、`exit_code` 诊断与 `Command timed out after … seconds` 文案，以及 `wrapTool` 对所有同名工具生效的语义；这些都不是稳定 API。③ Git hook 依赖 `hook.<name>.event/command` 配置注入（较新 Git 才有）与 Git 自带的 `sh`，旧 Git 或禁用配置的环境会静默丢失 `coding-tools.committed`（推断）。④ 提交事件与 git commit 不在同一事务，崩溃会丢事件但保留 trailer，不能把事件当作唯一真相。⑤ `secrets` 是明文存储、不是 vault；agent 的 shell 与用户同权限，提示词只能防误读，不能防恶意读取，绝不能把值写进文档/notice/trace。⑥ `documents` 的 JSON 兜底会显示任何导出文档的全文，新的 `docs` 导出不要放敏感数据。⑦ `notices` 只在内存里，刷新即失，不能承载"必须看到一次"的结果。⑧ `agent` 的命令是 facet 级、每个 surface 都可触发，且在 `ConversationScope`（侧聊）里作用于那个会话；复刻时若把命令做成 surface 局部或写死主会话，会破坏侧聊语义。⑨ 七个扩展都是 core，`extensions.disable` 不会生效；复刻时若要让它们可关闭，必须同时改 discovery 的 core-tier 语义与依赖声明。

---

## A.2 模型与会话（models + conversations）分析笔记

### 1. 概览

这组两个 core tier 扩展分别解决"一次对话用什么模型、以什么思考级别跑、凭据从哪来"和"这次对话在做什么、做到哪、何时算结束"。`models` 把 Pi 的模型运行时包成编辑器工具栏上的模型按钮/思考级别按钮、按 provider 分组的可搜索选择器、以及驱动的任意 pi-ai provider 登录流程（OAuth 或 API key，凭据与 pi 共享在 `~/.pi/agent/auth.json`），并在模型失去登录时于下一次运行放置输入的瞬间回退到定义 pin 或默认模型。`conversations` 则是会话的"语义层"：用摘要模型自动生成标题、摘要、feature、回复摘要和树 abstract，维护侧栏读的 overview、上下文占用与活动时间，提供 conclude/resume/rename 与 `summaryModel` 设置，并把这些结论作为 Pi Durable 文档与条目投影出来。

| 名称          | 一句话职责                                                                            | 服务端入口                                                                 | 浏览器入口                                    | 是否 core tier                                 |
| ------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| models        | 模型/思考级别选择与 provider 登录，含登录文档、回退与切换分隔线                       | `extensions/models/server.ts`（default、`actions`、`docs`、`userActions`） | `extensions/models/web.tsx`（default）        | 是（`api.ts` 的 `export const tier = 'core'`） |
| conversations | 标题/摘要/feature/reply summary/abstract、overview、上下文与活动投影、conclude/resume | `extensions/conversations/server.ts`（default、`actions`、`docs`）         | `extensions/conversations/web.tsx`（default） | 是（`api.ts` 的 `export const tier = 'core'`） |

### 2. 逐扩展规格

#### 2.1 models

**职责与用户可见行为。** 编辑器工具栏左侧显示当前模型（`model…`/`no model`）与思考级别（模型不支持推理时整颗按钮不渲染）；点击模型打开按 provider 分组的搜索选择器，组头显示登录状态/登录方式，行内显示思考档位、上下文窗口与每百万 token 输入/输出价格。选择可用模型直接 `api.configure`；未登录的模型会打开该 provider 的登录，`claude-code` 例外，跳转 `claude-code` 面板。登录对话框按 provider 列出 OAuth/API key 方法，流式渲染 `auth_url`、`device_code`（倒计时）、`info`、`progress` 事件，以及 `text`/`secret`/`select`/`manual_code` 提示；已配置 provider 可二次确认后登出（提示会同时登出 pi）。已存响应若换了模型或思考级别，其上方出现一条安静的 `model a → b · thinking high → max` 分隔线。模型 provider 在本机无登录时，下一轮首个输入落库的事务里改跑定义 pin 或默认模型，并留下 `models.fallback` 卡片与一行模型可见说明。

**导出与契约。** `api.ts`：`PinService`、`Pin`（`defineApi<PinService>()('models.pin')`，唯一方法 `pin(tx, id)`）、re-export `LoginChanged`、`tier = 'core'`。`refs.ts`：`LoginFlow`、`LoginDoc`（docRef `models.login`）、`LoginAction`（`models`/`login`）、`AnswerAction`（`answer`）、`CancelAction`（`cancel`）、`LogoutAction`（`logout`）、`Fallback`、`LoginChanged`（事件 `models.login-changed`）。`server.ts`：`Logins` 文档、`docs = [Logins]`、`userActions = ['login', 'answer', 'cancel', 'logout']`（标记为用户专属，agent 调用会抛 `is a user-only action`）、`actions`、default `models(host)`。`ui.tsx` 导出 `ModelRow` 与 `LoginChanged`，供 conversations 的 Summary model 选择器复用。`picker.tsx` 导出 `ModelRow`/`ModelPicker`；`login.tsx` 导出 `LoginDialog`；`state.tsx` 导出 `dialogs`（`models.picker`、`models.login`）、`thinkingDialog`、`useCurrentModel`、`selectModel`、`openPicker`、`reopenPicker`、`usePickerTarget`、`useLoginProvider`、`nextThinking`、`formatWindow`、`price`、`authLabel` 及 `ModelInfo`/`ProviderInfo`/`ThinkingLevel` 类型。`switches.ts` 导出 `Switch`/`switchAt`；`fallback.ts` 导出 `fallback`。**tools：无；reactors：无；provided api：无**（只声明需求点 `models.pin`）；needed api：`models.pin`。settings keys：无自有键。

**状态与持久化。** `models.login` 是 conversation scope 文档（`history: 'latest'`、`fork: 'initial'`、`checkpointWhen: () => false`），`flows` 按 `flowId` 存 `provider`、`type`、`status: running|complete|cancel|error`、去掉了 `signal` 的 `prompt`、`events`、`error`；答案与凭据从不写入，失败只写 `Login failed`。每个对话保留最近 `kept = 10` 个已结束 flow。运行中的 flow 是进程内 `Map`，挂在 `host.resource('models.login')`，host 关闭时统一 abort；下次启动 `onOpen` 扫描全部对话（每页 256），把文档里仍 `running` 但本进程无对应 flow 的标记为 `cancel`。模型与思考级别本身写在 Pi 的 `AgentDoc` 的 `agent.model`/`agent.thinkingLevel`；凭据由 `modelRuntime` 写入 `~/.pi/agent/auth.json`。回退写一条 `models.fallback` 条目，`data = { from, to, reason: 'pin' | 'default' }`，并带一条合成 user 消息供模型阅读。

**UI 位置。** slot `composer.toolbar`: `[ModelButton, ThinkingButton]`；slot `overlay`: `[ModelPicker, LoginDialog]`；entry renderer `pi.assistant: Switched`（包裹核心渲染）、`models.fallback: FellBack`；commands `model.pick`、`model.thinking`、`model.thinking.cycle`（`keys: 'shift+tab'`，`whileTyping: true`）、`auth.login`。无 panel/surface/status item。思考 popover 的 dialog id 按对话区分（`models.thinking.${id}`），侧聊有独立状态。

**关键流程。**

1. 选模型：`ModelButton` → `openPicker`（把 `conversationId` 记到 `pickerTarget`）→ 选择 → `selectModel` → `api.configure({ model: { provider, modelId } }, id)`；服务端保留仍受支持的思考级别，否则用 `clampThinkingLevel` 夹取，工具栏回读配置。
2. 登录：`LoginAction` 校验 provider 的 `auth[type === 'oauth' ? 'oauth' : 'apiKey'].login` 存在 → 在一个事务里校验对话存在并写入 `running` flow → `modelRuntime.login(provider, type, { signal, prompt, notify })`；`prompt` 把等待项写进文档，`answer` action 解析它并等待 `flow.writes`；`notify` 逐条 push 事件；结束时 `complete` 触发 `loginChanged`，`error` 写 `Login failed`。
3. 思考级别：仅在 `model.reasoning` 时展示 `model.thinkingLevels`，选择后 `api.configure({ thinkingLevel }, id)`；Shift+Tab 用 `nextThinking` 按 Pi 顺序回绕。
4. 回退：`GenerationTask.beforeInput` 调 `fallback`：读 `AgentDoc` 与 `getAvailableSnapshot()`，若 `agent.model` 不存在、登录快照为空、或当前模型仍有登录则不动；否则 `Pin.pin` 给出的 pin 若有登录就用，否则 `defaultModel(available, host.settings)`；改写 `agent.model`、夹取 `agent.thinkingLevel`，返回 `models.fallback` 条目草稿。
5. 分隔线：`switchAt(entries, entry)` 只读 `pi.assistant` 的 `model[0]`，向前找上一条响应，优先比较双方的 `thinkingLevel`、否则 `providerThinkingLevel`，再比较 `provider`/`model`，派生而不写库。

**失败与恢复。** 参数错误抛 `Expected provider`/`Invalid auth type`/`Unsupported provider or login type`/`Unknown conversation`；未知 flow 抛 `Unknown login flow`，无待答提示抛 `No pending prompt for flow`。provider 异常被吞成 `status: 'error'`（不转发可能含密钥或回调码的细节）。flow 随进程死亡，下次启动显示 `cancel`；关闭对话框、`pagehide`、切换对话都会 `cancel`（`keepalive: true`，失败不提示）。`loginChanged` 提交失败只 `console.error`（health 是建议性数据）。回退在输入放置的事务里发生并改写 `agent.model`；若新模型仍无登录，下一轮可再次回退；若没有任何带登录的模型则什么都不做，运行失败由 watchdog 提示 provider 无登录。

**关掉它会发生什么。** 它是 core tier，`extensions.disable` 不会关掉它。若被移除：composer 没有模型/思考按钮，`model.pick`/`model.thinking`/`model.thinking.cycle`/`auth.login` 消失，登录文档与 `models.login-changed` 不存在，`models.fallback` 与切换分隔线消失；conversations 的 `dialogs.tsx` 直接 import `ModelRow` 会断，setup 对 `LoginChanged` 的监听与 health 的凭据健康重置也失去来源。

**复刻要点。** 令牌名与 dialog id 必须原样；文档只放"浏览器可见"的状态，答案/凭据/提供方错误绝不入文档；文档写入用每 flow 一条 promise 链串行化，避免乱序；运行态 Map 与持久文档分离，靠启动对账收敛；选择器行组件要能被别的扩展复用；回退必须在 `beforeInput` 事务内改 `AgentDoc` 并只产出一条条目；`switchAt` 是纯派生，不要在配置时写标记。

**证据。** `extensions/models/README.md:1-11`；`extensions/models/api.ts:16-17`；`refs.ts:9-45`；`server.ts:38-47`（文档）、`57`（kept）、`84`（userActions）、`99-209`（四个 action）、`215-238`（启动对账）、`242-247`（beforeInput）；`fallback.ts:20-48`；`switches.ts:19-52`；`state.tsx:37-39, 73-76, 104-121`；`picker.tsx:83-128, 218-246`；`login.tsx:557-605`；`web.tsx:202-245`。

#### 2.2 conversations

**职责与用户可见行为。** 它给每个顶层对话自动起标题、写侧栏摘要与 1–3 词 feature（root 的 feature 描述整棵树），在每次完成的回复后写一行 activity/reply summary，并在每个完成的 exchange 上为分支树生成 abstract；同时维护侧栏逐行读的 `ultimate.conversation-overview`、上下文占用 `conversations.context`、以及 metadata 里的 `inputTitle`/`inputAt`/`answerAt`。用户可见的是：会话标题与摘要、侧栏行状态（working/queued/answered/error/idle）、feature 彩色标签、`#id` mention 芯片、摘要条目安静的一行（含本地时间与完整日期 tooltip）、Conclude/Resume 与 Rename、以及"Summary model…"命令。自动触发可被 `setAutomaticSummaries(tx, id, false)` 整体关闭：不再排任务、已排任务结算但不写、标题保持设定值；standing agent、lander、侧聊与 `summaries: false` 的定义都关掉它，显式 `askSummaryModel` 不受影响。

**导出与契约。** `api.ts`：`ConversationsService`（`subject`、`concluded`、`concludedIn`、`concludeIn`、`summaryModel`、`summaryModelStatus`、`requestSummary`、`setAutomaticSummaries`、`setStanding`、`askSummaryModel`、`accountResponse`、`generatedTitle`）、`TreesService` 与点 `Trees`（`conversations.trees`：`rootOf`、`branchOf`、`abstract`）、`ReleaseService` 与点 `Release`（`conversations.release`：`release`）、`ContextUsageDoc`、`ConversationsApi`（`conversations`）、`tier = 'core'`。`refs.ts`：`Compacted` 事件（`conversations.compacted`）、`ContextUsage`/`ContextDoc`（`conversations.context`）、`SummaryModelSetting`、`OverviewDoc`（`ultimate.conversation-overview`）、`RenameAction`、`ConcludeAction`、`ResumeAction`、`SummaryModelAction`、`SetSummaryModelAction`。`types.ts`：`IntentSummary`、`TitleChange`、`SpawnSummary`、`SummaryStatus`、`ReplySummary`、`SummaryDiscard`、`OverviewRow`、`OverviewState`、`ConversationSubject`、`KeptWork`。`summary.ts`：条目 `TitleChanged`（`conversations.title-changed`）、`IntentSummarized`（`conversations.intent-summarized`）、`SpawnSummarized`（`conversations.summarized`）、`ReplySummarized`（`conversations.assessed`）、`SummaryDiscarded`（`conversations.summary-discarded`），以及 `Summaries` 文档、`SummaryState`、`SummaryResult`、`accountResponse`、`askSummaryModel`、`generateSummary`、`requestSummary`、`setAutomaticSummaries`、`summaryBehavior`，另导出 `transcriptText`、`exchangeMessages`、`summaryRequestTimeout`、`summaryInput`、`resetAfter`、`exchangeUser`、`currentAnswer`、`ResponseReceipt`、`SummaryReceipt`、`SummaryRequest`、`SummaryHost`。`summary-model.ts` 导出 `summaryModelSetting`、`summaryModelStatus`、`summaryModel`、`FALLBACK_SUMMARY_MODELS`、`fallbackModel` 及 `SummaryModel`/`SummaryModelHost`/`SummaryModelStatus` 类型；`summary-model-ref.ts` 导出浏览器可用的 `parseSummaryModel`。`server.ts` 另导出 `setStanding`、`concludeIn`、`subject`、`concludedIn`、`order = 100`，`docs = [Summaries, Overview, Fixed, ContextUsageDoc]`，`actions` 实现 `conclude`/`resume`/`rename`/`summaryModel`/`setSummaryModel`；`context.ts` 导出 `contextBehavior`，`activity.ts` 导出 `activityBehavior`，`overview.ts` 导出 `Overview`/`overviewBehavior`，`compactions.ts` 导出 `compactionEvents`。浏览器 `ui.tsx` 声明点 `ConversationPhase`（`conversations.phase`）、`Unsummarized`（`conversations.unsummarized`）、`ConversationTask`（`conversations.task`），并导出 `ConversationRef`、`FeatureTag`、`useOverview`、`useStandingName`、`AgentMark`、`agentTitle`、`Presence`、`hiddenConversationIds`、`Compacted`、`ConcludeAction`、`ContextDoc`、`OverviewDoc`、`RenameAction`、`ResumeAction`；`summary-entry.tsx` 导出 `SummaryAction`，`dialogs.tsx` 导出 `SummaryModelDialog`/`summaryModelDialog`，`mention.tsx` 导出 `MentionLink`。**tools：无**（动作可由 agent 经 codemode 调用，未列入 `userActions`）；reactors：无，全部用 `subscribeCommits` 投影；provided：`conversations` 服务；声明的浏览器点：`ConversationPhase`、`Unsummarized`、`ConversationTask`（实现由 phase/plan/lineage 提供）；needed：`conversations.trees`、`conversations.release`（`host.want`，可缺省）。settings key：`summaryModel`（用户 `~/.ultimate/settings.json` 或项目 `.ultimate/settings.json`，项目优先），默认 `openai-codex/gpt-6-luna:medium`，另有 `FALLBACK_SUMMARY_MODELS` 列表。

**状态与持久化。** 每个对话一个 `ultimate.conversation-summaries` 文档：`exchanges`、`revision`、`automatic?: false`、`intentRequested`、`lastYield`、`lastAnswer`、`pending`、`generatedTitle`、`summary`、`feature`、`abstract`、`summaryOwed`、`activity`、`assessmentStatus`、`status`；initial 为 `{ exchanges: 0, revision: 0 }`，`history: 'latest'`、`fork: 'initial'`、`checkpointWhen: () => false`。根对话一个 `ultimate.conversation-overview`：`conversations: Record<string, OverviewRow>`。每对话还有 `conversations.context`（`at`、`tokens`、`window`、`percent`、`estimated`、`entry`；initial `{ at: 0 }`，fork 不继承父测量）、`conversations.fixed`（`{ fixed?: true }`）与未列入 `docs` 数组的 `conversations.identity`（`{ head?: number }`）。concluded 列表是根对话 UI 状态文档 `ultimate.ui` 的键 `ext.conversations.concluded`。关键结论（意图摘要、标题变更、spawn 摘要、回复 activity）以条目落库；`Overview`/`Context`/activity metadata 是可从 Pi 记录重建的投影，`Summaries` 则保存摘要状态与计数。没有直接 SQLite 或自有文件，settings 只写 JSON；条目没有清理逻辑（范围内未见），旧条目保留。任务响应在解析前存进 task memo，重放不重复计数；用量累加到 `pi.usage` 的 `provider/model` 名下。

**UI 位置。** `web.tsx`：`link: MentionLink`；entry renderer 五个摘要条目 → `SummaryAction`，`conversations.identity` → `null`；slot `overlay: [SummaryModelDialog]`；命令 `conversations.summary-model`（标题 `Summary model…`，group `Conversations`）；dialog id `conversations.summary-model`。无 panel/surface/status item（侧栏是 sidebar 扩展的 UI）。侧栏（sidebar）自己读 overview 并调 `ConcludeAction`/`ResumeAction`；transcript 里摘要行在 compact 模式或 `Unsummarized` 为 true（lineage 的 root）时隐藏。`ConversationRef`/`FeatureTag`/`AgentMark` 被 sidebar、messages、tasks、activity、landings、goal、dream 等复用；`ConversationPhase` 由 `phase` 提供、`ConversationTask` 由 `plan` 提供、`Unsummarized` 由 lineage 的 roots 提供。

**关键流程。**

1. 意图摘要：`GenerationTask.beforeRequest` 先 `summaryModel(host)`，再提交 `requestSummary({ reason: 'intent' })`；只对非 owner（顶层）且 `automatic` 的对话；`intentRequested` 持久去重；从 `latestHeadMarker` 起扫条目，恰好一个 `isInput` 且没有 `pi.assistant` 才排任务（已建立的对话不补做）；它不增加 exchange、不评估回复；建立 `conversations.summary` 任务（`version: 1`，输入 `{ revision, inputs: [], intent }`），`state.pending`/`status = 'pending'`。
2. 回复摘要：`GenerationTask.onYield` 以 `generation: api.taskId` 排 `{ reason: 'reply' }`，`lastYield` 去重，任务输入带 `LiveDoc.run.inputs`；任务阶段 `observe` 等生成任务完成、只把"提交状态 done 且 answer 等于该答案"计为一次 exchange：`lastAnswer`、`exchanges++`，顶层且 `(exchanges - 1) % 3 === 0`（即第 1/4/7 次）置 `summaryOwed`；较旧的观察者只计数、不覆盖最新评估；随后 `prepare` 组装请求（原始请求 2400 字、`summaryInput` 的近期文本 12000 字、上一摘要/feature），`generate` 用 `summaryRequestTimeout`（60s 起、超过 6000 字符后每字符 +50ms、上限 600s）请求并校验 JSON，最终在**一个事务**里：`accountResponse`、清 `pending`、判断 `usable`、写 `state.activity`、`ReplySummarized`（reply 且 `completed` 存在时）、`state.summary`/`feature`、`IntentSummarized` 或 `SpawnSummarized`、必要时改 `metadata.title` 并追加 `TitleChanged`，同时置 `generatedTitle`。
3. 标题归属：仅当 `metadata.title` 为空或等于 `state.generatedTitle` 时摘要可改标题；`rename` 把标题压空白/trim/截 160 字，删除 `generatedTitle` 并写/删 `metadata.title`，空白标题让首条消息重新命名并恢复自动命名。
4. abstract：`prepare` 经 `Trees.branchOf` 识别树内分支，输入原始 intent 与上一 abstract；每个完成 exchange 都生成（与 1/4/7 cadence 无关），验收时先调 `Trees.abstract(tx, id, { text, at, title, feature })` 再写其他条目，`at` 指向答案条目；根、owner、树外对话不生成。
5. spawn：subagents 在创建子代理的同一事务调 `requestSummary({ reason: 'spawn', answer, agent, task })`，任务 `prepare` 从 `intent`/`spawn` 直接进入，不增加 exchange、不写 activity；动作回执负责重放去重。
6. overview：`overviewBehavior` 订阅 commit，按 conversation/submission/`isInput`/`pi.reset`/`pi.compaction`/`Summaries`/`LiveDoc.run`/`InboxDoc` 变更加入待算集合；`reconcile` 用 `latestInput`（`scanSubmissions` 降序、每页 16、最多再读 32 条旧提交以覆盖 steer 先于 queued follow-up）与 `Summaries`、`LiveDoc`、`InboxDoc` 派生 `runState`：`live.run` → `working`；inbox 有非 write 项 → `queued`；input done 且 answer → `answered`；unanswered 且 reason 不在 `aborted/reset/stale` → `error`；否则 `idle`。行只在 JSON 变化时写。
7. 上下文：`contextBehavior` 监听 `pi.assistant`/`pi.compaction`/`pi.reset` 条目与 `AgentDoc`，只取本对话自己的条目；最新源条目等于 `saved.entry` 且 `at !== 0` 时复用，否则用 `promptTokens(lastAssistant.usage)`，`source.stale` 且有 head 时用 `estimateAfterHead` 估算下一请求；窗口来自 `getModel(...).contextWindow`，`contextUsage` 计算 percent；打开时按 64 条一页串行回填。
8. 活动：`activityBehavior` 从 `viewState` 取首条 input 文本作 `inputTitle`（压空白、160 字）、最后 input/assistant 时间，reset/compaction 截断视图时向 head 之前补扫，`inputAt` 只前进；core 列表优先显式 `title` 于 `inputTitle`；值不变不提交。
9. compaction 事件：`compactionEvents` 监听 `CompactionEntry.kind`，按 entry id 在 `host.resource('conversations.compactions')` 去重，在**独立 commit**里 `emit(Compacted, { conversation, entry, reason? })`。
10. conclude/resume：`conclude` 先校验 ids（安全整数、去重）、逐个 `tx.conversation` 拒绝未知/owner，`refuseFixed` 读 `lineage.roots` 的根列表与 `Fixed.fixed` 拒绝根/standing agent，整批写 `ext.conversations.concluded` 后调 `Release.release(ids, caller)` 返回 `kept`；`resumeIn` 沿 `owner.conversationId ?? parent.conversationId` 收集祖先，从 concluded 列表里删除并返回真正被移除的 ids；Resume 本身不创建 checkout，下一次输入才从目标 tip 重建；`GenerationTask.beforeInput` 对任何会启动运行的输入先调 `resumeIn`。
11. 摘要模型：`summaryModelSetting` 先项目后用户、用 `Object.hasOwn` 判断，未设置回默认；`summaryModelStatus` 处理 `ULTIMATE_MODEL` 预览覆盖、`parseSummaryModel` 非法值（一次性 notice、`problem: 'invalid'`）、未登录/未知（默认值才走 `fallbackModel` 的已知列表或最低价模型，否则 `problem: 'unavailable'`），思考级别缺省 `medium` 并 `clampThinkingLevel`。
12. 系统提示：`section('conversations', ...)` 只为顶层对话返回固定两段文本（不列具体对话，保护 prompt cache），`order = 100` 表示最后渲染；`beforeInput` 的 `identityNote` 在新 head/fork 时写 `conversations.identity` 条目与 `SeenIdentity.head`，`beforeRequest` 再兜底把 `You are conversation #N.` 放到消息最前（timestamp 0）。

**失败与恢复。** 摘要模型不可用或未登录：不排任务、静默跳过；已选模型但任务开始前消失则静默结算，不写 discard/error。非法设置：一次性 notice 且摘要关闭。请求超时/异常：`SummaryDiscarded` 写 `reason: 'error'`、`cause` 为超时说明或错误文本；收到但被更新工作/重置取代写 `reason: 'stale'`；已有摘要保留，下次回复重试。`automatic` 关闭后，已排任务结算时清 `pending`/状态但不写结果。任务重放复用 response memo 与 `reply` memo，不会二次请求或二次计量。`conclude` 任一 id 非法则整批拒绝；`Release` 返回的 `kept` 带 `uncommitted`/`unlanded`/`busy` 解释保留原因。启动时 overview 全量重算、context 分页回填、activity 全量对账；compaction 事件在 Pi 条目与自建 commit 之间崩溃会丢一次，之后不重放。`latestInput`/overview 失败发 `Conversation overview:` notice，context 回填失败发 `Conversation context backfill:` notice，activity 失败发 `Conversation activity:` notice。

**关掉它会发生什么。** core tier，始终启用。若移除：没有标题/摘要/feature/reply summary/abstract 与 `Summary model…`，侧栏行失去 `runState`/摘要/feature，`ConcludeAction`/`ResumeAction` 与 concluded 语义消失，`#id` 芯片失去 feature/标题来源；workspaces、lineage、subagents、side-chat 等 `host.need(ConversationsApi)` 的调用会失败，`Trees` 点不再被消费，`conversations.compacted` 与上下文/活动投影也一起消失。

**复刻要点。** 先把 `Summaries`/`Overview`/`ContextUsageDoc`/`Fixed`/`SeenIdentity` 五类文档和六个条目 kind 定死，再写投影；所有派生态只读提交记录，绝不让进程内状态决定行；摘要任务的 `observe → prepare → generate` 阶段、`pending`/`revision` 围栏与"计数+推进+结算"同事务是防重复的关键（注意：范围内 `Summaries.revision` 只有初始 0 与比较，未见自增点，复刻时需自行定义递增时机，否则围栏退化为常量）；abstract 必须在事务第一条条目之前写；标题只在 `undefined` 或 `generatedTitle` 时让摘要改写；固定 prompt 文本、`order = 100` 与"identity 放最前"都是为了缓存稳定；项目 settings 存在时禁止 UI 写入；concluded 列表只由服务端事务改写，浏览器只读。

**证据。** `README.md:19-70, 74-162, 172-215`；`api.ts:20-105`；`refs.ts:9-76`；`types.ts:4-54`；`summary.ts:95-103`（文档）、`105-160`（结算/计量）、`194-206`（输入）、`219-343`（请求与解析）、`419-495`（排任务）、`497-816`（三阶段任务）、`820-851`（hooks）；`server.ts:44-54`（Fixed/docs）、`57-82`（identity）、`115-119`（setStanding）、`129-202`（actions/conclude）、`214-258`（resume/subject）、`267-347`（服务装配/section/hooks）；`context.ts:24-94, 133-149`；`overview.ts:27-51, 64-107, 127-161`；`activity.ts:14-69`；`compactions.ts:11-46`；`summary-model.ts:20-62, 88-134`；`summary-model-ref.ts:9-21`；`web.tsx:6-25`；`dialogs.tsx:53-64, 75-89, 143-151`；`summary-entry.tsx:14-42`；`feature.tsx:8-10, 23-39, 53-82`；`marks.tsx:6-11, 45-84`；`visible.tsx:2-22`；`mention.tsx:19-41`。

### 3. 跨扩展协作

| 调用方                                             | 被调用方           | 通道                                                                                                                                                                  |
| -------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| conversations（`dialogs.tsx`）                     | models（`ui.tsx`） | 浏览器 import `ModelRow`，Summary model 选择器复用模型行                                                                                                              |
| models（`fallback.ts`）                            | subagents          | `host.want(Pin)?.pin(tx, id)` 读定义 pin（`models.pin`），subagents 在 `server.ts:595` 实现                                                                           |
| models（登录/登出）                                | health、setup      | `host.emit(LoginChanged, { provider })`；health 用 `host.react('login-changed', [LoginChanged], ...)` 重置凭据健康，setup 用 `useEvents` 刷新                         |
| conversations（摘要验收）                          | lineage            | `Trees.rootOf`/`branchOf`/`abstract`（`conversations.trees`）；abstract 写在事务第一条条目前                                                                          |
| lineage                                            | conversations      | `ConversationsApi.generatedTitle`（`named` reactor）与 `concludeIn` 结束已 landing 的分支                                                                             |
| conversations（conclude）                          | workspaces         | `Release.release(ids, caller)`（`conversations.release`）返回 `KeptWork[]`                                                                                            |
| workspaces                                         | conversations      | `setStanding`、`setAutomaticSummaries(tx, id, false)`、`subject(id)`（landing 记录标题/摘要/feature）；打开时 `concluded(context)` 后 `release` 已结束对话的 worktree |
| subagents                                          | conversations      | 子代理创建时 `setAutomaticSummaries(false)`、`requestSummary({ reason: 'spawn' })`；standing agent `setStanding`                                                      |
| side-chat                                          | conversations      | fork 时 `setAutomaticSummaries(tx, fork.id, false)`，仅 Summarize & inject 显式问模型                                                                                 |
| sidebar / tasks / sounds / activity                | conversations      | `OverviewDoc`（`useDocOf(1, ...)`）、`ConcludeAction`/`ResumeAction`、`FeatureTag`/`ConversationRef`/`hiddenConversationIds`                                          |
| phase / plan / lineage                             | conversations 点   | `ConversationPhase`、`ConversationTask`、`Unsummarized` 的 provider                                                                                                   |
| codemode / messages / update / lineage / keep-warm | conversations      | `askSummaryModel`、`accountResponse`、`summaryModelStatus`、`summaryModel`                                                                                            |
| setup                                              | conversations      | `summaryModelStatus()` 判断摘要模型是否可用并解释 fallback/不可用原因                                                                                                 |
| watchdog / voice-live                              | conversations      | `concludedIn`（事务内读 concluded 集合）/`concluded` 判断哪些对话不再驱动工作                                                                                         |

### 4. 复刻顺序建议与风险

建议顺序：

1. 先落 `api.ts`/`refs.ts`/`types.ts` 的令牌与文档 kind，保证跨扩展引用稳定；
2. 实现 `contextBehavior`、`activityBehavior`、`overviewBehavior` 三个只读投影，让侧栏先有数据；
3. 实现 `summary-model.ts` 与 Summary model 对话框，再实现 `summaryBehavior` 的 `observe/prepare/generate` 与五个摘要条目；
4. 补 `concludeIn`/`resumeIn`/actions、固定 prompt section 与 identity；
5. 最后做 models 的 picker/thinking（简单）→ 登录文档与 flow → fallback 与 `switchAt`；
6. 接 `Trees`/`Release`/`Pin` 三个点，先以 `host.want` 可选依赖接入。

风险：摘要任务若无 `pending`/`revision`/`lastYield` 三重围栏，会在重试、并行观察者与 steer 下重复计数；`revision` 在源码中没有自增点（实测仅初始化与比较），复刻时要明确语义；abstract 必须在事务第一条条目之前写，否则 lineage 读不到；标题归属规则（`undefined` 或 `generatedTitle`）漏掉会导致手动改名被覆盖；`order = 100` 与固定 section 文本、identity 放最前都关系到 prompt cache，改动即全量重写；`beforeInput` 是 Pi Durable 1.4.0 的补丁钩子，升级 Pi 时是首要回归点；登录文档绝不能混入答案/凭据/provider 错误，且 flow 是进程内状态、重启需对账；`latestInput` 的 32 条窗口与 `scanSubmissions` 顺序是 queued/steer 场景的边界；concluded 属于 UI 状态，浏览器不能写，resume 必须连带祖先；core tier 依赖只能单向指向 core，`Trees`/`Release`/`Pin` 都必须用可选 `want` 而不是硬 `need`。

---

## A.3 workspaces 与 subagents 分析笔记

### 1. 概览

这两个扩展共同构成 Ultimate 的“隔离执行 + 委派”底座：`workspaces` 把一个 conversation 变成可准备、可恢复的 Git worktree（isolate），并把提交串行化为 lander 队列，执行 merge → checks → fast-forward → push → 报告；`subagents` 把 bounded work 交给按 Markdown 定义配置的 child conversation，并提供 standing agents、fork、reporter/answer 去重与 Agents 配置界面。两者都是 core tier（各自 `api.ts` 的 `export const tier = 'core'`），是其他扩展可以直接 `need` 的基础服务；在扩展 API 上 `workspaces` 只依赖 conversations，`subagents` 依赖 workspaces 与 conversations。

| 名称         | 一句话职责                                                                  | 服务端入口                                          | 浏览器入口                      | 是否 core tier                          |
| ------------ | --------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------- | --------------------------------------- |
| `workspaces` | Git worktree 生命周期 + 同步/异步 landing + lander 队列与日志               | `extensions/workspaces/server.ts`（`order = -200`） | `extensions/workspaces/web.tsx` | 是（`extensions/workspaces/api.ts:49`） |
| `subagents`  | 子会话/常驻智能体的创建、消息、等待、停止、worktree land/discard 与定义管理 | `extensions/subagents/server.ts`                    | `extensions/subagents/web.tsx`  | 是（`extensions/subagents/api.ts:84`）  |

### 2. 逐扩展规格

#### 2.1 `workspaces`

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

#### 2.2 `subagents`

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

### 3. 跨扩展协作

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

### 4. 复刻顺序建议与风险

#### 4.1 顺序

1. 先做 `lib/git.ts`、`lib/shell.ts`、`lib/process-group.ts`、`lib/exec.ts` 与 `lib/agents.ts`：worktree、shell、检查进程容器、定义解析是所有上层行为的地基。
2. 做 `workspaces` 的 doc + `WorkspacesApi` + `paths/setup` + `Preparation` + `create/ready/land/discard/release`；先用假 lander 验证 worktree 创建、dirty 拒绝、保留未落地分支、removed 重建。
3. 加 `lander` task：先 merge/ff/记录 `landed`，再加 checks、memo、`workspaces.check`/`workspaces.landed`，最后加 `onFailure` 与 deploy handoff；用故障注入验证崩溃窗口。
4. 做 `subagents` 的 `Subagents/Standing/Profile` doc、`createChild`、`subagent` 工具、Reporter 与 `recover()`；先让 foreground 单 child 跑通，再加 background/yield/stop/receipt。
5. 加 standing、定义 actions 与 Agents UI；最后接 fork、`isolate: worktree`、`land`/`discard`。
6. 最后按依赖顺序接 `lineage`（landing note/conclude）、`messages`（Handoff/board）、`automations`（triggers/standing）、`review`（Review point）、`sidebar/info/status-line/plan`（浏览器消费者）与 `onboarding`（setupGit）。

验收至少覆盖：① 创建后 setup 失败，修复 PATH 后同一对话的下一次工具调用自动重试并可用；② submit 在 lander 崩溃后从 `prepared`/`landed` 继续，且不会二次 merge 或二次 push；③ 父对话 stop 不会停 child，只有 `stop {id}` 会停并列出未提交文件；④ lander 日志、submitter 报告、root landing note 三处卡片一致。

#### 4.2 风险

- **lander 的崩溃窗口**：`prepared`、`merged`、check、`fix-verdict` 四个 memo 与 queue entry 的 `landed` 必须按源码顺序写入；少一个就会重复 merge、重复检查或重复推送。`finish` 必须在同一事务里移出 queue、写 results、写 outcome 日志并发出 `workspaces.landed`，随后才进入 `report` 向 submitter 投递；否则 UI 与恢复逻辑会分叉。
- **source 串行与删除安全**：`serial(source)` 只覆盖本进程；README 明确说没有跨进程 landing 锁（推断这是已知限制）。删除永远不能 force，`finishRemoval` 要先验证 `HEAD` 等于记录的分支 tip，否则会丢掉用户改动。`release` 的祖先/后代保留是最容易回归的部分：一个 kept descendant 必须连带 kept 其所有 ancestors，且 `removed` 记录在并发 recreate 时必须由同一 source 队列串行（`workspaces.ts:571-647`）。
- **检查进程容器**：`runLanderCheck` 依赖 POSIX process group 或 Windows Job Object（`lib/process-group.ts`），watchdog 2 分钟无输出/10 分钟总计、`timeout` 同时压低两者；移植到没有这些能力的运行时会导致子进程泄漏。
- **README 与实现漂移**：`workspaces/README.md` 第 108 行说 lineage 对 `workspaces.check` 写 landing note，但当前 `extensions/lineage/server.ts` 只订阅 `SubmissionLanded`；`workspaces.check` 的实际消费者是 `automations/triggers.ts:29`。复刻时以代码为准，别把 README 当作契约。
- **subagent 交付去重**：`reported`、`subagent-answer:<entryId>`、`afterTools` 的 `subagent-tool-delivered` 三者缺一不可；尤其 `recover()` 对 `interrupted`/`unanswered`/`failed`/`given-up` 与输入 entry 顺序的判断，最容易在重放时重复或丢报告。
- **standing 退休**：`pruneRetired` 只在 `errors.length === 0` 时删条目；如果为了“清理”提前退休，一个临时 parse error 就会把 standing conversation 变成普通会话。
- **fork 成本与 doc policy**：fork 复制父上下文，成本高于 fresh child；`ultimate.subagents`/`Profile` 从 `initial` 开始，`pi.agent`/`codemode.store`/`ultimate.ui` 按 `asOf` 复制。复刻时若把 child 的 `ultimate.ui` 当 root UI 读，会污染 Agents 展示（README 已明确只有 root 的 UI doc 被 web 读取）。
- **UI 语义**：`LandingCard` 的 `tone`（landed/pushFailed/failed）、`StatusChip` 的 `queued #N`/`landing`/`Not landed`、`Steps` 的折叠与 `full log in #<lander>` 是用户可感知契约；只做 Markdown 输出会被判为未复刻。

---

## A.4 会话谱系、消息、侧栏与上手（lineage + messages + sidebar + onboarding）分析笔记

### 1. 概览

这四个扩展合起来回答四个问题：项目的工作如何组织成"会话森林"、对话之间如何可靠地传话、这些树如何被看见和操作、第一次使用如何被引导。`lineage` 是数据与语义层：`lineage.roots` 列出 root，root 上维护只读 tally（分支意图、abstract、landing、note）与项目 memory，branch 从 root（或其 memory brief）分叉，另有 note/notify/catch-up/rewind/compact。`messages` 是通信层：`message`/`branch` 工具、`board.delivery` 投递任务、triage、把分支最终答复路由回启动者，以及跨项目 Ultimate 的 `tell`。`sidebar` 是 Agent surface 的导航层，读 conversations/workspaces/subagents/lineage/messages 的投影，画出 @ultimate、Agents、Memory、Landed、In flight、Earlier、Concluded。`onboarding` 负责首启 "Get ready"、@ultimate 的设置卡片（extensions/project/git）与 Extensions 面板。四者均为 core tier，彼此形成单向依赖：messages → lineage，sidebar/onboarding 读两者。

| 名称       | 一句话职责                                                                                 | 服务端入口                                                                                     | 浏览器入口                                 | 是否 core tier                                 |
| ---------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| lineage    | 项目森林：root/tally、branch、abstract、note、memory、rewind、notify、catch-up、compaction | `extensions/lineage/server.ts`（default `lineageExtension`、`docs`、`userActions`、`actions`） | `extensions/lineage/web.tsx`（default）    | 是（`api.ts` 的 `export const tier = 'core'`） |
| messages   | 对话间与对用户的 durable 消息、`branch` 工具、triage、答复路由、跨项目 Ultimate            | `extensions/messages/server.ts`（default `messages`、`docs`、`actions`、`userActions`）        | `extensions/messages/web.tsx`（default）   | 是（`api.ts`）                                 |
| sidebar    | Agent surface 的侧栏与手机标题栏 @ultimate 入口，树的浏览与控制                            | 无 `server.ts`；`api.ts` 仅导出 `tier`                                                         | `extensions/sidebar/web.tsx`（default）    | 是（`api.ts`）                                 |
| onboarding | 首启、设置卡片、Extensions 面板与项目 setup 决策                                           | `extensions/onboarding/server.ts`（default `onboarding`、`docs`、`actions`、`userActions`）    | `extensions/onboarding/web.tsx`（default） | 是（`api.ts`）                                 |

### 2. 逐扩展规格

#### 2.1 lineage

**职责与用户可见行为。** root 是项目的一条工作线，本身不跑 turn；它的 tally 是给分支读的共享上下文：每个分支一行意图、每个对话最新 abstract、note 与 landing，以及 token 估算。分支从 root 的 tally（root 有 memory 时改为 memory brief）分叉，在独立 worktree 里工作。用户可见的是 sidebar 的 Memory 行（`Memory · N tokens` 与按 kind 计数）、Memory 面板（Decisions/Facts/Lessons，可展开 body 与 source、可 forget）、root 的 History 页（只读，composer 换成 "You're reading the project's history" + Back to @ultimate）、landing/abstract/note/catch-up 卡片，以及消息上的 **Go back to here**。

**导出与契约。** `api.ts`：`Roots`（`lineage.roots`）、`BranchState`/`Branch`（`lineage.branch`）、`LineageService`（`branch`、`rootOf`、`leaveNote`、`remember`、`memoryBrief`、`memoriesOf`）、`LineageApi`、re-export `Branched`/`Rooted`、`tier='core'`。`refs.ts`：`RootsDoc`、`TallyDoc`（`lineage.tally`）、`MemoryItem`/`MemoryDoc`（`lineage.memory`）、`ForgetAction`（`lineage`/`forget`，user-only）、`RecentAction`（`recent`）、`CompactAction`（`compact`）、`RewindFile`/`RewindDependent`/`RewindPreview`/`RewindPreviewAction`/`RewindAction`（`rewindPreview`、`rewind`）、`Rewound`（`lineage.rewound`）、`Branched`（`lineage.branched`）、`Rooted`（`lineage.rooted`）。`types.ts`：`RootEvent`（`landed`/`note`/`branched`/`compacted`/`started`）。`ui.tsx`：`MEMORY_PANEL='memory'`、`MEMORY_FOCUS='ext.lineage.memoryFocus'`、`useOpenMemory`、`column`、`MemoryHeader`（点 `lineage.memory-header`）、`useRoots`、`getRoots`。**tools**：`note`、`notify`、`compact`(deferred)、`memory`、`remember`(deferred，仅 @ultimate)；**actions**：`info`、`recent`、`compact`、`unlist`、`forget`、`rewindPreview`、`rewind`；**userActions**：`rewind`、`forget`、`compact`；**reactors**：`named`（`[Branched, Rooted]`）、`conclude-landed`（`[SubmissionLanded]`）、`landing-notes`（`[SubmissionLanded]`）、`memorize`（`[SubmissionLanded]`，`{from:'now'}`）；**docs**：`lineage.roots`、`lineage.branch`、`lineage.tally`、`lineage.seen`、`lineage.memory`（`server.ts:101`）；**tasks**：`lineage.prompt`、`lineage.notify`、`lineage.landing-note`、`lineage.conclude-landed`、`lineage.woken`、`lineage.memorize`、`lineage.rewind`；**points**：实现 `Trees`（`conversations.trees`：`rootOf`/`branchOf`/`abstract`），声明点 `lineage.memory-header`，浏览器 `provide(Unsummarized)`；**needed**：`WorkspacesApi`、`ConversationsApi`（另直接读 subagents 的 `Standing`/`Subagents` 文档，并 emit `Started` 事件）；**settings keys**：无自有键。

**状态与持久化。** 文档均在 Pi Durable（SQLite 支撑）：`lineage.roots`（在 conversation 1，`{ roots }`，初始 `[1]`）、`lineage.branch`（分支自身，`{ from, at, intent, brief? }`）、`lineage.tally`（root，`{ abstracts, tokens, briefTokens?, since? }`）、`lineage.seen`（`{ main?, at?, tally? }`）、`lineage.memory`（`{ memories }`，最多 `MEMORY_LIMIT=150`）、`lineage.notified`（`{ answers }`）、`lineage.notify-receipts`/`lineage.branch-receipts`（task scope）、`lineage.woken-receipt`/`lineage.memorize-receipt`（doc family，按提交/压缩任务）。tally 无自有保留策略（推断：源码未见裁剪，只有 compaction 收敛）；`Memorized` 收据永不淘汰，保证每次 landing 只蒸馏一次。条目 kind：`lineage.abstract`、`lineage.note`、`lineage.branched`、`lineage.finished`、`lineage.woken`、`lineage.rewound`、`lineage.rewound-dependent`，以及带 `data.lineage.tally`/`data.lineage.brief` 的 `pi.reset`。

**UI 位置。** slot `overlay` 挂 `Roots`（保持 roots 流）；`composer` 挂 `RootComposer`（root 显示 History 横幅）；panel `memory`（标题 Memory，icon `BrainIcon`，order 6）；`tools.note` 渲染 `NoteCall`；entries 渲染 `lineage.branched`/`lineage.note`/`lineage.finished`/`lineage.woken`/`lineage.abstract`/`lineage.rewound`/`lineage.rewound-dependent`/`pi.reset`；`messageActions: [GoBackAction]`；`provides: [provide(Unsummarized, ...)]`。sidebar 的 Memory 行通过 `openPanel(MEMORY_PANEL)` 打开它。

**关键流程。** 1. 分支：messages 的 `branch` 工具 → `LineageApi.branch({from, prompt, title?, isolated?, deliver:false, by, receipt})` → `startBranch`：空 root 先写 `pi.reset` 并把 `Tally.since` 指向它；`forkBranch` 校验 `from`/`at`，读取 root 与 `memoryBrief`（index + 最近 10 次 landing + 读全 tally 的指引）/`inheritedTally`，`forkConversation`，配置 cwd/model/thinking，删掉继承的 `tools`/`modelTools`，必要时 `WorkspacesApi.create`、`seedSeen`、写 `Branch` 文档与可选 brief reset，写标题与 `inputAt`，emit `Branched`/`Started`，在 root 追加一行 `lineage.branched`（源不是 root 时源上另有 display-only marker），创建 `lineage.prompt` 任务（`deliver:false` 时不建）。2. abstract：conversations 摘要器在每次完成 exchange 后调 `Trees.abstract(tx,id,{text,at,title?,feature?})`；有 open abstract 时追加 carrier（`anchor` 指向旧条目，`edits: replace`），否则追加 model-visible anchor；compaction 进行中则新开 anchor 并 omit 旧 anchor；landing 时 `placeLanding` 在**同一事务**把 open abstract 冻进 `lineage.note.data.abstract` 并 omit 其 anchor。3. landing：workspaces 的 `SubmissionLanded` 触发 `landing-notes` reactor → root 是 tally 则直接 `placeLanding`，否则建 `lineage.landing-note` 任务；同时 `memorize` reactor 建 `lineage.memorize` 任务，`summaryModelStatus()` 无模型则空完成，有则请求 JSON ops，`normalizeMemoryOp` 宽松修正后 `applyMemoryOps`，失败重试一次。4. memory：`remember` 只允许 @ultimate，`applyMemoryOps` 先整批校验（slug/字段/重复/上限/root 合法）再写，全有或全无；`memory {read?}` 任何 agent 可读。5. resume catch-up：`GenerationTask.beforeInput` 先 `refuseTally`，再 `catchup`：按 `lineage.seen.tally` 生成 "Meanwhile in #R's tree"（≤6000 token，新的 full、旧的 collapsed，无模型调用），按 `seen.main` 生成最多 30 条新提交（overlap 优先），note、seen 基线与输入同事务提交。6. go back：`rewindPreview` 算 steps/files/commits/dependents 与拒绝原因；`rewind` 建 `lineage.rewind` 任务，memo 事实与摘要，最终事务写一条 `lineage.rewound`（`edits` omit `at` 之后仍贡献的条目、恢复更早 go-back 改过的前缀）并 emit `Rewound`，再给 dependents 写 `lineage.rewound-dependent`。7. compact：`compactTally` 只允许 listed root 且 `since` 存在的 tally，`admitCompaction`；`CompactionTask.beforeCompact` 用 `COMPACT_SYSTEM`+`compactFocus` 生成 summary，@ultimate 的 manual compaction 额外建 `lineage.woken`，放好 summary 后投递 wake-up。

**失败与恢复。** 分支：空 prompt、无条目、`at` 不在源里、非 root 都会抛错；branch receipt 以 `{taskId, callId}` 原子记录，重放返回同一个分支；prompt 任务用 `requestId: 'lineage:prompt'`。landing note 用 `lander-root:<submission>` 去重；root 尚不是 tally 时落到后台任务。memory 批次失败整批回滚；`memorize` 解析失败会把拒绝原因附在第二次请求里，再失败只发 notice，landing 本身不失败。catch-up 失败由 hook 抛出，输入不落库；tally token 统计失败只 `host.notice`。rewind 在 admission 与最终提交都检查 busy/compaction/head marker，并用 revision 防"期间又长出新条目"。conclude-landed 只在 lander 报告 `done` 后继续，报告 `unanswered` 或 lander 空转即结束、分支保持打开（交给 watchdog）。

**关掉它会发生什么。** core tier，`extensions.disable` 无效。若被移除：没有 roots/tally/memory/branch 语义，messages 的 `branch` 工具与 `leaveNote` 失去实现，sidebar 的 Memory 行/History 页/Landed 数据源消失，onboarding 的 `start` 无法 `rootOf`，conversations 的 `Trees` 点无 provider，所有 `lineage.*` 条目与事件也一起消失。

**复刻要点。** 先把六类文档与全部 kind/ID 定死；`abstract` 必须在事务第一条表写入前调用（它读 conversation 记录）；fork 与 receipt、branch 文档、prompt 任务必须同事务；tally 的 tokens 只由 `subscribeCommits` 在 root 追加条目或 memory 变化后重算，绝不在读时算；memory 的唯一写路径是 `applyMemoryOps`；catch-up 是确定性拼装、不得调用模型；rewind 的前缀必须字节一致以命中 provider 缓存。

**证据。** `extensions/lineage/README.md:1-60`、`61-123`、`124-179`、`191-202`；`api.ts:13-70`；`refs.ts:10-114`；`types.ts:2-25`；`ui.tsx:21-53`；`server.ts:91-103`（docs/userActions）、`219-330`（root/branch/abstract）、`344-398`（watchTally）、`405-726`（Prompt/Notify/LandingNote/ConcludeLanded/Woken）、`867-1011`（startBranch/forkBranch）、`1043-1127`（landing/leaveNote）、`1136-1155`（section）、`1260-1350`（actions）、`1400-1430`（implements）、`1434-1504`（reactors）、`1507-1523`（hooks）、`1587-1749`（tools）；`memory.ts:20-35`、`156-192`、`244-272`、`320-430`；`catchup.ts:22-30`、`69-107`、`280-457`；`rewind.ts:64-113`、`363-542`；`web.tsx:619-639`。

#### 2.2 messages

**职责与用户可见行为。** 给 agent 一个 `message` 工具：按 `#id`、`@name`、`@lander` 或 `user` 寻址，立即返回 message id，答复异步回来；忙的接收者按 `steer` 插入当前 run，或作为 follow-up 排在后面；`reply:false` 是单向。@ultimate 可以给 `user` 发消息，其他 agent 只能发给 @ultimate 让它转达。`branch` 工具创建 lineage 分支并把 prompt 作为第一条 reply-enabled 消息发出，答复回到调用者。所有消息在 transcript 里渲染为带稳定 accent 的卡片/气泡，@ultimate 的会话使用 compact 模式（工具与思考折叠成 “worked · N steps”，消息、branch、landing、setup 卡片保留），并对发送者的每条消息显示 sending/delivered/awaiting reply/answered/failed/stopped 状态。跨项目时 `ultimate.tell` 可驱动另一个 Ultimate，消息模型文本明确标注 "another project's Ultimate, not the user"。

**导出与契约。** `api.ts`：`Message`（`id/from/to/text/at/reply/re/state/entry/answer/error/call/images/triage/remote/questions`）、`Messages`（kind `board`，`{messages,next}`）、`MessagesService`（`answer`、`openQuestions`、`dismiss`、`send`、`tell`）、`MessagesApi`、`GateService`/`Gate`（点 `messages.gate`，可选 pause 提供）、`tier='core'`。`refs.ts`：`Remote`、`Question`、`Message`、`Triage`、`MessagesData`、`MessagesDoc`（`board`）、`CallerAction`（`messages`/`caller`）、`MessageSent`（`board.sent`）、`Triaged`（`board.triaged`）。浏览器 `ui.tsx` re-export `conversationState`/`emptyMessages`/`isOpen`/`stateTone`/`stateWord`/`waitingOnUser`/`MessagesDoc`/`MessageSent`/`accentOf`/`Address`/`Body`/`Bubble`/`useAccentOf`/`MessageAnswers`。**tools**：`message`、`branch`(deferred)。**actions**：`caller`、`addresses`、`remote`、`remoteReply`；**userActions**：`remote`、`remoteReply`。**tasks**：`board.delivery`、`board.route`；**reactors**：无（`GenerationTask.onYield` 建 `board.route`，投递靠任务）；**docs**：`board`、`board.sent-calls`、`board.requests`、`board.started`、`board.remote`。**provided**：`MessagesApi`；实现 workspaces 的 `Handoff.send`；声明点 `messages.answers`（questions 提供答题卡）；**needed**：`LineageApi`、`SubagentsApi`、`WorkspacesApi`；**wanted**：`Gate`；**settings keys**：无。

**状态与持久化。** `board` 文档在 conversation 1（`history:'latest'`、`fork:'initial'`），`next` 从 1 开始；`append` 只保留最新 300 条（`log.ts:11`），但 transcript 仍保留已投递输入。`board.sent-calls` 是 task scope 的 `{ids}`，在消息与 delivery 任务同一事务写入，防止 memo 未落盘时重复；`board.requests` 是发送者 conversation scope 的 `{ids}`，给跨任务 requestId 去重；`board.started` 记 `{by, yielded}`；`board.remote` 存 `{received, told}`，不受 300 条上限裁剪，reply-enabled 的 tell 保留到答复到达。消息状态机：`sent → delivered → answered | dismissed | failed | stopped`；triage 先 `assessing` 再 `act|fyi`。

**UI 位置。** 无独立 surface/panel；`web.tsx` 只挂 `slots.overlay: [MessageNavigation]`（响应 `messages:open`，在 Agent surface 里滚动到 entry 或 tool call 的响应），entries `board.message`/`board.reply` → `MessageInput`、`board.wake`/`board.open` → `null`、`pi.assistant` → `CompactAnswer`；tool renderers `message`/`branch`；`compact.when=ultimateCompact`、`compact.tools`、`compact.quiet`、`compact.summary=BackgroundSummary`；`answerLabels: [MessageAnswerLabel]`；`provides(ConversationKind, label==='coordinator' ? 'branch · coordinator')`。card 组件在 `cards.tsx`（`Address`、`Body`、`Bubble`、`MessageCall`、`BranchCall`、`TriageStatus`、`MessageInput`）。

**关键流程。** 1. 发送：`message` 工具 → `send(host, from, input, ctx, taskId, callId)` → 先查 `Sent`/`Requests` 回执，校验 @ultimate 才能发 user、非空、questions 只随 reply-expected user 消息、subagent 只能发 parent、`resolve` 地址（自消息、未知对话、tally 均拒绝）→ 事务里 `append`、emit `MessageSent`、为接收者建 `board.delivery` 任务。2. 投递：delivery `deliver` 阶段刷新 standing 定义、解析 images、`recipient.submit({type:'input'|'write', requestId:'board:<id>', whenBusy: steer? 'steer':'followUp'})`；等 Inbox 队列清空后读 submission 状态，把 `sent` 改 `delivered`/`stopped`/`failed`；reply-enabled 时等答复，把答复写成 `board.reply` 并唤醒发送者。3. triage：仅对"非 note、来自数字/remote、发给 primary"的消息；reply 立即 `act`，否则 `declared()` 判 question/options/超长（`TRIAGE_MAX=24_000` 字符）；不确定才问 summary model（`TRIAGE_SYSTEM`，30s），`act` 发 `board.wake`，`fyi` 只作为 context；先写 `board.message` 再评估，verdict 提交先于 wake。4. `branch`：`actingAs` 后选 root（显式 → tree root → 唯一 root），解析 images，读 `coordinator` 定义与 pin 的 model/thinking，`lineage.branch({deliver:false, receipt})`，再 `configure` instructions + `label='coordinator'` + `Started.by`，最后 `send` 第一条 reply-enabled 消息。5. 答复路由：`GenerationTask.onYield` 若 `Started.by` 存在，为每个 generation 建 `board.route`；`observe` 等 generation 完成，仅在"该答案确实结算了某个 input、不是已回答启动者的 reply-enabled 消息、run 没用 `message` 联系过启动者、不是只被启动者自己的 reply 唤醒"时，用 `send(..., reply:false, requestId:'route:<answer>')` 发回；末行是问题/选项时用 follow-up，否则 note。6. 远程：`tell` 在本地先记 `sent` 的消息与 `board.remote.told[key]`，再 POST 目标的 `messages.remote`；目标 `remoteAction` 以 `key` 幂等、只投递给 `standing('ultimate')`；回答经 `remoteReply` 回到 `told[key].answer`，且第二条答复返回第一条 id。

**失败与恢复。** 地址错误/自消息/tally/未知 standing 均抛可读错误；subagent 越界发消息被拒。接收者 input hook 拒绝放置时消息标 `failed` 并写 `error`，delivery 完成而不是卡在 `sent`。接收者 run 被 Stop 时记 `stopped`（错误文本 "was stopped by the user before it answered"），崩溃/provider 错误/空答案记 `failed`。`message`/`branch` 都是 `replay:'safe'`：memo + task-scoped 回执 + `board.requests` 三层去重。投递用 `board:<id>`、回复用 `board-reply:<id>`，记录答复/追加回复/推进 checkpoint 同事务。远程 `tell` 在 codemode 中不重放，崩溃可能留下 `sent` 但未 POST（README 明说），再次 tell 用新 key。

**关掉它会发生什么。** core tier。若移除：agent 没有 `message`/`branch` 工具，@ultimate 无法给用户发消息，分支无法被创建（lineage 只提供 API），delivery/triage/route 全部消失，sidebar 的 `conversationState`/`waitingOnUser` 与 @ultimate 行失去数据源，onboarding 也无法通过 @ultimate 对话推进。

**复刻要点。** 把 `board` 的 300 条上限与“transcript 才是输入真相”分开；所有 idempotency key 必须原样（`board:<id>`、`board-reply:<id>`、`route:<answer>`、`lineage:notify:<target>:<task>`）；delivery 的两个阶段与 memo 必须能在重启后恢复；triage 失败一律当 `act`；`steer` 默认值只对 primary 的发送者为 true；`board.sent` 只带元数据不带正文；subagent 的 note 是 `delivery:'note'` 的 write、不启动 run。

**证据。** `extensions/messages/README.md:5-47`、`48-115`、`116-149`、`151-180`、`182-227`、`250-270`；`api.ts:13-102`；`refs.ts:42-105`；`server.ts:34-78`（actions）、`79-144`（service/handoff）、`145-187`（hooks/sections）、`188-270`（tools）；`send.ts:19-221`；`delivery.ts:29-425`；`triage.ts:23-58`、`139-232`；`route.ts:14-114`；`branch.ts:13-124`；`remote.ts:23-244`；`log.ts:8-20`；`questions.ts:25-153`；`images.ts:14-68`；`web.tsx:55-116`；`data.tsx:39-92`；`cards.tsx:360-462`。

#### 2.3 sidebar

**职责与用户可见行为。** Agent surface 的整个左栏：最上面 @ultimate 一行（`working`/`idle`/`N waiting on you` + 最新消息年龄，点开即 `talkToUltimate`），下面是 Agents 组（lander 第一，其余 ownerless 顶层 standing agent 按 id），lander 行下嵌 **Landed · N**；再往下每个 root 的 **Memory** 行 + 安静的 **History #id** 链接；`sidebar.top` 插槽；**In flight · N**（所有树里未 conclude、且未在最近输入后 land 的分支，按最新输入排序，带 feature、状态、年龄、`N commits`/`+ N edits` 与各层 subagent 行）；底部折叠的 **Earlier · N** 与 **Concluded · N**。每行都有 `…` 菜单：Rename（双击也能进）、Compact context、Conclude/Resume，隔离行另有 Workspace details 与 Review changes。手机上侧栏隐藏，改用标题栏的 `@ultimate` 按钮；宽屏标题栏的 ULTIMATE wordmark 也可点。

**导出与契约。** `api.ts`：仅 `tier='core'`。`ui.tsx`：点 `UnderUltimate`（`sidebar.under-ultimate`，输入 @ultimate id，多个 provider 按发现顺序）、`Unlisted`（`sidebar.unlisted`，返回一组 id，取并集）。`state.tsx`：`useSidebarState`，键前缀 `ext.conversations.`。`listed.ts`：`topLevelRows`。`label.ts`：`primaryLabel`。`landings.ts`：`Landing`/`LandingGroup`/`groupLandings`/`groupRange`。`work.ts`：`Work`/`workOf`。`root.tsx`：`landedAt`、`inFlight`、`stillOpen`、`InFlight`、`MemoryRow`、`Flight`。`rows.tsx`：`Row`、`RowMenu`、`saveTitle`、`StandingRow`、`SubagentLine`、`ChildRow`。`landed.tsx`：`useLandings`、`Landed`；`lander.tsx`：`LanderState`；`section.tsx`：`Section`、`More`。`ultimate.tsx`：`WaitingOnUser`、`StandingPhase`、`UltimateWordmark`、`UltimateButton`。**tools/actions/events/reactors/apis**：无；纯浏览器扩展。**提供的 point**：`sidebar.under-ultimate`、`sidebar.unlisted`；**消费**：conversations、workspaces、subagents、lineage、messages、coding-tools。**settings keys**：无；UI 状态键 `ext.conversations.concluded`、`ext.conversations.seen`、`ext.conversations.expanded`、`ext.conversations.closedSections`、`ext.conversations.landedAll`。

**状态与持久化。** 无自有文档或 SQLite；所有数据来自其它扩展的文档/事件（`StandingDoc`、`MessagesDoc`、`TallyDoc`、`MemoryDoc`、workspaces index、`useOverview`、`useTasks`）。持久化只有 UI 状态（`useUiState`）。`concluded` 是 sidebar 读的列表（写方在 conversations 的 conclude 语义里），`seen` 由 overlay `Seen` 在展示的顶层对话空闲后记录 `answerAt`，`expanded` 记展开的 Sub-agents，`closedSections` 记折叠的 section，`landedAll` 记 Landed 是否全展开。

**UI 位置。** `slots.sidebar: Conversations`；`slots['titlebar.brand']: [UltimateWordmark]`；`slots['titlebar.left']: [{component: UltimateButton, order: 100}]`；`slots.overlay: [Seen]`。无 panel/surface/command/status item。每个 section 用 `Section`（`section.tsx`）画 mono 标题、chevron、count bubble；`Landed` 只用前 5 组，`+N more` 展开。

**关键流程。** 1. 组装树：`Tree` 先由 `useConversations()` + `useOverview()` + foreground tasks 计算每行 `busy`（pause 的 run 不算），`topLevelRows` 去掉 `Unlisted`；`pinned`（label lander 或顶层 ownerless `agent`）单列；root 行 → `MemoryRow`；其余按 `branchOf.conversationId` 生成 `branchesBySource`，`inFlight`/`stillOpen` 过滤出 `openBranches`，`InFlight` 渲染；剩下的是 Earlier 顶层，Concluded 由 `hiddenConversationIds`。2. 状态：每行统一 `conversationState`（paused/working/waits/awaiting/done/failed/idle，messages 的 `data.tsx`），`working` 还包含子代理 run；`Mark` 用 pulsing dot/solid dot/check/help/cross 表示，`unseen` 只由 `seen` 与 `answerAt` 比较。3. Landed：`useLandings(roots)` 订阅每个 root 的 `TallyDoc.kind`，`tokens` 变化即重排，调 `lineage recent {types:['landed'], limit:20}`，按 feature（无 feature 用 title/sha）分组，组内次序列出；`groupRange` 只在 landing 首尾相接时给 Review range。4. Conclude：`requestConclude` 先 `workspaces pending {ids}`，有未提交/未 land 的工作弹确认（说明 checkout 会保留），否则立即 `ConcludeAction`；`ResumeAction` 反向。5. 工作进度：`useFlightWork` 对 ready worktree 调 `workspaces progress`，仅在 `coding-tools.committed`、worktree 变化或 run 起止时 refetch，绝不轮询。6. `Seen`：展示的顶层对话空闲后把 `answerAt` 写入 `ext.conversations.seen`，使 unread 点变实心。

**失败与恢复。** `recent` 失败（root 刚被 unlist）被吞成空列表，下一次 entry 变化会重读；`progress` 失败由 `useAction` 报错并保持空；`pending` 失败会弹确认框并显示错误，用户仍可 Conclude；`saveTitle`/`ConcludeAction` 失败走 `store.notify`。standing agent 若还没有 conversation（@ultimate 尚未打开），`standingRow(undefined)` 用 `waiting` 计数显示 `waits`，点击仍能 `talkToUltimate` 创建它。删掉的 conversation id 在 UI 状态里残留不会报错，只是不再匹配。

**关掉它会发生什么。** core tier。若移除：Agent surface 没有侧栏，无法在 UI 里切 root/branch、看 In flight/Landed/Memory、Rename/Compact/Conclude/Resume；手机没有 `@ultimate` 按钮，桌面没有 titlebar wordmark；`sidebar.under-ultimate` 与 `sidebar.unlisted` 两个点没有宿主，side-chat/voice-live 的嵌套行也失去落点。

**复刻要点。** 侧栏是"读投影"的组件：不要在 sidebar 里写会话状态，所有状态来自 `conversationState` 和 workspaces；`In flight` 的判定要用 "landed after latest input" 而不是"曾经 landing 过"；`Section` 的折叠键和 `landedAll` 等必须沿用 `ext.conversations.*` 以兼容旧状态；standing 行永远不给 Rename/Conclude，只给 Compact；所有列表查询都要有"何时重读"的事件依据（commit、worktree 变化、run 起止），不要定时器。

**证据。** `extensions/sidebar/README.md:1-114`；`api.ts:1-2`；`ui.tsx:7-15`；`state.tsx:5-6`；`listed.ts:7-15`；`web.tsx:5-14`；`sidebar.tsx:110-125`、`129-251`、`253-372`、`374-456`、`458-632`、`635-648`；`root.tsx:28-48`、`51-79`、`299-345`、`358-433`；`rows.tsx:117-269`、`275-356`、`363-444`、`460-609`；`landed.tsx:16-133`；`landings.ts:11-31`；`work.ts:12-28`；`lander.tsx:12-71`；`ultimate.tsx:19-114`；`section.tsx:11-67`。

#### 2.4 onboarding

**职责与用户可见行为。** 首次启动只弹 **Get ready**：连接 provider、选一个可用模型（推荐 1M+ context，模型窗口不足会提示），Continue 只有在两者都满足时可用；Continue 调 `start` 打开 @ultimate 的 standing 对话并开始 onboarding，Escape/关闭只记录完成、不改设置。@ultimate 对话里由 `how-ultimate-works` skill 带用户走五个节拍，然后按需展示三张 setup 卡片：**Extensions**（推荐扩展复选框，core 锁定为 "core, always on"）、**Project**（"Use this project's setup?" 与它带来的扩展/设置/agents/skills/README）、**Git**（不可隔离的原因；空文件夹 `git init` + 空首提交，有文件则让 @ultimate 写 `.gitignore` 与首提交）。Extensions 面板（右侧 tab，⌘K **Extensions…**）列出项目 setup 决策和每个扩展的 source、deciding layer、README 首句、开关与详情。

**导出与契约。** `api.ts`：仅 `tier='core'`。`refs.ts`：`ProjectSetup`、`OnboardingStatus`、`Described`、`StartsDoc`（`onboarding.starts`）、`StatusAction`、`FirstRunDoneAction`、`StartAction`、`DismissAction`、`WalkthroughAction`、`HelpAction`、`ChooseAction`、`DecideAction`、`SetExtensionAction`、`AdoptProjectSetupAction`、`ExtensionDetails`、`DetailsAction`、`ExtensionsAction`。`onboarded.ts`：`onboarded(started, memories)`。`server.ts`：`Starts` 文档、`ChoiceRequests`（`onboarding.choice-requests`）、`docs=[Starts]`、`StartEntry`（`onboarding.start`）、`WalkthroughEntry`（`walkthrough.start`）、`ChoiceEntry`（`onboarding.choice`）、`actions`、`userActions`（start/dismiss/walkthrough/help/choose/decide/setExtension/adoptProjectSetup/applyFirstRun/firstRunDone）。浏览器侧另导出 `FirstRun`/`Recommended`/`ProjectCard`/`GitCard`（`pages.tsx`）、`ExtensionsPanel`（`panel.tsx`）、`StartComposer`（`survey.tsx`）、`projectDialog`/`gitDialog`/`firstRunDialog`/`sources`/`useDescribed`/`projectLists`/`Line`/`Heading`/`Segmented`（`parts.tsx`）、`recommended`/`switchScope`/`extensionOptions`（`choices.tsx`）。**tool**：`setup`(deferred)。**needed**：`LineageApi`、`SubagentsApi`、`WorkspacesApi`。**settings keys**：用户 `~/.ultimate/settings.json` 的 `onboarding: false` 与 `extensions.enable/disable`；项目 `.ultimate/settings.json` 的同名键。**files**：`~/.ultimate/onboarding.json`（`{firstRunDone:true}`）。

**状态与持久化。** `onboarding.starts`（conversation 1 scope）：`{ roots: { [root]: ultimateConversationId }, dismissed? }`，`history:'latest'`、`fork:'initial'`；它是"每个 root 只 onboarding 一次"和 Start here 永久消失的依据。`onboarding.choice-requests` 按 `toolCallId` 存已规范化的 payload，保证标签页竞争/重试返回同一选择。marker 文件用 `writeJson` 原子写。项目决策通过 `host.setProjectDecision`（Pi `ProjectTrustStore`）保存，linked worktree 共享主 checkout 的决策。扩展开关写 user 或 project settings（`updateSettings`，同目录临时文件 + rename、两空格 JSON + 尾换行）。

**UI 位置。** `composer: StartComposer`（仅 @ultimate 会话，在 composer 上方插 Start here 卡片，直到 `onboarded` 或 dismissed）；`tools.setup` → `SetupCall`（`Card`，`data-setup-card`）；entries `onboarding.choice`、`onboarding.start`、`walkthrough.start`；`slots.overlay: [Onboarding]`（Get ready 对话框 + 旧 dialog 入口重定向到 @ultimate）；`slots['statusline.right']: [NoGit, Undecided]`（`phone:true`）；panel `extensions`（标题 Extensions，`BlocksIcon`，order 8）；commands `onboarding.extensions`（"Extensions…"）、`onboarding.first-run`（"Get ready…"）、`onboarding.walkthrough`（"Walk me through Ultimate"）。

**关键流程。** 1. 首启：`Onboarding` 读 `StatusAction`，`navigator.webdriver` 为真时不弹；`FirstRun` 的 `next` 依次是 `auth.login`/`model.pick`/`continue`；`finish(false)` 先 `StartAction({})` 再 `FirstRunDoneAction`；关闭走 `finish(true)`，只记 marker。2. `start`：解析 root（参数 → 当前对话的 tree root → 1），若 `Starts.roots[root]` 已存在直接返回；校验是 root；取 `standing('ultimate')`，收集 facts（project name/path、firstRun、projectUndecided、gitReason、root、rootEmpty）与可选 instructions，`submit` 带 `requestId:'onboarding:<root>'`、entry `onboarding.start`、`whenBusy:'followUp'`，然后把 root→id 写入 `Starts`。3. 设置卡片：`setup` 只返回现状（project 卡片无 config 或已决策则拒；git 已可隔离则拒）。浏览器 `SetupCall` 的按钮调 `ChooseAction {card, toolCallId, extensions|local|initialize}`；`choose` 用 `host.resource('onboarding.choose')` 串行化，先查 `onboarding-choice:<toolCallId>`，不同 payload 拒绝；应用 `applyFirstRun`/`decide`/`WorkspacesApi.setupGit()`，把 payload 存 `ChoiceRequests`，再提交 `onboarding.choice`（summary + toolCallId）。4. 完成判定：卡片是否已选只看 transcript 里匹配 `toolCallId` 的 `onboarding.choice`，不看当前 settings 或本地 flag。5. 面板开关：`ExtensionsPanel` 读 `useSystem()`，按 `scope`（project 仅当 `system.project.decision===true` 且用户选了 project，否则 user）调 `SetExtensionAction`；core 扩展 switch disabled；失败写行内错误。6. 项目 setup：`DecideAction` 调 `host.setProjectDecision`，`AdoptProjectSetupAction` 把项目 enable/disable 合并进用户 settings 并 reload。

**失败与恢复。** `choose` 的 payload 在 admission 前持久化，queued submission 也能阻止第二个标签页选别的；应用成功但通知失败时按钮仍可用，重试是幂等的；`setup` 卡片只在对应 typed choice entry 出现后显示 "Chosen: …"。`start` 用 requestId 保证一个 root 一次，重复调用返回已有 `{id}`。没有可用 provider 或没有可用模型时首启 Continue 被禁用，不会进入 onboarding。`setExtension` 在项目决策未选时拒绝写 project；`adoptProjectSetup` 同理。settings 写失败直接抛给 UI。Ext 面板 `details` 对未知扩展抛 `Unknown extension ...`；`extensions` 对缺 README 返回空串而不是失败。

**关掉它会发生什么。** 它是 core tier（`extensions.disable` 无效），但用户可在 `~/.ultimate/settings.json` 写 `"onboarding": false`：`status.off=true`、`firstRun=false`，没有 Get ready/Start here/setup 卡片/git 提醒；未决的项目 setup 仍保留 **project setup** 提醒，点击改为打开 Extensions 面板的项目决策处。Extensions 面板、⌘K Get ready… 与 Walk me through Ultimate 仍可用。若整个扩展被移除：首启、设置卡片、Extensions 面板与 `onboarding.starts` 都不存在，@ultimate 的 composer 没有 Start here，项目 setup 决策无处修改。

**复刻要点。** `onboarding.starts` 是唯一"已 onboarding"真相（加上 root 有 memories 的兜底）；`start`/`walkthrough`/`help` 都直接向 standing @ultimate 提交 input，不要自己建对话；`choose` 必须"先持久化 payload、再应用设置、再提交 typed input"，且在同一把资源锁里；`applyFirstRun` 对每个名字同时写 enable 与清 disable（`toggle`）；marker/settings 写入必须原子；面板的 scope 选择与 core 锁死要在 UI 与服务端各校验一次。

**证据。** `extensions/onboarding/README.md:3-20`、`22-51`、`53-96`、`98-107`、`109-137`；`refs.ts:10-117`；`server.ts:42-73`、`161-172`、`174-515`、`521-564`；`web.tsx:57-103`、`153-172`、`174-229`、`240-300`；`panel.tsx:46-58`、`84-199`、`212-314`、`456-610`；`pages.tsx:37-182`、`201-283`、`349-436`；`survey.tsx:12-85`；`choices.tsx:7-63`；`onboarded.ts:5-8`；`parts.tsx:7-62`。

### 3. 跨扩展协作

| 调用方            | 被调用方                                                    | 通道                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| messages          | lineage                                                     | `host.need(LineageApi)`：`branch`、`leaveNote`、`rootOf`；`branch` 工具把 `{taskId, callId}` 作为 receipt 传给 lineage                                                                                                                   |
| lineage           | messages                                                    | 不 import 其 api（避免环）：按 kind 读 `board` 文档判断是否有 open reply（`server.ts:672-683`），`rewind.ts` 用 `defineEvent('board.sent')` 读消息依赖                                                                                   |
| messages          | workspaces                                                  | 实现点 `Handoff.send`（lander 的 deploy handoff）；`addresses.ts` 用 `WorkspacesApi.doc` 的 `landerConversations` 解析 `@lander`                                                                                                         |
| messages          | subagents                                                   | `SubagentsApi.residents/standing` 解析 @name、刷新定义；读 `Standing` 索引判断 @ultimate                                                                                                                                                 |
| lineage           | workspaces                                                  | `WorkspacesApi.git` 取 HEAD、`create` 建 worktree、`Release.release` 释放；reactor 监听 `SubmissionLanded`                                                                                                                               |
| lineage           | conversations                                               | `ConversationsApi.generatedTitle`（`named` reactor）、`concludeIn`（conclude-landed）；实现 `Trees` 点供摘要器写 abstract                                                                                                                |
| lineage           | subagents                                                   | 读 `Standing`/`Subagents` 文档，emit `Started`；`branch` 的 `by` 用于 tally 文本                                                                                                                                                         |
| sidebar           | conversations / workspaces / subagents / messages / lineage | 读 `OverviewDoc`、`MessagesDoc`、`TallyDoc`、`MemoryDoc`、workspaces index；调 `ConcludeAction`/`ResumeAction`/`RenameAction`/`PendingAction`/`ProgressAction`；复用 `AgentMark`/`FeatureTag`/`ConversationPhase`/`CommitCount`/`Review` |
| sidebar           | side-chat / voice-live 等                                   | 消费 `sidebar.under-ultimate`、`sidebar.unlisted` 点                                                                                                                                                                                     |
| onboarding        | lineage                                                     | `start` 调 `rootOf` 校验 root；`onboarded` 读 root 的 `MemoryDoc`                                                                                                                                                                        |
| onboarding        | subagents                                                   | `standing('ultimate')` 取得/创建 @ultimate 会话；`help`/`start`/`walkthrough` 都向它提交 input                                                                                                                                           |
| onboarding        | workspaces                                                  | `setupGit()`；浏览器 `IsolationAction`；Git 卡片与 `onboarding:git` 事件                                                                                                                                                                 |
| sidebar / lineage | messages（浏览器）                                          | sidebar 的 `LandedRow` 与 lineage 的 `MemorySource` emit `messages:open`，messages 的 `MessageNavigation` 收；messages 再 emit `ultimate:reveal-entry`                                                                                   |

关键约束：messages 是 lineage 的上层，lineage 仅以 doc kind `board` 和事件名 `board.sent` 反向读取，绝不能 import `messages/api.ts`（`pnpm deps` 会报环）。sidebar 不属于服务端依赖图，但浏览器 import 了 messages/lineage/subagents/workspaces/conversations 的 `ui.tsx`，因此这些模块的 `ui.tsx` 必须保持 browser-safe、不 import 服务端代码。

### 4. 复刻顺序建议与风险

建议按 1→4 复刻：**lineage**（先把 Roots/Tally/Branch/Memory 四类文档、`abstract` 的 anchor/carrier 语义、branch fork 事务、memory brief 定死）→ **messages**（依赖 lineage 的 branch/leaveNote，先做 `board` 日志与 delivery 两阶段，再做 triage/route/remote）→ **sidebar**（只读投影，最后接事件与 UI 状态）→ **onboarding**（依赖 standing @ultimate、lineage rootOf、workspaces setupGit，适合最后做）。

主要风险：

- **依赖环**：messages → lineage 是硬依赖；lineage 若为了读消息而 import messages 会成环。必须坚持"按 doc kind / event 名读取"的弱耦合（`extensions/lineage/server.ts:672`、`extensions/lineage/rewind.ts:55`）。
- **事务边界**：abstract 必须在事务第一条表写入前；landing note 与 abstract 冻结同事务；branch fork、branch 文档、`Branched` 事件与 prompt 任务同事务；漏一处就会出现"abstract 丢失/分支无 prompt/重放建两个分支"。
- **幂等**：`branch` 的 task-scoped receipt、`board.sent-calls`、`board.requests`、`route:<answer>`、`lineage:notify:*`、`onboarding-choice:<toolCallId>` 全部要原样复刻；否则重启/重试会重复发送或重复建任务。
- **hook 依赖**：catch-up 与 open-questions note 都挂在 `GenerationTask.beforeInput` 的**事务性**补丁上，输入与 note 同 commit；这是本仓库对 Pi 上游的 patch，复刻时要先确认目标 Pi 版本有该 hook，否则语义会退化为"先写 note 再输入"的竞态。
- **UI 判定**：In flight 的"最近 landing 之后又工作"、unread 的 `seen` 比较、Landed 的 feature 分组与 contiguous range、`conversationState` 的七态，都依赖时间戳与文档投影的精确对齐；用轮询代替事件会引入闪烁与额外查询。
- **core tier 边界**：四个扩展都是 core，core 只能依赖 core；若把 sidebar 的某个数据源做成可选扩展（如 workspaces），需要 `useSystem().extensions` 判空 + 不 import 可选模块，或把它降级为非 core。
- **设置与信任**：onboarding 的项目开关只有在 `ProjectTrustStore` 决策为 true 时才能写项目 settings；用户 settings 的 `onboarding:false` 只关闭引导，不关闭扩展本身。复刻时不要把两者混成一个开关。
- **保留策略**：`board` 只留 300 条但 transcript 保留输入；`Memory` 上限 150；`Memorized` 收据永不淘汰；`board.remote` 不裁剪。任何"统一清理"都会破坏可回放性与去重。

---

## A.5 编排与监督扩展组 分析笔记

### 1. 概览

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

### 2. 逐扩展规格

#### 2.1 `plan`

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

#### 2.2 `tasks`

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

#### 2.3 `todos`

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

#### 2.4 `phase`

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

#### 2.5 `automations`

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

#### 2.6 `goal`

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

#### 2.7 `pause`

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

#### 2.8 `review`

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

### 3. 跨扩展协作

- **plan ↔ tasks**：`tasks/web.tsx` 直接 import `TaskChip`/`useTaskOf`（`tasks/web.tsx:25`），在任务图会话行显示 plan task；`plan` 通过 `ConversationTask` point 把自己的 chip 提供给 sidebar、subagents 等（`plan/web.tsx:817`）。`plan` 的 isolate 行读 `workspaces` 的 `InfoAction`（`plan/web.tsx:106-111`）。
- **plan ↔ lineage**：`plan/server.ts` 用 `lineage` 的 `Branch` 文档判断 fork 起点，并在 `beforeInput` 重置未回答分支的计划（`server.ts:14,152-160`）。
- **todos ↔ messages/questions/subagents**：面板直接读 `MessagesDoc` 的 waiting 消息（`todos/panel.tsx:43`），用 `waiting()` 和 `messages:open` 事件（`panel.tsx:239`），并用 `StandingAction` 找 @ultimate（`panel.tsx:69`）。
- **phase ↔ classify ↔ sidebar**：`phase/server.ts` 通过 `host.want(ClassifyApi)` 调 classify；`phase/web.tsx` 提供 `ConversationPhase`，sidebar 的 `rows.tsx:120`、`root.tsx:129`、`ultimate.tsx:30,76`、`lander.tsx:14`、voice-live 使用该 point。
- **automations ↔ goal**：goal 用 `AutomationsApi` 创建/暂停/恢复 `Goal reminder · goal N`（`goal/reminder.ts:28-100`）；automations 关闭时 goal 仍运行但没有 reminder（`goal/server.ts:300-303`）。
- **automations ↔ dream/activity**：dream 通过 `AutomationsApi` 创建“Dream before compaction”上下文自动化并消费 `automations.fired`（`dream/before-compaction.ts:25`，`dream/server.ts:26`）；activity 读 `Escalated`（`activity/feed.tsx:15`）。
- **pause ↔ messages/cloud/update/keep-warm**：pause 实现 `messages.gate`，让 Messages 的 triage 模型调用在暂停时等待（`pause/server.ts:443-447`）；`cloud`/`update`/`keep-warm` 用 `host.want(PauseApi)` 跳过工作（`cloud/server.ts:73`，`update/server.ts:121-128`，`keep-warm/server.ts:147-204`）；pause 还提供 `ParkedRuns` 给 sidebar/system/transcript（`pause/web.tsx:447`）。
- **review ↔ workspaces/subagents**：review 读 `WorkspacesApi.doc` 的 worktree index 和 `SubmissionLanded`（`review/server.ts:22,71,130`），用 `SubagentsApi.standing('ultimate')` 作默认收件人，并提供 `workspaces.review` point 给 landing card、sidebar branch 行（`workspaces/landing.tsx:74`，`sidebar/rows.tsx:323`）。
- **tasks ↔ transcript**：`tasks` 提供 `RunStart` point，transcript 用它显示运行时钟（`web/src/app/transcript.tsx:1289-1291`）。

### 4. 复刻顺序建议与风险

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

---

## A.6 上下文与记忆组（Context & Memory）分析笔记

### 1. 概览

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

### 2. 逐扩展规格

#### 2.1 context

**职责与用户可见行为**：在会话第一条记录上方显示一条安静的头：agent 名、模型与思考级别、`N sections · N tools`、预算条和总 token；展开后是定义路径、逐段系统提示、每个工具的说明与 schema、以及上下文开始前注入的内容（memory brief / tally / compaction summary / 继承历史），各带 token 与占比。之后的上下文起点（compaction、reset）在自己的卡片下再显示一份；中途的 `pi.system` 变成可展开的 diff 标记。

**导出与契约**：`breakdown.ts` 是纯模型，导出类型 `Section`/`Tool`/`Prompt`/`Injected`/`Breakdown`/`SectionChange`/`ToolChange`/`Diff`，函数 `systemOf`、`startsContext`、`removesAll`、`toolTokens`、`promptAt`、`opensContext`、`breakdownAt`、`diffAt`、`modelLine`、`ownStart`。`web.tsx` 默认导出 `defineWebExtension({ slots: { 'transcript.start': [Start] }, entries: { 'pi.system': SystemEntry, 'pi.reset': ContextStart, 'pi.compaction': ContextStart } })`。无 tools、actions、docs、events、reactors、apis、settings keys。

**状态与持久化**：不写任何文档；完全由 `useTranscript()` 的条目重放。token 用 Pi 的 `estimateTextTokens` 估算（3.5 字符/token），图片按 4800 字符计（界面写"约 1.4k"）。`promptAt` 从最近的 reset/compaction 起回放 `pi.system` 的 `sections`（`null` 删除、赋值追加）与 `toolsRemoved`/`toolsAdded`；go-back 用 `setAsideIds` 排除被搁置的补丁。

**UI 位置**：槽 `transcript.start`；三个 entry 渲染器。展开态用 `Collapsible`；diff 标记用 `useFold(id)` 保存开合。

**关键流程**：(1) `Start` 用 `ownStart(entries, id)` 找当前会话第一条自己的条目，`ContextAt` 调 `breakdownAt`。(2) `breakdownAt` 把 reset/compaction 当作 `start`；若其 `model[0]` 是 user 则按 `data.lineage.brief|tally` 标为 memory brief / tally，否则 handoff；没有 start（fork）则 `inherited()` 汇总源会话从上次上下文起点到本 fork 首条的历史。(3) `firstSystem` 找起点后第一个 `pi.system`；`removesAll` 的补丁与其后的重加合并为同一次。(4) `promptAt` 重建 sections/tools，求和得 `tokens.prompt`、`tokens.tools`、`tokens.injected`、`total`。(5) 首个 `pi.assistant` 记录 provider/model/thinking，`modelLine` 在尚无回答时退回会话配置并标 `configured`。(6) `SystemEntry` 对"开启上下文的补丁"和 remove-all 前的补丁返回 `null`，其余渲染 `system prompt · N sections · N tools · ±tokens`，展开为 `diffAt` 的增/改/删与全文。

**失败与恢复**：没有 `pi.system` 时 `ContextAt` 不渲染；条目索引找不到时退回核心渲染；损坏的补丁只是少一段，不影响运行。README 声称的 `Reloaded`/`Restarted` 标记在 `web.tsx` 中不存在（在 `extensions/` 内搜索无命中），属文档滞后（推断）。

**关掉它会发生什么**：`transcript.start` 不再有头，三个 `pi.*` 条目退回核心默认渲染，diff 与预算可视化全部消失，不影响模型请求。

**复刻要点**：这是纯派生视图，只读条目，不读 settings/provider headers/secrets；remove-all 折叠是对 Pi 条目顺序的隐式耦合（源码首行注释声明为上游临时方案）。`inherited()` 对 compaction 的 `head` 处理最易错。

**证据**：`extensions/context/breakdown.ts:36-46,67-80,91-120,130-146,148-155,186-211,218-259,265-309,315-334`；`extensions/context/web.tsx:47-59,62-81,264-367,377-400,482-504,506-509`。

#### 2.2 recall

**职责与用户可见行为**：@ultimate 的上下文至少 20% 满之后，每条新输入（用户 `pi.user` 或分支 `board.message`，以及 triage 报告的 `board.wake`）先问一次 classify："哪条项目记忆正好适用于这条消息？"最多取 3 条概率 ≥ 0.25 的记忆，把全文插到输入之后。检查期间用户气泡边缘跑一圈光带；命中后气泡下缘飞入记忆 chip，点开 Memory 面板对应记忆；没命中什么都不显示。

**导出与契约**：`server.ts` 导出 `FROM_PERCENT = 20`、`THRESHOLD = 0.25`、`Recall`（doc，kind `recall.state`，version 1，`scope: 'conversation'`，`history: 'latest'`，`fork: 'initial'`，`checkpointWhen: () => false`）、`docs = [Recall]`、`recallQuestion(memories)`、`recallText(picked)`，默认导出 `recall(host)`。`types.ts` 导出 `RECALL_ENTRY = 'recall.memories'` 与 `Recalled { input, root, memories: [{slug,line,confidence}] }`。`refs.ts` 导出 `RecallDoc` 与 `RecallState { pending?, last? }`。依赖声明：`host.want(ClassifyApi)`、`host.need(LineageApi)`；不提供 api，无 reactor，无 tools/actions/settings。

**状态与持久化**：`recall.state` 记 `pending`（正在检查的输入条目 id）与 `last`（已检查的最新输入 id）；`recall.memories` 条目带一条 user-role 模型消息（`recallText`）和 `Recalled` 数据，作为会话历史持久化。无独立 SQLite/文件。README 提到的 `injected`（每条记忆最近被召回的 token 位置）在 `refs.ts`/`server.ts` 中并不存在，改用实时上下文扫描 `recentlyRecalled`（推断：文档残留）。

**UI 位置**：`userBubble` 贡献 `RecallBubble`；`entries: { 'recall.memories': () => null }`（内容不进 transcript）。chip 经 `useOpenMemory()` 打开 Memory 面板。

**关键流程**：(1) `GenerationTask.beforeRequest` 先确认 `Standing.ultimate === conversationId`，否则不工作。(2) 取实时 `context()`，`findLast(isInput)` 得输入；`messageOf` 只认 `pi.user`/`board.message`，`board.wake` 则回找其指向的 `board.message`。(3) `state.last >= input.id` 表示这条输入已问过；重启后重发的请求若存储的回忆恰是上下文最后一条且 `request.messages.length < view.messages.length`，只把该条模型消息补回请求。(4) 读 `ContextUsageDoc` 与 `lineage.memoriesOf(id)`；无 token/百分比 < 20/无记忆时只写 `last` 并返回。(5) 写 `pending = message.id`，调 `classify.ask({state: {from, message: textOf(...).slice(0,4000)}, questions: {memory: recallQuestion(memories)}}, AbortSignal.any([ctx.abortSignal, AbortSignal.timeout(3000)]))`。(6) 在 `0.3 × window` token 范围内扫最近 `recall.memories` 得到 `recent`，过滤 `p >= 0.25`、未在 recent、按概率降序取 3，写 `recall.memories` 并返回 `{ messages: [...request.messages, recalled] }`。

**失败与恢复**：provider 错误或 3 秒超时被吞掉（注释称 "advisory"），run 保持原样；`ctx.abortSignal` 已中止时先在 `BACKGROUND_CONTEXT` 清 `pending` 再抛出，避免气泡常亮；重启后因 `last` 已写不再重问。

**关掉它会发生什么**：没有光带、没有 chip、没有任何 `recall.memories` 条目；系统提示完全不变，模型只是少了这段记忆。classify 关闭（无 `TYPESAFE_API_KEY`）时 `host.want` 返回 `undefined`，recall 静默不工作。

**复刻要点**：插入位置必须在输入之后，否则破坏 prompt 前缀缓存；必须先提交文档再追加条目，并在同一事务中删 `pending`；"最近已召回"基于实时上下文而非持久计数，compaction 后失效。

**证据**：`extensions/recall/server.ts:26-41,44-54,71-107,115-219`；`extensions/recall/refs.ts:4-12`；`extensions/recall/types.ts:2-12`；`extensions/recall/web.tsx:14-56,58-99,101-105`。

#### 2.3 keep-warm

**职责与用户可见行为**：@ultimate 使用 `claude-code` 时，空闲 55–60 分钟且用户 8 小时内出现过，就发一次极小请求重放它的上下文，读中缓存从而续期一小时；下一次真实提问便整段命中缓存。状态栏的 `warm` chip 显示暖/冷/关闭与失败（琥珀/暗/红），弹层有开关、"Warm until 14:52"/"Cold since …"、下一次 ping 或为什么没有、上次 ping 的读写量。

**导出与契约**：`due.ts` 导出 `TTL = 60*60_000`、`LEAD = 55*60_000`、`IDLE_STOP = 8*3600_000`、`Activity`、`due(activity)`。`refs.ts` 导出 `Ping`、`WarmDocState`、`WarmState`、`WarmDoc`（`keep-warm.state`）、`StateAction`（`keep-warm.state`）、`SetAction`（`keep-warm.set`）。`server.ts` 导出 `State` doc、`docs`、`cached(message, model)`、`open(paused, lastRequest, now)`、`actions { state, set }`、`userActions = ['set']`。无 tools、无对外 events/reactors（仅一个 `user-input` 内部 reactor 更新 `inputAt`）；不提供 api；无 settings key（是否开启存文档）。

**状态与持久化**：`keep-warm.state` 在 conversation 1：`{ off?, inputAt?, last?, pings? }`，`last` 是 `{at, model, read?, write?, error?}`，`checkpointWhen: () => false`。状态全部在 SQLite 文档里；定时器与并发标记用 `host.resource('keep-warm.timer')`，随 facet 重载保留。

**UI 位置**：`statusline.right`，`{ component: Chip, order: -1 }`；chip 的 `data-keep-warm` 为 `warm|cold|off`。

**关键流程**：(1) 模块加载时 `setInterval(TICK = 60_000)`，用 `shared.running ??= tick(host)` 防重入；`host.onClose` 清定时器并等待在飞的 tick。(2) `tick` 先查 `PauseApi.paused()`，读文档 `off`，`activity()` 要求 @ultimate 存在且 `agent.model.provider === 'claude-code'`；`answeredAt` 分页扫条目，找一小时内最新一条 `cached()` 助手消息；`lastRequest = max(answered, 成功的 last.at)`，失败 ping 作为 `failedAfter`。(3) `due()`：`lastRequest`、`inputAt` 齐备；`failedAfter >= lastRequest` 则停；年龄在 `[LEAD, TTL)`；`now - inputAt < IDLE_STOP`。(4) `ping()` 取 `context().messages`，若无 `You are conversation #N.` 则前置，再追加 `QUESTION`；再次 `open()`；`claim()` 在一个提交里校验 `!off`、`doc.last?.at === previous`、`LiveDoc.run` 为空，然后写 `{error:'interrupted'}` 并 `pings++`；再查一次 `open()`。(5) `modelRuntime.streamSimple(model, {messages}, {reasoning?, signal: AbortSignal.timeout(180_000)})`，不传 `sessionId`（一次性 Claude Code 进程）。(6) `record()` 同一次提交写 `last` 并用 `ConversationsApi.accountResponse` 把 usage 计入 @ultimate；失败也记录，从而在下一次真实请求前不再重试。

**失败与恢复**：任何异常都在 `record` 中变成 `last.error` 并阻断后续 ping，直到 @ultimate 有更新的请求；`tick` 的整体异常 `host.notice('Keep warm: …')`；崩溃时"已记 interrupted"使该次算失败而不是重试。

**关掉它会发生什么**：`set({on:false})` 写 `off: true`，不再 ping；一小时后缓存自然变冷，下次问答重新写整段上下文。chip 变暗，弹层显示 Off。

**复刻要点**：定时器必须在任务调度器之外（暂停会挂起调度器）；必须在发送前最后一次校验暂停/缓存时限/无 run，否则会和真实请求抢缓存；usage 必须并入会话账本，否则状态栏花费少算。

**证据**：`extensions/keep-warm/due.ts:4-29`；`extensions/keep-warm/server.ts:28-43,52-57,63-101,107-137,143-200,202-232,234-279`；`extensions/keep-warm/web.tsx:16-30,36-98,100-102`。

#### 2.4 questions

**职责与用户可见行为**：@ultimate 用 `message { to:'user', text, questions }` 提问，消息下方出现答案卡。一个问题展开、其余折叠为"1b drop them / 未回答"一行，圆点显示进度；支持 `choice`/`multi`/`confirm`/`scale`/`text`，选项自带"Something else…"内联输入、Markdown `preview` 侧栏、"my pick" 推荐标记；底部永远有备注框（可单独 "Send note"）；"Accept picks" 一次接受所有仍开放的推荐；发送后有 3 秒 Undo 窗口，随后卡片定格为已发送摘要。桌面端 1–9/字母选择、↑↓ 切题、Enter 取推荐或前进、⇧Enter 接受全部并发送、`/` 聚焦备注、Esc 清除/退出/撤销。

**导出与契约**：`server.ts` 导出 `answerText(answers, questions, note?)`、`userActions = ['answer','dismiss']`、`actions { answer, dismiss }`，默认导出 `questionsExtension`（仅 `host.need(MessagesApi)`）。`refs.ts` 导出 `Answer`、`AnswerAction`（`questions.answer`）、`DismissAction`（`questions.dismiss`）。`ui.tsx` re-export `waiting`。`open.tsx` 导出 `waitsOnUser`、`openQuestions`、`waiting`、`newestAsked`、`keyCard`；`state.tsx` 导出 `Choice`、`Draft`、`choices`、`keyOf`、`choiceForKey`、`pickIndices`、`pickDraft`、`answerOf`、`picks`、`answered`、`position`；`question.tsx` 导出 `brief`、`QuestionItem`；`card.tsx` 导出 `MessageQuestions`。无自有 doc，也不提供 api 或 reactor（只消费 `MessagesApi`）。

**状态与持久化**：问题存在 `messages` 的 `Message.questions` 上（`extensions/messages/api.ts` 的 `Question` 类型），本扩展不落盘；卡片草稿只在组件 state，刷新即丢（推断：设计如此）。打开条件统一为 `to === 'user' && reply && state === 'delivered'`。

**UI 位置**：通过 `messages` 的 `MessageAnswers` 点提供 `MessageQuestions`；命令 `questions.open`（"Show open questions"）打开 `todos` 面板；`questions.asked`/`questions.answers` 两个退役 entry 渲染为 `null`。To-dos 页顶部的等待列表由 `messages` 的 `openQuestions` 提供。

**关键流程**：(1) 工具边界 `extensions/messages/questions.ts` 的 `checkQuestions` 校验：非空、文本/ref 唯一、choice/multi ≥2 个标签与 key 唯一、scale 升序且 ≤10 级；不适用字段被丢弃。(2) 卡片 `send()` 先进入 `phase:'undo'`，`setTimeout(fire, 3000)`；离开页面时 `flush()` 直接发送，只有 Undo 撤回。(3) `answer` action 在一个提交里按 `messageId` 找消息、要求仍 open、校验 answers 无重复且都属该消息，`answerText` 生成 `1a. Topic: label`、`2a,c. Topic: a, c`、`3: text`、无 ref 时 `Topic: answer`，备注追加 `Note: …` 或独立成段。(4) 调 `MessagesApi.answer(messageId, reply, ctx, device)` 投递为带 `re` 的普通用户回复。(5) `dismiss` 直接 `MessagesApi.dismiss`，一条单向便条、不启动 sender 的 run。

**失败与恢复**：action 抛错显示在卡片 `role="alert"`；`sending` 失败回到 `answering` 并保留草稿；消息已关闭时服务端拒绝；并发回答由 messages 的准入在同一事务里保证只有一条回复。

**关掉它会发生什么**：问题仍被 `message` 工具接受并存在消息上，但没有卡片、没有 `MessageAnswers`、没有 `questions.open` 命令；用户只能当普通消息回复，问题保持 `delivered`（推断）。

**复刻要点**：`answerText` 的编号是契约，别把 UI 标签直接拼给模型；"一次只开一题"与"最新卡独占全局键"（`keyCard`）须同时实现；发送窗口可撤销且离页即发。

**证据**：`extensions/questions/server.ts:9-11,22-55,57-108`；`refs.ts:7-26`；`web.tsx:5-19`；`card.tsx:26,42-46,52-78,91,221-359,393-440`；`question.tsx:180-189,195-377`；`state.tsx:25-95`；`open.tsx:14-35`。

#### 2.5 side-chat

**职责与用户可见行为**：在 @ultimate 的输入框按 Tab（或点 Normal/Side chat 开关）进入侧聊模式，Enter 派生一个临时副本；主会话左移、缩放 0.88 变暗但继续流式输出，副本以纸片从右侧（手机从底部）推入，顶部有"forked from @ultimate at HH:MM · knows everything up to here"的切口。副本固定标题 `Side chat`、关闭自动摘要；结束只有两条路：Discard（无副作用时才可）或 Summarize & inject（摘要写回主会话，不唤醒它）。

**导出与契约**：`refs.ts` 导出 `SideChat`、`SideChatIndex`、`SideChatSummary`、`SideChatDoc`（`sidechat`）、`SideChatsDoc`（`sidechat.index`）、`OpenAction`/`DiscardAction`/`InjectAction`（`side-chat` 的 `open`/`discard`/`inject`）。`logic.ts` 导出 `TabKey`、`togglesSideMode`、`openSides`、`frontSide`、`Ending`、`createEndings`、`endings`。`server.ts` 导出 `Side`、`Index`（内部 `sidechat.ending`）、`docs`、`userActions = ['open','discard','inject']`、`actions`、`endTask(host)`、`tracksEffect`、`sideReminder`。`ui.tsx` 导出 `OpenAction`、`SideChatsDoc`、`useSideChatFront`（UI state `ext.side-chat.front`）。hooks：`GenerationTask.beforeInput`、`ToolTask.beforeTool`；tasks：`side-chat.start`、`side-chat.end`；运行时 `need(ConversationsApi)`；无 reactor、不提供自有 api。

**状态与持久化**：每个 fork 上的 `sidechat`：`{of, at, effects, ended?}`，空文档表示不是侧聊；主会话上的 `sidechat.index`：`{sides:[{id, at, openedAt, ended?}]}`，保留已结束项供浏览。两者都 `fork: 'initial'`（不被再次 fork 继承）。结束进度在同会话的 `sidechat.ending`（`{mode?, task?, introduced?}`）。

**UI 位置**：`composer` 包裹主输入框（模式开关、Tab、`ComposerRedirect`）；`conversation.overlay` 的 `Stage` 做景深与纸片；`entries: { 'sidechat.summary': SummaryCard }`；侧栏点 `UnderUltimate`（开的侧聊行）与 `Unlisted`（所有侧聊 id 不进分支/Earlier/Concluded）。

**关键流程**：(1) `open` 校验调用者是 @ultimate 且自身不是侧聊；`lastAnswer` 用 `scanSubmissions({status:'done'})` 找最大的 `input.answer`（不是最新 assistant，也不是 GenerationTask）；`closingEntry` 若该答案还带未回填的 `toolCall`，向后扫到匹配 `toolResult`，避免副本继承悬空工具调用。(2) 一个提交内 `forkConversation(main, at, {ownership:{kind:'ownerless'}})`，写 `sidechat`、metadata `{title:'Side chat', label:'side-chat'}`、`setAutomaticSummaries(false)`、index 追加，并创建 `side-chat.start` 任务（`requestId: sidechat:open:<id>`）。(3) `beforeInput` 首次注入 `sideReminder`（kind `conversations.identity`，隐藏）；`beforeTool` 在工具执行**之前**提交 `effects = true`（`tracksEffect`：branch/message/note/notify/remember/setup/restart/edit/write、todo add/done、除 list/runs/log 外的 automation）。(4) `end` 在一个提交里建 `side-chat.end` 任务（inject 需 `summaryModel()`），`stop` 阶段 abort + `waitForIdle`，`summarize` 阶段只取 `at+1` 之后、排除 `pi.system` 的条目，`askSummaryModel` 结果用 `runtime.memo('source'|'response')` 记忆化。(5) inject 用 `conversation.submit({type:'write', requestId: 'sidechat:summary:<id>', entry:{kind:'sidechat.summary', data, model:[user 文本]}})` 写入主会话，再在一个提交里 `concludeIn`、写 `ended` 与 index。(6) 模型失败且未准入时清 `mode/task/ended`，副本可继续输入并重试。

**失败与恢复**：注入失败显示模型错误并变成 "Retry summary"，绝不退回纯文本；写准入后崩溃复用 memo 与去重 write 收尾；`effects` 粘性先写，工具失败也锁死 Discard；结束/结束中的副本在服务端拒绝输入与工具。

**关掉它会发生什么**：无 Tab 模式、无副本；已存在的侧聊退化为带 `label: 'side-chat'` 的普通会话（推断：`branchOf` 仍指向主会话，会重新出现在树里）。

**复刻要点**：fork 边界必须来自 settled `SubmissionRecord.answer`，不是 assistant 或 summary；必须继承全部工具（含 compact），否则 system prompt 变化破坏缓存前缀；`lib/acting-as.ts` 让核心按 kind 读文档。

**证据**：`extensions/side-chat/refs.ts:4-30`；`server.ts:21-49,53-102,111-147,149-169,171-292,294-347,350-402`；`web.tsx:115-194,221-332,335-439,462-494,499-559`；`logic.ts:18-81`；`lib/acting-as.ts`。

#### 2.6 dream

**职责与用户可见行为**：用户按 Dream（Memory 面板头或 ⌘K "Dream…"），@ultimate 先写 handoff，然后起一个 dream 分支跑六趟 pass（memory/failures/tools/corrections/codify/project），产出三条 `learned`、一篇 Markdown 日志和最多 40 条提案；用户与 @ultimate 逐条决定（approve→分支、apply、reject、landed+sha）。会话在日志归档且所有提案落定后自动结束；此后可 Fall asleep 把记忆与未完成工作带进新 chapter，旧 chapter 原样留在磁盘并可切回。内置 "Dream before compaction"（context > 70% of @ultimate）与 "Dream after a pause"（> 50% 且 idle 8h）会自动触发。

**导出与契约**：`server.ts` 导出 `Sessions`（kind `dream.sessions`，version 3，`migrate` 把 `afterCompaction`→`beforeCompaction`、旧会话补 `project` pass）、`docs = [Sessions, SeedState, BuiltInDoc, PauseDoc]`、`userActions = ['start','end','asleep','switch']`、`actions`（`chapters`、`switch`、`asleep`、`start`、`handoff`、`end`、`pass`、`journal`、`decide`、`stats`）、`startSession`、`reportPass`、`fileJournal`、`decide`、`landed`、`journalText`、`toolStats`、`askHandoff`、`startDreamIn`，默认导出 `dream(host)`。`refs.ts` 导出全部 action ref 与 `DreamDoc`、`Session`、`Proposal`、`Journal`、`Sleep`、`Waiting`、`BeforeCompaction`、`Handoff`、`ToolStats`。`types.ts` 导出 `Seed`、`PASSES`、`PassName`、`busyElsewhere`、`pinnedOf`、`sleepLeads`、`STAGES`、`DreamStep`、`stepOf`、`progress`。`before-compaction.ts` 导出 `AUTOMATION_NAME`、`CONDITION`、`PAUSE_NAME`、`PAUSE_CONDITION`、`BuiltInDoc`、`PauseDoc`、`DREAM_WAIT_MS`、`DREAM_LOOK_MS`、`HANDOFF_WAIT_MS`、`HANDOFF_ASK`、`ASLEEP_AFTER`、`HANDOFF_CHARS`、`asleepAfter`、`hoursOf`、`changes`、`ensureAutomation`、`compactionSummary`、`Origin`、`compactionDream`。`seed.ts` 导出 `SeedState`、`buildSeed`、`writeSeed`、`applySeed`；`gate.ts` 导出 `BRIEF_BUDGET = 6000`、`gate`；`delivery.ts` 导出 `deliverTask`、`deliver`。settings：`dream.asleepAfter`（project 覆盖 user，默认 5）。tasks：`deliverTask(host)`、`Wait`、`Retired`、`Settle`；reactors：`ultimate-started`、`landed`、`after-compaction`；依赖：`CloudApi`、`InstanceApi`、`AutomationsApi`、`LineageApi`、`Standing`、`Started`、`SubmissionLanded`、`ConversationsApi`。

**状态与持久化**：`dream.sessions`（conversation 1）持 `{next, sessions, waiting?}`；每会话含 `passes`、`journal`、`proposals`、`sleep`、`handoff`、`beforeCompaction`、`endedAt`。`dream.seed` 记录 `{applied?, automations: string[]}`；`dream.after-compaction` 记第一个内置自动化的 id/删除（version 2 迁移），`dream.after-pause` 记第二个。文件侧：`<home>/chapters.json`、`pending-chapter.json`、`chapters/<name>/seed.json`；后续 chapter 的 `state.sqlite`/`trace.sqlite`。会话条目 `dream.handoff|started|journal|chapter|settled` 落在 @ultimate 会话。

**UI 位置**：`entries` 五个卡（handoff/started/journal/chapter/settled）；`slots.sidebar.top`（`OlderChapterBanner` -30、`DreamSection` -25）；`statusline.right`（`DreamStatus` phone、`TimeToDream`、`OlderChapterStatus`）；`overlay`（DreamDialog/JournalDialog/ChaptersDialog/SwitchVeil/WakeUp）；命令 `dream.open`、`dream.chapters`；`provides: [provide(MemoryHeader, useDreamButton)]`。状态栏五个月相表示 handoff/dreaming/deciding/settled/asleep。

**关键流程**：(1) `start`→`askHandoff`：`refuseBusy` 后 `compaction.request()` 在一提交内建 `dream.handoff-wait` 任务、写 `waiting`、给 @ultimate 投递 `dream.handoff`（用户按钮为 input，自动化触发为 write，避免第二个 run）。(2) `Wait` 每 15s `look()`：超 2h 标 `gaveUp` 并 `LineageApi.leaveNote`（requestId `dream.handoff-wait:<task>`），自动化被暂停/删除或已有会话/睡眠/换章则结束；handoff 到位或满 30 分钟且无其它顶层会话在跑时 `delete waiting` 并 `startDreamIn`。(3) `startDreamIn` 校验 @ultimate 与空闲，`startSession`，投递 `dream.started`（`dream.deliver`，requestId `dream.started:<N>`，busy 时 followUp），提示 dream 分支按 DREAM.md 起六趟 pass；首个 `pass` 报告者成为 `dreamer`。(4) `journal` 校验恰好 3 条 `learned`（各 ≤200 字）、正文 ≤20000、提案 id 匹配 `/^[a-z0-9][a-z0-9-]{0,47}$/` 且唯一，只写一次，随后 `dream.journal` passive write 进 @ultimate，`settle()` 结算。(5) `decide`：`approved` 必须带 `branch`；`landed` 只能从 approved+branch 转，`sha` 需 7–40 位十六进制；每条可带一行 `reason`（hands-off goal）。(6) reactor `landed` 监听 `SubmissionLanded`，把同分支的 approved 提案批量标 landed 并 settle；settle 触发 `dream.settled` 任务，按 `changes() >= asleepAfter` 或 pause 决定 `stay`（write）或 `ask`（input）。(7) `asleep`：`admitSleep` 要求有日志、无 open/approved、无其它忙会话、名字合法且未占用；`fallAsleep` 依次 `seeding`（`buildSeed`）→`checking`（`gate` 在临时 home 写 seed、`requestChapter`、`InstanceApi.start` 真启动、用 `postAction` 读 `lineage.memory`/`todos`/`dream.seed`/Standing 并等 10s 的 `dream.chapter`，失败重建一次）→`backing up`（`CloudApi.backup()`，缺失/关闭记录 skipped，配置了却失败则中止）→再 `idle`→`switching`→`writeSeed`+`restartChapter`。(8) `switch` 只做 `requestChapter`+restart，不建 seed、不备份；`onOpen` 的 `settleSleep` 把被重启打断的 `seeding/checking/backing up` 标 failed，把已存在目标 chapter 的 `switching` 标 asleep。(9) 打开时 `applySeed` 一次提交写入记忆、待办、问题（转为 user-owned 待办）、脚本重建待办，并投递 `dream.chapter`；随后按名字幂等重建 automations。

**失败与恢复**：gate 两次失败停在当前 chapter；备份失败中止；重启失败删 `pending-chapter.json` 并记 `failed`，seed 保留可重试；handoff 等待失败会重试留便条（requestId 去重）；模型/进程崩溃后 `dream.deliver` 与 requestId 保证不重复投递。内置自动化被删除会被记住（`deleted`），被暂停则下次建出来即 pause。

**关掉它会发生什么**：Dream 按钮、状态栏、章节对话框全部消失；已存在的 dream 会话文档仍在但无人推进；两个内置自动化仍由 automations 触发（它们不是 dream 的调度器），会给 @ultimate 投递 fired 输入却无人接手（推断：应同时暂停/删除）。

**复刻要点**：这是本组风险最高的扩展。顺序必须是"state 与投递同提交"，所有耗时步骤（gate、backup）都在事务外并把阶段写回 `sleep`；切章必须走日志（pending-chapter.json）并由 host 在打开存储前完成，否则重启即丢；六趟 pass 与提案 id 是 DREAM.md/agent 的契约；seed 必须能在一个提交内应用且幂等。

**证据**：`extensions/dream/server.ts:55-96,144-165,168-225,231-271,274-321,355-407,413-446,448-536,542-588,594-671,684-724`；`before-compaction.ts:35-54,61-114,120-160,162-215,221-253,260-363,374-428,436-524`；`seed.ts:19-37,179-297`；`gate.ts:17-113`；`delivery.ts:19-65`；`refs.ts:93-170`；`types.ts:9-178`；`web.tsx:31-153`；`journal.tsx:44-167,176-244,274-311,359-419,444-502`；`sleep.tsx:46-175,224-303`；`chapters.tsx:28-118,124-257,262-401,455-502`；`morning.tsx:44-117`；`pinned.tsx:10-59`；`modal.tsx:14-74`；`sidebar.tsx:29-131`。

#### 2.7 classify

**职责与用户可见行为**：给其他 server facet 提供廉价的类型化判断，无工具、无提示、无 UI；默认关闭，启用后在 Secrets 面板（⌘K → Secrets）填 `TYPESAFE_API_KEY`。

**导出与契约**：`api.ts` 导出 `ClassifyQuestion`（`choice`/`noul`/`score`，各带 `instructions` 与 `criteria`）、`ClassifyAnswer`、`ClassifyResult { model, answers, usage.inputTokens }`、`ClassifyService.ask({state, questions}, signal)`、`ClassifyApi`（`defineApi<ClassifyService>()('classify')`）。`choice` 答案含 `choice/confidence/probabilities`，`noul` 是 0–1 的概率，`score` 含 `score/confidence/probabilities/legend`。`server.ts` 导出 `secrets = [{name:'TYPESAFE_API_KEY', url:'https://console.typesafe.ai/keys'}]` 与默认 `classify(host)`（`host.implement(ClassifyApi, service)`）。

**状态与持久化**：无文档、无缓存、无重试（调用方负责持久记忆化）。

**UI 位置**：无。

**关键流程**：(1) `ask` 用 `readSecret(host.userHome,'TYPESAFE_API_KEY')`，缺失即抛指引错误。(2) `POST https://api.typesafe.ai/v1/systemone`，body `{model:'jev-1.14.0', ...request}`，Bearer，转发 `signal`。(3) 非 2xx 抛 `TypeSafe <status>: <body 前 1000 字>`；响应须有字符串 `model`、对象 `answers`/`usage` 与数字 `usage.input_tokens`。(4) 逐题校验 `answers[id].type === question.type`。(5) 返回 `{model, answers, usage:{inputTokens}}`。

**失败与恢复**：错误交给调用方；`recall` 用 3 秒超时并降级为不召回。

**关掉它会发生什么**：`host.want(ClassifyApi)` 为 `undefined`，`recall` 静默不工作，其它扩展不受影响。

**复刻要点**：模型版本必须钉死（别名漂移，阈值按版本调）；必须校验答案类型；不要在此层重试/缓存，否则破坏调用方的超时与去重。

**证据**：`extensions/classify/api.ts:9-42`；`extensions/classify/server.ts:7-13,19-64`。

### 3. 跨扩展协作

- **recall 的依赖面**：`want(ClassifyApi)`（可选，缺失即静默）、`need(LineageApi).memoriesOf(id)` 取根记忆与 `root`、`ContextUsageDoc`（conversations 维护的 `conversations.context`）判断 20% 与窗口；`Standing.ultimate`（subagents）确认只服务 @ultimate；浏览器端读 `RecallDoc` 并用 lineage 的 `useOpenMemory` 打开 Memory 面板。
- **questions ↔ messages**：问题由 `message` 工具声明、`extensions/messages/questions.ts` 校验并存在 `Message.questions`；本扩展的 `answer`/`dismiss` 调 `MessagesApi.answer`/`dismiss`，由 messages 在同一事务里验证消息仍 open 并投递（`user.input` 事件）；messages 每次开跑用 `openQuestionsNote` 把未答问题列给 asker；卡片通过 `MessageAnswers` 点挂载，`MessagesDoc` 读取问题。
- **keep-warm ↔ conversations/pause/subagents**：`ConversationsApi.accountResponse` 记账、`PauseApi.paused()` 跳过、`Standing` 找 @ultimate、`UserInputEvent` 更新 `inputAt`、`LiveDoc` 判 run。
- **side-chat ↔ conversations/subagents/lib**：`summaryModel`、`askSummaryModel`、`accountResponse`、`concludeIn`、`setAutomaticSummaries`；`Standing` 判 @ultimate；`lib/acting-as.ts` 让 messages/lineage/automations 等按 `sidechat` kind 以 main 身份行动，核心对 side-chat 零依赖。
- **dream ↔ 几乎全仓**：`Standing`（@ultimate）与 `Started`（@ultimate 启动后补建自动化）、`AutomationsApi` + `Fired`（内置触发器）、`SubmissionLanded`（提案落地）、`CloudApi`（换章前备份）、`InstanceApi`（gate 起临时实例）、`LineageApi`（`Roots`、`leaveNote`）、`Messages`（把未答问题搬进 seed 的待办）、`Roots`/`lineage.memory`（seed 记忆）、`todos`（seed 待办）、`lib/chapters.ts`（章节文件与切章日志）、`side-chat`（早晨卡的 awake 检查用 `OpenAction`/`SideChatsDoc`/`useSideChatFront`）。
- **context**：只读条目；浏览器端借 `subagents.DefinitionAction` 显示 agent 定义、借 conversations 的 `ConversationSummary.label/title` 推断身份，不写任何东西。

### 4. 复刻顺序建议与风险

**顺序**：1) `classify`（无依赖，先把 key/错误契约做对）；2) `questions`（依赖 core messages，独立可测）；3) `context`（纯前端派生，先建立"条目即真相"的读模型）；4) `keep-warm`（独立定时器 + 账本，风险可控）；5) `recall`（依赖 classify/lineage/conversations，且要处理重启重放）；6) `side-chat`（fork 边界、effects、注入任务三块，依赖 conversations）；7) `dream`（依赖 automations/instance/cloud/lineage/subagents/side-chat，最后做）。

**风险**：`dream` 的切章是唯一会重启进程并换数据库的路径，`pending-chapter.json`、`settleSleep`、gate 的一次重建、seed 幂等四者任一错都会造成"数据看起来丢了"；`side-chat` 的缓存前缀要求（继承全部工具、身份说明用隐藏 entry）很容易被"优化"破坏；`keep-warm` 花的是用户的钱且与真实请求共享缓存，必须在发送前最后一刻校验；`recall` 的 README 与实现已漂移（`injected`、`Reloaded`/`Restarted` 文案），复刻应以源码为准；`context` 的 remove-all 折叠依赖 Pi 的条目顺序，属显式上游耦合；`questions` 的 `answerText` 编号格式与 `keyCard` 的全局键归属是行为契约，别只做视觉；七个扩展都非 core，必须在 `extensions.disable` 下干净降级（仓库有 `test/e2e/disable-each.test.ts` 做全量校验）。

---

## A.7 运维与可观测性扩展组 分析笔记

### 1. 概览

这 12 个扩展共同构成 Ultimate 的“运行外壳”：对外用 `status` 暴露一台实例的只读汇总；对内用 `status-line`/`health`/`setup`/`info` 把 token、成本、上下文、provider 健康、安装缺口和运行环境摊在用户眼前；`update` 让宿主 clone 只快进地跟上 origin；`instance` 起第二实例预览核心改动；`watchdog` 负责失败运行的一次重试与上报；`system`/`debug`/`activity` 把 durable 事件与 trace 汇成可检索的观测面；`codemode` 提供受限的 QuickJS 沙箱与 `ultimate.*` 自省。它们全部不是 core tier（没有任何一个 `api.ts` 声明 `export const tier = 'core'`），因此都必须通过 `host.want` 容忍同伴缺席，并且不得被 `server/` 直接点名。`health`（`~/.ultimate/health.json`）与 `update`（git 目录内的锁、摘要缓存）把状态写在 Pi Durable 存储之外，因此采用“先改外部状态、再单独 commit 事件”；`instance` 另写 `previews.json` 与临时 home。

| 名称          | 一句话职责                                                       | 服务端入口                                                 | 浏览器入口                                                       | 是否 core tier |
| ------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | -------------- |
| `status`      | 供仪表盘轮询的只读汇总（HEAD、失败、provider、提问、忙碌、扩展） | `server.ts`（`status` action）                             | 无                                                               | 否             |
| `status-line` | composer 行与全局状态栏的 token/成本/上下文读数                  | `server.ts`（`rates` action）                              | `web.tsx`（`composer.status`、`statusline.*`、`messageDetails`） | 否             |
| `health`      | 从真实调用推断每个 provider 在本机的健康                         | `server.ts` + `store.ts`（`HealthApi`）                    | `ui.tsx`（仅再导出 `Changed`）                                   | 否             |
| `info`        | 右栏 Info 页：workspace、模型、代码、进程、持久化、skills        | 无（纯浏览器，读 `useSystem()`）                           | `web.tsx` + `ui.tsx`（`info` panel）                             | 否             |
| `setup`       | 状态栏 `⚠ N setup issues` 与给 @ultimate 的隐藏提示              | `server.ts`（`check` action、`beforeInput` hook）          | `web.tsx`（`statusline.right`）                                  | 否             |
| `update`      | 仅 fast-forward 的自更新、layer 分析与 merge 委派                | `server.ts` + `clone.ts`（`UpdateApi`）                    | `web.tsx`（`statusline.right`）                                  | 否             |
| `instance`    | 最多 3 个第二 Ultimate 预览实例与预览链接                        | `server.ts` + `cleanup.ts`（`InstanceApi`）                | `web.tsx`（`titlebar.project`、`link`）                          | 否             |
| `watchdog`    | 失败运行的一次重试/上报、空闲分支提醒                            | `server.ts` + `idle.ts`（`WatchdogApi`）                   | `web.tsx`（entry 卡片）                                          | 否             |
| `system`      | 事件日志 + trace 的统一流、Agent Lanes、trace 树                 | `server.ts`（`stream`/`lanes`/`tree`/`polls`/`navigated`） | `web.tsx`（`system` surface）                                    | 否             |
| `debug`       | 只读 `debug` 工具（events/reactors/catalogue/trace/apis/api）    | `server.ts`（`debug` tool）                                | 无                                                               | 否             |
| `activity`    | 右栏 Activity 页：项目事件流                                     | `server.ts`（`page` action）                               | `web.tsx` + `feed.tsx`（`activity` panel）                       | 否             |
| `codemode`    | QuickJS/WASM 沙箱执行、`ultimate.*` 自省、一行摘要               | `server.ts` + `summary.ts`（`codemode` tool）              | `web.tsx`（工具卡、Store 文档）                                  | 否             |

### 2. 逐扩展规格

#### 2.1 `status`

**职责与用户可见行为**：没有任何 UI；只有 `status { since? }`。`since` 是 epoch 毫秒，只过滤 `failures`，默认 `now - 24h`；返回 `at/head/failures/providers/questions/busy/extensions`，供 tailnet 上的仪表盘每 30 秒轮询。

**导出与契约**：`Status` 类型与 `StatusAction = actionRef('status','status')`（`refs.ts:4-41`）；`server.ts` 导出 `status(host, since, now)`、`pollActions = ['status']`、`actions.status`。`host.need(MessagesApi)`，`want` `UpdateApi`/`WatchdogApi`/`HealthApi`（`server.ts:78-85`）。

**状态与持久化**：不写任何 doc/文件；读 `UpdateApi.state()`、`WatchdogApi.failures(since)`、`HealthApi.providers()`、`MessagesApi.openQuestions(context)`、`host.conversations()`、`host.extensions()`。重复轮询由 trace 的 poll 计数吸收，不逐条落库。

**UI 位置**：无。

**关键流程**：1) 校验 `since` 为有限 number，否则抛 `since must be epoch milliseconds`；2) 取 `Date.now()`；3) 四项读取 `Promise.all`；4) `head` 仅在 `clone.head` 存在时组装，`behind`/`ahead` 缺省 0，`error` 取上次 fetch 失败；5) `failures` 只保留五个字段；6) `providers` 仅在 `state==='failing'` 时带 `error`；7) `questions.first` 取最旧一条的 `text/conversation/message`；8) `busy` 数 `conversation.busy`；9) `extensions` 取 `server.error`。

**失败与恢复**：任一被依赖服务抛错会整体失败（无 catch），由调用方重试；`head`/`failures`/`providers` 在对应扩展关闭时整体缺席，而不是空数组；`since` 非法直接拒绝。

**关掉它会发生什么**：仪表盘失去 `/api/extensions/status/actions/status`；没有其他扩展依赖它，属叶子。

**复刻要点**：字段必须“由拥有者 API 提供”，不要读别人的 doc；区分“缺席”与“空”；`pollActions` 让高频轮询不写 trace。

**证据**：`extensions/status/refs.ts:4-41`；`extensions/status/server.ts:15-97`；`extensions/status/README.md:43-52`。

#### 2.2 `status-line`

**职责与用户可见行为**：composer 下方一行显示 cwd/workspace、git 分支、`↑input ↓output R cacheRead W cacheWrite`、缓存命中率、成本（订阅加 `(sub)`）、上下文百分比（>70% 警告色、>90% 错误色）；底部全局栏显示最近 30 秒的全项目输出 tok/s、运行中 agent 数（含子代理，0 也显示）、项目累计 token/成本、连接状态与 generation；悬停消息显示该条的上下文与成本。

**导出与契约**：`Tokens`、`RateSample { rates, elapsed, totals }`、`RatesAction`（`refs.ts:5-13`）；`server.ts` 的 `actions.rates`；内部 `rates.ts` 的 `createRateSampler`/`keys`/`zero`，`context.ts` 的 `usageTotals`，`turns.ts` 的 `turnOf`/`responseAfter`。无 `api.ts`，无 need/want。

**状态与持久化**：无 doc/文件。模块级 `WeakMap` 以 host 为键保存最新快照；`onOpen` 以 256/页 `scanConversations` 播种每个会话的 `UsageDoc`（settled）与 `LiveDoc`（partial），再 `subscribeCommits` 增量维护；`spend` 用差值累加所有 model+tool 桶。

**UI 位置**：`slots['composer.status'] = [Cwd, Tokens, Context]`，`statusline.left = [GlobalUsage]`，`statusline.right = [Connection(phone:true)]`，`messageDetails = [MessageUsage]`（`web.tsx:368-374`）。

**关键流程**：1) `onOpen` 先 `stop()` 清旧计时器/订阅；2) 全量扫描并 `replace` 每会话 settled/partial；3) 同一 commit 边界内订阅；4) 每秒 `sample(performance.now(), total)`；5) UI 每秒调 `rates`，5 秒请求超时；`rates` 未满两个 5 秒内样本时返回 `null`。

**失败与恢复**：播种/订阅失败 `host.notice('Instance token rates unavailable: …')` 并停表；UI 轮询失败显示 `?`，下一秒重试；`ContextDoc` 缺 `window` 时整项隐藏。

**关掉它会发生什么**：没有 `rates` action，composer 行与全局栏消失；模型选择器（`models`）不受影响；消息悬停细节消失。

**复刻要点**：rate 采样要在 30 秒窗口上按两点线性内插基线，显示时 clamp 到 0（内部允许负修正）；tool 用量不计入 rate、计入成本；上下文百分比读 `conversations.context`，不要浏览器自算。

**证据**：`extensions/status-line/refs.ts:5-13`；`server.ts:12-119`；`rates.ts:9-32`；`context.ts:4-14`；`turns.ts:10-35`；`web.tsx:235-334,368-374`。

#### 2.3 `health`

**职责与用户可见行为**：不 ping provider，只从每次真实响应记录“这台机器上这个登录是否还能用”；失败的 provider 由 `setup` 状态栏项列出。登录被替换后旧结论作废，重置为 `unknown`。

**导出与契约**：`ProviderHealth`、`Changed = defineEvent('health.changed')`（`refs.ts:5-26`）；`HealthService.providers()` 与 `HealthApi`（`api.ts:10-15`）；`server.ts` 另导出 `responseEntry`、`announce`、`recordHealth`；`store.ts` 导出 `healthPath`、`STREAK=3`、`STREAK_WINDOW=5*60_000`、`sanitize`、`failureKind`、`state`、`apply`、`merge`、`readHealth`、`record`、`reset`、`Flip`。reactor `login-changed` 监听 `models` 的 `LoginChanged`；hook `GenerationTask.afterResponse`。

**状态与持久化**：`~/.ultimate/health.json`（所有 Ultimate home 共用），每 provider 记 `lastOk/lastFail/error/lastUsed/lastAuth/transient[3]`；临时文件 + rename 原子写，进程内按 path 串行；读取时逐字段取最大时间戳，乱序写也收敛；损坏 JSON 视为空。

**UI 位置**：无自有 UI；`ui.tsx` 只再导出 `Changed` 供 `setup/web.tsx` 订阅。

**关键流程**：1) `afterResponse` 把 `stopReason` 映射为 entry（`aborted` 不记，`error` 记 fail，其他记 ok）；2) 仅 `getProviderAuthStatus(...).configured` 的 provider 记；3) `record` 清洗 `error` 后 `apply`：auth 盖 `lastAuth`、capacity 只盖 `lastFail/error`、transient 进 `transient`；4) 比较写入前后 `state()`，变化才 `announce`；5) `announce` 在独立 commit 里 emit `health.changed`；6) 登录变化 reactor 调 `reset` 并在自己的事务里 emit。

**失败与恢复**：文件写失败只 `console.error`，绝不阻塞生成；storage 关闭（core swap）时 `announce` 直接返回，下一次翻转再报；`providers()` 过滤掉无登录的 entry，避免陈旧失败告警。

**关掉它会发生什么**：`setup` 的 Providers 行与 `status.providers` 消失；登录/登出不再重置健康；`health.changed` 不再出现。

**复刻要点**：`sanitize` 必须是固定 allowlist（状态码 + `KNOWN` 词），绝不落原文；capacity 永不判登录坏；状态由 `lastOk` 之后的 auth/streak 推导，所以成功不必清空失败。

**证据**：`extensions/health/refs.ts:5-26`；`api.ts:10-15`；`server.ts:12-83`；`store.ts:23-30,36-89,123-177,239-298`；`README.md:20-30`。

#### 2.4 `info`

**职责与用户可见行为**：右栏 Info 页按固定顺序展示 Workspace、Model & usage、Code、Execution、Machine、Process、Persistence、Skills、Context files；路径可点击复制，折叠状态持久化；Code 的 `core changed · restart pending` 与 Process 的 restart 按钮直接触发 `useRestart()`。

**导出与契约**：无 `server.ts`、无 API、无 doc。`web.tsx` 默认导出 `panels:[{id:'info',title:'Info',icon:InfoIcon,order:5}]`、`slots.overlay=[SkillPicker]`、命令 `info.open`/`info.skill`（`web.tsx:464-479`）；`ui.tsx` 导出 `Section`、`Copy`、`Meter`、`Tag`、`ErrorText`；`skill-picker.tsx` 导出 `skillDialog='info.skill'` 与 `SkillPicker`。

**状态与持久化**：仅 `useExtensionUiState<string[]>('closed', [])` 记录折叠的 section id；无服务端状态。

**UI 位置**：右栏 panel `info`（order 5）；⌘K “Show system info”；overlay 里的 skill 选择器把 `/skill:<name> ` 填入 composer。

**关键流程**：1) `useSystem()` 未就绪显示 `connecting…`；2) 依次渲染 9 个 Section；3) Model 段按 `usage.models` + `usage.tools` 汇总 token/成本；4) Code 段比较 `code.coreStale`，显示 restart 按钮；5) Process 段用 `useNow(1000)` 算 uptime，`restart.pending` 显示 `→ N swapping…`；6) 路径经 `shortenPath` + `elidePath`。

**失败与恢复**：`useSystem()` 缺失只显示 connecting；`restart.error` 用 `ErrorText` 展示，按钮由 `restart.busy` 禁用；某段数据缺字段时显示 `—`/`none`。

**关掉它会发生什么**：Info 面板与两个命令消失；`info/ui.tsx` 的原语若无其他扩展导入则一并不可用（推断：本仓库内未发现外部导入）；skills 选择器入口消失。

**复刻要点**：Info 只读 `system` 事件与 `useConversation()`，不要为它新增服务端接口；折叠状态要放 durable UI state，避免刷新复位。

**证据**：`extensions/info/web.tsx:444-479`；`ui.tsx:8-105`；`skill-picker.tsx:11-26`；`README.md:1-3`。

#### 2.5 `setup`

**职责与用户可见行为**：当有 `warn` 时状态栏出现 `⚠ N setup issues`，popover 按“警告→信息→已就绪”列出每个 area 的现状、影响与修复按钮（命令或 Secrets 面板）；同时只在 @ultimate 的输入前注入一条隐藏 `setup.note`，警告集合变化时提醒、清空时提示 resolved。

**导出与契约**：`SetupFix`、`SetupIssue`、`CheckAction('setup','check')`（`refs.ts:5-21`）；`server.ts` 导出 `docs=[Seen]`（kind `setup.seen`）、`check(host, read?)`、`setupNote(issues)`、`noteFor(tx, conversationId, issues, now)`、`pollActions=['check']`、`actions.check`。need `ConversationsApi`；want `HealthApi`、`TailscaleApi`；`Standing`、`RootsDoc`/`MemoryDoc` 经 doc 读取；`workspaces` 只按 `host.extensions()` 判断是否启用。

**状态与持久化**：`setup.seen`（conversation scope，`{key}`）记住上次听到的 warning 文本；检查结果缓存在 `host.resource('setup.check')` 30 秒；无文件/SQLite。

**UI 位置**：`statusline.right`（`phone:true`，仅 warn 时渲染）；`entries['setup.note'] = () => null` 隐藏该 entry。

**关键流程**：1) `check` 并行跑 10 个检查函数（Summary model、Agent models/definitions、Providers、Secrets、Extensions、Cloud backup、Tailscale、Lander checks、Worktree setup、Project memory）；2) 每个 area 包 `Promise.resolve().then(...).catch`，失败降级为 `area:'Setup check', status:'info'`；3) 按 `rank {warn:0,info:1,ok:2}` 排序；4) `beforeInput` 先确认 `Standing.ultimate === conversationId`；5) `current(tx)` 复用 30 秒缓存；6) `noteFor` 生成 `setup.note` entry（`data.warnings` 计数 + user model 文本），并与 `Seen.key` 同事务提交。

**失败与恢复**：单个 area 抛错不拖垮整体；检查失败只跳过本次 note，状态栏仍显示上次结果；`fix.command` 不在命令面板时按钮隐藏；30 秒缓存避免连续输入反复读文件。

**关掉它会发生什么**：状态栏安装提示与 @ultimate 的 setup 提示消失；`check` action 404；其他扩展不受影响。

**复刻要点**：一定要用 `beforeInput` + 事务内 doc 写，保证“一次输入最多一条 note”；note 文本作为 key，保持 system prompt 可缓存；`fix` 用 `command`/`secret` 两种形态。

**证据**：`extensions/setup/refs.ts:5-21`；`server.ts:34-43,62-139,148-200,202-316,319-399,401-433`；`web.tsx:72-134`；`README.md:1-39`。

#### 2.6 `update`

**职责与用户可见行为**：每 5 分钟（启动后 30 秒首查）比较宿主 clone 与 `origin/<default branch>`，只在必要时 fetch；状态栏显示 `✓ up to date`、`↓ N new · update`、`install owed` 或 `updated · restart`；popover 给出 clone 路径、落后提交、摘要、DiffsHub 链接、改动 layer 与更新后的动作；`Update now` 只做 fast-forward + 必要 `pnpm install`。

**导出与契约**：`Layers`、`UpdateState`、`UpdateResult`、`StateAction`/`CheckAction`/`UpdateAction`/`MergeAction`、`Applied('update.applied')`/`Refused('update.refused')`（`refs.ts:6-98`）；`UpdateService.state()` + `UpdateApi`（`api.ts:7-12`）；`itemOf(state)`（`item.ts:7-17`）；`clone.ts` 导出 `FETCH_EVERY=1h`、`layersOf`、`gitPath`、`fetchedAt`、`fetchIfDue`、`withLock`、`cloneState`、`SUMMARY_INPUT_CAP=12000`、`SUMMARY_SYSTEM`、`summaryLines`、`summaryFor`；`server.ts` 导出 `TICK`、`gitIn`、`installOwed`、`landingInstalls`、`userActions=['merge']`、`actions`。

**状态与持久化**：clone 自身即状态；`.git/ultimate-update.lock`（`server/lock.ts` 的 SQLite 锁，进程退出释放）、`.git/ultimate-update-summary.json`（按 `<head>..<remoteHead>` 缓存 2–4 行摘要）、`FETCH_HEAD` mtime 作为全 clone 的 fetch 时钟；`update.state` 是跨 reload 共享的 host resource，`updated` 只保留到本进程重启；事件单独 commit。

**UI 位置**：`statusline.right`（order -2）；`CheckNow`、`Action`、`Popup` 组成 popover；`merge` 成功后 `showSurface('agent')` 并 `switchConversation(id)`。

**关键流程**：1) `tick` 若 `PauseApi.paused()` 则跳过；2) `withLock` 内 `fetchIfDue`（或 `check` 强制）后 `summarize(true)`；3) `cloneState` 得 behind/ahead/commits/layers/refused/diverged；4) 若 behind，`landing(host)` 查 lander 队列是否正在落同一 clone；5) `diverged && !landingNow && isProject(host)` 才给 `merge`；6) `installOwed` 比较 `pnpm-lock.yaml` 与 `node_modules/.pnpm/lock.yaml`；7) `installedSince` 比较 lockfile mtime 与进程 `startedAt` 得 `restart`；8) `update` 在锁内 `fastForward(git, undefined, landing)` → `diff --name-only` → `layersOf` → `installPackages` → 记录 `update.applied`；9) reactor `install-landed` 在 `SubmissionLanded` 命中 lockfile/`patches/` 且 commit 是 HEAD 祖先时补装。

**失败与恢复**：锁被别的 Ultimate 持有 → `refuse('Another Ultimate is updating this clone')`；dirty/别的分支/diverged/lander 正在落 → `Refusal` 文案原样返回并记 `update.refused`；fetch 失败存 `state.error`，计数沿用上次；install 失败记 `installError`，下次 update 重试；预览（`ULTIMATE_INSTANCE_OWNER`）完全不读 clone，返回 `preview:true`。

**关掉它会发生什么**：没有自动检查/更新与 `UpdateApi`，`status.head` 缺席；landing 改包后不再自动 install；`merge` 委派不可用。

**复刻要点**：绝不 stash/rebase/reset；锁必须在 fetch 前拿、覆盖 install；摘要按 range 缓存且失败也缓存空结果；`restart` 来自全 clone 的 lockfile mtime，不是本进程的更新记忆。

**证据**：`extensions/update/refs.ts:6-98`；`api.ts:7-12`；`server.ts:34,56-59,85-92,105-161,172-253,256-294,306-409`；`clone.ts:12-158`；`item.ts:7-17`；`web.tsx:352-488`。

#### 2.7 `instance`

**职责与用户可见行为**：按需启动第二个 Ultimate（最多 3 个，含启动中），用于在重启共享宿主前验证核心改动，或在别的项目验证其 `.ultimate/` 扩展；可 start/stop/logs/list，卡片显示 URL、pid、home 与可折叠日志；标题栏项目 chip 变成预览切换器，预览以 iframe 嵌在标题栏下。

**导出与契约**：`Preview`、`ListAction('instance','list')`（`refs.ts:5-17`）；`InstanceService.start({home})`/`stop(id)` + `InstanceApi`（`api.ts:4-11`）；`server.ts` 导出 `DEFAULT_PREVIEW_MODEL='openai-codex/gpt-6.1-sol'`、`previewModelSetting`、`previewEnv`、`previewWorkspace`、`stopped`、`remember`、`actions.list`；`cleanup.ts` 导出 `cleanPreview`、`sweepPreviews`；`links.ts` 导出 `at`、`label`；工具 `instance`（`action: start|stop|logs|list`，参数 `id/home/subagent`）。

**状态与持久化**：进程内 `host.resource('instance')` Map + `instance.starts.pending`；停止记录按端口写宿主 home 的 `previews.json`（最多 50，跨重启保留）；临时 home 为 `tmpdir()/ultimate-instance-*`，内含 `project.json`、`ultimate.lock`；显式 home 写 `instance-preserve` 以免被清扫；tailnet 地址读 `~/.ultimate/tailscale.json`。

**UI 位置**：`tools.instance` 卡片（start/list/stop/logs）、`link: PreviewLink`、`slots['titlebar.project']=[Switcher]`、`overlay=[Poll, Embedded]`。

**关键流程**：1) 检查 `live + pending < 3`；2) `prepare()` 解析 workspace：有 workspace 用其 `path`，Ultimate 自身项目还要求 `server/main.ts` 与 `node_modules`；3) 无 `home` 时先 `mkdtemp('.ultimate-instance-')` 写 `ultimate.lock`/`project.json` 再 rename 发布；4) 拒绝宿主 home 或已被占用 home；5) `previewEnv` 剥离 `ULTIMATE_*`/云变量，设 `ULTIMATE_HOME/PROJECT`、`PORT=0`、`NO_OPEN=1`、`INSTANCE_OWNER=pid`、可选 `ULTIMATE_MODEL`；6) `spawnGroup(node, ['server/main.ts'])`；7) 从 stdout 匹配 `Ultimate: http://127.0.0.1:<port>`；8) 60 秒内轮询 `/api/models`；9) 失败则 `stop` 并带输出尾部；10) `onOpen` 异步 `sweepPreviews(tmpdir())`。

**失败与恢复**：超时/退出 → 报 `Instance did not become ready:\n<tail>`；启动被 abort → `stop` 清临时 home；清扫失败 `notice`；显式 home 永不自动删除；停止用 `stopGroup` 杀整个进程组并 `cleanPreview`（持有 `ultimate.lock.db`/`storage.lock.db` 排他事务、校验 PID sidecar、按 home hash 删 `ultimate/<hash>-*` 分支）。

**关掉它会发生什么**：不能起预览，标题栏保持普通项目 chip，预览链接退化为普通链接；`dream` 的 gate 因 `want(InstanceApi)` 为空而显式失败。

**复刻要点**：临时 home 的“先 staging 后 rename”是防别的宿主清扫的关键；预览必须有自己的 storage/Vite 缓存，且不继承云设置；`instance.model` 会覆盖 root/agent pin/summaryModel，`null` 关闭。

**证据**：`extensions/instance/refs.ts:5-17`；`api.ts:4-11`；`server.ts:38-60,66-97,152-232,239-254,256-528`；`cleanup.ts:11-117`；`web.tsx:373-377`；`README.md:11-25`。

#### 2.8 `watchdog`

**职责与用户可见行为**：失败运行若属临时错误则 60 秒后自动续跑一次；登录类错误立即上报并给登录提示；持久错误变成 `watchdog.failure` 卡片发给子代理 owner 或 @ultimate，@ultimate 自己的失败只发 notice；另外在 @ultimate 每次输入前提醒空闲超过 30 分钟（等待回复的分支 2 小时）的分支。

**导出与契约**：`Failure`（`refs.ts:2-11`）、`ReportedFailure`/`WatchdogService.failures(since)`/`WatchdogApi`（`api.ts:6-13`）；`server.ts` 导出 `FAILURE_LIMIT=20`、`diagnose(error, assistant?)`、task `watchdog.failure`（phase `wait|retry|report`）；`idle.ts` 的 `idleNote` 使用私有 doc `watchdog.seen`。reactor：无显式 `host.react`，用 `subscribeCommits` 看 task/submission；hook `GenerationTask.beforeInput`。

**状态与持久化**：`watchdog.reported`（root，最近 20 条 `ReportedFailure`）、`watchdog.receipts`（root，`{highWater,tasks}` 防重复检测）、`watchdog.seen`（每会话空闲集合 key）；运行本身是 durable task，entry 是 `watchdog.failure`/`watchdog.idle`。

**UI 位置**：`entries['watchdog.failure']` 卡片（会话链接、error、last step、hint、retried）与 `entries['watchdog.idle']` 纯文本。

**关键流程**：1) 订阅 commit，筛 `GenerationTask` 终态失败且 `reason ∈ {model_error,no_model}`；2) `detect` 先查 receipts/highWater 去重；3) `details` 扫任务与 entry，确定失败边界、最后工具名、标题；4) `diagnose` 分类：rate-limit 直接 report 并提示 Play；未登录/OAuth/invalid_grant 立即 report 带 hint；并发上限/Claude relay 200/`isRetryableAssistantError` → `temporary:true`；5) 创建 task（`background:true`，`until = endedAt + 60s`）；6) `wait` 睡到点，`retry` 检查是否已有 `watchdog-retry:<id>` 提交或会话 busy，否则提交一次并终止；7) `report` 给自己发 `host.notice`，否则 `submit` 到 recipient（`whenBusy:'steer'`）并追加 `Reported`、把子代理 action 标 `given-up`。

**失败与恢复**：重试失败不再重试；`subagent stop` 取消 task 并撤回 queued retry；恢复扫描首次安装把所有既有失败标历史、`highWater` 不越过未完成任务；恢复失败 `notice('Watchdog recovery failed: …')`；Messages 中已带失败回复的 board input 被排除。

**关掉它会发生什么**：没有自动重试/失败卡片/空闲提醒；`status.failures` 缺席；失败仍由 UI 以普通错误呈现。

**复刻要点**：request id 必须稳定（`watchdog-retry:<failedTask>`、`watchdog-report:<failedTask>`）以支持重放；`Reported` 按失败发生时间排序而非上报时间；检测与高水位推进必须在事务里。

**证据**：`extensions/watchdog/refs.ts:2-11`；`api.ts:6-13`；`server.ts:31-54,112-141,191-274,276-342,353-426`；`idle.ts:9-101`；`web.tsx:7-42`。

#### 2.9 `system`

**职责与用户可见行为**：把 durable 事件与 trace 调用合并成一种 `SystemRow`，在 System surface 上提供 Agent Lanes 时间线（30m/2h/24h）与 All events 流；可按 source/kind/conversation/errors/text 过滤、分页、跟随实时；点一行可展开该 trace 的调用树；`navigated` 记录用户所在 surface。

**导出与契约**：`SystemRow`、`SystemFilter`、`SystemCall`、`LaneCall`、`LaneRun`、`LaneSpawn`、`Lane`、`LaneLink`；`StreamAction`、`LanesAction`、`TreeAction`、`PollsAction`、`NavigatedAction`（`refs.ts:8-135`）；`server.ts` 导出 `lanes(host,args,clock)`（测试用）、`pollActions=['stream','lanes','tree','polls']`、`userActions=['navigated']`、`actions`；私有 doc `system.last-view`。

**状态与持久化**：自身只存 `system.last-view`（root，`{key}`，`<surface>:<conversation>`）；数据来自 `host.eventLog`（SQLite 事件日志）与 `host.trace`（`trace.sqlite`）；游标是不透明字符串 `<event id>.<trace position>`。

**UI 位置**：surface `system`（order 50）、命令 `system.open`、`overlay=[NavigationReporter]`；`LaneTree`/`Axis`/`Stream`/`TraceTree` 分别渲染树、时间轴、流与调用树。

**关键流程**：1) `stream` 校验 filter 与 `limit 1..500`，先读最新 event id；2) `before` 从 `{latest+1, MAX_SAFE_INTEGER}` 倒序，`after` 正序；3) events 走 `eventLog.recent`（`since`/`before` + `order`），calls 走 `trace.page`（`after`/`before`、`kinds`、`conversation`、`errors`、`text`），各读 `limit+1`；4) `merge` 按时间取前 `limit`，calls 的排序时间是 `at + ms`；5) `resume` 为每个 source 记录最后取到的位置；6) `head` 为 `{最新 event id, trace 最后位置}`；7) `lanes` 按 `tool|model` 拉窗口内调用，20 秒静默切 run，最多 40 lane/200 call，父 lane 一跳带上，`subagents.started` 提供 agent/model/kind，`board.sent` 提供 links；8) `tree` 用 `trace.tree` + 该 trace 的事件；9) `navigated` 在事务里比较 `LastView.key`，重复则不写。

**失败与恢复**：非法 cursor 抛 `Invalid before cursor`；非法 limit/kinds 抛错；UI 的 stream 失败保留已加载行、每 2 秒重试；lanes 失败显示 `lanes failed: …`；`stream` 的 `errors:true` 会禁用 event source。

**关掉它会发生什么**：没有 System surface 与命令；`activity` 面板的 “System ↗” 因检测不到 surface 而隐藏；`debug` 与 codemode 的 `trace` 仍可用。

**复刻要点**：两个 source 各自保留 cursor 是“不跳不重”的核心；calls 必须在 settle 时写入才能按完成时间排序；`subagents.started`/`board.sent` 只按名字 `defineEvent`，不 import 生产者的 token；轮询要声明 `pollActions`。

**证据**：`extensions/system/refs.ts:8-135`；`server.ts:15-59,155-219,242-513,522-569`；`web.tsx:233-248`；`stream.tsx:12-94,223-287`；`layout.ts:11-16,97-160,198-235`；`navigation.tsx:6-38`。

#### 2.10 `debug`

**职责与用户可见行为**：一个延迟加载（`deferred:true`）的只读工具，只有定义里点名它的 agent（本仓库是 @ultimate）才拿得到；回答是紧凑文本、每行一条、按新到旧、带相对年龄，最多约 16K 字符。

**导出与契约**：工具 `debug`，参数 `call: events|reactors|catalogue|trace|apis|api` 及 `events/since/limit/trace/conversation/name`；`age(at, now)` 导出；`BUDGET=16000`；`replay:'safe'`。无 API/doc/events。

**状态与持久化**：无；只读 `host.eventLog.recent`/`reactors()`、`host.catalogue()`、`host.trace.query/tree()`、`lib/api-files.ts` 的 `apiSummaries`/`apiSource`。

**UI 位置**：无。

**关键流程**：1) `events` 用事件名 `defineEvent(name)` 过滤、`since` 为排他事件 id；2) `reactors` 输出 name/on/cursor/lag/running/failure；3) `catalogue` 输出 provider（缺失为 `MISSING`）、needs/wants、missing、cycles；4) `trace` 无 `trace` 时列调用，带 `trace` 时递归缩进；5) `apis` 列每个有 `api.ts`/`refs.ts` 的扩展及首句摘要；6) `api` 返回两个文件全文，未知名字报已知列表；7) `bounded` 按预算截断并附 `… N more`。

**失败与恢复**：`events.since` 非 number、`trace.since` 非 string、`api` 缺 name 都抛明确错误；输出超预算截断；无数据返回 `No events.`/`No calls.` 等。

**关掉它会发生什么**：@ultimate 失去 `debug` 工具；同样的数据仍可由 codemode 的 `ultimate.trace()`/`catalogue()`/`apis()` 读取。

**复刻要点**：`deferred` 与 `replay:'safe'` 必填；用相对年龄而非绝对时间；`api`/`apis` 必须复用 `lib/api-files.ts`，否则与 codemode 的契约阅读分叉。

**证据**：`extensions/debug/server.ts:9-56,58-165,166-213`；`README.md:1-13`。

#### 2.11 `activity`

**职责与用户可见行为**：右栏 Activity 页按新到旧列出项目事件：Landing、Branch、Root、Notice、Check、Backup、Escalation；错误红边、警告琥珀边，头部统计 problems 并可一键切到 Problems；chips 过滤 all/landed/branches/problems，时间范围 24h/7d/all。

**导出与契约**：`PageAction('activity','page')`（`refs.ts:10-16`）；`server.ts` 的 `pollActions=['page']` 与 `actions.page`；`feed.tsx` 导出 `activityEvents`、`filters`、`tone`、`shows`、`joined`、`Feed` 及类型 `ActivityEvent`/`Filter`。

**状态与持久化**：无自有存储；实时行来自 root 的 `ultimate.event-feed` doc（`useEvents({events, limit:100})`），历史页走 `host.eventLog.recent`；过滤与范围存 `useExtensionUiState('filter'|'range')`。

**UI 位置**：panel `activity`（order 2）、命令 `activity.open`（“Show recent activity”）；头部在装了 `system` surface 时显示 “System ↗”。

**关键流程**：1) 计算 `since`（按分钟取整，保证轮询参数稳定）；2) 用 `shows(filter,event)` 过滤实时事件并统计 `loud`；3) “Load older” 以 live feed 最旧 id 或上一页 `next` 为 `before`，调 `page {kinds, before, since, limit:50}`；4) `joined` 按 id 去重合并 live/kept/older；5) 行点击通过 `messages:open` + `switchConversation` 打开来源会话。

**失败与恢复**：`page` 失败只在页脚显示错误，已有行保留；加载中禁用按钮；`filters` 里 `cloud.backup`/`automations.escalated` 用字符串 `defineEvent`，所以没装那两个扩展也能加载。

**关掉它会发生什么**：没有 Activity 面板与命令；事件仍写入 event log，可由 System 查看。

**复刻要点**：可选扩展的事件必须按名字定义；`passed` check 与 `started` backup 属 `quiet`，任何过滤器都不显示（Problems 也只收 error/warning）；分页要与 live feed 无缝拼接。

**证据**：`extensions/activity/refs.ts:10-16`；`server.ts:7-33`；`feed.tsx:25-85,100-160,320-354`；`web.tsx:27-134,228-239`；`README.md:22-28`。

#### 2.12 `codemode`

**职责与用户可见行为**：QuickJS/WASM 沙箱执行 async 函数体；`tools.<name>` 调本会话工具（codemode 自身除外），`ultimate.*` 自省，`ultimate.action` 唯一写通道，`store/load` 持久化；每次调用一行过去时摘要，显示在工具卡与折叠的 toolLines。

**导出与契约**：`CallSummary`/`SummariesDoc('codemode.summaries')`/`Summarized('codemode.summarized')`；`SummaryDoc`/`PendingDoc('codemode.summaries-pending')`；`Store('codemode.store')`、`docs`、`actions.read`、工具 `codemode`、task `codemode.summary`；`fixedLine`/`SUMMARY_SYSTEM`/`scrub`/`summaryInput`/`parseSummary`；`readProject`；`closedChapter`/`readChapter`。

**状态与持久化**：三个 conversation doc：`codemode.store`（`fork:'asOf'`、`history:'rewindable'`）、`codemode.summaries`（最近 1000）、`codemode.summaries-pending`；Store 在返回前单独 commit，崩溃窗口为“已写但报告 interrupted”。

**UI 位置**：工具卡（Script/Calls/Output/返回值 JSON 树）、`toolLines.codemode`、Store 文档、`MessageReference` point。

**关键流程**：1) 解析 `// @options`（默认 60s/10000 token）；2) 快照 Store；3) 由 `agent.tools` 建声明（排除 codemode/restart）；4) 256 MiB 沙箱内嵌套调用，`details.yielded` 同步 abort；5) 未完成调用标 `cancelled`，输出按 token 预算截断；6) `fixedLine` 或 `codemode.summary`；7) 成功先 commit Store 再返回 `details`；8) 失败返回 `codemode.js:<line>` 栈。

**失败与恢复**：失败保留输出、不重放；yield 外层成功并给 `pendingSubagents`；摘要失败不写行；`userActions` 被拒；跨项目 1 MiB 上限；`subagentAnswers` 只在成功且未 yield 时回执。

**关掉它会发生什么**：无工具/Store/摘要，agent 退回普通工具调用。

**复刻要点**：嵌套调用共享父 task、绕过工具 hook、结果不进模型上下文；声明与真实 schema 一致；摘要只喂清洗后的名字/状态/参数。

**证据**：`extensions/codemode/refs.ts:9-22`；`api.ts:10-32`；`server.ts:55-85,465-482,484-825`；`summary.ts:46-167`；`web.tsx:260-267`；`README.md:9,68-72`。

### 3. 跨扩展协作

- **状态聚合链**：`status` 汇总三者——`need(MessagesApi).openQuestions`，`want(UpdateApi).state()`、`want(WatchdogApi).failures()`、`want(HealthApi).providers()`；任一关闭就整体省略对应字段（`status/server.ts:16-24,40-59`）。
- **健康链**：`models` 的 `LoginChanged` → `health` 的 reactor `login-changed` 重置条目；`health` 的 `Changed` → `setup/web.tsx` 立刻重查（`setup/web.tsx:94`）；`setup` 与 `status` 都读 `HealthApi`。
- **更新链**：`update` 消费 `ConversationsApi.summaryModel/askSummaryModel`、`SubagentsApi.standing('ultimate')`、`WorkspacesApi.doc` 与 `SubmissionLanded`；`PauseApi.paused()` 阻止 tick；`status` 读 `UpdateApi`；`instance` 启动的预览用 `ULTIMATE_INSTANCE_OWNER` 让 `update` 直接返回 `preview:true`（`update/server.ts:105-125`）。
- **失败链**：`watchdog` 读 `Subagents`（owner/action）、`Messages`（reply-expecting 排除）、`Standing`、`Branch`、`WorkspacesApi.doc`；`WatchdogApi` 供 `status`。
- **观测链**：`system` 只读 core 的 `host.eventLog` 与 `host.trace`，按名字读 `subagents.started`/`board.sent`，并 emit `ui.navigated`；`activity` 读事件日志与 `ultimate.event-feed`，并链接到 `system` surface；`debug` 与 `codemode` 共用 `lib/api-files.ts`；`codemode` 的 `codemode.summarized` 事件会出现在 `system` 流中。
- **实例链**：`instance` 依赖 `WorkspacesApi`（预览 workspace）与可选 `TailscaleApi`（tailnet 地址）；`dream` 以 `want(InstanceApi)` 作为 gate，缺 `instance` 时明确报错（`dream/server.ts:640-641`）。
- **UI 链**：`status-line` 读 `conversations` 的 `ContextDoc` 与 `workspaces/ui.tsx` 的 `useWorkspaceConversations`；`info` 复用 `workspaces` 的 `Workspaces`/`useWorkspacesMeta`；`setup` 的修复按钮走 `useCommands()`/`runCommand` 与 `secrets:open` 浏览器事件。

### 4. 复刻顺序建议与风险

**顺序**（先契约后消费者，先只读后写入）：

1. `health` + `status-line`：二者是叶子，没有下游；先把 `Changed`、`HealthApi`、`RatesAction` 固定，后续 `setup`/`status` 才有依赖。
2. `setup`：只读健康、设置、secrets、agent 定义与 lineage 文档，验证 `beforeInput` 事务内写 doc 的模式。
3. `update`：引入 clone 锁、外部状态 + 独立事件 commit、预览守卫，是“存储外状态”的模板。
4. `watchdog`：引入 durable task 的 wait/retry/report 与稳定 request id，验证重放安全。
5. `status`：聚合 `health`/`update`/`watchdog`（外加 core 的 `MessagesApi`），检验 `want` 缺省语义。
6. `system`：统一流与 cursor 协议，是观测面的地基。
7. `activity`：只读事件日志的薄 UI，可先用 `system` 验证事件形状。
8. `debug`：复用 `system` 的 trace 视图与 `lib/api-files.ts`。
9. `codemode`：沙箱、嵌套工具、摘要任务与三个 doc，依赖最多，最后做。
10. `instance`：进程组、临时 home、清扫锁与 iframe 切换器，涉及面最广。
11. `info`：纯浏览器，最后按 `system` 事件字段补齐即可。

**风险**：

- **可选性**：12 个全非 core tier；本组内引用同伴一律 `want`（`status`、`setup`），只有 core API 才可 `need`（如 `status` → `MessagesApi`）。把可选依赖写成 `need` 会让 `pnpm deps` 失败并在缺席时崩掉。
- **存储外状态**：`health.json`、`.git/ultimate-update.lock`、`previews.json` 不参与 Pi Durable 事务；事件只能“事后单独 commit”，崩溃会丢事件不丢状态，复刻时不要把二者当原子。
- **并发**：多 home 写 `health.json` 会丢至多一个事件；同一 clone 的 fetch/update/install 必须共用 `server/lock.ts` 的锁；临时目录清扫要拿 `ultimate-preview-sweep.lock.db`。
- **游标语义**：`system` 的 `<event id>.<trace position>` 每个 source 独立推进，且 calls 以“完成时间”排序；任何一边算错都会跳行或重复。
- **重放**：`watchdog` 的 `watchdog-retry:<task>`、`watchdog-report:<task>`、`update-merge:<head>..<remoteHead>` 都是幂等键；`codemode.store` 的 commit 在结果返回前，存在“已写入但报告 interrupted”的窗口。
- **隐私**：`health` 的 `sanitize` 与 `codemode` 的 `scrub` 都是 allowlist，任何“把原始错误/参数直接落盘或发给摘要模型”的改动都会泄露凭证。
- **进程与预览**：`instance` 必须按进程组停止、先 staging 后 rename、保留显式 home；预览不得读/改宿主 clone（`ULTIMATE_INSTANCE_OWNER` 是唯一开关）。

---

## A.8 外部集成与打磨分析笔记

### 1. 概览

这十个扩展都不属于 core tier（core tier 仅有 agent、prompt、coding-tools、conversations、models、documents、notices、secrets、theme、workspaces、subagents、lineage、messages、onboarding、sidebar，见 `docs/extensions.md:64-76`），它们把 Ultimate 接到外部世界并把体验补完整：`cloud` 把项目状态加密备份到用户自建的 Cloudflare Worker，`tailscale` 把本机 UI 发布到 tailnet HTTPS 并自带准入校验，`browser` 用 Playwright 提供截图/驱动兜底工具，`voice` 把麦克风听写塞进输入框，`voice-live` 用 GPT-Live 做耳朵、用常驻 Voice 代理把请求转给 @ultimate，`parallel` 用 parallel.ai 提供 `web_search`/`web_fetch`，`claude-code` 把外部 CLI 注册成原生 provider，`fast` 给 OpenAI 请求加 `service_tier: "priority"`，`sounds` 只对 @ultimate 的关键事件发声，`splash` 在启动时画 ULTIMATE 字标。十者之间没有循环依赖，全部通过 `api.ts`（cloud/tailscale）、action ref、event token 或浏览器事件总线协作。

| 名称        | 一句话职责                                       | 服务端入口                                                     | 浏览器入口                                                       | 是否 core tier |
| ----------- | ------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------- | -------------- |
| cloud       | 加密项目备份 + 云端登记簿 + Join 向导            | `server.ts`（`state`/`backup`/`joinState`/`join`，`CloudApi`） | `web.tsx`（`statusline.right`、`JoinDialog`、命令 `cloud.join`） | 否（默认关闭） |
| tailscale   | 用 Tailscale Serve 发布本机 UI，仅放行白名单登录 | `server.ts`（`status`/`retry`，`TailscaleApi`）                | `web.tsx`（`statusline.right` 指示器、命令 `tailscale.panel`）   | 否（默认关闭） |
| browser     | Playwright 的 `screenshot`/`browser` 兜底工具    | `server.ts`（tools + `visual_verification` section）           | `web.tsx`（两个 tool 渲染器）                                    | 否（默认开启） |
| voice       | 输入框旁的语音听写                               | `server.ts`（`status`/`transcribe`）                           | `web.tsx`（`composer.actions`）                                  | 否（默认开启） |
| voice-live  | GPT-Live 语音 + Voice 常驻代理转 @ultimate       | `server.ts`、`brief.ts`、`relay.ts`、`session.ts`              | `web.tsx`、`live.tsx`                                            | 否（默认关闭） |
| parallel    | parallel.ai 的网页搜索与抽取                     | `server.ts`（tools + `web_tools` section）                     | `web.tsx`（tool 渲染器）                                         | 否（默认关闭） |
| claude-code | 外部 Claude Code CLI 作为原生 provider           | `server.ts`（`registerNativeProvider` + `status`）             | `web.tsx`（panel `claude-code`、命令）                           | 否（默认开启） |
| fast        | OpenAI 优先服务层开关                            | `server.ts`（provider overlay + `beforeRequest`）              | `web.tsx`（`composer.toolbar`）                                  | 否（默认开启） |
| sounds      | @ultimate 的问题/完成/失败提示音                 | 无（纯浏览器）                                                 | `web.tsx` + `cues.ts` + `tones.ts`；`ui.tsx` 供他人复用          | 否（默认关闭） |
| splash      | 启动字标动画遮罩                                 | 无                                                             | `web.tsx`（`overlay`）+ `electric.tsx`                           | 否（默认开启） |

### 2. 逐扩展规格

#### 2.1 cloud

**职责与用户可见行为**：状态行显示 `backed up 3h ago`、`no backup yet`、`backing up…`、`backup refused`；无 GitHub origin 时显示 `not backed up`，卫星机显示 `satellite · no backups`（`web.tsx:219-253`）。弹层含上次备份（机器、大小）、**Back up now** 与进度条、被拒时的 Worker 原句与 **Back up anyway**（二次确认 **Replace it**），以及 `pnpm restore <name>` 提示（`web.tsx:87-213`）。⌘K **Join cloud backups** 打开 `JoinDialog`（`join.tsx:384-397`），四步 `check`/`secrets`/`settings`/`done`（`join.tsx:21-26`）。

**导出与契约**：actions `state`、`backup`、`joinState`、`join`；`userActions = ['join']`（`server.ts:195`，代理不得替用户存密钥）。事件 `BackupEvent` = `cloud.backup`，负载 `{phase:'started'|'done'|'failed', project, bytes?, uploaded?, ms, reason?, error?}`（`refs.ts:19-23`）。API `CloudApi` 提供 `backup()` 与 `status(): 'off'|'local'|'satellite'|'on'`（`api.ts:7-14`）。secrets 声明 `ULTIMATE_CLOUD_TOKEN`、`ULTIMATE_CLOUD_SNAPSHOT_KEY`（`server.ts:20-26`）。依赖：`need(SecretsApi)`，`want(TailscaleApi)`、`want(PauseApi)`（`server.ts:202-205`）。配置键只在用户设置：`cloud.url`、`cloud.machine`、`cloud.satellite`，环境变量 `ULTIMATE_CLOUD_URL`/`_TOKEN`/`_SNAPSHOT_KEY`/`_MACHINE` 优先（`lib/cloud.ts:23-54`）。`cloud.state` 的返回即 `CloudState`（`types.ts:11-32`）。

**状态与持久化**：章节目录下 `cloud-backup.json` = `{key, parent, last}`（`backup.ts:13-18`），首章 key 为 `github.com/<owner>/<repo>`，后续章为 `<key>@<name>`（`chapterKey`，`backup.ts:24-25`）。运行态（`backup` 进度、`conflict`、`lastError`）放在 `host.resource('cloud.backup')`，只活在进程内（`server.ts:36-40,67`）。快照 id = `Date.now().toString(36)-<16 hex>`；对象写一次、Worker 保留策略；单次备份上限 10 分钟（`BACKUP_CAP`，`server.ts:29`）。

**UI 位置**：`statusline.right` + `overlay`（`web.tsx:285-290`）；命令 `cloud.join`。

**关键流程**：1）`setup()` 读 `cloudConfig`，判定 `off`/`satellite`/`local`/`on` 并算出 `chapterKey`（`server.ts:43-57`）。2）`backup()` 先拒绝并发与暂停，置进度占位，再查无 origin、卫星、未配置（`server.ts:70-90`）。3）`record` 提交 `started`。4）读 `ULTIMATE_CLOUD_SNAPSHOT_KEY`（env 优先），取 `TailscaleApi.status().url` 作 `tailnet`。5）`uploadSnapshot`：`VACUUM INTO` 复制库、`git bundle create --branches=ultimate/*`、zstd、按 16 MiB 分块、每块 AES-256-GCM（nonce‖密文‖tag），AAD 为 `id:kind:index:last|more`，密钥 HKDF-SHA256(secret, salt=projectKey, info=`ultimate-snapshot:<id>`)，最后上传 manifest 才使快照完整（`snapshot.ts:59-104,165-190,193-244`）。6）`POST /sync/backups/<sha256(key)>/<id>`，body 带 `key,name,chapter,machine,parent,force?,createdAt,bytes,uploaded,tailnet?`（`backup.ts:100-118`）。7）200 写 `cloud-backup.json` 并把新 id 当 parent；409 时若 `latest.id === done.id` 视为成功，若 `latest` 是本机在已记录 parent 之上的备份则采纳并重试一次，否则抛 `Conflict`（`backup.ts:121-156`）。8）成功/失败各提交 `done`/`failed`，`classify` 把异常映射为 `conflict`/`missing snapshot key`/`integrity check failed`/`timed out`/`HTTP 5xx`/`failed`（`backup.ts:164-177`）。

**失败与恢复**：冲突保留 parent 与已上传分块，UI 给 **Back up anyway**（`force`）；网络错误与 5xx 重试两次（`snapshot.ts:295-315`）；`PUT` 重试遇 409 视为已写成功；`downloadSnapshot` 校验 manifest 的 `id`/`key`/`root`、`PRAGMA integrity_check`、逐块大小与明文 SHA-256，失败只删自己的文件（`snapshot.ts:107-160,247-280`）；分支只做快进式写入，冲突存 `refs/heads/ultimate-moved/<id>/<name>`（`snapshot.ts:328-371`）。`backup.ts` 只负责上传/提交，`pnpm restore` 在 `scripts/restore.ts`（范围外）。

**关掉它会发生什么**：`CloudApi` 解析为 undefined，Dream 的睡前备份显式跳过并记 `Cloud extension is not enabled`（`extensions/dream/server.ts:364-372`）；状态行与 Join 命令消失；已存在的 `cloud-backup.json` 原样留在磁盘。

**复刻要点**：父链（parent）是防两台机器互相覆盖的唯一机制，必须与 Worker 的 409 语义一起实现；加密的 AAD 必须覆盖快照 id、部件、序号、是否末块，否则乱序/换块无法被发现；`chapter` 只影响 key 与目录，恢复路径的绝对路径校验在 restore 脚本里。

**证据**：`extensions/cloud/server.ts:20-26,29,43-57,59-65,70-90,92-152,154-193,195-207`；`backup.ts:13-25,41-47,79-161,164-177`；`snapshot.ts:47-52,59-104,107-160,165-190,193-244,247-280,282-315,328-371`；`join.ts:9-31,45-95,112-137`；`refs.ts:7-50`；`api.ts:7-14`；`types.ts:11-32`；`web.tsx:53-64,87-213,219-290`；`join.tsx:19-26,327-397`。

#### 2.2 tailscale

**职责与用户可见行为**：默认关闭；开启后把本机 supervisor 端口用 `tailscale serve --bg --yes --https=<port> http://127.0.0.1:<localPort>` 映射到 `https://<dns>:<port>`，只有 `tailscale.allow`（缺省为机器 owner 的 `User.LoginName`）能进（`server.ts:144-148,201-208,266-290`）。状态行 `tailnet`：ready 绿点、问题琥珀点；off/starting 不显示（`web.tsx:317-351`）。弹层 ready 显示二维码、URL、Copy/Open、允许名单与 "Tailnet only"；问题态给出标题、hint，hint 里的命令变成可复制 chip，并提供 **Check again**（`web.tsx:114-236`）。

**导出与契约**：`StatusAction`（`tailscale`/`status`）、`RetryAction`（`tailscale`/`retry`）（`refs.ts:26-28`）；`Status` 的九个状态 `disabled|starting|ready|not-installed|not-running|not-operator|https-disabled|port-conflict|error`，含 `url?`、`allow`、`hint?`（`refs.ts:8-23`）。`TailscaleApi` 暴露 `status()`（`api.ts:10-15`）。设置键 `tailscale.allow`（仅用户设置）；`TAILSCALE_COMMAND` 可换 CLI（`server.ts:59-60`）。`export const reloadOnSettings = true`（`server.ts:40`）。

**状态与持久化**：`<home>/.ultimate/tailscale.json` = `{ ports: { "<projectRoot 或 home>": { port, owner, temporary? } } }`，写入走 `acquireLock`（pid 所有，进程死亡自动释放）+ 0600（`server.ts:65,85-120,273-277`）。端口优先本机 supervisor 端口，否则从 4747 起找空闲；排除 443、现有 Serve 映射与其它登记（`server.ts:230-265`）。只有默认 home 的服务器以 `projectRoot` 为键；preview/`mktemp` 实例以 `home` 为键并标 `temporary`（`server.ts:66-72`）。

**UI 位置**：`statusline.right`，命令 `tailscale.panel` 发 `tailscale:open` 事件把弹层从空锚点打开（`web.tsx:320,353-362`）。

**关键流程**：1）`onOpen(begin)` 启动，`begin` 串行化（`server.ts:303-308`）。2）已有 `ownedPort` 时先 `intact()`：owner token 仍是自己且 Serve 目标等于本机 URL 才算 `own`，否则重新申请（`server.ts:121-143`）。3）`tailscale status --json`，ENOENT 时回退 macOS app 路径；仍无则 `not-installed` 且只给状态不发 notice（`server.ts:150-169`）。4）解析 `BackendState`、`Self.DNSName`、`Self.UserID`→`User.LoginName`（UserID 用 reviver 保留原数字串，避免超 `MAX_SAFE_INTEGER`），检查 `CertDomains` 含该 DNS（`server.ts:171-208`）。5）在登记表锁内清理死 owner 的 loopback 映射（仅当目标不是 live supervisor）、分配端口、写 Serve、`host.access.allow({origin, verify})` 注册准入，verify 读 `tailscale-user-login` 并要求在 allow 内（`server.ts:210-291`）。

**失败与恢复**：stderr 里 permission/operator → `not-operator`（提示 `sudo tailscale set --operator=$USER`）；not running/logged out/needslogin → `not-running`；其余 `error`（截 500 字）（`server.ts:292-300`）。`retry` 在启动中会等待同一次启动；ready 后只修复丢失的映射（`server.ts:50-53,303-308`）。关闭时先等 `opening`，仅当 token 仍拥有且 Serve 目标仍是自己时才 `serve off`，临时条目删除，失败只报错不阻止关闭（`server.ts:310-330`）。真正的请求准入（Forwarded 头、Origin、`Sec-Fetch-Site` 放宽仅限根导航 `GET`+`navigate`+`document`+无 `Upgrade`）在核心里（`server/request-security.ts:39-58`）。

**关掉它会发生什么**：`TailscaleApi` 缺失，`instance` 的 preview 没有 tailnet 地址（`extensions/instance/server.ts:195-205`），`setup` 不报 Tailscale 区域（`extensions/setup/server.ts:228-233`），cloud 提交不带 `tailnet`；`access.origins` 少一个 origin，状态行无指示器，预览不发布。

**复刻要点**：端口登记表必须"项目条目长存、临时条目随 home 消失"；owner token 让延迟的旧关闭不会删掉继任者的映射；identity 只信 Serve 注入的头，且 Funnel/带标签设备因无头一律拒绝。

**证据**：`extensions/tailscale/server.ts:19-54,59-72,85-131,132-301,303-330`；`refs.ts:8-28`；`api.ts:10-15`；`web.tsx:30-43,49-67,114-236,285-310,317-362`；`server/request-security.ts:39-58`。

#### 2.3 browser

**职责与用户可见行为**：兜底浏览器工具（首选 ego-browser，见 README 与 `visual_verification` section，`server.ts:154-160`）。`screenshot` 载入页面、等 `waitMs`（默认 1500）、截图并返回压缩图 + 标题 + 控制台/页面错误；`browser` 按 `click|fill|press|wait|eval|send|until` 逐步驱动，可末尾截图。

**导出与契约**：两个 `defineTool`：`screenshot`（`replay: 'safe'`）与 `browser`（不 safe，因为可能提交 prompt），参数 `url/path/timeoutMs` + 各自扩展（`server.ts:138-151,162-302`），`outputSchema` 统一 `{type:'object'}`。`browserBinary()` 与 `screenshotFile()` 是导出的纯辅助（`server.ts:19-86`）。无 API、无事件、无设置键。

**状态与持久化**：进程级 `host.resource('browser')` 持有懒启动的 `Browser`，host 关闭时关闭（`server.ts:130-137`）。每次调用新建隔离 `BrowserContext`，结束/取消即关；截图默认存 `<home>/screenshots/<ts>-<uuid>.png`，传 `path` 则相对会话 cwd 且必须以 `.png` 结尾（`server.ts:79-86,370-375`）。

**UI 位置**：`tools` 渲染器 `screenshot`/`browser`（缩略图、步骤 ✓/✗、`eval` 返回值、错误列表，`web.tsx:76-239`）。

**关键流程**：1）解析 Chromium：`ULTIMATE_CHROMIUM` → Windows 各 `ProgramFiles` 下的 Chrome/Edge 与 `%LOCALAPPDATA%\ms-playwright\chromium-*`（按版本倒序）→ Linux `/usr/bin/chromium`、`google-chrome-stable`、`~/.cache/ms-playwright/...`（`server.ts:19-76`）。2）懒启动 headless，`TMPDIR` 置空以避开 Chromium singleton socket 路径问题（`server.ts:347-367`）。3）`newContext({viewport: 1440×900, colorScheme: theme})`、`newPage`、`setDefaultTimeout`。4）对任意 Ultimate 页面注入 `sessionStorage['ultimate.driven']=1`；同源时再注入 `ultimate.detached=1` 与 `ultimate.theme`，使被驱动页面不推动用户标签（`server.ts:385-397`）。5）`send` 调 `window.ultimate.send(text,{conversation})`，`until` 调 `window.ultimate.until(condition,{conversation,timeoutMs})`，默认 5 分钟（`server.ts:249-289`）。6）截图后 `resizeImage(maxWidth/Height 1600)` 并带尺寸注记（`server.ts:110-128`）。

**失败与恢复**：每步 30 s（`timeoutMs` 可覆盖），整次 `4*stepMs+显式等待`；`eval` 也用 `Promise.race` 包住（`server.ts:95-108,333-342`）。`until` 超时会说明仍在忙什么或等到了什么；无 `window.ultimate` 的页面直接报"not an Ultimate UI"。关闭 context 限 5 s，关不掉则关共享 browser 并让下次重启（`server.ts:439-456`）。

**关掉它会发生什么**：两个工具与 `visual_verification` 段落消失，agent 失去内建截图/驱动能力（codemode 的 `tools` 也不再含它们）；无后台资源。

**复刻要点**：必须把"页面属于本 UI"与"普通网页"分开处理（detached/theme 注入只在同源）；`until` 的语义完全依赖 `web/src/sdk/test-hook.ts`，复刻时先复刻 hook。

**证据**：`extensions/browser/server.ts:19-76,79-93,110-128,130-151,154-160,162-302,305-436,439-456`；`web.tsx:17-35,76-124,141-241`。

#### 2.4 voice

**职责与用户可见行为**：`composer.actions` 里的麦克风；录制中变为 Cancel + 计时 + 电平条 + Stop；停止后转写并**插入草稿光标处**，绝不自动发送（`web.tsx:94-273`）。无 key 时按钮变暗，点按发 `secrets:open` 打开 `OPENAI_API_KEY` 行（`web.tsx:249-256`）。

**导出与契约**：`StatusAction`（`voice`/`status`）→ `{available:true}|{available:false,reason}`；`TranscribeAction`（`voice`/`transcribe`）`{audio: base64, mimeType}` → `{text}`（`refs.ts:5-12`）。secrets 声明 `OPENAI_API_KEY`（`server.ts:13-19`）。无 API、无事件产生方；监听浏览器事件 `secrets:changed`。

**状态与持久化**：无文档、无 SQLite；只读 secret 或 Pi `openai` provider 的 API key（OAuth 登录被排除，`server.ts:24-31`）。`MAX_AUDIO_BYTES = 8 MiB`，请求超时 65 s（`server.ts:9-11`）。

**UI 位置**：`composer.actions`；插槽组件内自带错误行与 `transcribing…`。

**关键流程**：1）`unsupported()` 检查 secure context 与 `MediaRecorder`（`web.tsx:33-38`）。2）`getUserMedia({echoCancellation,noiseSuppression})`，按 `audio/webm;codecs=opus` → `audio/mp4` → `audio/webm` 选类型，`recorder.start(1000)`（`web.tsx:141-185`）。3）`stop` 时停轨、关 AudioContext、把 chunks 合成 Blob 交给 `transcribe`（`web.tsx:170-180`）。4）base64 后调用 action；服务端组 `FormData`（`file`、`model=gpt-4o-mini-transcribe`、`response_format=json`）POST `https://api.openai.com/v1/audio/transcriptions`（`server.ts:37-68`）。5）`insertIntoComposer(id, text)`（`web.tsx:124-139`）。

**失败与恢复**：401/413/429 与其它状态各有文案（`server.ts:71-77`）；超时提示缩短录音；`NotAllowedError`/`NotFoundError` 有专门提示；错误 8 秒后自清（`web.tsx:111-115,148-158`）。录制随 composer 卸载而取消并释放麦克风；超过 `MAX_MS` 自动停止（`web.tsx:107-110`）。

**关掉它会发生什么**：麦克风按钮消失，输入框只剩打字；`OPENAI_API_KEY` 声明仍在 secrets 目录里（由 secrets 扩展决定展示），但无消费者。

**复刻要点**：README 写"10 分钟自动停止"，代码是 `MAX_MS = 5 * 60_000`（`web.tsx:19`）——以代码为准，属文档漂移；`openaiTranscribe` 是唯一知道端点/字段的位置，替换供应商只改这里。

**证据**：`extensions/voice/server.ts:7-19,24-31,37-77,81-110`；`refs.ts:5-12`；`web.tsx:19-21,33-38,94-185,187-273,275-277`。

#### 2.5 voice-live

**职责与用户可见行为**：默认关闭；开启后 `agents/voice.md`（`resident: true`，模型 `openai-codex/gpt-6-luna`、`thinking: low`、`fast: true`、`tools: [voice_say, voice_ask_ultimate, voice_note, codemode]`）随扩展启用而加载。用户点麦克风后：GPT-Live（`gpt-live-1`，voice `marin`，`delegation.type='client'`）只做听觉界面与寒暄，Voice 代理决定是否转给 @ultimate，并把答复压缩成 2–4 句口语（`server.ts:47-58,447-464`；`agents/voice.md:1-28`）。

**导出与契约**：actions `status`、`start`（`{sdp}`→`{sdp,conversation}`）、`heard`、`log`、`end`，全部列入 `userActions`（`server.ts:67`）。task `voice-live.answer`；doc `voice-live.forwarded`（`scope:'task'`，`checkpointWhen:()=>false`，`server.ts:60-66`）。entry kind：`voice.line`、`voice.heard`、`voice.answer`、`voice.session`、`voice.context`、`voice.utterance`（`refs.ts:15-48`）。tools：`voice_say {text}`、`voice_ask_ultimate {request}`、`voice_note {text}`（`server.ts:580-714`）。依赖 `need` MessagesApi、SubagentsApi、LineageApi、ConversationsApi（`server.ts:544-547`）。secrets `OPENAI_API_KEY`（只 API key，非 OAuth，`server.ts:36-44`）。

**状态与持久化**：全部写在 Voice 会话的 durable entries 里；session 分隔用 `voice.session`（`started`/`ended`+`seconds`），brief 用 `voice.context` 且 `transient: true`、带 `edits:[{target: previous.id, action:'omit'}]` 让只有最新 brief 进入模型（`server.ts:120-142`）。`host.resource('voice-live.briefs')` 保存"brief 正在生成"的 promise，使首条 `heard` 等它（`server.ts:93-95,493-495`）。前端 `live.tsx` 把 `mode` 与 `session` 放在 React 之外的模块单例里，`web.tsx` 热更新不会孤儿化会话（`live.tsx` 自身 dispose 时才关闭）；`front` 不持久（`live.tsx:41-48`）。

**UI 位置**：`composer.actions`（StartButton）、`titlebar.right`（LiveIndicator）、`conversation.overlay`（Stage 前推/折叠卡）、`transcript.end`（LiveTurn 实时字幕）、`overlay`（Relay 播报）、`composer`（VoiceDock 取代 Voice 会话的输入框）、`provides`：`UnderUltimate`（sidebar 行）、`Unlisted`（Voice 会话不进侧栏其他列表）；entries 渲染器覆盖 `voice.line`/`voice.heard`/`voice.answer`/`voice.session`/`voice.context`/`voice.utterance`/`pi.assistant`；命令 `voice-live.start|front|mute|end`，⌥V/Alt+V（`web.tsx:56,1391-1442`）。

**关键流程**：1）浏览器 `getUserMedia`、把 track 加入 `RTCPeerConnection`、先建 `oai-events` 再 `createOffer`（`session.ts:25-87`）。2）`start` 用 `SubagentsApi.standing('voice')` 取会话 id，并行组 brief（`voiceBrief`：`LineageApi.memoryBrief` + 最近 5 条用户请求及答复首行 + 最多 8 个未 conclude 分支，`brief.ts:16-19,71-148`），把最近 10 条 Voice 行（各截 200 字，过滤 `note`）作为 `input` 种子，POST `https://api.openai.com/v1/live/sessions`（30 s 超时），成功后写 `voice.session started` 并异步 `placeBrief`（`server.ts:408-488`）。3）浏览器把 SDP answer 设回，等 `session.started`，播放远端音轨，启动 100 ms `relay.tick`（`session.ts:88-164`）。4）`Relay` 拼接输入碎片：句末 1200 ms、未完 2800 ms 静默才成行，`[unintelligible]`/`[inaudible]` 变 `…`（`relay.ts:3-23,63-80`）。5）成行即 `HeardAction`，作为 `voice.heard` 输入（`whenBusy:'steer'`）进 Voice（`server.ts:489-506`）；同时前端把 `voice.line` 中 `ultimate` 且 `speech` 的行转成 `session.commentary.append` 朗读，`note` 转成 `session.thinking.append`（`web.tsx:333-365`；`live.tsx:320-331,334-337`）。6）Voice 调 `voice_ask_ultimate`：`api.commit` 内写 `Forwarded.scheduled` 并 `createTask(answerTask(...,{conversationId, ownership:'conversation', background:true}))`，再写 `userLine`（`voice:line:<taskId>`），保证重放不重复（`server.ts:646-690`）。7）answer task 写转发行，找 @ultimate 最新未答问题，有则 `MessagesApi.answer` 并等消息 `entry` 落地、拿 `board:<reply>` 的 submission receipt；否则提交 `voice.utterance` 给 @ultimate，随后 `receipt.wait`（`server.ts:226-315`）。8）取答复：优先该 run 内与 tool call 匹配的 `message` 文本（含编号问题/选项），否则 assistant 文本；`answerVoice` 以 `voice:answer:<line>` 写 `voice.answer`（`source` 指向 @ultimate 的 answer entry），再终止 task（`server.ts:345-394`）。9）`beforeRequest` 钩子在 compaction 把最新 brief 切掉时重新 append 一条 `again:true` 的 brief 并追加到本次请求消息（`server.ts:551-579`）。

**失败与恢复**：brief 失败变成带 `error` 的 `voice.context`，会话照常开始（`server.ts:418-432`）；`HeardAction` 等 brief 完成再提交；答复失败/被停止会写 `notice` 并让 Voice 口头解释（`server.ts:316-343`）；`voice_say` 用 `voice:say:<taskId>`、answer 用 `voice:answer:<line>` 等稳定 requestId 做幂等；空闲 120 s（`IDLE_MS`）自动 `release('paused')`，收到答复时若浏览器无用户激活则显示 `Tap to hear`，否则自动续会（`live.tsx:340-354`）；`pagehide` 与 HMR dispose 都会关闭会话并释放麦克风（`live.tsx:380-389`），关闭最多等 `session.closed` 5 s（`session.ts:122-150`）。20 s 后每 45 s 说一次 "Still on it."（`live.tsx:235-244`）。

**关掉它会发生什么**：`voice` agent 定义不再被发现（`lib/agents.ts:330-336` 只加载已启用扩展的 `agents/`），`Standing.voice` 无法创建；所有 UI 入口、工具、task 与 `voice.*` 渲染器消失；旧 Voice 会话与其 entries 留在库里但侧栏不再有 `UnderUltimate` 行。

**复刻要点**：难点不在 WebRTC 而在幂等——`Forwarded` doc + `createTask` 同一事务、`voice:answer:<line>`、`MessagesApi.answer` 的 "These questions are no longer open" 容错、`re` 从工具轮前的输入反查，缺一都会重复转发或答错行；`voice.context` 的 omit 链是"只有最新 brief 进模型"的关键。

**证据**：`extensions/voice-live/server.ts:26-34,47-77,79-142,145-158,180-207,209-400,402-541,543-716`；`brief.ts:16-19,71-148`；`relay.ts:3-23,25-105`；`session.ts:25-199`；`live.tsx:41-48,55-73,165-169,262-309,311-331,334-378,380-389`；`web.tsx:56,136-190,198-317,333-365,374-514,520-583,635-696,811-890,895-954,969-1080,1325-1378,1391-1442`；`agents/voice.md:1-28`。

#### 2.6 parallel

**职责与用户可见行为**：`web_search` 用 Search API（`mode:'turbo'`、`max_chars_total:40000`）返回标题/URL/日期/摘录；`web_fetch` 用 Extract API 取 1–20 个 URL 的干净 markdown（`server.ts:95-238`）。卡片默认折叠，失败自动展开；缺 key 时头部出现 **Add key/Replace key** 打开 Secrets 对应行，`secrets` 关闭时给 **Turn on secrets**（`web.tsx:97-112,115-187`）。

**导出与契约**：tools `web_search`（参数 `query`/`searchQueries`/`maxResults`/`afterDate`）与 `web_fetch`（`url` 可为字符串或数组、`objective`），均 `replay:'safe'`；`prepareArguments` 把以 `[` 开头的 `url` 字符串 JSON 解析成数组（`server.ts:143-153`）。`section('web_tools', guidance)` 写系统提示。`normalizeUrls`、`validateResponse` 已导出。secrets `PARALLEL_API_KEY`；环境变量 `ULTIMATE_PARALLEL_TEST_URL` 只用于本地假服务器（`client.ts:1-2,72`）。

**状态与持久化**：无文档；`host.resource('parallel:missing-key')` 只记"已发过缺 key notice"，保证每进程一次（`server.ts:33,50-54`）。输出上限 50 KiB / 2000 行，附截断说明（`output.ts:1-33`）。

**UI 位置**：`tools` 两个渲染器；`search` 标题带域名摘要与 `n results`，`fetch` 显示 `n pages`，内容在 disclosure 里、`disallowedElements=['img','picture','source']` 保证离线（`web.tsx:58-59,248-403`）。

**关键流程**：1）`key()` 先确认 `secrets` 扩展已启用且无错误，再 `readSecret('PARALLEL_API_KEY')`，其次 `process.env`（用户 secret 优先，`server.ts:34-55`）。2）`parallelRequest` 合并 abort 与 120 s 超时，`x-api-key` 头，解码 JSON 后先 `redact` 掉 key（含对象键名），再按状态映射错误（`client.ts:61-153`）。3）search 组装 `objective/search_queries/mode/max_chars_total/client_model/advanced_settings` 并 `validateResponse`。4）`api.details(...)` 写结构化 details（`status/searchId/sessionId/results/warnings`），文本走 `truncateToolOutput`。5）web_fetch 额外把每页 `content` 截 20000 字并记 `contentTruncated`，`errors` 截 20 条；全部失败时 `isError: true`（`server.ts:184-232`）。

**失败与恢复**：401/403 → "PARALLEL_API_KEY was rejected"；429 → 等一会；其它附 `ref_id`（`client.ts:134-152`）；网络/超时/空响应分别有文案；形状不符抛 "unexpected response shape"（`server.ts:295-334`）；错误 details 让 UI 显示 HTTP 状态与 ref 并提供换 key 入口。

**关掉它会发生什么**：两个工具与 `web_tools` 提示消失，agent 失去 `web_search`/`web_fetch`；`secrets` 扩展仍可在面板里展示该 secret，但无消费者。

**复刻要点**：`details` 是 UI 的唯一数据源，文本 output 只给模型；两处 `client_model` 从 `api.agent(context).model?.modelId` 取，便于计费归因；`redact` 必须在解析后做，否则转义的 key 会漏。

**证据**：`extensions/parallel/server.ts:14-55,60-131,139-239,243-269,276-334`；`client.ts:1-2,50-59,61-153`；`output.ts:1-33`；`web.tsx:47-55,97-112,115-187,248-403,405`。

#### 2.7 claude-code

**职责与用户可见行为**：默认开启；把外部 Claude Code CLI 的登录作为实验性 provider 接入，模型出现在既有 model picker 里。⌘K **Claude Code setup…** 打开 panel：显示 `Checking CLI…`/`CLI not installed`/`Login not confirmed`/`Subscription connected`/`CLI connected · no subscription reported`，并给安装与 `claude auth login`、`claude auth status` 命令（`web.tsx:7-72`）。

**导出与契约**：`StatusAction`（`claude-code`/`status`）→ `{available, loggedIn, subscription, plan}`（`refs.ts:5-13`），只暴露元数据，绝不返回 CLI 输出或账号身份（`server.ts:88-93`）。`createUltimateClaudeCodeProvider()` 导出，用于把 `claude-sonnet-5` 的 `thinkingLevelMap.off` 置 `null`，并让 `getModels`/`getAllModels` 都走同一适配（`server.ts:13-26`）。无 API、无事件、无 settings key；环境变量 `PI_CLAUDE_CODE_COMMAND`、`PI_CLAUDE_CODE_CONFIG_DIR`（README 记录，上游读取）。

**状态与持久化**：`host.resource('claude-code.provider')` 持有跨 facet 重载的 provider、活跃 stream 集合与 `closing` 标志（`server.ts:29-64`）；`shared.facets` 计数保证重载期间不反注册，最后一个 facet 关闭才 `unregisterProvider`（`server.ts:68-73`）。无文档。

**UI 位置**：`panels` 里 `id: 'claude-code'`（`tab: false`，从 ⌘K 与 model picker 打开），命令 `claude-code.panel`（`web.tsx:74-93`）。

**关键流程**：1）`createClaudeCodeProvider()` 后删除 `auth.oauth.login`（外部登录，无应用内 OAuth），保留订阅元数据（`server.ts:66-67`）。2）`registerNativeProvider(provider)` 注册；`stream`/`streamSimple` 包装为 `track(...)`，把 `response.result()` 计入 `active`，并在 `closing` 时拒绝新请求（`server.ts:55-62,76`）。3）action `status` 先 `modelRuntime.refresh({allowNetwork:false})`，`aborted` 或 `errors.has('claude-code')` 则抛 `Claude Code status refresh failed`，再 `getClaudeStatus(claudeCodeEnv())`（`server.ts:81-94`）。4）浏览器每次拿到 data 就 `refreshModels()`，让登录/登出即时反映到 picker（`web.tsx:11-14`）。5）关闭时若有活跃流，等 `Promise.allSettled` 后再 `closeClaudeProcesses()`，避免把 harness 挂起变成错误（`server.ts:43-54`）。

**失败与恢复**：status 失败在面板显示 `Status check failed` 与重试按钮；不可读的 CLI 状态被上游当作"未确认登录"；`closing` 期间的新请求直接抛 `Claude Code provider is closing`；用户取消不重放，durable 重开会重放未完成请求（README 语义）。无新增重试分类。

**关掉它会发生什么**：provider 反注册、模型从 picker 消失，但**不杀正在进行的请求**（facet 关闭只反注册）；panel 与命令消失；CLI 本身不受影响。

**复刻要点**：provider 必须是进程级 host resource，facet 只是引用计数；`stream`/`streamSimple` 都要包，否则 warm worker 清理时漏流；不要复制上游的 OAuth login。

**证据**：`extensions/claude-code/server.ts:13-26,28-78,80-95`；`refs.ts:5-13`；`web.tsx:7-72,74-93`。

#### 2.8 fast

**职责与用户可见行为**：当选中 `openai-codex/` 或 `openai/` 模型时，composer 工具栏出现 **fast** 开关；开启即把该模型加入用户 `fastModels`，对所有该模型的请求生效（不只当前会话）；项目设置决定列表时开关禁用并提示 `Fast models are set by project settings`（`web.tsx:7-47`）。

**导出与契约**：`StatusAction`（`fast`/`status`）→ `{models, project}`；`SetAction`（`fast`/`set`）`{model,on}` → 新状态（`refs.ts:5-13`）。`FAST_PROVIDERS = ['openai-codex','openai']`、`fastModels()`、`fastStream()` 均导出（`server.ts:27,48-54,109-129`）。设置键 `fastModels`（`"provider/id"` 数组，项目覆盖用户）。

**状态与持久化**：只写 `~/.ultimate/settings.json` 的 `fastModels`；项目设置永不写（`server.ts:84-102`）。`host.resource('fast.sessions')` 保存"定义 `fast: true` 的会话的 provider sessionId"集合（上限 10 000，超出删最早），跨 facet 重载共享（`server.ts:142-143,177-181`）。`reported` Set 让非法配置只 notice 一次（`server.ts:24,62-67`）。

**UI 位置**：`composer.toolbar`，`order: 1`（`web.tsx:49-51`）；监听浏览器事件 `fast:changed` 自行刷新（不是 durable 事件）。

**关键流程**：1）`fastSetting()` 读项目设置，若有 `fastModels` 键则项目优先，否则用户设置（`server.ts:34-42`）。2）`listedModels()` 校验每个条目都以两个 provider 开头，否则整体关闭并 notice（`server.ts:56-68`）。3）`fastModels()` 在有 preview 时追加 preview 的模型（`server.ts:48-54`）。4）`fastStream` 用 `lazyStream` 延迟到请求时才判断：sessionId 在集合里或模型在列表里，就给 `onPayload` 注入 `service_tier:'priority'`，其余原样透传（`server.ts:109-129`）。5）`beforeRequest` 钩子：读 `ProviderDoc` 的 `sessionId`、`AgentDoc` 的模型，模型属 OpenAI 时取 `Profile.definition` 否则 `host.metadata` 的 label，再 `discoverAgents` 找该定义当前的 `fast`，据此增删 session 集合（`server.ts:154-183`）。

**失败与恢复**：非法 `fastModels` 只告警并整体关闭；`set` 在项目接管时抛错；非 OpenAI 模型的 `fast: true` 被忽略；API key 与 ChatGPT 登录都接受 `priority`（ChatGPT 拒绝文档里的 `fast`）。

**关掉它会发生什么**：两个 provider 的 overlay 反注册（最后一个 facet 关闭时），所有请求回到标准层；`fast` 开关消失，`fastModels` 留在设置里但无人读；`fast: true` 的定义不再加速。

**复刻要点**：必须在 `onPayload` 里注入而不是 `streamSimple` 选项（pi-ai 会丢 `serviceTier`，`server.ts:120`）；`lazyStream` 保证每次请求重新读列表；`beforeRequest` 要按定义**当前**的 `fast` 判断，而不是建会话时。

**证据**：`extensions/fast/server.ts:24-42,48-73,75-103,109-129,131-186`；`refs.ts:5-13`；`web.tsx:7-51`。

#### 2.9 sounds

**职责与用户可见行为**：只对 @ultimate（主 standing agent）发声：它发给用户且 `reply` 的 `message` → **Needs input**；非 reply 的 `message` 或对用户输入的答复 → **Finished**；`runState === 'error'` → **Failed**。分支、worker、lander、其他 standing agent、landing、`internalInput` 一律不响（`cues.ts:27-40`）。状态行 `sounds` 打开开关（总开关 + 每音效复选框 + 试听），底部注明 "For @ultimate only"（`web.tsx:65-124`）。

**导出与契约**：无 server、无 API、无 action、无事件。浏览器侧 `ui.tsx` 导出 `playNotes(notes, volume=0.18)` 与 `Note` 供 voice-live 复用（`ui.tsx:2-3`）。设置键是 UI state `ext.sounds.muted`（布尔）与 `ext.sounds.off`（`Sound[]`），由 `useExtensionUiState` 生成（`web.tsx:16-20`）。`Sound = 'input'|'finished'|'failed'`。

**状态与持久化**：`localStorage['ultimate.sounds.played']` 保留最近 100 个已播 `key`（`web.tsx:14,26-35`）；其余为 durable UI state。无文档。

**UI 位置**：`overlay`（无渲染的 `Player`）+ `statusline.right`（`Control`，`order:-1`）（`web.tsx:126-128`）。

**关键流程**：1）`Player` 读根会话（id 1）的 `OverviewDoc`、`MessagesDoc`、`StandingDoc.ultimate`（`web.tsx:41-46`）。2）`listener()` 首次只把当前所有 cue 记为"已听过"，之后只返回新增 key，保证"打开页面时已有的不响"（`cues.ts:46-58`）。3）`announce` 先查 `navigator.userActivation.hasBeenActive`，无用户激活的标签页直接放弃，让别的标签播（`web.tsx:26-35`）。4）在 `navigator.locks.request('ultimate.sounds.played')` 内查/写 localStorage，抢到才 `play`。5）`tones.ts` 用 Web Audio 合成：每个音 3 个 partial（1/0.12/0.04），指数衰减，`playNotes` 懒建 `AudioContext` 并在 suspended 时 `resume`（`tones.ts:36-62`）。

**失败与恢复**：`announce`/`preview` 的 rejection 只 `console.warn`；播放被浏览器拒绝时静默；`AudioContext` 单例复用。

**关掉它会发生什么**：状态行入口与 `Player` 消失，`playNotes` 对 voice-live 也不可用（voice-live 的音效随之静默，但 voice-live 仍工作）；`ext.sounds.*` 保留。

**复刻要点**：三重去重（内存 `heard`、localStorage key、Web Lock）缺一都会多标签重复播；只认根会话文档，别用通知或事件流，否则分支的动静也会响。

**证据**：`extensions/sounds/web.tsx:14-35,41-62,65-128`；`cues.ts:3-58`；`tones.ts:7-62`；`ui.tsx:2-3`；`extensions/conversations/types.ts:30-34`。

#### 2.10 splash

**职责与用户可见行为**：启动时全窗遮罩，WebGL 闪电按 ULTIMATE 轮廓从左到右描出字标，扫完从中爆发涟漪/弧光，再稳定为电流轮廓；仍在加载则在字下画一条细线。ready 后 240 ms 内收束并淡入应用，最短 0.7 s（reduced motion 0.4 s）。首启（onboarding `StatusAction.firstRun`）以 0.8 倍速播签名版并交给 onboarding 页面；无 WebGL2 或 `prefers-reduced-motion` 只显示实心字标；`navigator.webdriver`（agent 的 browser/screenshot）不播；8 s 未 ready 由核心放行，`Late` 提示列出 `pending`/`failed`（`web.tsx:9,98-107,336-442`）。

**导出与契约**：无 server、无 API/actions/events/settings；入口 `slots.overlay`（`web.tsx:444`）；`Electric` 与 `ElectricProps` 由 `electric.tsx:569-607` 导出；依赖 onboarding 的 `StatusAction`（`web.tsx:5`）。

**状态与持久化**：无。`?splash` 排练并可点击重播，`?splash=first` 播首启版（`web.tsx:322-333`）。

**UI 位置**：`overlay`；`role="progressbar"`、`aria-label="Loading Ultimate"`、`aria-busy`、`aria-live="polite"`，遮罩 `z-[60]`，绘制层 `aria-hidden`。

**关键流程**：1）`useReady()` 给 `{ready,timedOut,pending,failed}`；挂载时已 ready、`resumed`（重载保留旧视图）或 `navigator.webdriver` 则直接 `gone`（`web.tsx:337-343`）。2）`shield()` 抢焦点并在 capture 阶段吞掉所有 key（F5/Ctrl+R 除外），释放时把焦点还给应用（`web.tsx:292-316`）。3）`play()` 用 `[data-sweep]` 隐形动画当时钟，`level()` 算 `reveal`/`presence`/`bursts` 供 `Lightning` 每帧读取（`web.tsx:139-212,46-69`）。4）`reveal()` 等最短时长，`hurry()` 把剩余动画加速到 240 ms，`handOver()` 去掉 `pointer-events` 并 `release()`，再按 still/signature/普通三种退场（`web.tsx:220-272`）。5）`signature()` 把 intro 降速到 0.8（`web.tsx:348-367`）。6）`Electric` 用 ogl 建 WebGL2 渲染器，把 SVG 栅格化成场，`uPresence/uSweep/uHead/uPulse` 驱动闪电与爆发（`electric.tsx:607-831`）。

**失败与恢复**：无 WebGL2 自动退回实心字标；动画异常 `store.notify` 后直接 `setGone(true)`；`document.hidden` 跳过表演直接交接（`web.tsx:369-380,232-236`）。

**关掉它会发生什么**：无启动遮罩，应用直接出现；`Late` 的未就绪提示与 `?splash` 排练消失（核心仍会在 8 s 后放行应用）。

**复刻要点**：shell 必须"ready 前不渲染应用"，否则晚到的遮罩会闪出应用；焦点盾与 `pointer-events` 要在淡出前交接；字标轮廓是数据（`letters`+`view`），不是字体运行时。

**证据**：`extensions/splash/web.tsx:9,16-40,46-107,139-275,277-316,322-343,348-404,414-444`；`electric.tsx:569-607,613-677`；`web/src/sdk/hooks.ts:40-46`。

### 3. 跨扩展协作

- **cloud → pause / secrets / tailscale / dream**：`host.want(PauseApi)?.paused()` 阻止暂停期间备份（`cloud/server.ts:73`）；`host.need(SecretsApi).set` 只在 Join 里写 secret（`cloud/server.ts:182-192`）；`TailscaleApi.status().url` 作为提交的 `tailnet`（`cloud/server.ts:109,118`）；Dream 通过 `CloudApi.status()` 判定 `on` 后 `backup()`，其它状态写 `skipped` 文案（`dream/server.ts:364-372`）。备份进度通过 `cloud.backup` 事件进 System stream。
- **tailscale → instance / setup / cloud / system**：`instance` 用 `TailscaleApi.status().url` 的 hostname 加 `~/.ultimate/tailscale.json` 的端口拼出每个 preview 的 tailnet 地址（`instance/server.ts:195-205`）；`setup` 把 `state==='ready'` 报成 "published on the tailnet"（`setup/server.ts:228-233`）；`access.allow` 注册的 origin 进入 `system.access.origins`；cloud 的 `tailnet` 与浏览器指示器则经 `TailscaleApi`/`status` 读取。
- **voice-live → subagents / messages / lineage / conversations / sounds / sidebar / side-chat**：`SubagentsApi.standing('voice')` 创建并取回 Voice 会话（`voice-live/server.ts:413`）；`MessagesApi.answer` + `Messages`/`Question` 回答 @ultimate 的开放问题（`server.ts:238-270`）；`LineageApi.memoryBrief` 组 brief（`brief.ts:122`）；`ConversationsApi.concluded` 过滤已 conclude 分支（`brief.ts:102`）；`sounds/ui.tsx` 的 `playNotes` 播连接/就绪/暂停/结束音（`live.tsx:8,55-73`）；`UnderUltimate`/`Unlisted` 提供侧栏行与隐藏（`web.tsx:1400`）；`SideChatsDoc` 与 Voice 前推互斥（`web.tsx:379-393`）。
- **voice ↔ voice-live ↔ secrets**：两者都以 `OPENAI_API_KEY` 为唯一凭据、都排除 OAuth（`voice/server.ts:24-31`；`voice-live/server.ts:36-44`）；两者都用浏览器事件 `secrets:open` 定位到该行，并监听 `secrets:changed` 刷新 `status`。
- **fast ← subagents / agent 元数据**：`Profile` doc 给出子代理、自动化、standing agent 运行的定义名，`host.metadata` 的 `label` 覆盖 branch 与 lander；`discoverAgents` 读当前定义（`fast/server.ts:154-183`）。`voice.md` 的 `fast: true` 因此让 Voice 走优先层。
- **browser → web SDK**：`send`/`until` 依赖 `window.ultimate`（`web/src/sdk/test-hook.ts`）与 `sessionStorage['ultimate.driven']`；`until` 的 `{event,where}` 匹配各扩展 `defineEvent` 的数据字段（`browser/README.md:9-11`）。
- **claude-code → models**：`host.modelRuntime.registerNativeProvider/refresh` 与浏览器 `refreshModels()` 让 model picker 在登录变化后无需刷新页面（`claude-code/server.ts:76,83`；`web.tsx:11-14`）。
- **splash ← onboarding / web core**：`StatusAction` 决定首启签名版；`useReady`/`resumed` 由 core registry 提供（`web/src/sdk/hooks.ts:40-46`；`web/src/sdk/resume.ts:22`）。
- **parallel ← secrets**：只有 `secrets` 扩展启用且无错误时才读 secret store，否则统一报缺 key（`parallel/server.ts:34-55`）。

### 4. 复刻顺序建议与风险

**顺序**（按依赖与风险递增）：

1. `fast`：只碰 modelRuntime 与设置，能先验证 provider overlay / `beforeRequest` / `discoverAgents` 三条底座。
2. `sounds`：纯浏览器，验证 `useDocOf`、根会话文档与 Web Lock 去重。
3. `splash`：验证 `useReady`/`resumed`/shell 启动时序与 overlay 槽。
4. `voice`：最小 action + secret + 媒体录制闭环，为 voice-live 打样。
5. `claude-code`：验证 host resource、facet 引用计数、native provider 生命周期。
6. `parallel`：验证 tool `details` 契约、输出截断、secret 优先级与 UI 渲染器。
7. `browser`：最大的是浏览器生命周期与超时，依赖 `window.ultimate` hook。
8. `tailscale`：端口登记表、Serve 映射、`access.allow` 与核心准入规则必须一起做。
9. `cloud`：加密、分块、父子链与 Worker 409 语义，最容易被"看起来能备份"骗过。
10. `voice-live`：跨 6 个扩展、WebRTC + durable task + 幂等，最后做。

**风险**：

- **加密与完整性**：`snapshot.ts` 的 AAD 只覆盖 `id:kind:index:last`，不含 `key`；跨项目防护靠 `cipherKey` 的 HKDF salt（project key）与 manifest 的 `key` 校验（`snapshot.ts:123-124,165-170`）。复刻时若把 salt 写成常量，另一个项目的密文就能互解。
- **父链与 409**：`backup.ts:121-156` 的两条"自己的 409"分支极易漏；漏掉会把"Worker 已登记但应答 500"误报成冲突，或把重试当成功之外的新备份。
- **恢复路径**：`downloadSnapshot` 在写任何文件前拒绝 `root` 不一致（`snapshot.ts:125-128`），因为会话/worktree 存绝对路径；复刻若省掉会在另一台机器产生不可用历史。
- **Tailscale 准入**：安全不靠扩展本身，而靠核心 `server/request-security.ts:39-58` 的 Forwarded/Origin/`Sec-Fetch-Site` 规则 + Serve 的 identity 头；只做 Serve 映射而不接 `access.allow` 等于把 UI 暴露给整个 tailnet。
- **端口登记表并发**：`withRegistry` 的 pid 锁、owner token、`temporary` 语义三者缺一，就会出现"旧实例关闭删掉新实例映射"或"preview 抢走正式地址"。
- **voice-live 幂等**：`Forwarded.scheduled` + `createTask` 同事务（`server.ts:658-672`）、`voice:answer:<line>`、`voice:line:<request>`、`voice:say:<taskId>` 任一缺失都会在 task 重放时重复转发/重复说话；`re` 必须从工具轮前的输入反查，不能用模型给的 id。
- **voice 文档漂移**：README 说录音 10 分钟自动停，代码是 5 分钟（`voice/web.tsx:19`）。复刻与验收以代码为准；同理 cloud 的 "next start on" 偏保守（推断）——`cloudConfig` 与 `readSecret` 每次调用都重读磁盘（`lib/cloud.ts:23-40`；`lib/secrets.ts:53-56`），实际无需重启。
- **browser 的 `eval` 与取消**：Playwright 的 `evaluate` 无超时，必须自己 `Promise.race`（`server.ts:99-108`）；取消时若只关 context 不处理 wedge，会永久占住共享 browser。
- **splash 的时序**：`minimum` 与 `hurry` 必须由 shell 的"ready 前不渲染应用"配合，否则遮罩晚到会闪一下应用；`shield` 的焦点归还若丢失，桌面端键盘会卡在 overlay 上。
- **fast 的 payload 注入点**：pi-ai 的 simple stream options 会丢 `serviceTier`，必须走 `onPayload` 且在调用方 hook 之后合并（`fast/server.ts:120-127`），否则"看起来设置了"但请求仍是标准层。

---

## A.9 self 扩展分析笔记

### 1. 概览

`self` 让 Ultimate 意识到"自己正在运行哪份代码"：提供 replay-safe 的 `restart` 工具请求核心热替换，渲染重启结果、构建信息与 transcript 重载标记，并在状态行提示"core changed · restart"。它不是 core-tier（无 `api.ts`/`tier`），但依赖 `workspaces`（`host.need(WorkspacesApi)`），因此 workspaces 必须存在。

### 2. 规格

#### 2.1 职责与用户可见行为

- Agent 修改 `server/`/`shared/` 后调用 `restart`，Supervisor 做类型检查并启动新 generation；失败则回滚并返回诊断。
- 状态行右侧显示 `core changed · restart`（仅当本进程启动后 `server/` 或 `shared/` 有变更），点击触发重启；失败变 `restart failed`，popover 里给原因。
- 构建信息（build id、core/lib hash、每个扩展 hash、history）可在 UI 中查看。
- Vite 热更新后，状态行上方出现 3 秒的安静 toast，列出被重新执行的模块；Tailwind 样式表仅在无其他变化时单独提示。
- transcript 渲染 `restart` 工具卡与重载标记。

#### 2.2 服务端（`server.ts`）

- `section('self', …)`：向系统提示注入路径与规则：
  - `Project (your work)` = 当前 cwd；`Host project`；`Ultimate (running host)`；
  - 项目专属扩展/agent/skill/surface 放 `<cwd>/.ultimate/`；
  - 运行中的 host 从 `projectRoot/.ultimate/` 与 `ultimateRoot/extensions/` 加载；
  - 改 `server/`/`shared/` 才 restart；`web/`/`extensions/`/`agents/` 热重载即可；
  - 隔离 workspace 必须先 land 到运行中的 clone。
- `restart` 工具：
  - 参数 `{}`；`replay:'safe'`；原因注释说明目标 generation 在 swap 前 memo 化，重放只报告不重启；
  - 先检查隔离 workspace：`own.source === ultimateRoot` 且 `own.landed` 存在且 clone clean 且 `HEAD === own.landed`，否则拒绝；
  - `memo('restart:<taskId>')` 记录 `{generation, fromGeneration, build}`；
  - 重放时：若当前 generation ≠ 记录的 generation → 说明激活失败被回滚，返回 `rolledBack` 详情；
  - 否则返回成功详情（from/to generation、from/to build）；
  - 首次执行：`host.restart(approved)`，`approved` 里写 memo，等待 supervisor 结果。

#### 2.3 浏览器（`web.tsx`）

- `tools: { restart: RestartCall }`：工具卡显示重启前后 generation/build，失败显示回滚原因。
- `slots['statusline.right']`：
  - `CoreStale`（`phone:true`）：`core changed · restart` / `restart failed`，用 `useRestart()` 的 `busy/error/run`；
  - `Build`（order 1）：build id 与详情 popover（core/lib/扩展 hash、history）。
- `overlay: HotReloaded`：监听 Vite HMR 事件，3 秒 toast。
- 重启后的 transcript 重载标记来自 `prompt` 扩展的 `prompt.build` entry（`self` 只负责工具卡与状态）。

#### 2.4 依赖与协作

- `WorkspacesApi`：`need`（隔离 workspace 的 source/landed 校验、git 状态）。
- `host.restart`：核心能力，通向 `server/supervisor-protocol.ts` 的 `requestSwap`。
- `prompt`：构建变化说明（`prompt.build` entry）。
- `status-line`：同在 `statusline.right`，发现顺序让 `self` 排在 `live · gen N` 左侧。

#### 2.5 失败与恢复

- `pnpm dev`（无 supervisor）：`host.restart` 返回 "Restart requires pnpm start"，工具报错。
- 类型检查失败：不启动新 core，工具返回错误与 tsc 输出尾部。
- 激活失败：旧 core reacquire，系统信息带 `activationError`；重放的工具调用报告 `rolledBack`。
- workspace 未 landing：拒绝并提示先 land。

#### 2.6 关掉它

非 core，可禁用；禁用后没有 `restart` 工具（agent 无法请求热替换）、状态行没有 core 陈旧提示、没有构建详情与 HMR toast；热替换仍可由 `POST /api/restart` 触发。

#### 2.7 复刻要点

- `replay:'safe'` 必须有 memo：否则重启后重放会再次触发 swap（无限重启）。
- 隔离 workspace 的四个校验（source/landed/clean/HEAD）缺一不可。
- 状态行提示依赖 `system.code.coreStale`（`server/system.ts` 在 `server/`/`shared/` 变更时置位）。
- HMR toast 去重/合并，避免每个模块一条。

#### 2.8 证据

`extensions/self/README.md:1-10`；`server.ts:1-200`（section、restart 工具、memo、workspace 校验）；`web.tsx:40-102`（RestartCall）、`102-179`（CoreStale）、`179-261`（Build）、`261-356`（HotReloaded）、`357-367`（contributions）。

---
