# 运维与可观测性扩展组 分析笔记

## 1. 概览

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

## 2. 逐扩展规格

### 2.1 `status`

**职责与用户可见行为**：没有任何 UI；只有 `status { since? }`。`since` 是 epoch 毫秒，只过滤 `failures`，默认 `now - 24h`；返回 `at/head/failures/providers/questions/busy/extensions`，供 tailnet 上的仪表盘每 30 秒轮询。

**导出与契约**：`Status` 类型与 `StatusAction = actionRef('status','status')`（`refs.ts:4-41`）；`server.ts` 导出 `status(host, since, now)`、`pollActions = ['status']`、`actions.status`。`host.need(MessagesApi)`，`want` `UpdateApi`/`WatchdogApi`/`HealthApi`（`server.ts:78-85`）。

**状态与持久化**：不写任何 doc/文件；读 `UpdateApi.state()`、`WatchdogApi.failures(since)`、`HealthApi.providers()`、`MessagesApi.openQuestions(context)`、`host.conversations()`、`host.extensions()`。重复轮询由 trace 的 poll 计数吸收，不逐条落库。

**UI 位置**：无。

**关键流程**：1) 校验 `since` 为有限 number，否则抛 `since must be epoch milliseconds`；2) 取 `Date.now()`；3) 四项读取 `Promise.all`；4) `head` 仅在 `clone.head` 存在时组装，`behind`/`ahead` 缺省 0，`error` 取上次 fetch 失败；5) `failures` 只保留五个字段；6) `providers` 仅在 `state==='failing'` 时带 `error`；7) `questions.first` 取最旧一条的 `text/conversation/message`；8) `busy` 数 `conversation.busy`；9) `extensions` 取 `server.error`。

**失败与恢复**：任一被依赖服务抛错会整体失败（无 catch），由调用方重试；`head`/`failures`/`providers` 在对应扩展关闭时整体缺席，而不是空数组；`since` 非法直接拒绝。

**关掉它会发生什么**：仪表盘失去 `/api/extensions/status/actions/status`；没有其他扩展依赖它，属叶子。

**复刻要点**：字段必须“由拥有者 API 提供”，不要读别人的 doc；区分“缺席”与“空”；`pollActions` 让高频轮询不写 trace。

**证据**：`extensions/status/refs.ts:4-41`；`extensions/status/server.ts:15-97`；`extensions/status/README.md:43-52`。

### 2.2 `status-line`

**职责与用户可见行为**：composer 下方一行显示 cwd/workspace、git 分支、`↑input ↓output R cacheRead W cacheWrite`、缓存命中率、成本（订阅加 `(sub)`）、上下文百分比（>70% 警告色、>90% 错误色）；底部全局栏显示最近 30 秒的全项目输出 tok/s、运行中 agent 数（含子代理，0 也显示）、项目累计 token/成本、连接状态与 generation；悬停消息显示该条的上下文与成本。

**导出与契约**：`Tokens`、`RateSample { rates, elapsed, totals }`、`RatesAction`（`refs.ts:5-13`）；`server.ts` 的 `actions.rates`；内部 `rates.ts` 的 `createRateSampler`/`keys`/`zero`，`context.ts` 的 `usageTotals`，`turns.ts` 的 `turnOf`/`responseAfter`。无 `api.ts`，无 need/want。

**状态与持久化**：无 doc/文件。模块级 `WeakMap` 以 host 为键保存最新快照；`onOpen` 以 256/页 `scanConversations` 播种每个会话的 `UsageDoc`（settled）与 `LiveDoc`（partial），再 `subscribeCommits` 增量维护；`spend` 用差值累加所有 model+tool 桶。

**UI 位置**：`slots['composer.status'] = [Cwd, Tokens, Context]`，`statusline.left = [GlobalUsage]`，`statusline.right = [Connection(phone:true)]`，`messageDetails = [MessageUsage]`（`web.tsx:368-374`）。

**关键流程**：1) `onOpen` 先 `stop()` 清旧计时器/订阅；2) 全量扫描并 `replace` 每会话 settled/partial；3) 同一 commit 边界内订阅；4) 每秒 `sample(performance.now(), total)`；5) UI 每秒调 `rates`，5 秒请求超时；`rates` 未满两个 5 秒内样本时返回 `null`。

**失败与恢复**：播种/订阅失败 `host.notice('Instance token rates unavailable: …')` 并停表；UI 轮询失败显示 `?`，下一秒重试；`ContextDoc` 缺 `window` 时整项隐藏。

**关掉它会发生什么**：没有 `rates` action，composer 行与全局栏消失；模型选择器（`models`）不受影响；消息悬停细节消失。

**复刻要点**：rate 采样要在 30 秒窗口上按两点线性内插基线，显示时 clamp 到 0（内部允许负修正）；tool 用量不计入 rate、计入成本；上下文百分比读 `conversations.context`，不要浏览器自算。

**证据**：`extensions/status-line/refs.ts:5-13`；`server.ts:12-119`；`rates.ts:9-32`；`context.ts:4-14`；`turns.ts:10-35`；`web.tsx:235-334,368-374`。

### 2.3 `health`

**职责与用户可见行为**：不 ping provider，只从每次真实响应记录“这台机器上这个登录是否还能用”；失败的 provider 由 `setup` 状态栏项列出。登录被替换后旧结论作废，重置为 `unknown`。

**导出与契约**：`ProviderHealth`、`Changed = defineEvent('health.changed')`（`refs.ts:5-26`）；`HealthService.providers()` 与 `HealthApi`（`api.ts:10-15`）；`server.ts` 另导出 `responseEntry`、`announce`、`recordHealth`；`store.ts` 导出 `healthPath`、`STREAK=3`、`STREAK_WINDOW=5*60_000`、`sanitize`、`failureKind`、`state`、`apply`、`merge`、`readHealth`、`record`、`reset`、`Flip`。reactor `login-changed` 监听 `models` 的 `LoginChanged`；hook `GenerationTask.afterResponse`。

**状态与持久化**：`~/.ultimate/health.json`（所有 Ultimate home 共用），每 provider 记 `lastOk/lastFail/error/lastUsed/lastAuth/transient[3]`；临时文件 + rename 原子写，进程内按 path 串行；读取时逐字段取最大时间戳，乱序写也收敛；损坏 JSON 视为空。

**UI 位置**：无自有 UI；`ui.tsx` 只再导出 `Changed` 供 `setup/web.tsx` 订阅。

**关键流程**：1) `afterResponse` 把 `stopReason` 映射为 entry（`aborted` 不记，`error` 记 fail，其他记 ok）；2) 仅 `getProviderAuthStatus(...).configured` 的 provider 记；3) `record` 清洗 `error` 后 `apply`：auth 盖 `lastAuth`、capacity 只盖 `lastFail/error`、transient 进 `transient`；4) 比较写入前后 `state()`，变化才 `announce`；5) `announce` 在独立 commit 里 emit `health.changed`；6) 登录变化 reactor 调 `reset` 并在自己的事务里 emit。

**失败与恢复**：文件写失败只 `console.error`，绝不阻塞生成；storage 关闭（core swap）时 `announce` 直接返回，下一次翻转再报；`providers()` 过滤掉无登录的 entry，避免陈旧失败告警。

**关掉它会发生什么**：`setup` 的 Providers 行与 `status.providers` 消失；登录/登出不再重置健康；`health.changed` 不再出现。

**复刻要点**：`sanitize` 必须是固定 allowlist（状态码 + `KNOWN` 词），绝不落原文；capacity 永不判登录坏；状态由 `lastOk` 之后的 auth/streak 推导，所以成功不必清空失败。

**证据**：`extensions/health/refs.ts:5-26`；`api.ts:10-15`；`server.ts:12-83`；`store.ts:23-30,36-89,123-177,239-298`；`README.md:20-30`。

### 2.4 `info`

**职责与用户可见行为**：右栏 Info 页按固定顺序展示 Workspace、Model & usage、Code、Execution、Machine、Process、Persistence、Skills、Context files；路径可点击复制，折叠状态持久化；Code 的 `core changed · restart pending` 与 Process 的 restart 按钮直接触发 `useRestart()`。

**导出与契约**：无 `server.ts`、无 API、无 doc。`web.tsx` 默认导出 `panels:[{id:'info',title:'Info',icon:InfoIcon,order:5}]`、`slots.overlay=[SkillPicker]`、命令 `info.open`/`info.skill`（`web.tsx:464-479`）；`ui.tsx` 导出 `Section`、`Copy`、`Meter`、`Tag`、`ErrorText`；`skill-picker.tsx` 导出 `skillDialog='info.skill'` 与 `SkillPicker`。

**状态与持久化**：仅 `useExtensionUiState<string[]>('closed', [])` 记录折叠的 section id；无服务端状态。

**UI 位置**：右栏 panel `info`（order 5）；⌘K “Show system info”；overlay 里的 skill 选择器把 `/skill:<name> ` 填入 composer。

**关键流程**：1) `useSystem()` 未就绪显示 `connecting…`；2) 依次渲染 9 个 Section；3) Model 段按 `usage.models` + `usage.tools` 汇总 token/成本；4) Code 段比较 `code.coreStale`，显示 restart 按钮；5) Process 段用 `useNow(1000)` 算 uptime，`restart.pending` 显示 `→ N swapping…`；6) 路径经 `shortenPath` + `elidePath`。

**失败与恢复**：`useSystem()` 缺失只显示 connecting；`restart.error` 用 `ErrorText` 展示，按钮由 `restart.busy` 禁用；某段数据缺字段时显示 `—`/`none`。

**关掉它会发生什么**：Info 面板与两个命令消失；`info/ui.tsx` 的原语若无其他扩展导入则一并不可用（推断：本仓库内未发现外部导入）；skills 选择器入口消失。

**复刻要点**：Info 只读 `system` 事件与 `useConversation()`，不要为它新增服务端接口；折叠状态要放 durable UI state，避免刷新复位。

**证据**：`extensions/info/web.tsx:444-479`；`ui.tsx:8-105`；`skill-picker.tsx:11-26`；`README.md:1-3`。

### 2.5 `setup`

**职责与用户可见行为**：当有 `warn` 时状态栏出现 `⚠ N setup issues`，popover 按“警告→信息→已就绪”列出每个 area 的现状、影响与修复按钮（命令或 Secrets 面板）；同时只在 @ultimate 的输入前注入一条隐藏 `setup.note`，警告集合变化时提醒、清空时提示 resolved。

**导出与契约**：`SetupFix`、`SetupIssue`、`CheckAction('setup','check')`（`refs.ts:5-21`）；`server.ts` 导出 `docs=[Seen]`（kind `setup.seen`）、`check(host, read?)`、`setupNote(issues)`、`noteFor(tx, conversationId, issues, now)`、`pollActions=['check']`、`actions.check`。need `ConversationsApi`；want `HealthApi`、`TailscaleApi`；`Standing`、`RootsDoc`/`MemoryDoc` 经 doc 读取；`workspaces` 只按 `host.extensions()` 判断是否启用。

**状态与持久化**：`setup.seen`（conversation scope，`{key}`）记住上次听到的 warning 文本；检查结果缓存在 `host.resource('setup.check')` 30 秒；无文件/SQLite。

**UI 位置**：`statusline.right`（`phone:true`，仅 warn 时渲染）；`entries['setup.note'] = () => null` 隐藏该 entry。

**关键流程**：1) `check` 并行跑 10 个检查函数（Summary model、Agent models/definitions、Providers、Secrets、Extensions、Cloud backup、Tailscale、Lander checks、Worktree setup、Project memory）；2) 每个 area 包 `Promise.resolve().then(...).catch`，失败降级为 `area:'Setup check', status:'info'`；3) 按 `rank {warn:0,info:1,ok:2}` 排序；4) `beforeInput` 先确认 `Standing.ultimate === conversationId`；5) `current(tx)` 复用 30 秒缓存；6) `noteFor` 生成 `setup.note` entry（`data.warnings` 计数 + user model 文本），并与 `Seen.key` 同事务提交。

**失败与恢复**：单个 area 抛错不拖垮整体；检查失败只跳过本次 note，状态栏仍显示上次结果；`fix.command` 不在命令面板时按钮隐藏；30 秒缓存避免连续输入反复读文件。

**关掉它会发生什么**：状态栏安装提示与 @ultimate 的 setup 提示消失；`check` action 404；其他扩展不受影响。

**复刻要点**：一定要用 `beforeInput` + 事务内 doc 写，保证“一次输入最多一条 note”；note 文本作为 key，保持 system prompt 可缓存；`fix` 用 `command`/`secret` 两种形态。

**证据**：`extensions/setup/refs.ts:5-21`；`server.ts:34-43,62-139,148-200,202-316,319-399,401-433`；`web.tsx:72-134`；`README.md:1-39`。

### 2.6 `update`

**职责与用户可见行为**：每 5 分钟（启动后 30 秒首查）比较宿主 clone 与 `origin/<default branch>`，只在必要时 fetch；状态栏显示 `✓ up to date`、`↓ N new · update`、`install owed` 或 `updated · restart`；popover 给出 clone 路径、落后提交、摘要、DiffsHub 链接、改动 layer 与更新后的动作；`Update now` 只做 fast-forward + 必要 `pnpm install`。

**导出与契约**：`Layers`、`UpdateState`、`UpdateResult`、`StateAction`/`CheckAction`/`UpdateAction`/`MergeAction`、`Applied('update.applied')`/`Refused('update.refused')`（`refs.ts:6-98`）；`UpdateService.state()` + `UpdateApi`（`api.ts:7-12`）；`itemOf(state)`（`item.ts:7-17`）；`clone.ts` 导出 `FETCH_EVERY=1h`、`layersOf`、`gitPath`、`fetchedAt`、`fetchIfDue`、`withLock`、`cloneState`、`SUMMARY_INPUT_CAP=12000`、`SUMMARY_SYSTEM`、`summaryLines`、`summaryFor`；`server.ts` 导出 `TICK`、`gitIn`、`installOwed`、`landingInstalls`、`userActions=['merge']`、`actions`。

**状态与持久化**：clone 自身即状态；`.git/ultimate-update.lock`（`server/lock.ts` 的 SQLite 锁，进程退出释放）、`.git/ultimate-update-summary.json`（按 `<head>..<remoteHead>` 缓存 2–4 行摘要）、`FETCH_HEAD` mtime 作为全 clone 的 fetch 时钟；`update.state` 是跨 reload 共享的 host resource，`updated` 只保留到本进程重启；事件单独 commit。

**UI 位置**：`statusline.right`（order -2）；`CheckNow`、`Action`、`Popup` 组成 popover；`merge` 成功后 `showSurface('agent')` 并 `switchConversation(id)`。

**关键流程**：1) `tick` 若 `PauseApi.paused()` 则跳过；2) `withLock` 内 `fetchIfDue`（或 `check` 强制）后 `summarize(true)`；3) `cloneState` 得 behind/ahead/commits/layers/refused/diverged；4) 若 behind，`landing(host)` 查 lander 队列是否正在落同一 clone；5) `diverged && !landingNow && isProject(host)` 才给 `merge`；6) `installOwed` 比较 `pnpm-lock.yaml` 与 `node_modules/.pnpm/lock.yaml`；7) `installedSince` 比较 lockfile mtime 与进程 `startedAt` 得 `restart`；8) `update` 在锁内 `fastForward(git, undefined, landing)` → `diff --name-only` → `layersOf` → `installPackages` → 记录 `update.applied`；9) reactor `install-landed` 在 `SubmissionLanded` 命中 lockfile/`patches/` 且 commit 是 HEAD 祖先时补装。

**失败与恢复**：锁被别的 Ultimate 持有 → `refuse('Another Ultimate is updating this clone')`；dirty/别的分支/diverged/lander 正在落 → `Refusal` 文案原样返回并记 `update.refused`；fetch 失败存 `state.error`，计数沿用上次；install 失败记 `installError`，下次 update 重试；预览（`ULTIMATE_INSTANCE_OWNER`）完全不读 clone，返回 `preview:true`。

**关掉它会发生什么**：没有自动检查/更新与 `UpdateApi`，`status.head` 缺席；landing 改包后不再自动 install；`merge` 委派不可用。

**复刻要点**：绝不 stash/rebase/reset；锁必须在 fetch 前拿、覆盖 install；摘要按 range 缓存且失败也缓存空结果；`restart` 来自全 clone 的 lockfile mtime，不是本进程的更新记忆。

**证据**：`extensions/update/refs.ts:6-98`；`api.ts:7-12`；`server.ts:34,56-59,85-92,105-161,172-253,256-294,306-409`；`clone.ts:12-158`；`item.ts:7-17`；`web.tsx:352-488`。

### 2.7 `instance`

**职责与用户可见行为**：按需启动第二个 Ultimate（最多 3 个，含启动中），用于在重启共享宿主前验证核心改动，或在别的项目验证其 `.ultimate/` 扩展；可 start/stop/logs/list，卡片显示 URL、pid、home 与可折叠日志；标题栏项目 chip 变成预览切换器，预览以 iframe 嵌在标题栏下。

**导出与契约**：`Preview`、`ListAction('instance','list')`（`refs.ts:5-17`）；`InstanceService.start({home})`/`stop(id)` + `InstanceApi`（`api.ts:4-11`）；`server.ts` 导出 `DEFAULT_PREVIEW_MODEL='openai-codex/gpt-6.1-sol'`、`previewModelSetting`、`previewEnv`、`previewWorkspace`、`stopped`、`remember`、`actions.list`；`cleanup.ts` 导出 `cleanPreview`、`sweepPreviews`；`links.ts` 导出 `at`、`label`；工具 `instance`（`action: start|stop|logs|list`，参数 `id/home/subagent`）。

**状态与持久化**：进程内 `host.resource('instance')` Map + `instance.starts.pending`；停止记录按端口写宿主 home 的 `previews.json`（最多 50，跨重启保留）；临时 home 为 `tmpdir()/ultimate-instance-*`，内含 `project.json`、`ultimate.lock`；显式 home 写 `instance-preserve` 以免被清扫；tailnet 地址读 `~/.ultimate/tailscale.json`。

**UI 位置**：`tools.instance` 卡片（start/list/stop/logs）、`link: PreviewLink`、`slots['titlebar.project']=[Switcher]`、`overlay=[Poll, Embedded]`。

**关键流程**：1) 检查 `live + pending < 3`；2) `prepare()` 解析 workspace：有 workspace 用其 `path`，Ultimate 自身项目还要求 `server/main.ts` 与 `node_modules`；3) 无 `home` 时先 `mkdtemp('.ultimate-instance-')` 写 `ultimate.lock`/`project.json` 再 rename 发布；4) 拒绝宿主 home 或已被占用 home；5) `previewEnv` 剥离 `ULTIMATE_*`/云变量，设 `ULTIMATE_HOME/PROJECT`、`PORT=0`、`NO_OPEN=1`、`INSTANCE_OWNER=pid`、可选 `ULTIMATE_MODEL`；6) `spawnGroup(node, ['server/main.ts'])`；7) 从 stdout 匹配 `Ultimate: http://127.0.0.1:<port>`；8) 60 秒内轮询 `/api/models`；9) 失败则 `stop` 并带输出尾部；10) `onOpen` 异步 `sweepPreviews(tmpdir())`。

**失败与恢复**：超时/退出 → 报 `Instance did not become ready:\n<tail>`；启动被 abort → `stop` 清临时 home；清扫失败 `notice`；显式 home 永不自动删除；停止用 `stopGroup` 杀整个进程组并 `cleanPreview`（持有 `ultimate.lock.db`/`storage.lock.db` 排他事务、校验 PID sidecar、按 home hash 删 `ultimate/<hash>-*` 分支）。

**关掉它会发生什么**：不能起预览，标题栏保持普通项目 chip，预览链接退化为普通链接；`dream` 的 gate 因 `want(InstanceApi)` 为空而显式失败。

**复刻要点**：临时 home 的“先 staging 后 rename”是防别的宿主清扫的关键；预览必须有自己的 storage/Vite 缓存，且不继承云设置；`instance.model` 会覆盖 root/agent pin/summaryModel，`null` 关闭。

**证据**：`extensions/instance/refs.ts:5-17`；`api.ts:4-11`；`server.ts:38-60,66-97,152-232,239-254,256-528`；`cleanup.ts:11-117`；`web.tsx:373-377`；`README.md:11-25`。

### 2.8 `watchdog`

**职责与用户可见行为**：失败运行若属临时错误则 60 秒后自动续跑一次；登录类错误立即上报并给登录提示；持久错误变成 `watchdog.failure` 卡片发给子代理 owner 或 @ultimate，@ultimate 自己的失败只发 notice；另外在 @ultimate 每次输入前提醒空闲超过 30 分钟（等待回复的分支 2 小时）的分支。

**导出与契约**：`Failure`（`refs.ts:2-11`）、`ReportedFailure`/`WatchdogService.failures(since)`/`WatchdogApi`（`api.ts:6-13`）；`server.ts` 导出 `FAILURE_LIMIT=20`、`diagnose(error, assistant?)`、task `watchdog.failure`（phase `wait|retry|report`）；`idle.ts` 的 `idleNote` 使用私有 doc `watchdog.seen`。reactor：无显式 `host.react`，用 `subscribeCommits` 看 task/submission；hook `GenerationTask.beforeInput`。

**状态与持久化**：`watchdog.reported`（root，最近 20 条 `ReportedFailure`）、`watchdog.receipts`（root，`{highWater,tasks}` 防重复检测）、`watchdog.seen`（每会话空闲集合 key）；运行本身是 durable task，entry 是 `watchdog.failure`/`watchdog.idle`。

**UI 位置**：`entries['watchdog.failure']` 卡片（会话链接、error、last step、hint、retried）与 `entries['watchdog.idle']` 纯文本。

**关键流程**：1) 订阅 commit，筛 `GenerationTask` 终态失败且 `reason ∈ {model_error,no_model}`；2) `detect` 先查 receipts/highWater 去重；3) `details` 扫任务与 entry，确定失败边界、最后工具名、标题；4) `diagnose` 分类：rate-limit 直接 report 并提示 Play；未登录/OAuth/invalid_grant 立即 report 带 hint；并发上限/Claude relay 200/`isRetryableAssistantError` → `temporary:true`；5) 创建 task（`background:true`，`until = endedAt + 60s`）；6) `wait` 睡到点，`retry` 检查是否已有 `watchdog-retry:<id>` 提交或会话 busy，否则提交一次并终止；7) `report` 给自己发 `host.notice`，否则 `submit` 到 recipient（`whenBusy:'steer'`）并追加 `Reported`、把子代理 action 标 `given-up`。

**失败与恢复**：重试失败不再重试；`subagent stop` 取消 task 并撤回 queued retry；恢复扫描首次安装把所有既有失败标历史、`highWater` 不越过未完成任务；恢复失败 `notice('Watchdog recovery failed: …')`；Messages 中已带失败回复的 board input 被排除。

**关掉它会发生什么**：没有自动重试/失败卡片/空闲提醒；`status.failures` 缺席；失败仍由 UI 以普通错误呈现。

**复刻要点**：request id 必须稳定（`watchdog-retry:<failedTask>`、`watchdog-report:<failedTask>`）以支持重放；`Reported` 按失败发生时间排序而非上报时间；检测与高水位推进必须在事务里。

**证据**：`extensions/watchdog/refs.ts:2-11`；`api.ts:6-13`；`server.ts:31-54,112-141,191-274,276-342,353-426`；`idle.ts:9-101`；`web.tsx:7-42`。

### 2.9 `system`

**职责与用户可见行为**：把 durable 事件与 trace 调用合并成一种 `SystemRow`，在 System surface 上提供 Agent Lanes 时间线（30m/2h/24h）与 All events 流；可按 source/kind/conversation/errors/text 过滤、分页、跟随实时；点一行可展开该 trace 的调用树；`navigated` 记录用户所在 surface。

**导出与契约**：`SystemRow`、`SystemFilter`、`SystemCall`、`LaneCall`、`LaneRun`、`LaneSpawn`、`Lane`、`LaneLink`；`StreamAction`、`LanesAction`、`TreeAction`、`PollsAction`、`NavigatedAction`（`refs.ts:8-135`）；`server.ts` 导出 `lanes(host,args,clock)`（测试用）、`pollActions=['stream','lanes','tree','polls']`、`userActions=['navigated']`、`actions`；私有 doc `system.last-view`。

**状态与持久化**：自身只存 `system.last-view`（root，`{key}`，`<surface>:<conversation>`）；数据来自 `host.eventLog`（SQLite 事件日志）与 `host.trace`（`trace.sqlite`）；游标是不透明字符串 `<event id>.<trace position>`。

**UI 位置**：surface `system`（order 50）、命令 `system.open`、`overlay=[NavigationReporter]`；`LaneTree`/`Axis`/`Stream`/`TraceTree` 分别渲染树、时间轴、流与调用树。

**关键流程**：1) `stream` 校验 filter 与 `limit 1..500`，先读最新 event id；2) `before` 从 `{latest+1, MAX_SAFE_INTEGER}` 倒序，`after` 正序；3) events 走 `eventLog.recent`（`since`/`before` + `order`），calls 走 `trace.page`（`after`/`before`、`kinds`、`conversation`、`errors`、`text`），各读 `limit+1`；4) `merge` 按时间取前 `limit`，calls 的排序时间是 `at + ms`；5) `resume` 为每个 source 记录最后取到的位置；6) `head` 为 `{最新 event id, trace 最后位置}`；7) `lanes` 按 `tool|model` 拉窗口内调用，20 秒静默切 run，最多 40 lane/200 call，父 lane 一跳带上，`subagents.started` 提供 agent/model/kind，`board.sent` 提供 links；8) `tree` 用 `trace.tree` + 该 trace 的事件；9) `navigated` 在事务里比较 `LastView.key`，重复则不写。

**失败与恢复**：非法 cursor 抛 `Invalid before cursor`；非法 limit/kinds 抛错；UI 的 stream 失败保留已加载行、每 2 秒重试；lanes 失败显示 `lanes failed: …`；`stream` 的 `errors:true` 会禁用 event source。

**关掉它会发生什么**：没有 System surface 与命令；`activity` 面板的 “System ↗” 因检测不到 surface 而隐藏；`debug` 与 codemode 的 `trace` 仍可用。

**复刻要点**：两个 source 各自保留 cursor 是“不跳不重”的核心；calls 必须在 settle 时写入才能按完成时间排序；`subagents.started`/`board.sent` 只按名字 `defineEvent`，不 import 生产者的 token；轮询要声明 `pollActions`。

**证据**：`extensions/system/refs.ts:8-135`；`server.ts:15-59,155-219,242-513,522-569`；`web.tsx:233-248`；`stream.tsx:12-94,223-287`；`layout.ts:11-16,97-160,198-235`；`navigation.tsx:6-38`。

### 2.10 `debug`

**职责与用户可见行为**：一个延迟加载（`deferred:true`）的只读工具，只有定义里点名它的 agent（本仓库是 @ultimate）才拿得到；回答是紧凑文本、每行一条、按新到旧、带相对年龄，最多约 16K 字符。

**导出与契约**：工具 `debug`，参数 `call: events|reactors|catalogue|trace|apis|api` 及 `events/since/limit/trace/conversation/name`；`age(at, now)` 导出；`BUDGET=16000`；`replay:'safe'`。无 API/doc/events。

**状态与持久化**：无；只读 `host.eventLog.recent`/`reactors()`、`host.catalogue()`、`host.trace.query/tree()`、`lib/api-files.ts` 的 `apiSummaries`/`apiSource`。

**UI 位置**：无。

**关键流程**：1) `events` 用事件名 `defineEvent(name)` 过滤、`since` 为排他事件 id；2) `reactors` 输出 name/on/cursor/lag/running/failure；3) `catalogue` 输出 provider（缺失为 `MISSING`）、needs/wants、missing、cycles；4) `trace` 无 `trace` 时列调用，带 `trace` 时递归缩进；5) `apis` 列每个有 `api.ts`/`refs.ts` 的扩展及首句摘要；6) `api` 返回两个文件全文，未知名字报已知列表；7) `bounded` 按预算截断并附 `… N more`。

**失败与恢复**：`events.since` 非 number、`trace.since` 非 string、`api` 缺 name 都抛明确错误；输出超预算截断；无数据返回 `No events.`/`No calls.` 等。

**关掉它会发生什么**：@ultimate 失去 `debug` 工具；同样的数据仍可由 codemode 的 `ultimate.trace()`/`catalogue()`/`apis()` 读取。

**复刻要点**：`deferred` 与 `replay:'safe'` 必填；用相对年龄而非绝对时间；`api`/`apis` 必须复用 `lib/api-files.ts`，否则与 codemode 的契约阅读分叉。

**证据**：`extensions/debug/server.ts:9-56,58-165,166-213`；`README.md:1-13`。

### 2.11 `activity`

**职责与用户可见行为**：右栏 Activity 页按新到旧列出项目事件：Landing、Branch、Root、Notice、Check、Backup、Escalation；错误红边、警告琥珀边，头部统计 problems 并可一键切到 Problems；chips 过滤 all/landed/branches/problems，时间范围 24h/7d/all。

**导出与契约**：`PageAction('activity','page')`（`refs.ts:10-16`）；`server.ts` 的 `pollActions=['page']` 与 `actions.page`；`feed.tsx` 导出 `activityEvents`、`filters`、`tone`、`shows`、`joined`、`Feed` 及类型 `ActivityEvent`/`Filter`。

**状态与持久化**：无自有存储；实时行来自 root 的 `ultimate.event-feed` doc（`useEvents({events, limit:100})`），历史页走 `host.eventLog.recent`；过滤与范围存 `useExtensionUiState('filter'|'range')`。

**UI 位置**：panel `activity`（order 2）、命令 `activity.open`（“Show recent activity”）；头部在装了 `system` surface 时显示 “System ↗”。

**关键流程**：1) 计算 `since`（按分钟取整，保证轮询参数稳定）；2) 用 `shows(filter,event)` 过滤实时事件并统计 `loud`；3) “Load older” 以 live feed 最旧 id 或上一页 `next` 为 `before`，调 `page {kinds, before, since, limit:50}`；4) `joined` 按 id 去重合并 live/kept/older；5) 行点击通过 `messages:open` + `switchConversation` 打开来源会话。

**失败与恢复**：`page` 失败只在页脚显示错误，已有行保留；加载中禁用按钮；`filters` 里 `cloud.backup`/`automations.escalated` 用字符串 `defineEvent`，所以没装那两个扩展也能加载。

**关掉它会发生什么**：没有 Activity 面板与命令；事件仍写入 event log，可由 System 查看。

**复刻要点**：可选扩展的事件必须按名字定义；`passed` check 与 `started` backup 属 `quiet`，任何过滤器都不显示（Problems 也只收 error/warning）；分页要与 live feed 无缝拼接。

**证据**：`extensions/activity/refs.ts:10-16`；`server.ts:7-33`；`feed.tsx:25-85,100-160,320-354`；`web.tsx:27-134,228-239`；`README.md:22-28`。

### 2.12 `codemode`

**职责与用户可见行为**：QuickJS/WASM 沙箱执行 async 函数体；`tools.<name>` 调本会话工具（codemode 自身除外），`ultimate.*` 自省，`ultimate.action` 唯一写通道，`store/load` 持久化；每次调用一行过去时摘要，显示在工具卡与折叠的 toolLines。

**导出与契约**：`CallSummary`/`SummariesDoc('codemode.summaries')`/`Summarized('codemode.summarized')`；`SummaryDoc`/`PendingDoc('codemode.summaries-pending')`；`Store('codemode.store')`、`docs`、`actions.read`、工具 `codemode`、task `codemode.summary`；`fixedLine`/`SUMMARY_SYSTEM`/`scrub`/`summaryInput`/`parseSummary`；`readProject`；`closedChapter`/`readChapter`。

**状态与持久化**：三个 conversation doc：`codemode.store`（`fork:'asOf'`、`history:'rewindable'`）、`codemode.summaries`（最近 1000）、`codemode.summaries-pending`；Store 在返回前单独 commit，崩溃窗口为“已写但报告 interrupted”。

**UI 位置**：工具卡（Script/Calls/Output/返回值 JSON 树）、`toolLines.codemode`、Store 文档、`MessageReference` point。

**关键流程**：1) 解析 `// @options`（默认 60s/10000 token）；2) 快照 Store；3) 由 `agent.tools` 建声明（排除 codemode/restart）；4) 256 MiB 沙箱内嵌套调用，`details.yielded` 同步 abort；5) 未完成调用标 `cancelled`，输出按 token 预算截断；6) `fixedLine` 或 `codemode.summary`；7) 成功先 commit Store 再返回 `details`；8) 失败返回 `codemode.js:<line>` 栈。

**失败与恢复**：失败保留输出、不重放；yield 外层成功并给 `pendingSubagents`；摘要失败不写行；`userActions` 被拒；跨项目 1 MiB 上限；`subagentAnswers` 只在成功且未 yield 时回执。

**关掉它会发生什么**：无工具/Store/摘要，agent 退回普通工具调用。

**复刻要点**：嵌套调用共享父 task、绕过工具 hook、结果不进模型上下文；声明与真实 schema 一致；摘要只喂清洗后的名字/状态/参数。

**证据**：`extensions/codemode/refs.ts:9-22`；`api.ts:10-32`；`server.ts:55-85,465-482,484-825`；`summary.ts:46-167`；`web.tsx:260-267`；`README.md:9,68-72`。

## 3. 跨扩展协作

- **状态聚合链**：`status` 汇总三者——`need(MessagesApi).openQuestions`，`want(UpdateApi).state()`、`want(WatchdogApi).failures()`、`want(HealthApi).providers()`；任一关闭就整体省略对应字段（`status/server.ts:16-24,40-59`）。
- **健康链**：`models` 的 `LoginChanged` → `health` 的 reactor `login-changed` 重置条目；`health` 的 `Changed` → `setup/web.tsx` 立刻重查（`setup/web.tsx:94`）；`setup` 与 `status` 都读 `HealthApi`。
- **更新链**：`update` 消费 `ConversationsApi.summaryModel/askSummaryModel`、`SubagentsApi.standing('ultimate')`、`WorkspacesApi.doc` 与 `SubmissionLanded`；`PauseApi.paused()` 阻止 tick；`status` 读 `UpdateApi`；`instance` 启动的预览用 `ULTIMATE_INSTANCE_OWNER` 让 `update` 直接返回 `preview:true`（`update/server.ts:105-125`）。
- **失败链**：`watchdog` 读 `Subagents`（owner/action）、`Messages`（reply-expecting 排除）、`Standing`、`Branch`、`WorkspacesApi.doc`；`WatchdogApi` 供 `status`。
- **观测链**：`system` 只读 core 的 `host.eventLog` 与 `host.trace`，按名字读 `subagents.started`/`board.sent`，并 emit `ui.navigated`；`activity` 读事件日志与 `ultimate.event-feed`，并链接到 `system` surface；`debug` 与 `codemode` 共用 `lib/api-files.ts`；`codemode` 的 `codemode.summarized` 事件会出现在 `system` 流中。
- **实例链**：`instance` 依赖 `WorkspacesApi`（预览 workspace）与可选 `TailscaleApi`（tailnet 地址）；`dream` 以 `want(InstanceApi)` 作为 gate，缺 `instance` 时明确报错（`dream/server.ts:640-641`）。
- **UI 链**：`status-line` 读 `conversations` 的 `ContextDoc` 与 `workspaces/ui.tsx` 的 `useWorkspaceConversations`；`info` 复用 `workspaces` 的 `Workspaces`/`useWorkspacesMeta`；`setup` 的修复按钮走 `useCommands()`/`runCommand` 与 `secrets:open` 浏览器事件。

## 4. 复刻顺序建议与风险

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
