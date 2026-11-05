# dev/lxy 相对上游的差异清单

这份清单服务一次性的合并工作：把 `upstream/main` 合入 `dev/lxy`，再把 `dev/lxy` 合入 `main`。
它回答两个问题：**以 `upstream/main` 为准，`dev/lxy` 都改了什么**，以及**下一个上游合并轮次里，哪些改动必须重新落一遍**。

**合并已完成**（`96b47564`）：`main`、`dev/lxy`、`sync/upstream-1.5` 均在 `c97c08e0`，上游 484 个提交已全部包含。
冲突有 105 个文件，先全取上游，再按本文逐项恢复 `dev/lxy` 的部分；下面的第 10 节记录了每处恢复。

快照信息（清单按下表的分支 tip 生成，上游再前进时请重跑文末命令更新）：

| 名称               | tip        |
| ------------------ | ---------- |
| 本次合并的共同祖先 | `50dccfd8` |
| `main`             | `b8458057` |
| `dev/lxy`          | `116fe510` |
| `upstream/main`    | `eb19f7b8` |

规模：`dev/lxy` 自祖先起改 396 个文件，上游改 548 个，双方都改的 224 个；`git merge-tree` dry-run 报 **126 个冲突文件**，其中 11 个是 modify/delete 或 rename/delete。

---

## 1. 裁决总则

1. **上游是架构权威**：依赖、Pi 适配、被上游删除或改名的文件，一律跟上上游。
2. **`dev/lxy` 是 Windows 权威**：平台兼容处理（PowerShell、路径分隔符、进程树、CRLF、测试门禁）比上游全，保留 `dev/lxy`。
3. 双方各自实现过同一功能的（add/add），**逐行融合**，不整块选边。
4. 每类冲突裁决完立即 `pnpm check`，不要攒到最后。

---

## 2. 已在上游落地，`dev/lxy` 版本要丢弃

`git cherry -v upstream/main dev/lxy` 标 `-` 的 10 个提交，其补丁已存在于上游（上游可能用不同的提交写了一遍）。**这 10 个提交的 `dev/lxy` 版本不保留，冲突时取上游。**

| 提交       | 主题                                                     | 上游对应     |
| ---------- | -------------------------------------------------------- | ------------ |
| `1517d8cc` | Spawn helper: drain unread output at exit…               | `afffdf68`   |
| `f5d2ff5e` | mcp: reconnect after transport failures…                 | `16a71d81`   |
| `d6942fe8` | Sidebar: drop native tooltips…                           | 上游同名改动 |
| `76e94503` | Keep a dropped file from navigating the page…            | 上游同名改动 |
| `c5845f82` | Frame attached images in a box…                          | 上游同名改动 |
| `64b3a45f` | Leave unchanged dimensions out of a resized image's note | `80aea86f`   |
| `f8ec8eae` | composer: attach images with a paperclip…                | 上游同名改动 |
| `11f8bbd2` | Show a notice when a background compaction fails         | 上游同名改动 |
| `33910e2b` | Name the OS in the prompt's environment section          | 上游同名改动 |
| `a9b550ab` | Review: show a landed branch's range…                    | 上游同名改动 |

**由此可以简化三处原先要融合的地方**：`extensions/mcp/**`、`web/src/components/image-paste.tsx`、`web/src/components/image-resize.ts` 上游都已具备同等实现 → 冲突时**整块取上游**，不需要逐行融合。这也是用户在合并前就要求的取舍。

仍需注意 `lib/spawn-helper.ts` 与上游还差 9 行（`git diff dev/lxy upstream/main -- lib/spawn-helper.ts`），取上游后再单独确认这 9 行是否属于 Windows 修复，属于则补回。

---

## 3. 依赖与 Pi 适配：一律取上游

| 文件                                                  | 处理                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `package.json` 的 `@earendil-works/*`                 | 取上游 1.5.0（`dev/lxy` 的 `a7592148` 是自研同款升级）                                                              |
| `pnpm-lock.yaml`                                      | 冲突时整体取上游，然后 `pnpm install` 重生成                                                                        |
| `pnpm-workspace.yaml`                                 | `minimumReleaseAgeExclude`/`patchedDependencies` 取上游；只补回 `dev/lxy` 独有的耦合说明（spawn helper、chord SGR） |
| `patches/@earendil-works__pi-durable@1.5.0.patch`     | 取上游；`dev/lxy` 额外的 spawn/scheduler 补丁若上游已有则删，没有则在新基线上重做                                   |
| `patches/@earendil-works__pi-claude-code@0.1.0.patch` | 取上游；`dev/lxy` 的 `useSpawn()` 一处需要重新贴到新 patch 上                                                       |
| `docs/pi-upstream.md`                                 | 取上游 1.5.0 行，补回 `dev/lxy` 独有的耦合记录                                                                      |
| `cfcdbc43` 用 `pi-schema` 替 TypeBox                  | 上游 `0bb05358` 已做，**丢弃 `dev/lxy` 版本**                                                                       |

---

## 4. 上游已删除或改名：跟上上游

| 文件                            | 上游动作                                         | 处理                                   |
| ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `bin/cli.ts`                    | 删除（`17d186bf` 移除 emergency terminal agent） | 删除；`dev/lxy` 的改动一并丢弃         |
| `test/cli.test.ts`              | 删除                                             | 删除                                   |
| `agents/lander.md`              | 删除                                             | 删除                                   |
| `.ultimate/agents/lander.md`    | 删除                                             | 删除；lander 定义改由上游新位置提供    |
| `test/web/tasks-parked.test.ts` | 改名 `tasks-rows.test.ts`                        | 跟上，采用上游新文件                   |
| `test/e2e/claude-code.test.ts`  | `dev/lxy` 已删（`66ad98c0`）                     | **保留删除**（不要因为上游改过就恢复） |

---

## 5. 平台兼容处理：保留 `dev/lxy`（本轮合并的核心）

### 5.1 只在 `dev/lxy` 存在、上游完全没有的文件

上游没有对应实现，**必须完整保留**：

| 文件                                                              | 作用                                            | 引入提交                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| `lib/shell.ts`（128 行）                                          | 一个模块决定用 Bash 还是 PowerShell             | `db103c26`（随 `main` 而来）                               |
| `lib/node-range.ts`（102 行）                                     | 解析 `engines` 范围，`setup` 用它告警           | `1373354d`                                                 |
| `lib/windows-process-group.ts`（357 行）                          | Windows Job Object 进程树监管                   | `b131c394`（随 `main` 而来）                               |
| `scripts/affected.ts`（+545 行）                                  | 按改动选择要跑的测试                            | `304648a5`                                                 |
| `test/test-portability.test.ts`                                   | 平台兼容性自身测试                              | `main` 侧                                                  |
| `test/e2e/process-group-windows.test.ts`                          | Windows 进程组 e2e                              | `main` 侧                                                  |
| `skills/wsl-gate/SKILL.md`                                        | WSL 落地门禁流程（本机 lander 跑不了完整 gate） | `6cb1698d`、`79ccd67a`、`00493984`、`8aba16eb`、`297ee821` |
| `bin/open-window.ts`                                              | Windows 上开窗口                                | `main` 侧                                                  |
| `lib/remote.ts`、`lib/title.ts`、`lib/cloud.ts`、`lib/secrets.ts` | 平台/云相关辅助                                 | `main` 侧 + `11783577`                                     |

### 5.2 双方都有、`dev/lxy` 版本更全的文件

冲突时以 `dev/lxy` 为底，把上游新区块贴进来：

| 文件                                   | dev/lxy    | upstream   | 说明                                                          |
| -------------------------------------- | ---------- | ---------- | ------------------------------------------------------------- |
| `lib/process-group.ts`                 | 335 行     | 318 行     | `dev/lxy` 多出的部分是 Windows 处理                           |
| `extensions/setup/server.ts`           | 446 行     | 410 行     | Node engines 告警、路径分隔符                                 |
| `extensions/coding-tools/server.ts`    | 380 行     | 346 行     | cwd 执行、PowerShell 文件形式                                 |
| `extensions/prompt/server.ts`          | 367 行     | 354 行     | 环境段里报 OS                                                 |
| `extensions/browser/server.ts`         | 459 行     | **510 行** | **上游更大**：上游重构过浏览器发现，取上游后再补 Windows 分支 |
| `test/sweep-temp.ts`                   | 26 行      | 28 行      | 上游更大，取上游后补 `073079b1` 的容忍逻辑                    |
| `vite.config.ts`                       | 207 行     | 208 行     | `4c385084` 的 hook 时限                                       |
| `scripts/setup-machine.ts`             | 359 行     | 358 行     | `ce43a2bb` 的路径分隔符                                       |
| `lib/spawn.ts` / `lib/spawn-helper.ts` | 与上游同源 | 同源       | 取上游 + 补 `lib/spawn-helper.ts` 差的 9 行                   |

### 5.3 平台兼容提交索引（下一轮上游合并时按此核对）

**源码类**

| 提交       | 主题                                                         | 触及文件                                                                                                                                           |
| ---------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e57a3fbd` | Start child processes from a small helper process            | `lib/spawn.ts`、`lib/spawn-helper.ts`、`lib/exec.ts`、`server/{actions,harness,system}.ts`、`extensions/{claude-code,workspaces}/*`、patches、lock |
| `aef14bb4` | Spawn helper: close after output drains…                     | `lib/spawn*`、`extensions/workspaces/setup.ts`、`test/e2e/spawn.test.ts`                                                                           |
| `1517d8cc` | Spawn helper: drain unread output at exit…                   | `lib/spawn*`（**已在上游**）                                                                                                                       |
| `db103c26` | feat(shell): one module decides Bash or PowerShell           | `lib/shell.ts` 等                                                                                                                                  |
| `b131c394` | feat(process): supervise Windows process trees               | `lib/windows-process-group.ts`、`lib/process-group.ts`                                                                                             |
| `33910e2b` | Name the OS in the prompt's environment section              | `extensions/prompt/server.ts`（**已在上游**）                                                                                                      |
| `9feaaafe` | coding-tools：shell 调用可指定 cwd，声明 PowerShell 文件形式 | `extensions/coding-tools/{README,server}.ts`、`extensions/prompt/server.ts`、`test/coding-tools.test.ts`                                           |
| `1373354d` | setup：Node 不满足 `engines` 时告警                          | `extensions/setup/{README,server}.ts`、`lib/node-range.ts`、`test/node-range.test.ts`                                                              |
| `ce43a2bb` | 按宿主分隔符读写路径，不再假设 POSIX                         | `extensions/phase/state.ts`、`extensions/setup/server.ts`、`scripts/setup-machine.ts`、`test/cli.test.ts`、`test/lib.test.ts`                      |
| `304648a5` | 按改动选择测试                                               | `package.json`、`scripts/affected.ts`、`test/affected.test.ts`                                                                                     |
| `59a0a536` | 在 Windows 上验证 spawn helper                               | `test/e2e/spawn.test.ts`                                                                                                                           |
| `4c385084` | 复制仓库的 fixture 需要更长 hook 时限                        | `vite.config.ts` + 一个 design 文档                                                                                                                |

**测试门禁类**

| 提交       | 主题                                        | 触及文件                                                     |
| ---------- | ------------------------------------------- | ------------------------------------------------------------ |
| `1213145c` | automations 脚本 fixture 走产品所用的 shell | `test/e2e/automations-scripts.test.ts`                       |
| `efaf5917` | POSIX watchdog 用例在 Windows 上跳过        | `test/e2e/lander-watchdog.test.ts`                           |
| `4db108f1` | reset fixture 用 Windows 装得下的 home      | `test/e2e/reset.test.ts`                                     |
| `d719c929` | trailer 提交走宿主自己的 shell              | `test/e2e/commit-trailer.test.ts`                            |
| `1497d78c` | update fixture 用上游提交的字节克隆         | `test/e2e/update.test.ts`                                    |
| `073079b1` | 无法清理的旧临时目录不得中断整轮            | `test/sweep-temp.ts`                                         |
| `3c2fae49` | tailscale 用例需要 Windows 上不可用的 CLI   | `test/tailscale.test.ts`                                     |
| `66ad98c0` | 删除 Claude Code 测试套件                   | `test/claude-code-*.test.ts`、`test/e2e/claude-code.test.ts` |

**文档/skill 类**

| 提交                   | 主题                                    | 触及文件                                                                      |
| ---------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| `2ff96048`             | 点名那个不在 Windows 上跳过的 e2e       | `docs/running.md`                                                             |
| `693c5019`             | 快选与完整落地门禁是两条路径            | `docs/running.md`                                                             |
| `0762cecc`             | 两条 Windows 事实、一条过期 lint 规则   | `docs/running.md`、`extensions/dream/DREAM.md`、`skills/ego-browser/SKILL.md` |
| `8aba16eb`、`297ee821` | 负载敏感的失败怎么判、别等 load average | `skills/wsl-gate/SKILL.md`                                                    |

---

## 6. 只属于 `dev/lxy`、上游没有的功能（整体保留）

这些是产品功能，与平台无关，冲突时保留 `dev/lxy`；只有与上游同名文件冲突才手工合。

- `.ultimate/extensions/web-access/**`（4 个文件）+ `test/web-access.test.ts`
- `agent_design/**`（约 30 个文档，agent 设计文档集，含 `00bb08ffc`）
- `analysis_design/**`（约 25 个文档）
- `docs/{agent-message-interaction,task,whole_process}.md`
- `extensions/phase/state.ts`、`extensions/workspaces/paths.ts`、`extensions/coding-tools/{api,refs}.ts`、`extensions/coding-tools/bash-command.tsx`
- `web/src/components/image-*` **除外**（已在上游）

另有 `dev/lxy` 的功能提交（侧栏摘要悬浮卡 `7e525837`、Memory 布局 `a3ee4050`、MCP `9e8036b3`、instance 预览落地 `546ab1cd`、Claude Code 套件移除 `66ad98c0` 等），冲突时以 `dev/lxy` 为准。

---

## 7. `main` 独有的 57 个提交：平台权威来源

`upstream/main..main` 的 57 个提交（其中 16 个是 merge）几乎全是 Windows/平台适配，**`dev/lxy` 已全部包含**（它是 `main` 的直系后代）。因此：

- `main → dev/lxy` 无需任何操作。
- 合并结束后 `dev/lxy → main` 是 **fast-forward**，零冲突。
- 这些提交里的平台实现是本清单第 5 节的来源，下一轮上游合并时若 `dev/lxy` 被重建，需从 `backup/main-before-upstream-merge` 取回。

清单里无对应上游提交的部分（`main` 独有）：`eb602b27`、`09b70539`、`f1afaca7`、`35572725`、`db103c26`、`959ffef9`、`7d110d8b`、`b131c394`、`c97e435d`、`cd906d6a`、`df858e86`、`c86ee686`、`92c60588`、`675705b9`、`1f062a7a`、`ad12460b`、`0392faf9`、`56194ddc`、`798d7b12`、`a8070250`、`d24ac297`、`99e39369`、`c0df4502`、`3f1df9bd`、`c968a02d`、`6cb1698d`、`11783577`、`857ee1e2` 以及若干 docs/format 提交。

---

## 8. 执行顺序

```
① 备份：backup/main-before-upstream-merge = b8458057
        backup/dev-lxy-before-upstream-merge = 116fe510
② worktree：D:\learnspace\git\ultimate-upstream-sync  (分支 sync/upstream-1.5，从 dev/lxy 起)
③ 分层合并（每层一个 commit，每层跑 pnpm check）：
   ③-1 依赖与 patch  …… 第 3 节
   ③-2 删除/改名对齐 …… 第 4 节
   ③-3 平台兼容      …… 第 5 节（核心）
   ③-4 功能与文档    …… 第 6 节
④ pnpm install；确认 node_modules/.pnpm 只剩 1.5.0 一份 pi-durable
⑤ pnpm check + wsl-gate 全量测试
⑥ git switch dev/lxy && git merge --ff-only sync/upstream-1.5
⑦ git switch main   && git merge --ff-only dev/lxy
```

---

## 9. 重新生成本清单的命令

```powershell
git log --no-color --format='%h|%ad|%s' --date=short main..dev/lxy
git cherry -v upstream/main dev/lxy              # "-" 已在上游
git diff --name-only 50dccfd8 dev/lxy
git diff --name-only 50dccfd8 upstream/main
git merge-tree --write-tree --name-only dev/lxy upstream/main
git diff --stat dev/lxy upstream/main -- <某个平台文件>
```

上游再前进时，把本文的第 2、4 节替换为 `git cherry` 的新结果即可，其余各节按文件路径仍然适用。

---

## 10. 本轮合并实际恢复的 `dev/lxy` 内容

冲突里一律先取上游，然后逐项恢复。每一处都提交在 `merge 96b47564` 之后，按提交顺序：

| 提交       | 恢复的内容                                                                                                                                                                                                              | 为什么上游没有                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `7d0c76f4` | `lib/agents.ts` 的 `portableToolNames`/`runtimeToolNames`/`runtimeDefinition` 与 `definitionAgent` 的 `excludeTools` 归一；`extensions/subagents/server.ts` 把 `args.tools` 归一                                        | 上游无 shell 工具名映射，`bash` 在 Windows 不会变成 `powershell` |
| `7d0c76f4` | `extensions/watchdog/server.ts` 的静默空回复卡片与并发限流诊断/重试（`8c115fb5`、`4c76ec5a`）                                                                                                                           | 上游 watchdog 无这两个功能                                       |
| `7d0c76f4` | `extensions/subagents/children.ts` 身份行不写入标题（`51930d06`）                                                                                                                                                       | 上游会存空标题                                                   |
| `7d0c76f4` | `lib/process-group.ts` 的 Darwin zombie 判断                                                                                                                                                                            | 上游有，`dev/lxy` 版缺；两边取并集                               |
| `c25f3603` | `extensions/plan/server.ts` 按 key 形式区分状态集并命名错误；`extensions/subagents/server.ts` 列出可用子节点 id（`9086c7b1`）；`extensions/lineage/server.ts` 保留以 tool call 结尾的摘要（`72053e1f`）                 | 上游未做这三处                                                   |
| `8557f5a7` | `server/extensions.ts` 同名工具冲突报告（`6a33f59c`）；`scripts/setup-machine.ts` 的 `KillMode=mixed`；`server/vite-extensions.ts` 整套 Windows 归一（`normalizePath`、跨盘 `/@fs/`、结构重载）并接受上游 `broken` 参数 | 上游无 Windows 路径处理，且删掉了 `KillMode` 之外的这些能力      |
| `249c65a2` | `test/server-reload.test.ts` 去掉已不存在的客户端 HMR 断言                                                                                                                                                              | 上游改为生产包 + `hmr:false`                                     |
| `0633d749` | `test/e2e/commit-trailer.test.ts` 走宿主 shell 并断言 `dev/lxy` 的 amend/rebase 归属；`docs/pi-upstream.md` 去掉 claude-code 测试条目                                                                                   | 上游清单要求已删除的测试文件存在                                 |
| `d0e97f9b` | 删除 `test/claude-code-tool-ids.test.ts` 与 `dev/lxy` 已移除的 dropped-browser 用例                                                                                                                                     | 上游后加，用户要求 claude-code 套件整体不保留                    |

作为交换，以下 `dev/lxy` 内容按“上游为准”丢弃：`cfcdbc43`（改用 pi-schema，上游 `0bb05358` 已做）、`a7592148`（Pi 1.5.0 升级，上游 `669df90a` 已做）、每检查项 `stall` 的额外用例、`failurePrompt`、`removeCheckTemp`、摘要 token 预算（`SUMMARY_TOKENS`/`SUMMARY_RETRY_TOKENS`）。

门禁结果（WSL，干净 ext4 clone，`landing` 前）：`pnpm check` 通过；`pnpm test` 1311 passed / 1 skipped / 0 failed；`pnpm test:e2e` 323 passed / 8 skipped / 1 failed（`test/e2e/self-debug.test.ts > terminates an isolated instance after its owner is SIGKILLed`，在 `eb19f7b8` 基线上同样失败，属本机环境）。
