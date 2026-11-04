# Ultimate worktree / lander 源码证据地图

- 基线：`3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（分支 `dev/lxy`，工作区仅新增 `agent_design/`、`analysis_design/` 等未跟踪目录）。
- 用途：给复刻 spec 的作者提供 `path:line` 证据；不是最终文章，不复制大段代码。
- 约定：未标 `推断:` 的句子均为代码/文档事实；`推断:` 表示由结构推出、无直接语句的结论。所有行号取自当前文件。
- 读法：第 2–8 节按一条提交的生命周期排列（submit → 排队 → 合并/检查 → 失败模型 → 落地/推送 → deploy → 报告 → conclude），第 9–11 节是相邻契约与测试证据，第 12 节是 spec 必须先裁决的冲突。凡“文档说、代码做”不一致处，均以代码行号为准并在第 12 节单列。
- 缩写：`lander.ts` = `extensions/workspaces/lander.ts`（1248 行）；`workspaces.ts` = `extensions/workspaces/workspaces.ts`（1059 行）；`wsserver.ts` = `extensions/workspaces/server.ts`（343 行）；`wsapi.ts` = `extensions/workspaces/api.ts`（49 行）；`wstypes.ts` = `extensions/workspaces/types.ts`（145 行）；`wsrefs.ts` = `extensions/workspaces/refs.ts`（76 行）；`capi.ts` = `extensions/conversations/api.ts`（105 行）；`cserver.ts` = `extensions/conversations/server.ts`（348 行）；`pg.ts` = `lib/process-group.ts`（352 行）；`wpg.ts` = `lib/windows-process-group.ts`（379 行）；其余首次出现给全路径。

## 1. 元数据与已读文件

| 文件                                                                                                | 行数                    | 读取范围 / 用途                                                                           |
| --------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `extensions/workspaces/lander.ts`                                                                   | 1248                    | 全文：任务定义、检查、模型失败、deploy、报告                                              |
| `extensions/workspaces/workspaces.ts`                                                               | 1059                    | 全文：文档、准备、submit/land/discard、release、lander 接线                               |
| `extensions/workspaces/server.ts`                                                                   | 343                     | 全文：`workspace` 工具、工具前 gate、`lander_state`/`workspace_workflow` 段落、打开时清扫 |
| `extensions/workspaces/api.ts` / `types.ts` / `refs.ts` / `setup.ts` / `paths.ts`                   | 49 / 145 / 76 / 41 / 19 | 全文：服务、文档类型、action/event、setup、路径比较                                       |
| `extensions/workspaces/README.md`                                                                   | 209                     | 全文，重点 71-209（submit 与 lander 生命周期）                                            |
| `extensions/workspaces/landing.tsx`                                                                 | 265                     | 全文，重点 70-135（`workspaces.review` point 与 `CommitCount`）                           |
| `extensions/workspaces/data.tsx` / `panel.tsx` / `ui.tsx`                                           | 36 / 268 / 19           | 全文：浏览器侧索引 hook 与 Info 面板                                                      |
| `extensions/subagents/server.ts`                                                                    | 1222                    | 全文，重点 440-525、860-1222（`subagent` 工具）                                           |
| `extensions/subagents/children.ts`                                                                  | 85                      | 全文：`createChild` 的工具继承                                                            |
| `extensions/subagents/README.md`                                                                    | 96                      | 全文，重点 70-90（Isolates）                                                              |
| `extensions/conversations/api.ts` / `server.ts`                                                     | 105 / 348               | 全文，重点 83-88、98-265（`Release`、conclude、`KeptWork`）                               |
| `extensions/conversations/types.ts`                                                                 | 54                      | 全文（`KeptWork`、`ConversationSubject`）                                                 |
| `extensions/review/refs.ts` / `server.ts` / `diff.ts`                                               | 84 / 221 / 283          | 全文：spec 语法、ranges、diff 两侧                                                        |
| `extensions/review/surface.tsx` / `selector.tsx` / `link.tsx` / `web.tsx`                           | 647 / 134 / 86 / 43     | 重点 surface 470-647、selector 全、web 42                                                 |
| `extensions/info/web.tsx`                                                                           | 479                     | 重点 426-462（Workspace section 注册）                                                    |
| `extensions/status-line/web.tsx`                                                                    | 375                     | 重点 51-85（Cwd/workspace 行）                                                            |
| `web/src/app/titlebar.tsx`                                                                          | 389                     | 重点 24-58（worktree 正则与项目名）                                                       |
| `extensions/sidebar/lander.tsx` / `root.tsx` / `sidebar.tsx` / `rows.tsx`                           | 71 / 433 / 648 / —      | lander 行、`ProgressAction`、`PendingAction`、`Review`                                    |
| `extensions/messages/send.ts` / `server.ts`                                                         | 221 / 272               | `Handoff` 实现与 sender-scoped receipt                                                    |
| `extensions/lineage/server.ts`                                                                      | 1752                    | 重点 584-668、735-760、1443-1473（landing note、auto-conclude）                           |
| `lib/process-group.ts` / `lib/windows-process-group.ts` / `lib/shell.ts` / `lib/agents.ts`          | 352 / 379 / 136 / 618   | 进程容器、host shell、`definitionAgent`                                                   |
| `docs/worktrees.md` / `.ultimate/settings.json` / `agents/lander.md` / `.ultimate/agents/lander.md` | 45 / 23 / 19 / 14       | 全文：运维说明与 lander 配置                                                              |

`test/workspaces.test.ts` 不存在（`Test-Path` 为 False，属于题面与仓库的清单差异）；存在的对应文件是 `test/e2e/workspaces.test.ts`（152 行）与 `test/e2e/workspaces-integration.test.ts`（3057 行，82 个 `it`/`it.each` 声明）。

## 2. Lander 任务生命周期

**任务定义。** `createLander` 返回 `defineTask<{ source: string }, State, null>`，`name: 'workspaces.lander'`，`version: 1`，`initial: () => ({ phase: 'next' })`（`lander.ts:474-495`）。输入只有 `{ source }`，由 `startLander` 以 `tx.createTask(Lander, { source }, { conversationId: index.landerConversations[source], ownership: { kind: 'conversation' } })` 创建（`workspaces.ts:192-203`）；输出恒为 `null`。状态机 `State` 为 `next | land | agent | report` 四相（`lander.ts:431-441`），跨尝试携带 `Carry = { pushRetried?, fixed? }`（`lander.ts:430`）。

**总览与并发。** 一个 source checkout 同时只有一个 lander 任务（`index.landers[source]`，`workspaces.ts:194-201`），它按该 source 的队列顺序逐条处理提交；不同 source 各有任务、互不阻塞。`createLander` 收到的 `serial(source, …)` 与同步 `workspace land` 共用同一把 per-source 串行锁（`workspaces.ts:169-190`），因此 lander 的 checkout 写入与同步 land 的 fast-forward 不会交错。lander 会话是 ownerless、标题 `@lander`、label `lander`、standing（永不 conclude），cwd 就是 lander checkout（`workspaces.ts:209-232`）；它没有 workspace 记录，所以 `workspace submit`/`land` 对它报错（`wsserver.ts:283-293`）。

| 阶段     | 行                    | 行为                                                                                                                                                                                                                                                               |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `next`   | `lander.ts:496-507`   | 读 root 文档，取 `index.queue.find(item => item.source === task.input.source)` 的第一条（先进先出）；无条目则 `delete index.landers[source]` 并 `terminal/completed`；有则 `entry.state = 'landing'`、记 `started`、checkpoint `{ phase: 'land', id, attempt: 1 }` |
| `land`   | `lander.ts:508-1089`  | 全部集成逻辑；可重入，按 checkpoint 决定续跑点                                                                                                                                                                                                                     |
| `agent`  | `lander.ts:1090-1139` | 把失败交给 lander 模型并等待，然后回到 `land`                                                                                                                                                                                                                      |
| `report` | `lander.ts:1140-1232` | 可选 deploy，向提交者投递报告，checkpoint 回 `next`                                                                                                                                                                                                                |
| `abort`  | `lander.ts:1234-1245` | 删 `index.landers[source]`，本 source 的队列项回 `queued` 并清 `step`/`agent`，`terminal/aborted`                                                                                                                                                                  |

**`land` 的执行顺序与证据。**

1. 读 settings（`lander.ts:828`）；若 checkpoint 带 `failure` 直接进 `answered`（`lander.ts:829`）。
2. 断点续传捷径：`entry.landed && attempt === 1 && !pushRetried && target` 仍包含 `entry.landed.sha` 时，跳过 merge/check，直接 `landedReport`（`lander.ts:830-838`）。
3. 取 `prepared:${id}:${attempt}` memo（`lander.ts:840`）；未命中则取 `merged:${id}:${attempt}`（`lander.ts:843-846`），并 `checkout(source, merged?.sha ?? target tip)`（`lander.ts:847-850`）。`checkout()` 做 `reset --hard`、`checkout --detach --force`、`clean -fdq`、`rematerializeLf`（`lander.ts:481-489`），即“每次尝试从干净 checkout 开始，忽略文件保留”。
4. `preparing` 步骤后 `base = HEAD`（`lander.ts:852-853`）。
5. **merge 三段**：若 `fixed` 存在，先合 `fixed.head`（`lander.ts:876-887`）；若配置 `push`，`ls-remote` 后 `fetch` 远端 target，远端领先则合 `FETCH_HEAD`（`lander.ts:888-908`）；最后合提交 tip `entry.tip`（`lander.ts:909-919`）；成功后写 `merged` memo（`lander.ts:920-924`）。任一 merge 冲突都走 `handOver`，并带 `merging` = 被合入的 commit（`lander.ts:855-874`）。
6. `rematerializeLf`（`lander.ts:928`）→ `setting up`（`lander.ts:930`）→ `setup(source, path, projectSettings, signal)`（`lander.ts:931`；`extensions/workspaces/setup.ts:13-40`，每条命令 120 s、`ULTIMATE_SOURCE`、stdin 关闭）。
7. 按 `settings.checks` 顺序跑检查组（`lander.ts:933-1018`，详见第 3 节）。
8. “只有所有检查跑过的那个 commit 才能落地”：核对 `HEAD === merged.sha` 且 `status --porcelain` 为空，否则 `fail('the integration checkout changed during checks')`（`lander.ts:1019-1028`）；写 `prepared:${id}:${attempt} = { base, integrated, flaky }`（`lander.ts:1029-1033`）。
9. **fast-forward**：`serial(source, …)` 内先读 `refs/heads/${target}`；若已是 `integrated` 则视为重放；若不等于 `base` 则 `moved`；否则找“checkout 了 target 的 worktree”，`merge -q --ff-only integrated`，没有则 `update-ref`（`lander.ts:1036-1056`）。`refused` 报告并失败（`lander.ts:1057-1061`）；`moved` 时 `attempt < 3` 重试，否则 `fail('${target} kept moving during 3 attempts.')`（`lander.ts:1062-1065`，常量 `attempts = 3` 在 `lander.ts:209`）。
10. 组装 `Landed { sha: integrated, base, commits, paths, flaky }`（`lander.ts:1068-1074`），在同一提交里 `saved.landed ??= candidate`（首次 fast-forward 决定最终结果）并写 `items[conv].landed`（`lander.ts:1075-1083`）。
11. `landedReport`：`push(settings, sha)`（`lander.ts:792-807`）、`needsRestart` 判定（`lander.ts:812-814`）、`finish(...)`（`lander.ts:815-825`）。

**push。** 只在 `settings.push` 存在时执行，`step('pushing to <remote>')` 后 `git push -q <remote> <sha>:refs/heads/<target>`，推的是被检查的 commit 而不是当时的 branch（`lander.ts:792-801`）；失败且未重试过则 `retry(true)`，重试仍失败则 `fail('<remote> rejected the push')`（`lander.ts:802-806`）。

`submit` 提交后只调用一次 `host.harness().resume()` 启动任务（`workspaces.ts:781`），返回文案告诉提交者 lander 会在原地报告、可以继续工作（`workspaces.ts:778`）。

**report 阶段。** `finish()` 已把 checkpoint 设为 `{ phase: 'report', id, conversationId, outcome, text }`（`lander.ts:597-606`），其中 `text` 形如 `[lander] Submission <id> (#<conv>, <tip7>) <text>\nLog: lander conversation #<lander>.`（`lander.ts:604`）。`report` 阶段先做 deploy（第 5 节），再向提交者 `submit(..., whenBusy: 'followUp', requestId: 'lander:<id>')`（`lander.ts:1217-1230`），最后 checkpoint 回 `{ phase: 'next' }`（`lander.ts:1231`）。

`log()` 只在 `queued`、`started` 或 outcome 三类行上带 `subject`（`lander.ts:147-149`），避免每条 step 重复标题；`LanderLog` 是 `defineEntry('ultimate.lander')`，不携带 model message，因此任何模型都看不到这些日志（`lander.ts:39-40`）。

**结果文案。** `summary(landed, sha, how)` 生成 `landed[ locally] as <sha7> on <target>.` 或 `had nothing new to land on <target>.`，随后是 `Commits:` 列表、`Fixed by lander:` 列表、每条 `Flaky: <cmd>`（`lander.ts:608-616`）。`fail(reason, output?, hint?, diagnosis?)` 在已本地 landed 时把原因改成 `Push failed: …` 并保留 landed 结果，否则 `was not landed: …`；detail 依次拼 reason/output/hint/`Diagnosis by lander:`（`lander.ts:621-640`）。所以“push 失败”在数据上是 landed + reason，在文案上是 landed locally + Push failed。

**memo keys。** `prepared:${id}:${attempt}`（`lander.ts:840,1029`）、`merged:${id}:${attempt}`（`lander.ts:843,920`）、`check:${id}:${attempt}:${position}` 或 `...:${position}.${member}`（`lander.ts:949`）、其重跑 `${key}:rerun`（`lander.ts:969,995`）、`fix-verdict:${id}:${attempt}`（`lander.ts:760`）。注释明确 memo 是 first-writer-wins，所以 rerun 单独用 key（`lander.ts:947-948`）。

**不变量。** (a) 队列条目在被 `finish()` 删除前一定处于 `queued` 或 `landing`，`abort` 会把它们改回 `queued` 并清 `step`/`agent`（`lander.ts:1238-1243`）；`workspaces.resume()` 也做同样的重置（`workspaces.ts:279-283`）。(b) 只有 `prepared` 之后才允许 fast-forward，且 fast-forward 前再次核对 HEAD 与 `status`（`lander.ts:1019-1033`）。(c) `landed` 一旦写入就不再被覆盖（`??=`，`lander.ts:1079`），所以 push 重试只推送同一 sha。

**resume 语义。** 同一 attempt 内重放会复用 `merged`/`prepared`/check/rerun/verdict 的 memo；attempt 递增（push 重试或 fix 之后）则重新 merge、重新 setup、重跑全部检查（`lander.ts:775-787`、`933-1018`）。`entry.landed` 是唯一跨任务的落地记录，`finish()` 之前不会丢（`lander.ts:1066-1083`）。`workspaces.ts` 的 `resume()` 会把“有队列但 lander 任务已结束”的 source 重新置 `queued` 并 `startLander`，然后 `harness().resume()`（`workspaces.ts:266-289`）；打开时还先 `standLander()`、`sweepChecks()` 再 `resume()`（`wsserver.ts:196-235`）。`started` 集合区分“本版本代码启动的任务”与旧代码任务，前者 fault 只 notice、不自动重启（`workspaces.ts:63-67`；`wsserver.ts:206-223`）。

**超时。** 检查默认 `{ stall: 120 s, total: 600 s }`（`lander.ts:210-212`）；每检查 `timeout` 覆盖 total，且 stall 不超过它（`lander.ts:213-217`）。远端 git 命令 300 s（`lander.ts:397-398`）；setup 每条 120 s（`extensions/workspaces/setup.ts:27`）；`rematerializeLf` 120 s / 64 MiB（`lander.ts:92-98`）；`disk` 的 `du`/`btrfs` 120 s（`workspaces.ts:1038-1044`）。

## 3. 检查执行

**配置与分组。** `Settings = { checks: (Check | Check[])[], push?, deploy? }`，`Check = { command, timeout? }`（`lander.ts:200-207`）。`landerSettings` 从 `projectSettings().lander` 读；一个 entry 是命令字符串、`{command,timeout}`，或一个数组（并发组）；空数组、0/字符串 timeout、缺 command 都抛 `lander.checks must be …`（`lander.ts:327-355`）。`push` 必须是字符串（`lander.ts:356-357`）；`deploy` 见第 5 节。分组后：外层 `for (const [position, group] of settings.checks.entries())` 顺序执行（`lander.ts:933`），组内 `members` 用 `Promise.allSettled` 并发（`lander.ts:1004`），因此同一时刻只跑一个组，组内所有成员共享这一段墙钟。

这种“组间串行、组内并发”让昂贵的测试套件（本仓库 `pnpm test` 与 `pnpm test:e2e`）并行，同时保证 setup、fast-forward 等写操作不与检查重叠。组内某个命令失败时不会立刻中止同组其它命令，而是等 `Promise.allSettled` 全部结束再选第一个失败者交给 `handOver`（`lander.ts:1003-1016`），避免还有子进程在 checkout 里读写。

**进程环境。** 每次检查继承 `process.env`，只覆盖 `TMPDIR`/`TEMP`/`TMP` 到该次运行的临时目录（`lander.ts:303-310`），cwd 是 lander checkout；`runGroup` 在 pid 记录完成后关闭子进程 stdin（`pg.ts:160-169`）。setup 命令另有一层：`setup()` 主动 `child.stdin?.end()`，让等待 EOF 的命令结束（`extensions/workspaces/setup.ts:31`；`test/e2e/workspaces-integration.test.ts:424-440`）。

**本仓库的配置。** `.ultimate/settings.json` 的 `lander.checks` 是 `pnpm check`（timeout 120）、`[pnpm test（180）, pnpm test:e2e（180）]` 两组，`push: origin`（`.ultimate/settings.json:13-22`）。按 `limitsFor`，这三个检查的 stall/total 分别是 120/120、180/180、180/180 秒，而不是默认的 2 min/10 min；`docs/worktrees.md:13` 对这三条命令的描述与配置一致。

**watchdog。** `runLanderCheck(path, command, context, pids, temp, limits)`（`lander.ts:250-325`）：`mkdirSync(temp)` + `mkdtempSync(temp/<pid>-…)` 作为该次运行的 `TMPDIR`/`TEMP`/`TMP`（`lander.ts:259-260,305`）；`AbortSignal.any([watchdog, context.abortSignal])`（`lander.ts:265-269`）；`stop()` 只记第一个原因（`lander.ts:270-274`）；`stalled()` 文案 `Stalled: no output for <n>, stopped`（`lander.ts:275`）；两个定时器：stall（`lander.ts:276`）、total（`lander.ts:277-280`）。每收到输出就重置 stall（`lander.ts:296-297`），但 total 不重置。停止时返回 `{ failure: watchdogFailure(reason), timedOut: true }`（`lander.ts:316`），`watchdogFailure` 依次拼接“触发的原因”“截至当时的失败测试行”“输出尾”（`lander.ts:282-287`）。退出码非 0 返回 `output + exit <code>`（`lander.ts:317`）；成功取最后一行非空输出、去 ANSI、截 200 字符作 `summary`（`lander.ts:318-319`）。任务取消（context abort）会 `throwIfAborted`，不被当成 watchdog 失败（`lander.ts:311-315`）。

**输出尾与失败测试名。** 累积输出只保留最后 3000 字符（`lander.ts:289`）；跨 chunk 的半行保留 1000 字符（`lander.ts:290-291`）；`failedLine = /^\s*(FAIL|×|✗)\s/`（`lander.ts:219`），命中的行去 ANSI 后截 300 字符、去重存入 `failed`（`lander.ts:292-295`），报告时取最后 20 条（`lander.ts:283`）。`failure()` 统一把错误输出截到最后 3000 字符（`lander.ts:390-395`）。

**进程容器。** 检查命令经 `shell.argv(command)` 交给 host shell（`lander.ts:302`；`lib/shell.ts:132-136`：win32 用 PowerShell，其余 bash）。`runGroup` 带 `cwd: path`、`pidFile: <home>/lander-checks/<pid>-<uuid>.pid`、`grace: 2000`、`onOutput`（`lander.ts:303-310`）。POSIX 下 `spawnGroup` 用 `/bin/sh -c handshake` 且 `detached: true` 建立进程组，pid 文件（含 `.start` 启动时间）写成功后才放行（`pg.ts:12,124-171`）；停止时 `SIGTERM`，`grace` 后 `SIGKILL`（`pg.ts:111-117,200-221`）。Windows 下 `spawnWindowsGroup` 以 `Local\UltimateProcessGroup-<uuid>` 命名 Job Object，记录 `.start`/`.job`/`.pid`，停止用 `stopWindowsJob`/`TerminateJobObject`（`wpg.ts:322-379`、`wpg.ts:292`；`pg.ts:230-241` 校验 job 名防止误杀）。因此 `runLanderCheck` 的 stall/total abort 会杀掉整个进程组/Job（`test/e2e/lander-watchdog.test.ts:9-35` 用真实 `/bin/sh` + `/proc` 验证）。

**崩溃清扫 `sweepChecks`。** `checkPids = <home>/lander-checks`（`lander.ts:223`）、`checkTemp = <home>/lander-tmp`（`lander.ts:244`）。`sweepChecks(home)` 用 `sweepPidFiles(checkPids(home), name => name.startsWith(`${process.pid}-`))` 杀掉其它 pid 留下的组，并删除 `checkTemp` 下不以本进程 pid 开头的目录（`lander.ts:228-239`）；`sweepPidFiles` 只处理 `*.pid`，逐个 `stopGroup`（`pg.ts:335-352`）。注释说明 Pi 在扩展打开前就恢复 lander 任务，所以本进程名下的都是活检查（`lander.ts:224-227`）。打开时的调用在 `wsserver.ts:231-234`。

**flaky 重跑。** 每个命令有两次机会：第一次结果写入 `check:...` memo；失败则第二次写 `${key}:rerun`（`lander.ts:946-1002`）。第一次失败仍会把结果与 `output` 记进 lander 日志（`lander.ts:958-963`）；重跑通过则记 `result: 'flaky'` 的 step 并返回 `{ flaky: true }`（`lander.ts:975-985,1001`）；重跑再失败则只发 `CheckRan`（`failed`/`timeout`）并返回 `{ failure }`（`lander.ts:987-1001`）。组内所有命令 `settle` 完才处理失败，避免仍有命令在 checkout 里跑（`lander.ts:1003-1017`）；`flaky` 命令名累积进 `prepared.flaky`（`lander.ts:1017`），最终进 `Landed.flaky`（`lander.ts:1068-1074`）和报告 `Flaky: <cmd>`（`lander.ts:614-615`）。

**步进与事件。** `step(text, result?, output?, ran?)` 在同一个提交里：写 `queue[id].step = text`、追加 `ultimate.lander` 日志、若给了 `result + ran` 则 emit `CheckRan { submission, command, result: timedOut ? 'timeout' : result.result, ms }`（`lander.ts:526-549`）。step 行只带 `check`，`output` 只进 lander 日志（`lander.ts:136-137,537-541`；`wstypes.ts:47-52` 注释）。每个命令最多三类 step：`checking: <cmd>`（开始）、`checked: <cmd>`（带 `LanderCheck`，passed/failed；flaky 时 result 为 `flaky`）、`rerunning: <cmd>`（仅失败后）；卡片据此把同一命令的旧行折叠、只让最后一行转（`test/web/lander-log.test.ts:14-35`；实现 `extensions/workspaces/steps.tsx`）。

## 4. 模型失败路径

**触发点。** 只有两类失败交给模型：merge 冲突（`lander.ts:855-874`，包括 fixed、远端 target、提交 tip 三段）与“检查失败两次”（`lander.ts:1009-1016`）。push 拒绝、target 移动、checkout 被改、setup 异常、`it failed` 兜底都不进模型（`lander.ts:802-806,1019-1028,1062-1065,1085-1088`）。

**模式来源。** `landerAgent(host, context)` 在 `discoverAgents` 结果里找 `name === 'lander'`；没有定义时只返回主会话的 model/thinking、无 `onFailure`（`lander.ts:182-190`）；有定义时返回 `onFailure: definition.onFailure ?? 'diagnose'`，并对 `definitionAgent` 排除 `workspace` 工具，未显式带 `subagent` 时还排除 `subagent` 工具与 `subagents` 扩展（`lander.ts:191-198`）。所以在任何定义下 lander 都不能调用 `workspace`。

**交接。** `handOver(reason, output, hint, { base, conflict?, merging })`（`lander.ts:669-730`）：若已有 `fixed` 或没有定义/`onFailure`，直接 `fail(...)`（`lander.ts:675-687`）；否则取 `head`，按是否有 `conflict` 生成 `state` 文案（冲突时明确“the merge is in progress”，否则“HEAD <head> is the merge of <tip> (#<conv>) into <target>, set up as the checks run it”）`lander.ts:689-692`；`failurePrompt(...)`（`lander.ts:693-700`）；在一个提交里写 `queue[id].agent = mode`、`step = 'fixing' | 'diagnosing'`、`configure(tx, landerConversationId, change)`，checkpoint 进 `agent` 并携带完整 `Failure`（`lander.ts:701-729`）。

**prompt 构造。** `failurePrompt` 输出五行：`[lander] Submission <id> failed: <reason>`、`output`、空行、`Your checkout <integration> is left as it failed. <state>`、模式段（`lander.ts:449-472`）。`fix` 段要求“最小改动、Conventional Commits、保持 checkout clean、绝不 push/碰其它 checkout、所有检查重跑”，并列出永不修的四类：缺 shell/POSIX 工具、与提交无关的 CRLF/格式化基线、provider limit，及“环境或 gate 失败不在产品代码里修”（`lander.ts:470`）。`diagnose` 段只要求解释原因与最小修法、不改动（`lander.ts:471`）。同一 fence 也写在 `agents/lander.md:15`；`test/lander-prompt.test.ts:13-35` 三段断言把它钉住。

`state` 的两种文案决定了模型能否直接提交：冲突时它知道 merge 正在进行（应 `git commit --no-edit` 完成合并），检查失败时它知道 HEAD 已是“按检查方式搭好的 merge”，可以在其上追加修复提交（`lander.ts:689-692`）。模型可见的上下文还包括只出现在 lander 会话的 `lander_state` 段落：该 source 的队列（id、#会话、tip、state、step）与最近 8 条结果（outcome、sha、push、reason、fixed）（`wsserver.ts:300-327`）；失败 prompt 本身不带整个队列。

**requestId 与等待。** `conversation.submit({ type: 'input', content: prompt, entry: { kind: 'ultimate.lander-ask', data: ask }, whenBusy: 'followUp', requestId: `lander-agent:${id}:${attempt}` })`，然后 `.wait(context)`（`lander.ts:1103-1116`）；`ask` 为 `{ submission, conversationId, tip, target, at, mode, reason }`（`lander.ts:1094-1102`）。注释说明“一个提交的一次尝试只有一个请求，resume 等同一个 run”（`lander.ts:1104`）。结果：`done + input` 取 assistant 文本作 `answer`；`unanswered` 取 `reason`（如 `model_error`），否则取 `status`（`lander.ts:1117-1124`）；提交里 `delete queue[id].agent` 并回 `land`（`lander.ts:1125-1138`）。

**裁决。** `answered(handed)`（`lander.ts:732-788`）：`unfinished` → `reset()` + `fail("the lander's model did not finish (<reason>)")`，模型已提交的改动被丢弃（`lander.ts:733-740`；`test/e2e/workspaces-integration.test.ts:2142-2166` 钉住“提交后运行失败也不落地”）。`diagnose` → `reset()` + 以 `diagnosis` 失败（`lander.ts:741-744`；报告追加 `Diagnosis by lander:`，见 `lander.ts:626`）。`fix` → 依次检查：有未提交改动 `left uncommitted changes`、仍有 `MERGE_HEAD` `left the merge unfinished`、`head === handed.head` `added no commits`、不是 `handed.head`/`handed.merging` 的后代 `did not build on the failed merge`（`lander.ts:745-758`）；结论用 `fix-verdict:${id}:${attempt}` memo 固化在 cleanup 之前（`lander.ts:759-760`），不通过则 `reset()` + `fail`（`lander.ts:761-769`）；通过则取 `--first-parent` 的 `<handed.head>..<head>` 提交列表，checkpoint 回 `land`，attempt+1 且 `fixed = { commits, head }`（`lander.ts:770-787`）。

**一次修复上限。** `Carry.fixed` 一旦存在，再次失败时 `handOver` 不再调模型，提示 `The lander's fix (N commit[s]) did not land it either.`（`lander.ts:675-687`）；`test/e2e/workspaces-integration.test.ts:2024-2048` 断言 `asked === 1`。

## 5. Deploy handoff

**设置。** `lander.deploy` 必须是 `{ agent: 非空 string, paths: 非空 string[] }`，否则 `host.notice('lander.deploy must name an agent and a non-empty array of path prefixes; deploy hook disabled')` 并禁用该 hook（`lander.ts:358-377`）。`.ultimate/settings.json` 当前没有 `deploy` 段（`.ultimate/settings.json:13-22`），所以本仓库不会发生 deploy。

**触发点与匹配。** 只在 report 阶段且 `outcome.outcome === 'landed'` 时（`lander.ts:1140-1144`）：取 `results[id]`，若 `paths` 中任一条 `path.startsWith(prefix)`（`deploy.paths` 的某个前缀）则命中（`lander.ts:1152-1156`）。这是**原始字符串前缀**，不做路径段边界判断；`推断:` `paths: ["src"]` 会匹配 `src2/x`，spec 必须明确是否改成 `src/` 或做 segment-aware 匹配。

**前置条件。** `host.want(Handoff)` 必须存在（messages 提供，`wsapi.ts:41-47`；`extensions/messages/server.ts:87-90`），且 `discoverAgents` 里存在同名、`resident: true` 的定义；否则写 `deploy warning: @<agent> is not a standing agent (messages unavailable)` 并 notice（`lander.ts:1157-1171`）。

**请求与幂等。** 发送 `messages.send(landerConversationId, { to: '@<agent>', reply: false, text: [...] }, 'lander-deploy:<submission>', context)`（`lander.ts:1174-1189`），文本包含 `Please deploy landed commit <sha>.`、`Commits:`、`Matching paths:`、`Pushed: <remote/target|no>`、`Submitter: #<conv>.` 并要求回报提交者（`lander.ts:1179-1185`）。`Handoff.send` 的 requestId 幂等在 messages 的 `Requests` 文档（`scope: 'conversation'`，key 为 requestId）里做，命中直接返回旧 message id（`extensions/messages/send.ts:26-35,61-64,92-99`）。`messages.send` 的“消息入板 + receipt”在同一 `host.harness().commit` 内（`extensions/messages/send.ts:92-99`），随后 lander 才在另一个提交里记 `deploy → @<agent>` 步骤（`lander.ts:1199-1210`）。因此“发送成功、记步骤前崩溃”重放时不会重复发送，只会补记步骤；`test/e2e/workspaces-integration.test.ts:1154-1225` 用“发送后 commit 抛错”钉住恰好一次。

**失败语义。** handoff 异常只记 `deploy warning: handoff to @<agent> failed: …` 并 notice，不改变已 landed 的结果（`lander.ts:1191-1197`）；report 仍继续（`lander.ts:1214-1230`）。已记录的 `deploy →`/`deploy warning:` 步骤会在重放时被复用而不重发（`lander.ts:1147-1150`）。

**语义边界。** 这是单向消息，不是部署：lander 不等待、不重试、不检查部署结果；部署 agent 被要求完成后向提交者回报（`lander.ts:1184`），因此“部署成功/失败”不在 lander 状态机里，spec 不应把 deploy 当阻塞阶段。`deploy.paths` 与 `Landed.paths` 都来自 `git diff --name-only base..integrated`（`lander.ts:1072`），匹配的是本次落地改动的文件而非目录本身；只改 `cloud/README.md` 也会命中前缀 `cloud/`。

## 6. 队列与结果持久化

**文档。** `Workspaces` 是 root conversation 上的 `scope: 'conversation'` 文档，`version: 4`，`initial` 为 `{ items, queue, landers, landerConversations, results }`（`workspaces.ts:32-39`）；migrate 为 v4 之前的 queue/results 补 `steps: []`（`workspaces.ts:40-61`）。

队列是 root 文档上的单一数组，按 `source` 过滤即为每个 checkout 的 FIFO；`results` 是提交 id 到结果的映射，既服务提交者卡片（`extensions/workspaces/log.tsx:441-452`），也服务 lander 会话的 `lander_state` 段落（`wsserver.ts:308-310`）。`items[conv].landed` 与 `queue[id].landed` 的区别是：前者是“该会话最近一次落地”，后者是“这一次提交首次 fast-forward 的不可变记录”，用于 push 重试与崩溃恢复（`lander.ts:1066-1083`）。

| 数据                          | 写入点                                                                                            | 关键字段                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `landers[source]`             | `workspaces.ts:194-201`；删除 `lander.ts:501,1237`                                                | lander task id                                                                                                                                                                                                   |
| `landerConversations[source]` | 新建 `workspaces.ts:223-231`；已有则复用并重设 title/standing `workspaces.ts:217-222`             | 会话 id                                                                                                                                                                                                          |
| `queue[]` 新条目              | `workspaces.ts:750-769`                                                                           | `id = ${conversationId}-${tip7}-${Date.now().toString(36)}`（`:754`）、`conversationId`、`source`、`target`、`tip`、`at`（提交时最新 entry id，`:742`）、`divergence`、`state: 'queued'`、`subject`、`steps: []` |
| `queue[id].state`             | `lander.ts:504`                                                                                   | `'landing'`                                                                                                                                                                                                      |
| `queue[id].step`              | `lander.ts:536`                                                                                   | 当前步骤文案                                                                                                                                                                                                     |
| `queue[id].steps[]`           | `log()` 内 `entry.steps.push({ step, at, check? })`（`lander.ts:136-137`）                        | 供提交卡片                                                                                                                                                                                                       |
| `queue[id].agent`             | `lander.ts:705` 设；`lander.ts:1129` 删                                                           | `'fix'                                                                                                                                                                                                           | 'diagnose'` |
| `queue[id].landed`            | `lander.ts:1079` `saved.landed ??= candidate`                                                     | `Landed`（首次 fast-forward 记录）                                                                                                                                                                               |
| `items[conv].landed`          | `lander.ts:556,1082`；同步 land 也在 `workspaces.ts:711-713`                                      | fast-forward 后的 sha                                                                                                                                                                                            |
| `results[id]`                 | `lander.ts:557-567`                                                                               | `...outcome` + `at`（= 提交 entry）、`divergence`、`target`、`tip`、`lander`、`steps`（提交前的副本）、`conversationId`、`subject`                                                                               |
| 结果保留                      | `lander.ts:44` `kept = 50`；`lander.ts:568` `Object.keys(draft.results).slice(0, -kept)` 删除最旧 | 最多 50 条                                                                                                                                                                                                       |

`at` 不是时间戳，而是提交者最近一条 entry id（`workspaces.ts:742`；`wstypes.ts:20-21`），用于卡片面包屑 `#<conv>/<at>`；真正的时间在各 step 的 `at` 与 `results.steps[].at` 上。

`needsRestart` 只由“source 就是运行的 Ultimate clone 且改动触及 `server/` 或 `shared/`”产生（`lander.ts:812-814`；同步 land 同规则 `workspaces.ts:698-700`），最终由 outcome 卡片渲染 `Needs restart.`（`extensions/workspaces/log.tsx:90`）。

`finish()` 的顺序固定：先取 `steps`、从 queue 移除该条、写 `items[conv].landed`（若有 sha）、组装 `results[id]`、裁到 50 条、追加 outcome 日志、若 landed 则 emit `SubmissionLanded`，最后返回 report checkpoint（`lander.ts:551-607`）。

**事件。** `SubmissionLanded`（`workspaces.landed`）字段为 `submission`、`conversationId`、`at`、`sha`、`base`、`target`、`lander`、`divergence`、`title`（优先 `subject.title`，否则读 metadata，`:585-588`）、`summary?`、`feature?`、`commits`（前 10 条 `{sha,subject}`）、`commitCount`、`paths`（前 8）、`pushed?`（`lander.ts:570-595`；类型见 `wsrefs.ts:37-69`）。只在 `outcome === 'landed'` 时发，push 失败也仍是 landed（`lander.ts:570,634-639`）。`CheckRan`（`workspaces.check`）在 `step()` 和失败重跑的显式提交里各发一次（`lander.ts:543-548,987-994`；类型 `wsrefs.ts:71-76`）。

提交者卡片从 root 文档读 `queue` 与 `results`（`extensions/workspaces/log.tsx:441-452`），所以报告消息到达前卡片已能显示 outcome；报告只是把同一结果推进 transcript。`workspaces.lander-report` entry 携带完整 `outcome`，因此即使 `results` 后来被 50 条裁剪，历史卡片仍可渲染（`lander.ts:1223-1225`；`extensions/workspaces/log.tsx:128-132`）。

**报告回投。** `report` 阶段向提交者会话 `submit(...)`，内容 `[text, deployText].filter(Boolean).join('\n')`；仅当 `outcome` 存在才带 `entry: { kind: 'workspaces.lander-report', data: { id, outcome } }`（`lander.ts:1217-1230`）；`whenBusy: 'followUp'`、`requestId: 'lander:<id>'`（`lander.ts:1226-1227`）。提交者不在时 `?.submit` 为 no-op，但阶段仍前进（`lander.ts:1218,1231`）。该 entry 由浏览器注册为 `LanderReport`（`extensions/workspaces/web.tsx:118-120`；`extensions/workspaces/log.tsx:128-132`）。

**与 auto-conclude 的配合。** `lineage.conclude-landed` 只认 `lander:<submission>` 这个 requestId 的提交记录：`done` 才继续等待提交者空闲并 conclude；`unanswered`（provider 错误、Stop、reset）直接结束且保持分支打开；lander 会话先 idle 且报告从未出现（例如 lander 被 abort）也保持打开（`extensions/lineage/server.ts:588-643`）。因此报告的 requestId 是跨扩展契约，不能随意改。

**landing note。** lineage 只监听 `SubmissionLanded`：`conclude-landed` reactor 为提交者建后台 `lineage.conclude-landed` 任务（`extensions/lineage/server.ts:1443-1452`）；`landing-notes` reactor 找到提交者所在树的 root，root 是 tally 时用 `placeLanding` 在同一事务写，否则建 `lineage.landing-note` 任务，requestId `lander-root:<submission>`（`extensions/lineage/server.ts:1455-1473`）；提交者就是 root 或不在树中则跳过（`:1459`）。note 文本/数据生成见 `landingNote`（`extensions/lineage/server.ts:735-760`）。`conclude-landed` 等待 `lander:<submission>` 报告的状态：未答（`unanswered`）则保持分支打开；报告完成且会话空闲、没有 queued input、没有需要回复的问题、没有运行中的 subagent 才 `concludeIn`（`extensions/lineage/server.ts:588-660`；`keepsWorking` `:669-673`）。

## 7. Subagent 集成

**创建。** `subagent` 工具参数含 `isolate: 'none' | 'worktree'`（`extensions/subagents/server.ts:871-891`）。`isolated = definition && (args.isolate ?? definition.isolate ?? 'none') === 'worktree'`（`:956-957`），即只有具名定义才能隔离；父目录有未提交改动时只提示、不阻止（`:958-962`）。`createChild` 以 `parent.cwd ?? projectRoot` 为 cwd 建子会话（`:994-1009`），随后在**同一事务** `workspaces.create(tx, child.id, parent.cwd ?? projectRoot)`（`:1017-1022`），并用 `configure` 覆写 instructions：`Work only in <path> on <branch>, cut from <base>. Commit your work on this branch … Never push and never touch other checkouts.`（`:1023-1025`）。`workspaces.create` 里路径是 `<home>/worktrees/<child id>`、分支 `ultimate/<sha256(home) 前 6 位>-<id>`、`base = git(source, rev-parse HEAD)`、状态 `preparing`（`workspaces.ts:925-951`）。

子会话的第一次模型请求会等 `workspaces.ready`：`workspace_workflow` 段落在渲染时先 `await service.ready(...)`（`wsserver.ts:328-330`），准备任务完成前模型请求不会发出（`test/e2e/workspaces-integration.test.ts:343-384`）。子会话 cwd 在 `workspaces.create` 里就 `configure` 到 worktree 路径（`workspaces.ts:945`）；prepare 失败时工具被 `unavailable` gate 拦住并给出原因（`workspaces.ts:784-800`；`wsserver.ts:250-256`）。

**子会话拿到的工具。** `createChild` 经 `definitionAgent` 从父 agent 继承工具，再按定义的 `tools`/`denyTools` 过滤（`lib/agents.ts:115-160`；`extensions/subagents/children.ts:66-75`），子会话默认排除 `subagent` 工具与 `subagents` 扩展，除非定义显式包含 `subagent`（`extensions/subagents/server.ts:1002-1003`）。`workspace` 工具没有被排除，因此子会话可调用；但 `workspace submit`/`land` 在工具执行前检查 `row.owner`，owned 会话直接报 `Only a top-level main conversation can …`（`wsserver.ts:283-293`）；`workspace status` 对子会话可用（`wsserver.ts:278-282`）。`workspace_workflow` 段落也明确告知子会话“只能提交给你的 owner”（`wsserver.ts:328-339`）。

**`land` / `discard` 映射。** `subagent` 的 `action: 'land' | 'discard'` 先查 memo `workspace-operation`：已存在则报 `Workspace operation interrupted; call again`，否则写 memo 再调用 `workspaces[operation](args.id, context)`（`extensions/subagents/server.ts:917-924`）。即 `land` → `workspaces.land(id, context)`（`workspaces.ts:648-716`），`discard` → `workspaces.discard(id, context)`（`workspaces.ts:973-986`）。

**`land` 规则。** 要求 `idle(id, context, own=false)`（无 live run、无 queued input，`:654`；`busy` `:437-443`）；状态 `ready`（`:655`）；worktree 干净（`:656-657`）；source 当前 checkout 的 branch 必须是 `target`（`:658-661`）；worktree 的 branch 必须是记录的 branch（`:662-663`）；tip 已在 target 中则 `Nothing to land.`（`:666-676`）；否则若 target 不是 tip 的祖先就报 `Target moved or diverged; …`（`:677-686`）；最后 `git merge --ff-only tip` 并记录 `items[id].landed`（`:701-713`）。不 rebase、不 push（`:703` 文案与 `docs/worktrees.md:28-29`）。

**`discard` 规则。** `idle` 后若 state 不是 `removed`：登记为 worktree 则 `worktree remove`（不带 `--force`，`:979-980`），标记 `removed`，保留分支并返回 `Discarded isolate; kept branch <branch>.`（`:981-985`）。

**所有权与阻塞。** 子会话由 `Anchor` 后台任务所有（`extensions/subagents/server.ts:990-996`），因此 `owner` 存在 → 不能 submit/land 自己；`stop` 只取消其当前 run、reporters 与 watchdog，不提交也不删除，并列出未提交文件 `Left uncommitted in <path>: …`（`extensions/subagents/server.ts:1092-1186`，列表构造 `:1173-1184`）。`subagent list` 每行附带 `workspace` 与 `busy`（`extensions/subagents/server.ts:901-910`）。

## 8. Conclude / Release 集成

**API。** `ConversationsService.concludeIn(tx, ids)` 只做“标记已 conclude”，`ReleaseService.release(ids, caller): Promise<KeptWork[]>` 由 workspaces 实现（`capi.ts:27-31,83-88`）。`conclude` action 的顺序是：`harness.commit(tx => concludeIn(...))`，然后 `host.want(Release)?.release(ids, caller)`（`cserver.ts:183-188`）；`concludeIn` 校验会话存在、非 owned，再 `refuseFixed`（root 或 standing agent 拒绝），最后并入 `ext.conversations.concluded`（`cserver.ts:190-202`；`refuseFixed` `:101-112`）。`Release` 的实现是 `wsserver.ts:178`。

Conclude 的语义是“用户声明这条线结束”，不是“删除”：先标记，再尽力释放；释放失败只记录原因并保持 `ready`/`removed` 的真实状态，下一次 open 会再次 `release(concluded)`（`wsserver.ts:196-204`）。`concludeIn` 与 `release` 分两个事务，所以“已标记未释放”是合法中间态，spec 必须允许它。

**锁与顺序。** `release` 对每个记录 `await serial(record.source, …)`（`workspaces.ts:584`），与 lander、同步 land 共用 per-source 锁，所以释放不会与落地交错；`candidates` 的深度排序保证嵌套 isolate 先释放子再释放父（`workspaces.ts:467-473`），父记录只有在所有子都没有保留工作时才会被删（`workspaces.ts:604-617`）。

**候选与后代。** `candidates(ids)` 分页扫描全部会话（每页 256，`workspaces.ts:455`），建 `parents` 映射，然后对 `owned` 做传递闭包直到不再增长（`:462-465`），最后按“到根的深度降序”排序，保证后代先处理（`:467-473`）。深度用于 `release` 的顺序：先子后父。

**busy 检查。** `busy(id)` 返回两种原因：`Conversation is running; wait or stop it before landing or removal`（`LiveDoc.run` 存在）与 `Conversation has queued input; wait or cancel it first`（`InboxDoc.items` 非空）（`workspaces.ts:437-443`）。`release` 在 `serial(source)` 内、**提交事务里**再读一次 LiveDoc/InboxDoc 复核（`workspaces.ts:598-603`），并在 `state === 'preparing'` 时直接 `{ busy: 'Workspace is preparing' }`（`:587-589`）。

**保留与删除。** 对每个 id：取 `recordedCheckout`（ready/failed/removed 且磁盘存在；未登记且 state 非 ready 则不算，`:477-494`），用 `held()` 算 `uncommitted`/`unlanded`（`:125-148`；未登记的目录只数 source 中该分支的未落地提交），再扫 `index.items` 把“source 属于本组路径”的后代加入 `sources` 并给 `item.descendant`（`:604-613`）；只有当 `uncommitted/unlanded/descendant` 全为空才把记录置 `removed`（`:614-615`），若之前是 `removed` 但 worktree 仍登记则恢复 `ready`（`:616-617`）；有保留项就早退（`:621-624`）。真正的删除在 `finishRemoval`：重新发现新工作则回 `ready` 并返回（`:526-534`），核对 `HEAD` 等于记录的 branch tip（`:535-539`），`worktree remove`（不带 force，`:541`），仅当 branch 已并入 target 才 `branch -D`（`:545-557`），失败则写 `state`（ready/removed）+ `error` 并返回带 `reason` 的 `KeptWork`（`:559-568`）。祖先通过 `retained` 映射补 `descendant`（`:597,638-644`）。

**`KeptWork`。** `{ id, uncommitted, unlanded, busy?, reason?, descendant? }`（`extensions/conversations/types.ts:46-53`）。`pending` 只返回有未提交或未落地工作的项（`workspaces.ts:509-518`），侧栏在 conclude 前用它警告（`extensions/sidebar/sidebar.tsx:239`）。

## 9. Review 集成

**spec 语法（`extensions/review/refs.ts:5-11`）。**

| spec               | 解析                                                     | 两侧                                         | 标题                           | 位置                                              |
| ------------------ | -------------------------------------------------------- | -------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| `uncommitted`      | 工作树 vs `HEAD`，含 untracked、不含 ignored             | base=`HEAD`（无提交则空树），无 head         | `Uncommitted changes`          | `extensions/review/diff.ts:52-61,225-259,267-271` |
| `uncommitted:<id>` | **只在 action 层**解析成该会话 worktree 的 `uncommitted` | 同上，但 cwd 换成 worktree                   | `Uncommitted changes in #<id>` | `extensions/review/server.ts:109-113,166-176`     |
| `branch:<name>`    | `name` 对“它要落到的 target”                             | base=`merge-base(target, head)`，head=`name` | `<target>...<name>`            | `extensions/review/diff.ts:63-69`                 |
| `<a>...<b>`        | 恰好一个 `...`                                           | base=`merge-base(a, b)`，head=`b`            | spec 原文                      | `extensions/review/diff.ts:70-77`                 |
| `<sha>`/任意 ref   | 单提交 vs 第一父（根提交用空树）                         | base=`<sha>^1` 或空树                        | 提交 subject                   | `extensions/review/diff.ts:78-84`                 |

`plain(part, spec)` 拒绝空串、以 `-` 开头、含空白/NUL 的部分，防止被当成 git 选项（`extensions/review/diff.ts:24-28`）；`commit()` 用 `rev-parse --verify --quiet --end-of-options <ref>^{commit}`，未知 ref 报 `Not a commit: <ref>`（`:31-45`）。`...` 多于两段报 `Invalid spec`（`:70-73`）。

**target 与 worktree 解析。** `target(branch)` 先在 root 文档所有 `items` 里找 `item.branch === branch` 的记录并返回其 `target`（包括已 removed 的记录），否则用 `isolatable(projectRoot)` 的当前分支（`extensions/review/server.ts:33-41`）。`where(conversation)` 在该会话 workspace `state === 'ready'` 时返回其 `path`，否则返回 `projectRoot`（`extensions/review/server.ts:24-31`）。`worktreeOf(spec)` 只匹配 `^uncommitted:([1-9]\d*)$`（`extensions/review/server.ts:109-113`）。

**默认收件人。** `recipient(spec)`：`uncommitted:<id>` → 该 id；`branch:<name>` → 该分支记录所属会话；`<a>...<b>` → 用 `rev-parse` 解析 b，再在最近 200 条 `SubmissionLanded` 里按 `data.sha` 找提交者；`uncommitted` 或以 `-` 开头 → 无；其余按提交的 `Ultimate-Conversation` trailer 找；任何异常吞掉，最终 fallback 到 `SubagentsApi.standing('ultimate')`（`extensions/review/server.ts:119-158`）。

**ranges 选项。** 固定第一条 `uncommitted`（`extensions/review/server.ts:73-75`）；`refs/heads/ultimate/` 最近 20 个分支，但只保留 `items` 中 state 非 `removed` 的分支（`:76-88`）；最近 10 条 landing 用 `<base>...<sha>`（`:89-96`）；最近 15 个提交（`:97-105`）。无仓库/无提交时对应段为空，仅剩自由输入（`:63-70`）。

**渲染。** Review surface 的 spec 默认 `uncommitted`，存在 durable UI state（`extensions/review/link.tsx:5`）；它只传 `{ spec }`，不传 conversation，因此默认在项目 checkout 里跑 diff（`extensions/review/surface.tsx:485-487`）；`data.spec === spec` 才显示，避免旧结果闪回（`:495`）；文件/增删统计 `:546-552`；只有 `kind` 为 `commit` 或 `range` 且有 base/head 时才生成 DiffsHub/GitHub compare 链接（`:553-557`）。`Selector` 是 `RangesAction` 的分组列表 + 任意 spec 输入（`extensions/review/selector.tsx:31-113`，placeholder 明示 `uncommitted, <sha>, <a>...<b>, branch:<name>` `:72`）。`review` 扩展把 `workspaces.review` point 实现为 `openReview(spec)`（`extensions/review/web.tsx:42`；point 定义 `extensions/workspaces/landing.tsx:70-74`），landing 卡的 `CommitCount` 用 `<base>...<sha>` 打开（`extensions/workspaces/landing.tsx:92-135`）。

diff 的渲染上限：单文件 400 KiB、总计 8 MiB、git 缓冲 16 MiB；超限文件只列名字不给 hunk，`truncated` 标记整体截断（`extensions/review/diff.ts:8-13,149-172,174-199`）。这是 review 的契约而非 workspaces 的，但 spec 描述 landing 卡的 Review 入口时要知道大 diff 会退化。

**回退。** 会话没有 ready worktree（未创建、preparing、failed、removed）时 `where` 回退到项目 checkout（`extensions/review/server.ts:24-31`）；未知 ref 在 `recipient` 里被吞掉并回退到 @ultimate（`:152-157`）；`uncommitted:<id>` 在非 action 路径（直接调 `reviewDiff`）会报 `Not a commit`（`test/e2e/review.test.ts:70-72`）。

**发送 review。** `SendAction` 只允许用户触发（`userActions = ['send']`，`extensions/review/server.ts:160`），把 `review.comments` entry 以 `whenBusy: 'steer'` 投入目标会话（`:183-201`），再单独提交 `UserInputEvent`（`:202-216`）；Review surface 发送成功后只清除已发送的草稿，发送期间新增的评论保留（`extensions/review/surface.tsx:497-525`）。

## 10. Workspaces 之外的 UI 数据触点

| 位置           | 证据                                                                                                                                                                                                                                                                                                  | 读什么                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Info 面板      | `extensions/info/web.tsx:20` 导入 `useWorkspacesMeta`/`Workspaces`；`:426-432` 注册 `<Section id="workspaces" meta={useWorkspacesMeta()} title="Workspace">`；`:451` 把它放在第一段                                                                                                                   | `extensions/workspaces/panel.tsx:26-29` 的 meta 是队列长度（`N landing`），`Workspaces` 组件展示队列、当前会话 checkout 与统计 |
| status line    | `extensions/status-line/web.tsx:21` 导入 `useWorkspaceConversations`；`:51-84` 的 `Cwd` 用 workspace 是否存在决定显示 `#<id>` 还是路径，tooltip 里给 `workspace.path` 与 `workspace.branch`                                                                                                           | 每个会话的 `workspace` 记录                                                                                                    |
| titlebar       | `web/src/app/titlebar.tsx:24-44` `projectTitle`、`:46-58` `projectName`，正则 `/\/\.ultimate\/projects\/(.+)-[\da-f]{8}\/worktrees\/(\d+)$/`（`:35,52`）把 `<project>-<hash>/worktrees/<id>` 显示成 `<name> #<id>`                                                                                    | 运行在 worktree 里的 instance 预览                                                                                             |
| 侧栏 lander 行 | `extensions/sidebar/lander.tsx:4` 只导入类型；`:26-70` 用 `index.landerConversations` 找 source、`index.queue` 的 `landing/queued` 与 `index.results` 的最后一条带 sha 的结果算 `fixing/diagnosing/landing/queue N/多久前`                                                                            | lander 索引                                                                                                                    |
| 侧栏其它       | `extensions/sidebar/root.tsx:18`（`CommitCount`、`ProgressAction`、`Review`、`useWorkspaceIndex`）；`extensions/sidebar/rows.tsx:33`（`Review`）；`extensions/sidebar/sidebar.tsx:30-35`（`PendingAction`、`useWorkspaceConversations`、`useWorkspaceIndex`）与 `:239`（conclude 前 `PendingAction`） | 索引、进度、review 入口                                                                                                        |
| 其它扩展       | `extensions/plan/web.tsx:40`（`InfoAction`、`stateLabel`、`useWorkspaces`）；`extensions/activity/feed.tsx:18`（`CheckRan`、`SubmissionLanded`）；`extensions/self/web.tsx:21`；`extensions/instance/server.ts:26-27`；`extensions/watchdog/idle.ts:7`                                                | 只读消费                                                                                                                       |

这些外部 UI 都只读 `ultimate.workspaces`（`useDocOf(1, WorkspacesDoc)`，`extensions/workspaces/data.tsx:14-20`）或调用 workspaces 的 action；没有一个 UI 直接写文档。spec 新增字段时只需保证文档 shape 与 action 返回类型，侧栏、Info、status-line 会自动跟随。

## 11. 测试清单

| 文件                                      | 行数 | 钉住的行为                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/lander-checkout.test.ts`            | 40   | `rematerializeLf` 把 CRLF 跟踪文件从索引重建（`:25-32`），有未提交改动时不动（`:34-39`）                                                                                                                                                                                                                        |
| `test/lander-posix.test.ts`               | 32   | 检查经 host shell（win32 PowerShell / 其余 bash）的 `shell.argv` 运行（`:14-31`）                                                                                                                                                                                                                               |
| `test/lander-watchdog.test.ts`            | 167  | stall（`:44`）、输出重置 stall 但 total 到点即停（`:52`）、默认 2 min/10 min（`:60`）、每检查 timeout 覆盖 total 且封顶 stall（`:72`）、watchdog 报告保留已滚出尾部的 `FAIL`（`:92`）、settings 解析（`:113`）、取消不被误报（`:137`）、成功 summary 与定时器清理（`:146`）、每检查独立 TMPDIR 且清理（`:156`） |
| `test/lander-prompt.test.ts`              | 35   | fix prompt 的环境/门禁 fence（`:13`）、diagnose 无该 fence（`:23`）、内置 `agents/lander.md` 同文（`:29`）                                                                                                                                                                                                      |
| `test/lander-trust.test.ts`               | 53   | 项目 setup 选择/定义编辑/放弃时，lander 工具集在不重开的情况下被重配（`:14-53`）                                                                                                                                                                                                                                |
| `test/web/lander-log.test.ts`             | 36   | 并发组中已完成检查与仍在转的兄弟行、下一条普通 step 的 spinner（`:14-35`）                                                                                                                                                                                                                                      |
| `test/e2e/lander-watchdog.test.ts`        | 36   | 真实 `/bin/sh` 下 stall/total 杀整个进程组，pid/临时目录清空（`:9-35`）                                                                                                                                                                                                                                         |
| `test/e2e/workspaces.test.ts`             | 152  | 进程崩溃后恢复 preparation（symlink home / 分支先建两种场景），要求 POSIX（`:66-151`）                                                                                                                                                                                                                          |
| `test/e2e/workspaces-integration.test.ts` | 3057 | 82 个 `it`/`it.each` 声明：见下                                                                                                                                                                                                                                                                                 |
| `test/subagents.test.ts`                  | 2264 | lander overlay 工具/模型/指令合并（`:1674-1718`）；`isolate` 只接受 `none                                                                                                                                                                                                                                       | worktree`（`:1800-1801`）；保存定义含 `isolate: 'worktree'`（`:1889-1903`）；缺 agent 时各种参数形状（含 `isolate`）都报 unknown（`:396-408`）。**没有** worktree 创建/land/discard 的用例 |
| `test/e2e/process-group-windows.test.ts`  | —    | Windows Job Object：记录 runner、排空后代、单 runner abort 不影响其它、伪造 job 记录拒绝、pid 身份校验等（`:56,96,160,177,226,247,275,296`）                                                                                                                                                                    |
| `test/e2e/review.test.ts`                 | —    | 根提交对空树、rename/超限文件、range 与 `branch:<name>`（`:61-69`）、`uncommitted:<id>` 只在 action 层（`:70-72`）、untracked 不含 ignored（`:75-92`）、拒绝未知 ref/选项注入（`:94-107`）、symlink 与 type change（`:129-176`）                                                                                |

覆盖缺口：没有针对 `deploy` 配置非法、`push` 重试超过一次、`results` 50 条裁剪、`sweepChecks` 清扫他进程 pid 文件的直接单测；`test/e2e/workspaces-integration.test.ts` 主要用 faux provider 与真实 git 仓库组合，POSIX-only 用例在 Windows 上跳过（`:2883,2916`）。

**20 个最重要的用例（按证据密度挑选）。**

1. `test/e2e/workspaces-integration.test.ts:1581` `runs a check group concurrently and records each summary`
2. `:1621` `reruns only the failing command of a group, reports its output twice failed, and lands a flaky one`
3. `:1834` `resumes a landing interrupted before its push: pushes and reports what it landed, not the moved target`
4. `:1909` `resumes checks after a restart without rerunning passed ones and keeps flaky notes`
5. `:1991` `diagnose: the lander model explains a conflict, which the report carries; the target stays`
6. `:2024` `fix: a fix that still fails the check is not landed and leaves the target untouched`
7. `:2049` `fix: an environment check failure is reported and changes no product code`
8. `:2142` `fix: a model run that fails after committing lands nothing`
9. `:2206` `keeps user tool calls out of the lander checkout while it lands`
10. `:2234` `lands only the commit every check ran on, never one added to its checkout meanwhile`
11. `:2251` `fix: a follow-up queued behind the failure run gets nothing landed unchecked`
12. `:2304` `resumes a group after a restart without a third run of its twice-failed member`
13. `:2335` `fix: a rejected fix stays rejected when the lander crashes during its cleanup`
14. `:2372` `fix: the lander model resolves a conflict with the remote target, then the submission merges, checks and lands`
15. `:1546` `re-materializes a long-lived CRLF lander checkout before its checks`
16. `:1154` `hands matching landings to the deploy agent exactly once`
17. `:1271` `concludes a landed branch once its report run and subagents are idle`
18. `:2419` `pending and release preserve dirty and unlanded work, removing only landed checkouts`
19. `:2455` `release includes transitively owned checkouts but not unrelated conversations`
20. `:2510` `release keeps a busy clean checkout without waiting`

补充：`:710` `starts a worker isolate, commits in the child and lands it through the parent tool`、`:735` `stop lists what a worker left uncommitted and keeps it`、`:826` `emits one landed event and notes the root once, across a replayed report and a reopen`、`:2820` `resuming a child after its removal keeps the parent in the same release batch`。

## 12. 冲突、缺口与 spec 必须回答的问题

**G1 文档与代码冲突：冲突时是否 abort。** `extensions/workspaces/README.md:130` 写“A conflict aborts the merge and reports the conflicting paths”，但代码在交给模型时明确保留“the merge is in progress”（`lander.ts:690-692`），只有无模型、`diagnose` 后、或 fix 被拒时才 `reset()`/`merge --abort`（`lander.ts:657-664,680,734,742,762`）。`agents/lander.md:10` 的“left exactly as it failed”才与代码一致。

**G2 文档与代码冲突：setup 跑几次。** README 说 `isolates.worktree.setup` “runs once when the checkout is created”（`extensions/workspaces/README.md:125-126`），但 lander 每次 `land` 尝试都会在 merge 后跑一遍 `setup`（`lander.ts:930-931`）；`checkout()` 本身不跑 setup（`lander.ts:481-489`），`standLander` 创建 lander checkout 时也不跑（`workspaces.ts:245-249`）。spec 必须选“每次尝试”还是“每个 checkout 一次”。

**G3 `attempt` 一字段多用。** 同一个 `attempt` 同时是：重试预算（`attempts = 3`，`lander.ts:209,1063`）、memo key 的命名空间（`lander.ts:840,949,1029`）、模型 requestId 的一部分（`lander.ts:1112`）、以及 fix 后 attempt 的递增（`lander.ts:783`）。`推断:` 一个 fix 会消耗一次 target-move 重试预算；在 attempt=2 后 fix，再遇 target 移动就只剩一次机会。spec 应拆分 `retryBudget` 与 `fixBudget`。

**G4 断点续传捷径的额外条件。** README 说“whichever task picks the entry next skips merging and checks”（`extensions/workspaces/README.md:196-200`），代码却要求 `attempt === 1 && !pushRetried`（`lander.ts:832-837`）。`推断:` 在 push 重试后的 attempt=2 崩溃，不会走捷径，而会重新 merge、重跑全部检查；spec 要定义这是否是期望行为。

**G5 无文档的常量与保留策略。** `kept = 50`（`lander.ts:44,568`）、`attempts = 3`（`:209`）、`checkLimits`（`:212`）、`checkPids`/`checkTemp` 目录（`:223,244`）、`sweepChecks`（`:228-239`）、`needsRestart` 只匹配 `server/`、`shared/`（`:812-814`）都未写进 README/`docs`。spec 需要给出可配置项与默认值。

**G6 deploy 的边界。** (a) 前缀匹配是裸 `startsWith`（`lander.ts:1154`），不按路径段；(b) push 失败的 landed 仍会触发 deploy，消息里写 `Pushed: no.`（`lander.ts:1183`；`fail()` 的 landed 分支 `:634-639`）；(c) 只要求定义 `resident`（`:1164-1168`），不校验 standing 会话是否真的存在；(d) `deploy` 配置非法只 notice 并禁用（`:374-376`），而 `checks` 非法会让本次提交以 `it failed` 结束（`:353-355,828,1087`）。这四点都需要 spec 明确。

**G7 配置错与 fail-fast。** `landerSettings` 在 `land` 的 try 内调用（`lander.ts:827-828`），所以坏的 `lander.checks` 变成该提交的失败报告，而不是打开时就报错；`deploy` 坏则只 notice。spec 应统一“配置错误在何时、以何种可见性失败”。

**G8 工具 gate 的边界。** `landerOwnsCheckout` 只在 `queue` 中存在 `state === 'landing'` 的条目时拦截（`workspaces.ts:294-311`），且只在 `entry.agent` 存在时放行 `lander-agent:<id>:` 的请求（`:302-309`）；`agent` 阶段结束会 `delete saved.agent`（`lander.ts:1129`），所以失败后排在后面的 follow-up 工具调用会被拦（`test/e2e/workspaces-integration.test.ts:2251-2302`）。但**已开始在跑**的工具调用不会被拦，只能靠检查后的 `HEAD/status` 复核兜底（`lander.ts:1019-1028`；测试 `:2234-2249`）。spec 要写清这是“协作式”而非沙箱。

**G9 deploy 步骤的重放语义。** 已记录的 `deploy →`/`deploy warning:` 会阻止重发（`lander.ts:1147-1150`），但只有消息 receipt 能防“发送后、记步骤前”崩溃（`extensions/messages/send.ts:61-64,92-99`；测试 `:1154-1225`）。spec 需说明两步提交的窗口与幂等键。

**G10 文档漂移：README 的 lineage 句。** `extensions/workspaces/README.md:106-109` 在讲 `workspaces.check` 后紧接着说“Lineage reacts to it with a landing note”，读起来像 lineage 监听 `CheckRan`；实际 lineage 只监听 `SubmissionLanded`（`extensions/lineage/server.ts:1443,1455`），`CheckRan` 的消费者是 activity feed（`extensions/activity/feed.tsx:18,41`），没有 automations 订阅。spec 应写明事件消费者。

**G11 本机 gate 与配置矛盾。** `docs/worktrees.md:24-26` 说本 Windows host 上 lander 跑不了项目 gate（`pnpm test` 会 broad-fail 且超时），要用 `wsl-gate` skill；但 `.ultimate/settings.json:13-19` 仍配置 `pnpm test`/`pnpm test:e2e` 各 180 s。`推断:` 在这台机器上 lander 的检查必定失败并进入 rerun/fix 流程。spec 必须决定“配置即真相”还是“按 host 能力降级”。

**G12 超时预算与仓库配置。** `limitsFor` 让 `timeout` 同时成为 total 和 stall 的上界（`lander.ts:213-217`）；本仓库 `pnpm check` 是 120 s，因此 stall 也只有 120 s（`.ultimate/settings.json:15`；`test/lander-watchdog.test.ts:72-90` 钉住语义）。README 只写默认 2 min/10 min（`extensions/workspaces/README.md:131-136`），没写“每检查 timeout 会压缩 stall”。

**G13 未测区域。** `test/workspaces.test.ts` 不存在；worktree 创建/land/discard 的 subagent 路径只在 `test/e2e/workspaces-integration.test.ts:710-767` 覆盖，`test/subagents.test.ts` 只覆盖定义解析与 overlay（`:1674-1718,1800-1801,1889-1903`）。`test/e2e/workspaces-integration.test.ts:2883,2916` 是 POSIX-only 的分支删除失败恢复用例，Windows 无对应覆盖。spec 若要跨平台，需要补 Windows 的 release/分支恢复用例。

**G14 待确认的行为问题（给 spec writer）。** (1) `finish()` 用 `!` 假定 `queue[id]` 与 `items[conversationId]` 仍存在（`lander.ts:554-556`）；当前 abort/release 都不删这两处，但任何未来的清理都必须保持该不变量，spec 应写明。(2) `results` 裁剪按对象 key 插入顺序（`lander.ts:568`），id 含时间戳，顺序稳定但依赖 JS 对象语义；是否要改成显式 `at` 排序？(3) `landerOwnsCheckout` 只看 `state === 'landing'`，`report` 阶段（队列已删）不再拦截，是否允许用户在报告投递前对 lander 会话发工具调用？(4) `deploy` 目前在 `results[id]` 被 50 条裁剪后静默跳过（`lander.ts:1145-1156`），是否需要保留待 deploy 的 outbox？

**G15 文档缺口：`docs/worktrees.md` 的定位。** 它只有 45 行，主要是运维步骤（手动 worktree、instance 预览、standing push 权限），没有 lander 队列、memo、resume、deploy 的契约；真正的生命周期文档在 `extensions/workspaces/README.md:71-209`。spec 不应把 `docs/worktrees.md` 当行为规范。

**G16 submit 的幂等与字段校验。** `submit` 只按 `(conversationId, tip, state === 'queued')` 去重（`workspaces.ts:750-752`），不按 divergence；同一 tip 在 `landing` 中再次 submit 会新建一条 id（含 `Date.now()`，`:754`）。`divergence` 只校验非空（`:722-726`），`at` 必须能取到至少一条 entry（`:742-744`），否则报错。spec 要定义重复提交、空/纯空白 divergence，以及“提交后又被要求改”的语义。

**G17 给 spec 的验收建议。** 以 `test/e2e/workspaces-integration.test.ts` 的 82 个 `it`/`it.each` 声明为行为基线，但不要把它当完整契约：其中没有 Windows release 恢复、没有 deploy 的多前缀/空结果、没有 50 条 results 裁剪。spec 应把第 2–8 节的状态机与不变量写成可测条目，再用现有用例名做映射；每条不变量至少对应一个现有用例或一个新增用例，避免 spec 只描述意图而没有可执行的验收。

**G18 文档版本与代码重载。** `Workspaces` 的 `version: 4` 与 `migrate` 决定旧数据能否被新代码读取（`workspaces.ts:32-61`）；`started` 集合在模块重载后清空（`workspaces.ts:63-67`），所以“本版本任务 fault 只 notice、旧版本任务 fault 立即 resume”的判定依赖进程内状态（`wsserver.ts:206-223`）。spec 若改变文档 shape，必须同时定义迁移、以及迁移失败时 lander 队列如何继续。
