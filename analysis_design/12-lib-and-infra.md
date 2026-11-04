# 12 · 共享库、脚本与基础设施（`lib/`、`scripts/`、`lint/`）

> 复刻目标：把"多个扩展都要用、但不应进入核心"的纯逻辑集中到 `lib/`；把机器安装/重置/恢复做成可重复脚本；
> 用自定义 lint 守住架构边界。

## 1. `lib/` 设计原则

- **纯函数/无状态**：不持有进程状态、不 import 扩展；只允许 `node:*`、`shared/`，以及 `server/` 的**类型**导入
  （`vite.config.ts` 的 `no-restricted-imports` 强制）；
- **可被服务端和扩展共同使用**：扩展不能 runtime import `server/`，所以共用逻辑必须下沉到 `lib/`；
- **浏览器安全**：少数文件（`compare.ts`、`entries.ts`、`ago.ts`、`context-usage.ts`）被纳入 `tsconfig.web.json`，
  不能 import Node。

## 2. 模块清单

| 文件                       | 职责                                                           | 关键导出                                                                                   |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `exec.ts`                  | `promisify(execFile)` 的极薄封装                               | `exec`                                                                                     |
| `git.ts`                   | 运行 git、判断可隔离性                                         | `git(cwd                                                                                   | opts, ...args)`、`empty`、`isolatable`、`noRepository`、`noCommit` |
| `shell.ts`                 | 平台 shell 抽象（bash / powershell）                           | `ShellName`、`Shell`、`shellFor`、`fill`、`argv`、`script`                                 |
| `process-group.ts`         | 拥有进程容器：后台进程树、超时、取消、pid 文件、孤儿清理       | `spawnGroup`、`stopGroup`、`runGroup`、`sweepPidFiles`、`groupAlive`、`closeOutput`        |
| `windows-process-group.ts` | Windows Job Object（KillOnJobClose）实现                       | `spawnWindowsGroup`、`stopWindowsJob`、`identifyWindows`                                   |
| `json-file.ts`             | 原子 JSON 读写（临时文件+fsync+rename，支持符号链接）          | `readJson`、`writeJson`、`updateJson`、`writeTextAtomically`                               |
| `settings.ts`              | 用户设置路径/读写                                              | `userSettingsPath`、`readSettings`、`updateSettings`                                       |
| `secrets.ts`               | 只读密钥存储（写入归 secrets 扩展）                            | `readSecret`、`secretMetadata`、`validateName/Value`                                       |
| `database-files.ts`        | 数据库三件套移动 + `VACUUM INTO`                               | `moveDatabase`、`vacuum`                                                                   |
| `chapters.ts`              | 分卷（多数据库）清单/切换/ID 连续                              | `activeChapter`、`requestChapter`、`finishChapterSwitch`、`continueChapterIds`、`inFlight` |
| `agents.ts`                | Agent 定义解析/发现/覆盖/默认模型                              | `AgentDefinition`、`discoverAgents`、`definitionAgent`、`defaultModel`                     |
| `actions.ts`               | 类型安全的 action 实现器                                       | `implementAction`、`ActionInput`、`TypedAction`                                            |
| `api-files.ts`             | 读扩展的 `api.ts`/`refs.ts` 摘要（codemode 的 `ultimate.api`） | `apiSummary`、`apiFiles`                                                                   |
| `compaction.ts`            | 在事务内安全地发起压缩                                         | `compacting`、`admitCompaction`                                                            |
| `context-usage.ts`         | 上下文占用/最后回答/token 估算                                 | `promptTokens`、`contextUsage`、`lastAssistant`、`estimate…`                               |
| `entries.ts`               | 输入/图片判定（浏览器安全）                                    | `isInput`、`imagesOf`                                                                      |
| `title.ts`                 | 从 prompt 生成短标题                                           | `shortTitle`                                                                               |
| `ago.ts`                   | 相对时间格式化（浏览器安全）                                   | `formatAgo`                                                                                |
| `compare.ts`               | GitHub compare 链接                                            | `compareUrl`                                                                               |
| `rate-limit.ts`            | 429/限流判定                                                   | `rateLimited`                                                                              |
| `fast-forward.ts`          | 只快进、不 stash/rebase/reset 的更新；SSH/HTTPS 互换回退       | `fetchOrigin`、`fastForward`、`otherTransport`                                             |
| `project-identity.ts`      | GitHub 项目 key + 根提交                                       | `projectKey`、`githubRepo`、`projectIdentity`                                              |
| `remote.ts`                | 解析其他项目实例的 URL（本机/remotes/云端注册）                | `resolveProject`、`Target`、`REMOTE_BYTES`                                                 |
| `cloud.ts`                 | 用户云配置/注册表/机器名                                       | `cloudConfig`、`fetchRegister`、`machineName`、`httpBase`                                  |
| `acting-as.ts`             | side chat 代表主会话                                           | `actingAs`                                                                                 |

## 3. 进程组（复刻重点）

`lib/process-group.ts` 解决的问题：shell 工具/自动化脚本会启动子进程树，**必须能可靠地全部杀掉**，且不能误杀复用了 pid 的
其他进程。

### 3.1 POSIX

- 以 `bash -c 'read -r _ || exit 1; exec "$0" "$@"' program args…` 启动：先写 pid 文件，父进程确认后再放行（handshake）；
- `setsid` 创建新进程组；`kill(-pgid, SIGTERM)` → 宽限 → `SIGKILL`；
- 通过 `/proc/<pid>/stat`（Linux）或 `ps -o lstart=`（macOS）记录启动时间，写 `<pid>.start`；
- 只有"leader 未被回收"或"pid 文件记录的启动时间匹配"才允许发信号；否则拒绝（防 pid 复用）。

### 3.2 Windows

- 编译并运行一段 C#（`windowsJobSource`），用 `CreateJobObject` + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`；
- 目标进程以 `CREATE_SUSPENDED` 启动，加入 Job 后 `ResumeThread`；
- 通过命名 Job + 创建时间识别 owner，`stopWindowsJob` 可跨进程停止；
- 需要 Windows PowerShell 5.1 来跑这段 native owner。

### 3.3 API

```ts
spawnGroup(program, args, opts): Group
  // Group = { child, ended, closed, stop?, force?, start? }
stopGroup({ pid, pidFile, leader, grace })
runGroup(program, args, opts): Promise<number>   // 退出码；信号=128+n
sweepPidFiles(directory, keep)                  // 启动时清理崩溃遗留
```

用途：`coding-tools` 的 shell、`automations` 的受监督脚本、`workspaces` 的 setup 命令、`instance`、`setup-machine`。

## 4. 原子文件与 JSON

`lib/json-file.ts`：

- `writeTextAtomically(path, text, { mode })`：在同目录写 `.<uuid>.tmp` → `fsync` → `rename`；
- 若目标是符号链接，解析到最终目标再写，保持链接（dotfiles 场景）；
- `updateJson(path, read, modify)`：进程内按路径串行（Promise 链），读-改-写，保留其他键；
- 解析失败抛出，调用方决定回退或提示。

## 5. Agent 定义（`lib/agents.ts`）

- `discoverAgents(host)`：从 clone、user、project 三个 `agents/` 目录读取 `.md`；
- 解析 frontmatter（`parseFrontmatter`），校验字段（未知字段报错）；
- 覆盖层合并（`addTools` 标记）：设置覆盖、工具追加、deny 追加、body 追加；
- `definitionAgent(definition, base)` → `AgentChange`（model/thinking/tools/denyTools/cwd/instructions）；
- `defaultModel(models, settings)`：按设置默认 provider/model，找不到则第一个可用模型；
- `resolveModel` 支持 `provider/id`、模糊 id/name、`:thinking` 后缀；
- 保存定义时写回 Markdown（`writeTextAtomically`），内置定义永不写，改为同名 override。

## 6. 远程实例（`lib/remote.ts` + `cloud.ts`）

解析顺序（`resolveProject(project, local, register, machine?)`）：

1. 当前项目（`current: true`）；
2. 本机其他运行中的项目（`project.json` + lock 的 URL）；
3. 用户 `settings.remotes`：`{ "<machine>": { "<project>": "<url>" } }`；
4. 云端 register 中该机器最后一次备份登记的 tailnet 地址。

- `REMOTE_BYTES = 1 MiB`：远端 JSON 响应上限；
- 所有读取走对方 `/api/*`（codemode 的 `ultimate.conversations/entries/search/trace/doc` 带 `{project}`）；
- `ultimate.tell({project,text})` 只发给该项目 @ultimate；
- 不复制对方 SQLite，不 fallback 到本地副本。

## 7. 脚本

### 7.1 `scripts/setup-machine.ts`（357 行）

机器初始化：检查 Node/pnpm 版本、安装依赖、安装/定位 Chromium（`/usr/bin/chromium`、Chrome、Playwright 缓存、
`ULTIMATE_CHROMIUM`）、Git 配置、可选 `claude` CLI 登录提示。幂等、可重复。

### 7.2 `scripts/deps.ts`（117 行）

扫描 `extensions/*/api.ts`/`server.ts`/`web.tsx` 的 import 与 `need`/`want`，构建扩展依赖图；
输出图并检查：

- 有环 → 失败；
- core tier 依赖 optional → 失败。
  `pnpm check` 的一部分。

### 7.3 `scripts/reset.ts` / `scripts/restore.ts`

见 13 章 §7：日志式、可中断续跑、先备份后移动、不删除。

## 8. 自定义 lint（`lint/ultimate.ts`，602 行）

| 规则                                                                       | 检查                                                             |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `api-file-shape`                                                           | `api.ts`/`refs.ts`/`ui.tsx` 的文档注释、允许的语句、token 文档   |
| `api-naming`                                                               | `defineApi`/`defineEvent`/`actionRef` 的命名                     |
| `api-only-imports`                                                         | 跨扩展 runtime 导入只允许 `api.ts`（server）/`ui.tsx`（browser） |
| `core-tier-deps`                                                           | core 只依赖 core                                                 |
| `no-raw-services`                                                          | 禁止 `host.provide/use`                                          |
| `no-raw-stream`                                                            | 浏览器禁止直接消费原始流（必须用 SDK）                           |
| `no-retired-ui`                                                            | 禁止旧 UI 标签/页面                                              |
| `replay-safe-reason`                                                       | `replay:'safe'` 前必须有注释说明为何可重跑                       |
| `no-silent-catch`                                                          | 空 catch / 返回 undefined 的 catch 必须写原因                    |
| `no-test-timeout` / `no-real-wait-in-fast-tests` / `no-local-test-polling` | 测试质量                                                         |

复刻时这套规则可以简化，但 `api-only-imports`、`core-tier-deps`、`replay-safe-reason` 建议保留——它们直接保护架构。

## 9. 补丁（`patches/`）

| 补丁                                          | 内容                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@earendil-works__chord@1.4.0.patch`          | `sanitizeOutput` 移除完整 CSI/OSC 控制串，保留数字 SGR                               |
| `@earendil-works__pi-durable@1.4.0.patch`     | `beforeInput` 事务钩子、输入来源标记、记录 thinkingLevel、`Harness.hold()/release()` |
| `@earendil-works__pi-claude-code@0.1.0.patch` | 重建 replay cache、未完成响应措辞、MCP 前缀工具解析、inline tools                    |

复刻时若不能打补丁：

- `beforeInput` 可用 `prompt` 扩展的输入注入替代（但会失去"输入放置"原子性）；
- `Harness.hold()` 可用 `pause` 扩展的应用层暂停替代；
- Claude Code provider 可暂不支持。

## 10. 复刻顺序

1. `exec.ts` → `git.ts` → `shell.ts` → `process-group.ts`（先 POSIX，Windows Job Object 后补）
2. `json-file.ts` → `settings.ts` → `secrets.ts`
3. `database-files.ts` → `chapters.ts`
4. `actions.ts` → `agents.ts` → `compaction.ts` → `context-usage.ts`
5. `remote.ts`/`cloud.ts`（依赖 cloud 配置，可最后）
6. `scripts/*` 与 `lint/*` 随核心稳定后补齐

## 11. 验收

- [ ] `runGroup('bash',['-c','sleep 10'])` 后 `stopGroup` 在 3s 内杀掉整个进程树（含子进程）。
- [ ] 杀父进程后重启，`sweepPidFiles` 清掉遗留组。
- [ ] `writeTextAtomically` 在写入中途 kill -9 不留下半个 JSON。
- [ ] `updateJson` 并发调用不丢键。
- [ ] `resolveProject` 能区分当前/本机/remotes/云端，并在多匹配时报错。
- [ ] `scripts/deps.ts` 能检测出人为制造的 core→optional 依赖。

## 12. 证据索引

- `lib/*` 各文件头注释与导出（本表逐项对应）
- `lib/process-group.ts:11-335`、`lib/windows-process-group.ts:1-357`
- `lib/chapters.ts:1-170`、`lib/database-files.ts:1-23`
- `lib/json-file.ts:41-84`、`lib/secrets.ts:1-62`
- `lib/agents.ts:1-586`、`lib/actions.ts:1-39`
- `lib/remote.ts:1-168`、`lib/cloud.ts:1-84`
- `scripts/deps.ts`、`scripts/setup-machine.ts`、`scripts/reset.ts`、`scripts/restore.ts`
- `lint/ultimate.ts`、`patches/*`
