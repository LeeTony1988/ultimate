# Core 原语组（prompt / coding-tools / documents / notices / secrets / theme / agent）分析笔记

## 1. 概览

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

## 2. 逐扩展规格

### 2.1 prompt

**职责与用户可见行为。** 它负责两件事：一是把 Ultimate 的身份、原则、自我认知、工具指引、项目上下文（`AGENTS.md` 等）、技能列表、被关闭的 building blocks、环境与 cwd 组成系统提示词；二是在运行的首个输入上按需附一条 `prompt.build` 备注，告诉模型"构建变了、你的指令重放了、Ultimate 的文档改了、期间落地了哪些分支"。用户可见的是转录里一条安静分隔线：`↻ Reloaded · <branch> #N · …`，否则 `↻ Reloaded · build a → b` 或 `↻ Instructions changed · …`，悬停显示完整文本（`extensions/prompt/web.tsx:38-68`）。@ultimate 的定义文件变更会在 `beforeInput` 里被重新 `configure`，因此手打输入也能拿到最新的 `agents/ultimate.md`。

**导出与契约。** `server.ts` 导出 `order = -100`（使本扩展的 section 排在其他扩展之前）、`docs = [SeenBuild]`、`buildNote(build, seen, landed)`、`landings(cwd, from, to, conversations)`、`instructionNote(changes)`、default `prompt(host)`。`refs.ts` 导出 `Landing`（`conversation?`、`title`、`sha`）与 `BuildNote`（`from?`、`to?`、`landed?`、`instructions?`、`docs?`）。浏览器 default 注册 `entries: { 'prompt.build': Note }`。**tools：无；actions：无；events/reactors：无；apis provided：无；needed：无**（运行时只导入 subagents 的 `Standing` 文档 token，`server.ts:22,151`）。**settings keys：无**（仅在 `building_blocks` 里向 agent 描述 `extensions.enable` 与两个 settings.json 路径）。

**状态与持久化。** 唯一文档 `prompt.build`：`scope: 'conversation'`、`history: 'latest'`、`fork: 'current'`、`checkpointWhen: () => false`、`initial: () => ({})`，值 `{ id?, head?, files? }`（`server.ts:31-39`）。`id` 是本进程 build id；`head` 是 clone 的 `HEAD`；`files` 是路径→sha256 前 16 位（`digest`，`server.ts:106`）。没有 SQLite 或自有文件；保留策略由文档语义决定（只留最新值）。

**UI 位置。** 仅 entry 渲染器，无 slot/panel/surface/command/status item；`named = 2`，最多点名两个 landing，其余折叠成 `+N more`（`web.tsx:10,57-63`）。

**关键流程。** 1) `GenerationTask.beforeInput` 取 `host.build()` 与 `SeenBuild`（`server.ts:218-224`）。2) `instructionChanges`：若 `Standing['ultimate']`（根会话文档）不等于本会话则跳过；否则 `discoverAgents` 找 `ultimate`，若 `AgentDoc.instructions` 与定义不同则 `configure(tx, conversationId, { instructions })`；随后给 `cloneDocs`（`AGENTS.md`、`docs/*.md`、`agents/*.md`）、`loadProjectContextFiles({ cwd: projectRoot, agentDir: ~/.ultimate })`、定义自身与 overlays 计算哈希；首轮只记录，之后比较新增/修改/删除（`server.ts:144-197`）。3) build 变化时用 `landings()`：`git log --first-parent -n 200`，从 `Ultimate-Conversation` trailer 或 subject 的 `from #N` 得 conversation，沿 `parentConversationId` 归并到 owner 分支，按分支去重，标题取 `shortTitle`，否则用 subject（`server.ts:68-104`）。4) 拼 `Build changed: <old> → <new> · generation N · changed: … · landed: …` 与 `instructionNote`，作为 `kind: 'prompt.build'` 的 entry 返回，`model` 是一条 user 文本（`server.ts:242-260`）。5) 浏览器 `Note` 读 `entry.data` 渲染分隔线，hover 用 `entry.model[0].content`。

**失败与恢复。** `git rev-parse` 失败（不在 Git 仓库）时没有 head，也就没有 landings；`landings` 失败被 `.catch(() => [])` 吞掉（历史被改写时旧 commit 不在 clone）；被删文件以空串哈希计为 changed 并显示 `(removed)`；`seen` 已不在 20 条 build history 内则 `since < 0`，不列 changed；新会话首轮静默；fork 继承父文档（`fork: 'current'`）。指令重放只对主 agent，其他 agent 保持启动时的指令。

**关掉它会发生什么。** core 层不可被设置关闭。若移除或加载失败：没有身份/原则/工具指引/项目上下文/技能/环境/cwd 这些 section，没有 build 与 instructions 提示，@ultimate 的定义热更新不再对手打输入生效（Messages delivery 仍会刷新，推断）。

**复刻要点。** 系统提示词必须跨构建稳定，否则每次热重载都会重写整个 prompt cache——这正是"变更放输入 entry、不放 section"的原因；`prompt.build` 既是 entry kind 又是文档 kind，二者同名但不是同一物；哈希键用绝对路径，才能把项目的 `AGENTS.md` 与 clone 的分开；landing 归并靠 `parentConversationId` 链，不是靠分支名；`order = -100` 是扩展安装排序，不是 section 内排序。

**证据。** `README.md:1-23`；`api.ts:2`；`refs.ts:4-20`；`server.ts:25`（order）、`31-40`（文档）、`46-61`（buildNote）、`68-104`（landings）、`109-125`（cloneDocs）、`144-197`（instructionChanges）、`200-209`（instructionNote）、`218-262`（beforeInput）、`264-374`（九个 section）；`web.tsx:10,38-72`。

### 2.2 coding-tools

**职责与用户可见行为。** 注册 Pi Durable 的 `read`、`write`、`edit` 与 shell 工具（Windows 上是 `powershell`，其余 `bash`），并为它们提供转录卡片：read 是带行号的高亮摘录（`SKILL.md` 显示为 skill）、write 显示大小与流式内容、edit 是带新旧行号的 unified diff、shell 是带流式输出/退出状态/耗时的终端卡。每次 shell 调用都用进程内 Git 配置注入 hook：`prepare-commit-msg` 写入 `Ultimate-Conversation: <id>` trailer，`post-commit`/`post-applypatch`/`post-merge`/`post-rewrite` 把提交记到本次调用的临时日志，调用结束（即使失败或超时）解析日志并发出 `coding-tools.committed` 事件。shell 卡可取消；`interruptible: true` 的等待命令会被排队中的 steer 提前结束。

**导出与契约。** `refs.ts`：`CancelledDoc`（`docRef('coding-tools.cancelled')`）、`CancelAction`（`actionRef('coding-tools','cancel')`，`{ callId } → null`）、`Committed`（事件 `coding-tools.committed`，字段 `conversation`、`sha`、`parents`、`repo`、`worktree?`、`branch?`、`subject`、`rewrittenFrom?`）。`api.ts` re-export `Committed` 并声明 `tier = 'core'`；`ui.tsx` 同样 re-export 给其他扩展的浏览器代码。`server.ts` 导出 `prepareBash(execution, api, log?)`、`changes(command)`、`docs = [Cancelled]`、`userActions = ['cancel']`、`actions = { cancel }`、default `codingTools(host)`。**tools：** `createReadTool()`、`createWriteTool()`、`editTool()`（在 Pi 描述后追加两条恢复提示）、`shellCall`（Pi shell 工具 + `interruptible` 布尔参数）。**actions：** 仅 `cancel`（user-only）。**docs：** `coding-tools.cancelled`。**events：** `Committed`。**reactors：无；apis provided/needed：无；settings keys：无**（读环境变量 `ULTIMATE_BASH_TIMEOUT`，默认 600 秒）。

**状态与持久化。** `Cancelled` 文档：`{ calls: Record<callId, number> }`，conversation scope、`history: 'latest'`、`fork: 'initial'`、`checkpointWhen: () => false`（`server.ts:106-115`）。提交事件是持久事件日志的一部分；临时 hook 日志在 `tmpdir()` 下每调用一个 `ultimate-commits-<uuid>.log`，结束即删。取消标记不在调用结束时自删，而由下一次 cancel 清掉已结束的条目（`server.ts:200-203`）。

**UI 位置。** 无 panel/surface/command；`tools` 注册 `read`、`write`、`edit`、`bash`、`powershell`，`toolLines` 注册同名短行（`web.tsx:491-500`）。shell 卡头的 `×` 只在 `running` 时出现（`CancelCall`，`web.tsx:370`）。

**关键流程。** 1) 调用 `shellCall.execute`：先校验 `interruptible` 命令不含变更动作（`changes()` 识别 `git push|commit|merge` 与独立的 `install`/`migrate` 词），否则直接抛错要求拆分。2) 生成临时日志，用 `shell.create({ prepare })` 注入 hook 环境（`GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`，键 `hook.ultimate-<event>.event|command`），再执行。3) `untilStopped`：确保 `Cancelled` 文档存在，`watchDoc` 它；`interruptible` 时同时 watch `InboxDoc`；用 `withCancel` 包住执行。4) 取消或 steer 命中时 `cancel(Error)`，捕获后返回 `retainedOutput` + 末行 `[Cancelled by the user after 5m 09s; …]` 或 `[Interrupted by a steering message after Ns; …]`，`exitCode: 130`，调用本身算成功。5) `finally` 里 `madeCommits` 解析日志：只认 `commit`/真实 `merge`（ORIG_HEAD 是合并前 HEAD，排除 fast-forward 与 squash），`rewrite` 只给同次调用里已记录的 commit 补 `rewrittenFrom`；按 git common dir 分组，用 `git log --no-walk=unsorted` 补 parents/subject，逐个 `host.emit(tx, Committed, …)`。6) 浏览器侧 `edit` 优先 `details.patch`（`parsePatch`），否则 `details.diff`（`parseDisplayDiff`），流式时用 `editRows(args.edits)`。

**失败与恢复。** 每个 hook 命令以 `|| true` 结尾，绝不使提交失败；事件在命令结束后、工具结果结算前单独提交，提交失败只 `console.error`，命令结果照常返回；提交与事件之间崩溃会丢事件但 trailer 仍在；取消不存在的调用抛 `That shell call is not running`；重启会终止运行中的调用，Pi 将其恢复为 interrupted；未显式 `timeout` 时 wrapper 注入默认值，并把 Pi 的 `Command timed out after … seconds` 改写成 `Tripwire: … Pass timeout for longer commands.`；`ULTIMATE_BASH_TIMEOUT` 非正或非有限会抛错。

**关掉它会发生什么。** 没有 read/write/edit/shell 工具，agent 无法读写文件或执行命令；没有 shell 卡及其取消按钮；没有 `coding-tools.committed` 事件与 trailer，lineage 的 rewind 与侧栏的提交刷新失去来源；`coding-tools.cancelled` 文档不再导出。

**复刻要点。** 提交记录必须走"每次调用独立日志 + 结束统一收取"，不能用仓库里的 hook 文件（会污染用户仓库）；事件要在工具结果之后单独提交，才能带 trace 且不受结果结算影响；`merge` 判定要用 ORIG_HEAD 与 parents[0] 双条件；`branch` 在 rebase 的 detached HEAD 下必须缺省；取消标记要持久化，否则扩展重载后取消不到旧调用；`interruptible` 必须在工具 schema 里并从传给基础工具的 args 中剥离。

**证据。** `README.md:1-31`；`refs.ts:6-28`；`api.ts:2`；`ui.tsx:2`；`server.ts:33-46`（edit 描述与默认超时）、`57-86`（hooks/prepareBash）、`89-100`（changes）、`106-115`（Cancelled）、`133-182`（untilStopped）、`184-207`（cancel）、`222-280`（madeCommits）、`282-326`（shellCall）、`327-350`（tools/wraps）；`web.tsx:48-51,53-116,134-232,234-247,259-298,301-323,325-443,491-500`；`bash-command.tsx:4-28,114-175`；`diff.tsx:5-61,77-142`。

### 2.3 documents

**职责与用户可见行为。** 右侧面板新增 Documents 标签：列出当前会话里所有服务端 facet 通过 `docs` 导出的文档 kind。注册了渲染器的 kind 排在前面、默认展开，用扩展给的标题与图标；其余按 kind 名排序、显示为 JSON 树并默认折叠。每个渲染器包在 `ExtensionBoundary` 里，渲染器抛错只坏它自己，下方仍显示 JSON。它不编辑任何文档。

**导出与契约。** 只有 default web 扩展：`panels`（`id: 'documents'`、`title: 'Documents'`、`icon: FileStackIcon`、`order: 4`）与 `commands`（`documents.open`，标题 `Show the conversation's documents`，`context.openPanel('documents')`）。`api.ts` 仅 `tier = 'core'`。**tools/actions/docs/events/reactors/apis/settings keys：全无**（纯读）。

**状态与持久化。** 不写业务文档，只把每个 kind 的折叠状态存进扩展 UI state：`useExtensionUiState<Record<string, boolean>>('open', {})`，落为 `ext.documents.open`（`web.tsx:89`）。文档本身由各扩展的 `docs` 定义，服务端在 SSE 订阅时用 `tx.doc(token, id)` 创建缺失文档的初值（`server/api.ts:284-286`），所以面板打开即"物化"所有 kind。

**UI 位置。** 右栏 panel `documents`（order 4）；命令 `documents.open`；无 slot/surface/status item。

**关键流程。** 1) `useSystem()` 取 `system.extensions`，flatMap 出 `{ kind, owner }`；`useDocumentRenderers()` 得 kind→renderer（后者胜）。2) 排序：有渲染器优先，其次 `kind.localeCompare`。3) 每个 kind 一个 `Document`，`useDocKind(kind)` 订阅；`value` 未到或没有会话时渲染 `null`。4) 展开状态取 `folds[kind] ?? renderers.has(kind)`。5) 有渲染器则 `<ExtensionBoundary extension={renderer.extension} fallback={<Json/>} key={renderer.extension} version={renderer.version}>`，否则 `<JsonTree open={1}/>`；空对象显示 `empty`。6) 头部右侧：有渲染器显示 kind，否则显示 owner。

**失败与恢复。** 未知 kind 由服务端发 `Unknown extension document: <kind>` warning notice（`server/api.ts:308-309`）；渲染器抛错由 `ExtensionBoundary` 显示错误卡并回退 JSON，其他文档不受影响；`system` 尚未到达时列表为空且不显示空态文案。

**关掉它会发生什么。** 面板与 `documents.open` 命令消失；文档仍然存在并可被各自的 UI 读取，但用户失去统一查看入口。

**复刻要点。** kind 列表来自 `system.extensions[].server.docs` 而不是前端注册表，因此新扩展只要导出 `docs` 就自动出现；排序必须"有渲染器优先"；折叠状态要用 `useExtensionUiState` 而不是 `useState`；`ExtensionBoundary` 要传 `extension`（同时作 key）与 facet 的 `version`，热重载后按新版本重挂载。

**证据。** `README.md:1-3`；`api.ts:2`；`web.tsx:17-21,27-78,84-133,135-152`；`server/api.ts:284-286,308-309`。

### 2.4 notices

**职责与用户可见行为。** 把服务端 `notice` 事件（对话刷新失败、未知文档等）和浏览器自己 `notify` 的提示（命令失败、UI 状态保存失败）显示为 header 下方居中的小 toast，不遮挡侧栏或右栏。info 5 秒、warning 9 秒、error 15 秒后淡出；悬停时全部保留；每条可手动关闭；同时最多显示最后四条。

**导出与契约。** 只有 default web 扩展：`slots: { overlay: Toasts }`。`api.ts` 仅 `tier = 'core'`。**tools/actions/docs/events/reactors/apis/settings keys：全无**；消费 SDK 的 `useNotices()` 与 `Notice` 类型（`shared/protocol.ts:164-167`）。

**状态与持久化。** 无持久化。`dismissed` 是组件内 `Set<number>`，`hovered` 是布尔；notice 本体在浏览器 store 里最多留 50 条（`web/src/sdk/store.ts:200-206`），重载即失。

**UI 位置。** `overlay` slot；`role="status"`，`fixed top-12 left-1/2 z-40 w-80`，`divide-y` 列表，error/warning 有浅色底。

**关键流程。** 1) store 收到 SSE `notice` 或 `notify()` 调用，追加 `{...Notice, id: ++noticeId, at: Date.now()}`并裁到 50 条。2) `Toasts` 用 `useNotices()` 读取；`live` 表示尚有未过期者，`useNow(500, live && !hovered)` 只在需要时每 500ms 重算。3) 过滤：未被 dismiss 且（悬停中或 `now - at < lifetime[level]`）。4) `slice(-4)` 取最后四条渲染；图标与色调按 level 映射；关闭按钮写 `dismissed`。

**失败与恢复。** 没有服务端确认或重试；notice 仅存在于当前标签页，刷新丢失。

**关掉它会发生什么。** 服务端与浏览器提示都不可见；store 仍记录，其他 UI 仍可读取，但用户看不到失败反馈（包括 surface 崩溃提示）。

**复刻要点。** 用 `overlay` 而不是 `statusline`，才能浮在 header 下且不挤布局；计时只在有 live notice 且未悬停时启动，避免每 500ms 空转；`slice(-4)` 在过滤后取，保证最新四条；dismiss 用 id 而非索引。

**证据。** `README.md:1-3`；`api.ts:2`；`web.tsx:7,15-27,30-61,63`；`web/src/sdk/store.ts:200-206,426-432`。

### 2.5 secrets

**职责与用户可见行为。** 管理用户全局密钥：值存 `~/.ultimate/secrets.json`（POSIX 上 0600、目录 0700；Windows 继承用户 profile ACL），所有项目共享。面板列出"被启用扩展声明"与"已存储"的密钥：名称、描述、`needed by <extensions>`（或 `no enabled extension needs it`）、`Get a key` 链接、`set · 5m ago` 或 `missing`。可以 Add/Replace（密码框、显示切换、Enter 保存、Escape 取消，值只存在组件 state 并在保存后清空）、Delete（先确认，焦点在 Cancel）。结果只含元数据，值从不回传。

**导出与契约。** `api.ts`：`SecretsService = { set(name, value): Promise<Written> }`、`SecretsApi = defineApi<SecretsService>()('secrets')`、`tier = 'core'`；供其他扩展的 user-only 流程写密钥（cloud 已用）。`refs.ts`：`Secret`（`name`、`description?`、`url?`、`declaredBy`、`set`、`updatedAt?`）、`Written`（`name`、`set`、`updatedAt?`）、`ListAction`（`null → Secret[]`）、`SetAction`（`{ name, value } → Written`）、`DeleteAction`（`{ name } → Written`）。`server.ts`：`userActions = ['set', 'delete']`（list 不限制）、`actions = { list, set, delete }`、default 注册 `SecretsApi` 并加 `secrets` prompt section。**tools：无；docs：无；events：无；reactors：无；settings keys：无**（密钥是独立存储，不受项目状态与 `ULTIMATE_HOME` 影响）。

**状态与持久化。** `store.ts` 的 `writeSecret(userHome, name, value?)`：校验名称 `^[A-Z][A-Z0-9_]*$` 与值（非空、≤16 KiB、无 NUL/CR/LF）→ `mkdir ~/.ultimate` 0700 并 `chmod` → `acquireLock('secrets.json.lock', { pid }, 120000)` → `readStore`（`O_NOFOLLOW`，POSIX 拒绝 `mode & 0o077`，逐项校验）→ 写/删 `{ value, updatedAt: ISO }` → `writeJson(..., { mode: 0o600 })`（临时文件 + fsync + 原子 rename）→ 返回 `{ name, set, updatedAt? }`。`lib/secrets.ts` 另有 `readSecret` / `secretMetadata` 供其他 facet 只读。

**UI 位置。** panel `id: 'secrets'`、`title: 'Secrets'`、`icon: KeyRoundIcon`、`order: 9`、`tab: false`（只在被打开时出现在标签行）；command `secrets.panel`（`Secrets…`）；`overlay` slot 放 `Opener`，监听浏览器事件 `secrets:open` 并 `openPanel('secrets')`，把 `{ name }` 暂存到模块级 `requested`，等列表到达后打开该行的编辑态。

**关键流程。** 1) `list`：遍历 `host.extensions()`，跳过未启用或 `server.error` 的；合并 `server.secrets` 声明并累加 `declaredBy`；叠加 `secretMetadata`（`set: true`、`updatedAt`）；按名称排序。2) `set`：UI `api.action(SetAction, { name, value })` → 校验 → `writeSecret` → 清空输入、`events.emit('secrets:changed', { name })`、关闭表单；`delete` 同路径但无 value。3) `useSecrets` 在挂载时读一次，之后在 `system.extensions` 的 name/enabled/server.secrets 签名变化时、和 `secrets:changed` 时重读（`loadedAt` 变化被刻意排除，避免每次热重载全 tab 齐刷）。4) 行状态：`missing()` 统计 `!set && declaredBy.length > 0`，面板头显示 `N missing` 或 `all set`。5) `setup` 的 status-line 在缺密钥时给修复按钮，通过 `secrets:open` 打开对应行。

**失败与恢复。** 名称/值非法、存储权限不安全（提示 `chmod 600 ~/.ultimate/secrets.json`）、JSON 损坏（`Invalid secret store; repair … or remove it`）、锁超时都会以 action 错误显示在面板内联文本里；写入失败保留表单并允许重试；读取时 `ENOENT` 视为空存储。值不会出现在文档、notice、日志或 trace 中。

**关掉它会发生什么。** 面板、`Secrets…` 命令与三个 action 消失，已声明的密钥无法再设置；`SecretsApi` 缺失会让 `host.need(SecretsApi)` 的 cloud 报 `cloud needs secrets, which no enabled extension provides`（扩展诊断）；voice/voice-live/parallel/setup 的 `secrets:open` 没有接收方。

**复刻要点。** 写入必须"锁 + 读 + 原子写"三件套，否则多进程会互相覆盖；文件名与 mode 是契约（0600/0700），POSIX 必须拒绝不安全权限；`list` 要合并"声明"与"已存"两侧，才能显示 missing 与 orphan；面板不要用 `<form>`、字段用 `autoComplete="one-time-code"` 并带 `data-1p-ignore` 等，避免浏览器密码管理器；`userActions` 必须包含 set/delete，防止 agent 通过 codemode 写密钥。

**证据。** `README.md:1-20`；`api.ts:5-11`；`refs.ts:8-27`；`server.ts:10-22,23-66`；`store.ts:9-27`；`lib/secrets.ts:7-63`；`lib/json-file.ts:41-65`；`web.tsx:44-65,90-184,186-233,237-332,334-400,402-422`。

### 2.6 theme

**职责与用户可见行为。** 调色板里的 `Toggle light and dark theme` 命令，把当前浏览器切换到另一套主题。主题是每个浏览器的偏好，不写入项目或会话。

**导出与契约。** 只有 default web 扩展：`commands: [{ id: 'theme.toggle', title: 'Toggle light and dark theme', group: 'Ultimate', run: (context) => context.setTheme(getState().ui.theme === 'dark' ? 'light' : 'dark') }]`。`api.ts` 仅 `tier = 'core'`。**tools/actions/docs/events/reactors/apis/settings keys：全无**。

**状态与持久化。** 无服务端状态。当前主题在 `getState().ui.theme`；`web/src/sdk/client.ts:35` 从 `localStorage['ultimate.theme']` 初始化，`:99-104` 每次变更写回、切换 `document.documentElement.classList.toggle('dark', …)` 并更新 `theme-color` meta。

**UI 位置。** 仅命令（group `Ultimate`），无 panel/surface/slot/status item。

**关键流程。** 读 `getState().ui.theme` 取反 → `context.setTheme(next)` → `store.setUi({ theme })` → client 把 `dark` class 与 `theme-color` meta 应用到 `<html>`，并写回 localStorage，刷新后保持。

**失败与恢复。** 无服务端调用，不存在部分失败。

**关掉它会发生什么。** 调色板里没有主题切换命令；已保存的 `ultimate.theme` 仍会被 client 应用，主题本身照常工作，只是无法从 UI 切换。

**复刻要点。** 主题属于浏览器而不是会话，必须用 localStorage + `dark` class；命令要显式放在 `Ultimate` 组；`setTheme` 是 SDK `UltimateActions` 的契约，不要自己操作 DOM。

**证据。** `README.md:1-2`；`api.ts:2`；`web.tsx:3-12`；`web/src/sdk/client.ts:35,99-104`；`web/src/sdk/actions.ts:139`。

### 2.7 agent

**职责与用户可见行为。** 内置的 Agent surface，也是 home surface：中间一列 `Header` + `Conversation`，左侧 `Sidebar`，右侧 `Panels`，底部 `StatusLine`。它只由 `@/sdk` 原语组成，因此同时是最小的 surface 示例；用户可以把整个文件夹复制到 `~/.ultimate/extensions/agent/` 或项目的 `.ultimate/extensions/agent/` 覆盖它。它还提供四个全局命令：停止运行（`agent.stop`，Escape，输入框里也生效）、压缩上下文（`agent.compact`）、聚焦输入框（`agent.composer`）、回到主会话（`agent.main`）。

**导出与契约。** default web 扩展：`surfaces: [{ id: 'agent', title: 'Agent', icon: MessagesSquareIcon, description: 'The conversation, with panels beside it', component: Agent }]` 与 `commands`（统一 `group: 'Ultimate'`）。`api.ts` 仅 `tier = 'core'`。**tools/actions/docs/events/reactors/apis provided/needed/settings keys：无**；但运行时 import lineage 的 `CompactAction` 与 `getRoots`（`web.tsx:13`），这是它唯一的外部耦合。

**状态与持久化。** 无自有状态。surface id 存在 shell UI state 的 `shell.surface`；会话本身由 core 持久化。

**UI 位置。** surface `agent`（home）；无 panel/slot/status item。命令在任何 surface 都可用（facet 级贡献，不属于 surface）。

**关键流程。** 1) 启动时 `resolveSurface` 在无选择时落到 `HOME = 'agent'`；`surfaceItems` 把 Agent 排第一（`web/src/sdk/registry.ts:386-418`）。2) `Agent` 渲染五个原语。3) `agent.stop`：`when: getConversation(id).busy`，`run: api.abort(context.conversationId)`。4) `agent.compact`：若当前会话是 root（`getRoots()?.includes(id)`）则 `api.action(CompactAction, { id })`（lineage 只接受 tally 并给它 root 的摘要焦点），否则 `api.compact()`。5) `agent.composer`：root 上隐藏，其余 `context.focusComposer()`。6) `agent.main`：`conversationId !== 1` 时 `context.switchConversation(1)`。

**失败与恢复。** surface 抛错由 `SurfaceBoundary` 捕获，回退到列表中的下一个 surface；Agent 自己也失败时渲染 `Frame`（裸 `Header`/`Conversation`/`StatusLine`，`App.tsx:35-43,102-112`），并给 warning notice：`The Agent surface is not installed, so a bare conversation shows.`；命令的 `when` 抛错只会隐藏该命令并上报，不会拖垮调色板（`registry.ts:424-435`）。

**关掉它会发生什么。** 没有 home surface：选择的面板失败或无选择时落到裸 `Frame`，用户仍能对话并求助，但失去侧栏与右栏；四个命令（stop/compact/composer/main）一起消失。

**复刻要点。** surface 组件必须只用 SDK 原语，保证被复制覆盖时仍能编译；`id: 'agent'` 是全局保留 id（`HOME`）；命令要放 `group: 'Ultimate'` 且 `agent.stop` 需要 `whileTyping: true` 才能在输入框里响应 Escape；root 的 compact 必须走 lineage 的 `CompactAction`，否则 tally 语义丢失；`agent.composer` 在 root 上要隐藏。

**证据。** `README.md:1-12`；`api.ts:2`；`web.tsx:15-30,36-67,69-80`；`web/src/sdk/registry.ts:386-418,424-435`；`web/src/app/App.tsx:35-43,102-112,158-169`。

## 3. 跨扩展协作

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

## 4. 复刻顺序建议与风险

**建议顺序。** 1) 先做 `theme` 与 `notices`（纯浏览器、零依赖），验证命令/overlay/slot 注册链路；2) 做 `documents`（只读 system info 与文档流），确认 `useDocKind` 的"订阅即创建"语义；3) 做 `secrets`（actions + store + panel + overlay 事件），因为其他扩展会通过 `SecretsApi` 与 `secrets:open` 依赖它；4) 做 `coding-tools`（工具注册、shell 包装、hook 提交日志、事件、渲染器），这是 agent 能不能干活的关键；5) 做 `prompt`（九个 section、`beforeInput`、build/landing/instruction 备注），此时才需要 `Standing` 与 `discoverAgents`；6) 最后做 `agent`，把 SDK 原语拼成 home surface 并接上 lineage 的 compact。若按依赖图施工，`prompt` 的 `Standing` 导入意味着它实际上要排在 `subagents` 的 doc token 之后，与文档中"prompt 属第 1 层、standalone"的表述不完全一致。

**风险。** ① `prompt` 的 system prompt 一旦包含易变内容就会毁掉 prompt cache，必须坚持"变更进输入 entry"；`beforeInput` 是 Pi Durable 1.4.0 的补丁钩子，升级 Pi 是首要回归点。② `coding-tools` 依赖 Pi 内部未类型化的 `details.patch`/`details.diff`、`exit_code` 诊断与 `Command timed out after … seconds` 文案，以及 `wrapTool` 对所有同名工具生效的语义；这些都不是稳定 API。③ Git hook 依赖 `hook.<name>.event/command` 配置注入（较新 Git 才有）与 Git 自带的 `sh`，旧 Git 或禁用配置的环境会静默丢失 `coding-tools.committed`（推断）。④ 提交事件与 git commit 不在同一事务，崩溃会丢事件但保留 trailer，不能把事件当作唯一真相。⑤ `secrets` 是明文存储、不是 vault；agent 的 shell 与用户同权限，提示词只能防误读，不能防恶意读取，绝不能把值写进文档/notice/trace。⑥ `documents` 的 JSON 兜底会显示任何导出文档的全文，新的 `docs` 导出不要放敏感数据。⑦ `notices` 只在内存里，刷新即失，不能承载"必须看到一次"的结果。⑧ `agent` 的命令是 facet 级、每个 surface 都可触发，且在 `ConversationScope`（侧聊）里作用于那个会话；复刻时若把命令做成 surface 局部或写死主会话，会破坏侧聊语义。⑨ 七个扩展都是 core，`extensions.disable` 不会生效；复刻时若要让它们可关闭，必须同时改 discovery 的 core-tier 语义与依赖声明。
