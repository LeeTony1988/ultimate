# 共享库与基础设施分析笔记（`lib/`）

## 1. 概览

`lib/` 是"核心与扩展都能用、但不属于任何一方"的纯逻辑层。它只允许 `node:*`、`shared/` 与 `server/` 的**类型**导入；
不得 import 扩展、web、bin。复刻时先把这一层做稳，扩展与核心都会薄很多。

## 2. 模块与职责

| 模块                       | 关键导出                                                                                   | 复刻要点                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `exec.ts`                  | `exec`                                                                                     | `promisify(execFile)`，不经过 shell                               |
| `git.ts`                   | `git(cwd                                                                                   | opts,...args)`、`empty`、`isolatable`、`noRepository`、`noCommit` | 30s 超时、1MB buffer；`isolatable` 判断 Git/分支/首提交 |
| `shell.ts`                 | `shellFor`、`fill`、`argv`、`script`、`ShellName`                                          | Bash/PowerShell 一处判定；`$NAME` 两壳互转                        |
| `process-group.ts`         | `spawnGroup`、`stopGroup`、`runGroup`、`sweepPidFiles`、`groupAlive`、`closeOutput`        | pid 文件 + 启动时间校验；POSIX 进程组；handshake 防"父死子活"     |
| `windows-process-group.ts` | `spawnWindowsGroup`、`stopWindowsJob`、`identifyWindows`                                   | C# Job Object（KILL_ON_JOB_CLOSE）；创建时间识别 owner            |
| `json-file.ts`             | `readJson`、`writeJson`、`updateJson`、`writeTextAtomically`                               | 临时文件+fsync+rename；符号链接保持；按路径串行                   |
| `settings.ts`              | `userSettingsPath`、`readSettings`、`updateSettings`                                       | 用户设置 `~/.ultimate/settings.json`                              |
| `secrets.ts`               | `readSecret`、`secretMetadata`、`validate*`                                                | `O_NOFOLLOW`；POSIX 拒绝 group/other 权限；≤16KiB                 |
| `database-files.ts`        | `moveDatabase`、`vacuum`                                                                   | db+`-wal`+`-shm` 一起移动；`VACUUM INTO`                          |
| `chapters.ts`              | `activeChapter`、`requestChapter`、`finishChapterSwitch`、`continueChapterIds`、`inFlight` | 切换日志、ID 连续、前台任务检查                                   |
| `agents.ts`                | `AgentDefinition`、`discoverAgents`、`definitionAgent`、`defaultModel`                     | frontmatter 解析、overlay 合并、模型解析                          |
| `actions.ts`               | `implementAction`、`ActionInput`                                                           | 编译期保证 handler 只读 ref 声明的参数                            |
| `api-files.ts`             | `apiSummary`、`apiFiles`                                                                   | 供 codemode 的 `ultimate.api` 读取契约                            |
| `compaction.ts`            | `compacting`、`admitCompaction`                                                            | 事务内检查/创建压缩任务                                           |
| `context-usage.ts`         | `promptTokens`、`contextUsage`、`lastAssistant`                                            | 上下文/用量计算（浏览器安全）                                     |
| `entries.ts`               | `isInput`、`imagesOf`                                                                      | 输入判定与图片提取                                                |
| `title.ts`                 | `shortTitle`                                                                               | 去掉 Markdown/章节名，取首个有空格的行                            |
| `ago.ts`                   | `formatAgo`                                                                                | now/5m/3h/2d/日期                                                 |
| `compare.ts`               | `compareUrl`                                                                               | diffshub 链接                                                     |
| `rate-limit.ts`            | `rateLimited`                                                                              | 429/限流与可重试判定                                              |
| `fast-forward.ts`          | `fetchOrigin`、`fastForward`、`otherTransport`                                             | 只快进；SSH/HTTPS 回退                                            |
| `project-identity.ts`      | `projectKey`、`githubRepo`、`projectIdentity`                                              | GitHub key + 根提交                                               |
| `remote.ts`                | `resolveProject`、`Target`、`REMOTE_BYTES`                                                 | 当前/本机/remotes/云端解析                                        |
| `cloud.ts`                 | `cloudConfig`、`fetchRegister`、`machineName`、`httpBase`                                  | 只读用户设置；token 来自 secrets                                  |
| `acting-as.ts`             | `actingAs`                                                                                 | side chat 代表主会话                                              |

## 3. 进程组细节（复刻重点）

POSIX 启动串：

```sh
bash -c 'read -r _ || exit 1; exec "$0" "$@"' <program> <args…>
```

- 先写 `<pid>` 与 `<pid>.start`，父进程确认后写一行释放 handshake；父进程若在写 pid 前死亡，子进程读到 EOF 直接退出。
- `setsid` 让子进程成为新进程组 leader；`kill(-pid, SIGTERM)` → grace → `SIGKILL`。
- `stopGroup` 只对"可证明属于我们"的组发信号：leader 未回收或 pid 文件启动时间匹配。
- `sweepPidFiles(directory)` 在启动时清理崩溃遗留的组。

Windows：

- 一段 C#（`windowsJobSource`）编译后作为 Job Object owner；
- `CreateJobObject` + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`；
- 目标以 `CREATE_SUSPENDED` 创建，入 Job 后 `ResumeThread`；
- `identifyWindows(pid)` 用创建时间识别；`stopWindowsJob(name)` 可跨进程停止。

用途：shell 工具、automations 脚本、workspace setup、instance、setup-machine。

## 4. 数据/文件细节

- `writeTextAtomically`：写 `.<uuid>.tmp` → `fsync` → `rename`；目标为符号链接时写最终目标。
- `updateJson`：进程内 Promise 链按路径串行，避免读-改-写丢键。
- `chapters.ts`：首章就是 home；后续在 `chapters/<name>/`；切换写 `pending-chapter.json`，下次打开时完成；
  `continueIds` 抬高目标库 `durable_metadata.next_id`，保证 `#id` 跨分卷唯一。
- `inFlight` 直接只读 SQLite：`tasks.status != 'terminal' AND background = 0`。

## 5. 远程与云

`resolveProject(project, local, register, machine?)` 顺序：

1. 当前项目；2. 本机运行中项目（`project.json` + lock 的 URL）；3. `settings.remotes`；4. 云端 register 的 tailnet 地址。
   `REMOTE_BYTES = 1MiB`；所有读取通过对方 `/api/*`，不复制 SQLite。
   `cloudConfig` 只读用户设置，token 来自 `ULTIMATE_CLOUD_TOKEN` 或 secrets。

## 6. 复刻风险

- 进程组不做启动时间校验会误杀复用 pid 的进程；Windows 不用 Job Object 会留下孙子进程。
- `writeTextAtomically` 不 fsync 在断电时可能丢文件。
- `chapters` 不抬高 next_id 会导致跨分卷 id 冲突（`#123` 指向两个会话）。
- `agents` overlay 合并顺序错会导致工具权限被意外扩大。

## 7. 证据

`lib/*` 各文件；重点 `process-group.ts:11-335`、`windows-process-group.ts:292-357`、`json-file.ts:41-84`、
`chapters.ts:1-170`、`agents.ts:1-586`、`remote.ts:1-168`、`fast-forward.ts:1-121`。
