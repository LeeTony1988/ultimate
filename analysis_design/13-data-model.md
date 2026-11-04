# 13 · 数据模型与持久化布局

> 复刻目标：知道每一个字节落在哪里、谁写、如何恢复、保留多久、如何备份。
> 证据：`server/project.ts`、`server/harness.ts`、`lib/chapters.ts`、`lib/database-files.ts`、`lib/secrets.ts`、`scripts/reset.ts`、`scripts/restore.ts`、`extensions/cloud/*`、Pi Durable schema。

## 1. Home 布局总览

```
~/.ultimate/
├─ secrets.json                 0600  用户全局密钥 { NAME: {value, updatedAt} }
├─ secrets.json.lock            SQLite 互斥锁
├─ trust.json                   ProjectTrustStore：项目路径 → 是否信任其 .ultimate/
├─ settings.json                用户设置（extensions、remotes、fastModels…）
├─ health.json                  每台机器的 provider 健康
├─ projects/
│  └─ <basename>-<sha256(root)[0:8]>/
│     ├─ project.json           {root,name,openedAt}
│     ├─ conversations.json     [{id,title,label,cwd,inputAt,answerAt}]（公开索引，1s 去抖）
│     ├─ ultimate.lock          supervisor 锁（JSON sidecar）
│     ├─ ultimate.lock.db       SQLite 锁库（BEGIN EXCLUSIVE）
│     ├─ storage.lock           core 锁（JSON sidecar）
│     ├─ storage.lock.db
│     ├─ state.sqlite           Pi Durable 主库（+ -wal/-shm）
│     ├─ trace.sqlite           调用追踪（+ -wal/-shm）
│     ├─ supervisor.log         JSONL 日志
│     ├─ vite/                  Vite 依赖缓存
│     ├─ chapters.json          分卷清单 {active, chapters[{name,createdAt?}]}
│     ├─ pending-chapter.json   分卷切换日志
│     └─ chapters/<name>/       state.sqlite + trace.sqlite
<project>/.ultimate/
├─ settings.json                项目设置（信任后生效）
├─ README.md                    首次信任展示（≤16KB）
├─ extensions/                  server.ts/web.tsx/…
├─ agents/*.md
├─ skills/*/SKILL.md
└─ automations/<slug>/run       项目级自动化脚本
```

Pi 自身：`PI_CODING_AGENT_DIR` 或 `~/.pi/agent`（auth.json、models.json、settings.json），Ultimate 与 pi 共享登录。

## 2. SQLite 主库（Pi Durable schema）

表（`@earendil-works/pi-durable` 的 `createSqliteSchema()`）：

| 表                   | 内容                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `durable_schema`     | schema 版本/迁移记录                                                                              |
| `durable_metadata`   | 单例元数据，含 `next_id`（全局记录 id 分配器，TEXT 存储）                                         |
| `record_ids`         | id 命名空间/品牌                                                                                  |
| `conversations`      | 会话记录：id、owner（conversation/task）、parent（fork 来源）、createdAt…                         |
| `entries`            | 条目：id、conversation_id、kind、data(JSON)、model(JSON)、head?、edits?、createdAt                |
| `tasks`              | 任务：id、conversation_id、kind、status、state(JSON)、background、abort_requested、restart_count… |
| `submissions`        | 输入提交：id、conversation_id、status、reason、request_id、entry…                                 |
| `documents`          | 文档当前 incarnation：address(scope/owner/kind)、version、base/delta…                             |
| `document_revisions` | 可回溯文档的历史 revision（`history:'rewindable'`）                                               |

索引（同样来自 schema）：`conversations_by_owner_conversation`、`conversations_by_owner_task`、
`entries_by_conversation`、`entry_heads_by_conversation`、`tasks_by_status`、`tasks_by_conversation`、
`tasks_by_kind`、`tasks_by_abort_requested`、`tasks_by_background`、`submissions_by_request`、
`submissions_by_conversation`、`submissions_by_status`、`documents_by_address`、`documents_by_scope`、
`documents_by_scope_kind`、`document_revisions_by_kind`。

> Ultimate 不直接写这些表（除 chapters 的 `next_id` 更新）；所有写入经 `Harness.commit(tx => …)`。

## 3. 文档清单（kind → 位置 → 语义）

| kind                       | scope                | history/fork    | 所有者     | 作用                                                                   |
| -------------------------- | -------------------- | --------------- | ---------- | ---------------------------------------------------------------------- |
| `pi.agent`                 | conversation         | rewindable/asOf | Pi         | 模型、思考级别、扩展选择、工具过滤、cwd、instructions；fork 从分叉点取 |
| `pi.usage`                 | conversation         | latest/initial  | Pi         | 每模型/每工具花费与 token                                              |
| `pi.live`                  | conversation         | latest/initial  | Pi         | 当前 run、流式 partial、运行中工具、重试、压缩                         |
| `pi.inbox`                 | conversation         | latest/initial  | Pi         | 排队 steer/follow-up/write                                             |
| `ultimate.metadata`        | conversation         | latest/initial  | server     | title/label/inputTitle/inputAt/answerAt                                |
| `ultimate.ui`              | conversation（root） | rewindable/asOf | server     | 跨端 UI 状态（`ui.rev` 排序）                                          |
| `ultimate.events`          | conversation（root） | latest/initial  | server     | 事件日志会话 id + 每个 reactor 的 cursor                               |
| `ultimate.event-feed`      | conversation（root） | latest/initial  | server     | 最近 100 条事件（`useEvents`）                                         |
| `ultimate.plan`            | conversation         | 扩展定义        | plan       | epic/task 账本                                                         |
| `ultimate.todos`           | conversation（root） | 扩展定义        | todos      | 项目待办                                                               |
| `ultimate.workspaces`      | conversation（root） | 扩展定义        | workspaces | worktree/landing 记录                                                  |
| `ultimate.lineage`         | conversation（root） | 扩展定义        | lineage    | 树/分支/tally/memory                                                   |
| `ultimate.subagents`       | conversation         | 扩展定义        | subagents  | 子智能体索引                                                           |
| `ultimate.standing-agents` | conversation（root） | 扩展定义        | subagents  | name→conversationId                                                    |
| `ultimate.questions`       | conversation         | 扩展定义        | questions  | 待回答的问题卡                                                         |
| …                          |                      |                 |            | 其余见各扩展 `refs.ts`                                                 |

`history:'latest'` 只留当前状态；`'rewindable'` 可按 entry 读取（`snapshotAsOf`）；`fork:'initial'` 在分支时重置，
`'current'` 复制当前，`'asOf'` 复制分支点。

## 4. 分卷（Chapters）

`lib/chapters.ts`：一个 home 可以有多个数据库"分卷"，同一时间只开一个。首个分卷就是 home 本身（`state.sqlite`），
因此从未切换过的 home 没有 `chapters.json`。

```json
// chapters.json
{ "active": "the-beginning", "chapters": [{ "name": "the-beginning" }, { "name": "fresh-roots", "createdAt": 171… }] }
```

切换流程：

1. `requestChapter(home, to, by?)`：校验名称 `^[a-z0-9][a-z0-9-]{0,39}$`；检查目标库是否有**前台**未完成任务
   （有则拒绝，因为一打开就会恢复）；写 `pending-chapter.json {to, by}`。
2. 下一次打开存储前 `finishChapterSwitch(home, create)`：
   - 若 `pending.by === process.pid`（同一个进程重开）→ 说明换代失败，删除 pending，留在原分卷；
   - `mkdir` 目标目录；`create(database)`（幂等，崩溃可能留下无 schema 的文件）；
   - 新分卷加入清单；
   - `continueIds(otherDatabases, target)`：把目标库 `durable_metadata.next_id` 提升到所有分卷的最大值，
     保证 `#123` 跨分卷唯一；
   - 写 `chapters.json`，删 pending。
3. 每一步可重复；中断的切换在下次打开时继续。

`inFlight(database)` 直接只读 SQLite：
`SELECT DISTINCT conversation_id FROM tasks WHERE status != 'terminal' AND background = 0 ORDER BY id`。

## 5. 锁

| 锁                  | 持有者       | 文件                            | 机制                                                         |
| ------------------- | ------------ | ------------------------------- | ------------------------------------------------------------ |
| `ultimate.lock`     | supervisor   | `home/ultimate.lock` + `.db`    | SQLite `BEGIN EXCLUSIVE` + JSON sidecar `{pid,port,project}` |
| `storage.lock`      | core         | `home/storage.lock` + `.db`     | 同上，`{pid}`；supervised 时等待 10s                         |
| `secrets.json.lock` | 写密钥的进程 | `~/.ultimate/secrets.json.lock` | 同上，等待 120s                                              |

锁文件是"所有者信息"，真正的互斥是 SQLite 事务；崩溃后 sidecar 残留由 `stale` 检测与 `retireStorageOwner` 处理。

## 6. 保留策略与大小上限

| 数据                 | 限制                                            |
| -------------------- | ----------------------------------------------- |
| 事件 feed            | 最近 100 条（`EVENT_FEED_SIZE`）                |
| build history        | 最近 20 条                                      |
| trace                | 7 天、最多 200,000 行；批量写入；失败不影响调用 |
| UI state             | 单次写入后总 JSON ≤ 256 KiB；键 ≤200 字符       |
| HTTP body            | 默认 1 MiB；submit/action 12 MiB                |
| 图片                 | ≤4 张，每张 ≤2 MiB                              |
| `conversations.json` | 每项目所有顶层会话，1s 去抖                     |
| agents 指令          | dream handoff ≤12,000 字符                      |
| 项目 README          | 首次信任展示前 16 KiB                           |

## 7. reset / restore（`scripts/reset.ts`、`scripts/restore.ts`）

### 7.1 Reset（开始全新状态）

- 用法：`pnpm reset [dir] [--dry-run] [--yes]`。
- 移动集合 `MOVES`：`state.sqlite*`、`trace.sqlite*`、`state.stale-*`、`chapters/`、`chapters.json`、
  `pending-chapter.json`、`conversations.json`、`previews.json`、`supervisor.log`。
- 备份目录：`<backups>/reset-<ISO>/<home basename>/`；**不删除**任何东西。
- 先写 `home/reset.json` 日志（`{backup, restore?}`），再移动；中断后重跑会继续到同一备份。
- 有进程持有 `ultimate.lock`/`storage.lock` 时拒绝（`holder()` 检查）。
- 完成后新 home 首次启动重建一切。

### 7.2 Restore（安装云备份）

- 用法：`pnpm restore [name|key] [--snapshot id] [--chapter name] [--dir project] [--yes] [--dry-run]`。
- 从 cloud 的 register 找项目 → 下载快照 → 安装为 `state.sqlite`（先移动当前状态到备份）。
- 恢复指定分卷时写 `chapters.json`/`pending-chapter.json`，并 `continueChapterIds` 保证 id 连续。
- 同样有 `reset.json` 日志；中断后重跑继续。

## 8. 云备份（`extensions/cloud`，默认关闭）

- 配置在用户设置（endpoint/bucket/key），惰性启用；
- `cloud.backup` 事件记录 started/done/failed；
- 快照是加密的项目状态（`state.sqlite` 的 VACUUM INTO 副本），带 register（项目名/key/机器）；
- `pnpm restore` 与 `cloud` 扩展共用 `extensions/cloud/backup.ts` 的 `BackupFile`/`writeBackup`；
- 跨机器不共享 `auth.json`，备份也不含密钥。

## 9. 数据一致性要点

1. **先提交后展示**：任何 UI 可见变化必须已经在 SQLite 提交；`subscribeCommits` 之后才推送 SSE。
2. **事件与状态同事务**：`host.emit(tx,…)` 与业务写入同一 commit；reactor 的写入与 cursor 同事务。
3. **文档 base/delta**：高频文档 `checkpointWhen: () => false`（永远 delta），避免每次写全量；需要 as-of 的用 rewindable。
4. **id 全局唯一**：所有记录 id 由 `durable_metadata.next_id` 分配；分卷切换必须抬高目标库 next_id。
5. **原子文件写**：`lib/json-file.ts` 用临时文件 + fsync + rename；数据库用 WAL。
6. **锁顺序**：supervisor lock → storage lock；不要反向获取。
7. **崩溃点**：任一步崩溃都必须能通过"重跑同一操作"恢复（reset/restore/chapter 都是幂等日志）。

## 10. 复刻检查清单

- [ ] 首次启动创建 home、`state.sqlite`、root 会话、`ultimate.ui`、`ultimate.events`。
- [ ] `kill -9` 后重启，未完成任务继续，已展示内容不丢。
- [ ] 切换分卷后 `#id` 仍全局唯一；切回旧分卷能读到旧会话。
- [ ] `pnpm reset --dry-run` 列出将移动的文件；`--yes` 后原状态在备份目录可找回。
- [ ] `pnpm restore` 能把备份装回并保持 id 连续。
- [ ] 事件 reactor 崩溃后重试不重复写业务状态（cursor 同事务）。
- [ ] UI state 超过 256KB 被拒绝且不影响其他写入。

## 11. 证据索引

- `server/project.ts:22-124`（home/project.json/conversations.json）
- `server/harness.ts:124-297`（storage lock、chapter、Harness.open）
- `lib/chapters.ts:1-170`（分卷/ID 连续/in-flight）
- `lib/database-files.ts:1-23`（moveDatabase/vacuum）
- `server/lock.ts:1-120`（锁实现）
- `lib/secrets.ts`、`lib/json-file.ts`
- `scripts/reset.ts:1-215`、`scripts/restore.ts:1-321`
- `extensions/cloud/README.md`、`extensions/dream/README.md`（Chapters）
- Pi Durable `dist/storage/sqlite/schema.d.ts:6-34`
