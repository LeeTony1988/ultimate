# 多 project 与多工作区设计

| 字段     | 值                                                            |
| -------- | ------------------------------------------------------------- |
| 证据基线 | `a28a9870`（2026-11-05，`dev/lxy`）                           |
| 状态     | draft（等待确认隔离边界与切换层级）                           |
| 语言     | 中文叙述 + 英文契约标识符                                     |
| 范围     | 多 project 的隔离边界、project 切换、project 内的多工作区切换 |

## 1. 名词

| 词               | 定义                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **project**      | 一个根目录，带自己的 `.ultimate/`。身份是规范化后的绝对路径。                                     |
| **workspace**    | project 内一个工作目录。三种来源：主检出（project root）、分支隔离 worktree、用户显式加入的目录。 |
| **home**         | `<userHome>/.ultimate/projects/<basename>-<sha256(root) 前 8 位>`                                 |
| **host**         | 承载一个 project 的进程，绑定一个端口 = 一个 origin。                                             |
| **conversation** | 绑定恰好一个 workspace，即它的 `cwd`。                                                            |

## 2. 现状（证据）

| 维度     | 现状                                                                            | 证据                                      |
| -------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| 项目身份 | `basename + sha256(root)[0..8]`：同目录不会有两个 home，同名目录不会撞          | `server/project.ts:121`                   |
| 进程     | 一个 host 一个 `projectRoot`（`--project` / `ULTIMATE_PROJECT` / `cwd`）        | `server/main.ts:68`、`bin/ultimate.ts:63` |
| 端口     | `ultimate.lock` 记录 `{pid, port, project}`                                     | `bin/ultimate.ts:213`                     |
| 存储     | 每个 home 一套 `state.sqlite` + `trace.sqlite`（实测 easywork：8.66 / 1.84 MB） | 项目 home 目录                            |
| 工作树   | `<home>/worktrees/<conversationId>`，可用 `isolates.worktree.path` 改位置       | `extensions/workspaces/tree.ts:31`        |
| 配置分层 | builtin(`ultimateRoot`) → user(`~/.ultimate`) → project(`<root>/.ultimate`)     | `server/project.ts:114`                   |
| 注册表   | `projects()` 扫 `~/.ultimate/projects`，给出 `current` / `running{pid,url}`     | `server/project.ts:40`                    |
| 记忆     | 写在该 project 的 durable state 里（`applyMemoryOps` 在 `tx` 内）               | `extensions/lineage/memory.ts:162`        |
| 自动化   | 每个 project 自己的文档；A1–A3 属于本 project                                   | `extensions/automations/server.ts:135`    |

结论：**多 project 的底层隔离已经成立，缺的是"切换"这一层**，以及三处会漏的软边界（§4）。

## 3. 隔离边界

### 3.1 三条硬边界

**H1. 一个 project 一个 SQLite。** 不合并。合并要给每张表加 project 列并迁移所有查询；更糟的是任一 project 的库损坏会拖垮全部。`state.sqlite` 是所有文档、任务、记忆的真源，它必须可单独备份、单独删除、单独 reset（`pnpm reset <root>` 已按 home 工作）。

**H2. 一个 project 一个 host 进程。** 因为 `.ultimate/extensions/` 是**任意代码**，在本进程内运行。共享进程意味着一个坏扩展能拖垮所有 project。运行期也已证明：一个 project 的 e2e 能把这台 16 核机器推到 load 30，同进程内没有任何东西能挡住它。

**H3. 一个 project 一个 origin。** 浏览器只跟一个 origin 对话，因此没有跨 project 的 token、cookie、CORS 与焦点泄漏。直接推论：**project 切换必须发生在窗口/外壳层，而不是在页面里 iframe 另一个 project。**

### 3.2 软边界（分层，可覆盖，但覆盖必须可见）

| #   | 维度    | 规则                                                                                           |
| --- | ------- | ---------------------------------------------------------------------------------------------- |
| S1  | 配置    | builtin → user → project。面板写入必须落到"当前生效的那一层"；被更高层压住时要显式提示。       |
| S2  | secrets | 只有用户级 `~/.ultimate/secrets.json`，**不按 project 分层**（已决定）。                       |
| S3  | 扩展    | builtin/user 扩展对所有 project 加载；`.ultimate/extensions/` 只对该 project，失败只影响自己。 |
| S4  | 资源    | 跨进程共享预算（worker 数、并发 gate），而不是每个 host 各自 8 个 worker。                     |

### 3.3 明确共享 / 明确不共享

- **共享（用户级）**：agent 定义与 overlay、skills、model families、secrets、trust、UI 偏好。
- **不共享（project 级）**：`state.sqlite`、`trace.sqlite`、会话、记忆、worktree、project settings、project agents/skills、自动化文档。

## 4. 当前缺口

| #   | 缺口                      | 影响                                               | 修法                                                               |
| --- | ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| G1  | 没有跨 project 的资源预算 | N 个 project 并行 = N×8 个 vitest worker，互相拖死 | supervisor 统一分配；或 `<userHome>/.ultimate/resources.lock` 租借 |
| G2  | ~~secrets 只有用户级~~    | 已决定：保持用户级，不做项目级                     | —                                                                  |
| G3  | 配置覆盖不可见            | 面板改了不生效（今天刚修一个：项目层压过用户层）   | 面板写入生效层；被覆盖时显示"被 X 覆盖"                            |
| G4  | project 扩展的失败边界    | 一个坏扩展让该 project 完全不可用                  | 已经是 per-project 状态行；保持并让失败只停用该扩展                |
| G5  | 注册表会积累死 home       | `~/.ultimate/projects` 越长越多                    | `projects()` 标记无 `ultimate.lock` 存活进程的项，提供归档/删除    |

## 5. 切换模型

### 5.1 多 project 切换 —— 外壳层

因为 H3，切换 = **换 origin**。所以：

1. 唯一真源是注册表 `projects()`（`server/project.ts:40`），它已经给出 `name` / `root` / `running{pid,url}` / `lastOpened`。
2. 切换器列：名字、路径、是否在跑、未读与运行中标记。
3. 点一个在跑的 → 跳到它的 `url`；没在跑的 → 由 launcher 启动后再跳。
4. **状态天然保留**：每个 project 的 UI 状态在自己的 home 里，不需要同步。

UI：标题栏 `ProjectChip` 已经有 `menu` 变体（`web/src/app/titlebar.tsx:64`），下拉即切换器。

### 5.2 多工作区切换 —— **不做**（已决定）

保持 **一个 project 一个工作区**：project 的工作目录就是它的主检出，分支隔离 worktree 仍按会话存在，但不提供"切换当前工作区"这一层。下面的原始设想保留作背景，**不实现**。

> 原设想：工作区列表 = 主检出 + 活跃 worktree + 手动加入的目录。

**两种语义要分开**：

- **事实层**：会话绑定一个 `cwd`，永不改变（现状）。
- **上下文层**：一个"当前工作区"，决定新建会话落在哪、以及列表怎么分组。

建议：切换器只改**上下文层**，不改已有会话的 `cwd`。侧边栏按工作区分组，worktree 已有 `#<conversationId>` 的标记（`titlebar.tsx:34`）。

不换 URL、不换 home、不换进程——**工作区切换是纯 UI 状态**。

### 5.3 两者不能混

| 层级      | 切换什么        | 换 origin？ | 换进程？ | 谁能看到                      |
| --------- | --------------- | ----------- | -------- | ----------------------------- |
| project   | 整个 home       | 是          | 是       | 外壳（标题栏下拉 / launcher） |
| workspace | 当前 cwd 上下文 | 否          | 否       | 页面内（会话区）              |

## 6. 分阶段

| 阶段 | 内容                                       | 价值             | 风险 |
| ---- | ------------------------------------------ | ---------------- | ---- |
| P0   | project 切换器（不动隔离）                 | 最大，且不碰数据 | 低   |
| P1   | ~~workspace 上下文切换~~（**已决定不做**） | —                | —    |
| P2   | 资源预算（G1）                             | 中               | 中   |
| P3   | 资源预算（G1）                             | 中，但治本       | 中   |
| P3   | 注册表清理（G5）                           | 小               | 低   |

## 7. 验收

- 两个 project 同时跑：各自的会话、记忆、worktree 互不可见；杀掉一个不影响另一个。
- 切换 project 后，回到原 project 时侧边栏、当前会话、草稿不变。
- ~~workspace 切换不改变任何已有会话的 `cwd`~~（该功能不做）。
- 一个 project 只有一个工作区：主检出。分支 worktree 仍是会话级的隔离目录，不是可选工作区。
- 同一 root 打开两次只产生一个 home。

## 8. 不做

- 不合并 SQLite，不做单进程多 project（违反 H1/H2）。
- 不用 iframe 在一个页面里嵌多个 project（违反 H3）。
- 不做跨 project 的会话搜索（属于另一个设计，且需要新的索引层）。
