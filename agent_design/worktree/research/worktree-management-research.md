# Worktree 管理机制调研：Claude Code、Codex、Z Code 与主流工具 / Skill 生态

| 字段                        | 值                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 文档 ID                     | AD-R-01（对应 `../01-worktree-plan.md` 的 R-01…R-08）                                                                         |
| 状态                        | final（2026-10-28，供 `../50-worktree-management-spec.md` 引用）                                                              |
| 证据基线                    | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`）                                                           |
| 调研日期 / 外部资料访问日期 | 2026-10-28                                                                                                                    |
| 方法                        | 官方文档、官方仓库与产品页优先；官方页面直连失败时用搜索索引摘录并标 B；二手资料只作线索；无法确认的写 `未验证`，不据记忆补写 |
| 语言                        | 中文叙述 + 英文标识符；命令、路径、字段保持原文                                                                               |
| 读者                        | 设计或复刻 Ultimate worktree 管理机制的 agent / 工程师                                                                        |

**置信度**

| 级别 | 含义                                                      |
| ---- | --------------------------------------------------------- |
| A    | 官方文档正文、官方仓库 README/源码可直接核对              |
| B    | 官方页面经搜索索引/摘要读取，或页面直连失败但内容来自官方 |
| C    | 二手来源（教程、对比站、社区帖），只作旁证                |
| D    | 未验证 / 产品未公开该能力                                 |

> 范围：只讨论"一个 agent 会话/任务如何获得独立 Git checkout"，以及它如何被创建、定位、命名、准备、回收、合并和呈现。容器、远程执行、权限沙箱只在"隔离边界"维度提及；不把营销页里的"并行"直接等同于 worktree。

## 1. 比较维度

| 维度           | 要回答的问题                                                     |
| -------------- | ---------------------------------------------------------------- |
| 创建           | 用户或 agent 通过什么入口创建？显式命令、UI 开关，还是系统自动？ |
| 位置           | checkout 落在哪个目录？是否可配置？是否在被管理仓库内部？        |
| 分支与基点     | 新分支叫什么？从哪个 ref/commit 起步？默认是否 detached HEAD？   |
| 每工作树准备   | 依赖安装、环境变量、密钥、hooks、忽略文件如何复制或重建？        |
| 生命周期与清理 | 何时归档、保留多久、未提交改动如何处理、能否恢复？               |
| 合并与落地     | 是否内置 merge/rebase/PR/队列？谁负责最终落地？                  |
| 隔离边界       | 只隔离文件系统与 Git 索引，还是也隔离进程、网络、凭据？          |
| UI 表面        | 终端、桌面 app、Web 各暴露哪些 worktree 信息与操作？             |
| 生态           | 配置目录、hooks、扩展点、与 CI/PR 系统的耦合方式                 |

## 2. Claude Code

### 2.1 创建与位置

- 终端：`claude --worktree <name>`（短旗标 `-w`）启动会话，并在 `<project-root>/.claude/worktrees/<name>/` 创建独立 checkout；省略名字时生成 `bright-running-fox` 一类名字。交互式启动要求 workspace trust，`-p` 非交互运行跳过该检查。[S01]
- 桌面 app 的 **Worktree** 开关默认关闭；打开后该 session 在独立 checkout 运行。Settings 可改 **Worktree location**（本机）与 **Worktree folder**（SSH），并设 **Branch prefix**。[S02]
- 会话中可用 `EnterWorktree` 创建并进入 worktree，或用 `path` 切到已存在的 worktree；`ExitWorktree` 可退出并选择保留/删除。产品约束是"只有用户或 CLAUDE.md 明确提到 worktree 时才使用"；进入 `.claude/worktrees/` 之外路径需要用户批准。[S01]
- agent view 的后台 session 默认先在当前 cwd 启动，编辑前自动移入 `.claude/worktrees/`；`worktree.bgIsolation: "none"` 可关闭。agent teams 本身不自动给每个 teammate 分配 worktree，只有显式 `isolation` 或 subagent 定义 `isolation: worktree` 才会。[S03][S04]

### 2.2 分支命名与基点

- 终端默认分支 `worktree-<name>`；桌面 branch prefix 的拼接符官方未明示，`未验证`。
- 基点由 `worktree.baseRef` 控制，只接受 `"fresh"`（默认，从 `origin/HEAD` 起步）或 `"head"`（当前本地 HEAD，带上未推送提交和 feature branch 状态）；不能设任意分支名，要特定分支就直接 `git worktree add`。[S01]
- `--worktree` 还接受 `#<number>`、GitHub PR URL、GitLab MR URL：从 `origin` 取该变更 head commit，创建到 `.claude/worktrees/pr-<number>`。[S01]

### 2.3 每工作树准备

worktree 是全新 checkout：untracked 的 `.env`、依赖目录、本地配置不会自动出现。官方提供 `.worktreeinclude`，用 `.gitignore` 语法列出要复制的文件，但**只复制同时被 Git 忽略且匹配模式的文件**，tracked 文件不会重复复制。依赖安装、数据库启动仍需在 worktree 内执行；没有通用的 per-worktree setup 命令配置。[S01]

### 2.4 生命周期与清理

- 交互式退出时检查变更、未跟踪文件、submodule 未提交工作、新提交：干净且未命名 → 自动删 worktree 和分支；命名会话 → 先询问；有工作 → 询问 keep/remove；无法核对 → 询问而不是自动删。`-p` 非交互运行不清理，并保留 worktree lock。[S01]
- 后台 session/subagent 的 worktree 由周期性 sweep 清理，条件是年龄超过 `cleanupPeriodDays`；仍有改动、未推送提交、submodule 状态无法检查、或属于尚未后台化的 `--worktree` session 时保留。Claude 在 git metadata 写 marker，sweep 只处理自己创建的 worktree，不碰用户 `git worktree add` 的目录。[S01]
- 桌面端：归档 session 时有未提交改动会问 **Archive anyway**；其它情况 worktree 留在磁盘，本地 session 在"归档或最后一次打开后约 30 天"删除，以较晚者为准；Unarchive 可保留。[S02]

### 2.5 合并与落地

没有 Ultimate 式 lander 队列。commit 走常规 Git：push 分支 → 开 PR → GitHub merge/auto-merge；桌面可监控 PR 状态并在 merge/close 后自动归档 session，但"归档"不等于"目标分支已通过检查并 ff"。官方 worktree 页没有 merge 命令或队列。[S01][S02]

### 2.6 UI 与隔离边界

- UI 以 session 列表为中心：没有公开的"所有 worktree"总览页、ahead/behind 字段或队列位置；桌面只有 Worktree 开关、location、branch prefix 和 session 级 diff。[S02]
- Agent view（`claude agents`）按 **Needs input / Working / Completed** 分组，行内是最新状态或问题 + 时间；这是最接近"并行工作区总览"的公开设计，但它是 session 视角，不是 worktree 视角。[S03]
- 本地 worktree 只隔离文件系统与 Git 索引；进程、网络、凭据、全局缓存仍共享。Claude 在 worktree session 中做四类强制检查：阻止 Edit/Write 写主 checkout；阻止 Bash/PowerShell 的 cwd 落到主 checkout；阻止 `git -C`/`GIT_DIR`/`GIT_WORK_TREE` 重定向；拒绝无法证明留在 worktree 内的 git 命令。它不追踪 shell 实际写了哪些文件，`cp`/redirect 写主 checkout 不在拦截范围。[S01]

### 2.7 生态

`.claude/worktrees/` 通常应加入 `.gitignore`。扩展点包括 `WorktreeCreate`/`WorktreeRemove` hooks（可完全替换 Git 创建逻辑，支持 SVN/Perforce 等非 Git VCS）、`.worktreeinclude`、`CLAUDE.md`、`.claude/settings.json` 与 Agent SDK。没有公开的 worktree 查询/控制 API；可观测面主要是 hooks 与 `git worktree list`。[S01]

## 3. OpenAI Codex

### 3.1 三个产品面

- **Codex app**：新建 chat 时在 composer 下选 **Worktree**，在独立 checkout 运行。
- **Codex CLI**：全局布尔旗标 `--worktree`，官方定义是 "Start in a new managed Git worktree"，支持新的交互 session、`codex fork <SESSION_ID>`、`codex exec` 与 `codex exec fork`，要求 local execution。[S06]
- **Codex Cloud**：在远程环境给每个 task 独立工作文件，不共享本机 checkout；Local 与 Worktree 都在本机。
- 三模式官方归纳为 **Local / Worktree / Cloud**。[S07]

### 3.2 位置、命名与基点

- Codex-managed worktree 默认在 `$CODEX_HOME/worktrees`（`$CODEX_HOME` 默认 `~/.codex`）；**Settings > Worktrees** 的 **Worktree root** 可改（FAQ 折叠，B）。CLI 是否与 app 共用同一 root，`未验证`。[S06]
- 默认 **detached HEAD**，不自动创建命名分支；用户点 **Create branch here** 才物化分支（示例 prefix `codex/`），之后才能 commit/push/开 PR。[S06]
- 基点是所选 branch 的 `HEAD`；若该 branch 有未提交改动，Codex 会把改动一并应用到新 worktree。这会让两个 worktree 各持一份相同未提交修改，后续合并需人工判断。[S06]

### 3.3 准备与 handoff

- 新建 worktree 时可选择 **local environment**，由它运行 setup scripts；`.worktreeinclude` 用 `.gitignore` 风格列出要复制的 ignored 文件（`.env`、`config/secrets.json`），只复制匹配项且不覆盖已存在文件；ignored 的 `AGENTS.override.md` 会自动复制。项目可在 `.codex` 保存 local environment 配置。[S06][S07]
- **Handoff**：在 Local 与 Worktree 之间移动 chat 和代码，因为 Git 只允许一个分支同时在一个 checkout；每个 chat 保持关联到同一个 worktree，从 Local 移回时回到原 checkout。`.gitignore` 忽略的文件不会随 Handoff 移动，除非 `.worktreeinclude` 复制进 managed worktree。运行中进程、终端状态、未提交改动如何处置，官方没有完整契约，`未验证`。[S06]

### 3.4 生命周期与清理

- 默认保留最近 **15** 个 managed worktree；可在 settings 改上限或关闭自动删除。pinned chat 关联的 worktree、仍在进行中的 chat 不会被自动删除；旧版本的 **Permanent worktree** 仍保留且受保护，但当前项目菜单已不能新建。[S06]
- 触发：归档关联 chat，或为保持在数量上限内删除更老的 worktree。删除前保存 snapshot；打开被清理 worktree 的 chat 时会出现 restore 选项。官方没有说明清理前检查"分支已合并/已推送"，不能假定它有 Ultimate 的 kept-work 保护。[S06]

### 3.5 合并与落地

本地路径：`Create branch here` → commit → push → 开 PR → GitHub merge；Cloud 的 PR/merge 细节本次未核验，`未验证`。官方 worktree 页没有本地 lander、目标分支 ff 校验、每源串行队列或 merge 命令；合并冲突与 CI 失败回到 chat 内由模型修复，属于 PR 工作流。[S06]

### 3.6 UI 与隔离边界

chat 头部有 **Create branch here**、**Open**（IDE 打开 worktree）、**Hand off**；diff pane 支持行内评论、stage/revert、commit/push/PR；集成终端 `Cmd+J`。没有公开的 worktree 总览页或队列位置。本机 worktree 共享 OS 用户、网络与凭据；命令沙箱按 `read-only`/`workspace-write`/`danger-full-access` 限制单条命令，但 worktree 本身不是安全边界；Cloud task 有独立工作文件。[S06][S07]

## 4. Z Code（zcode）

### 4.1 产品身份

本文的 "Z Code" 指 **Z.ai（智谱 AI）的 ZCode**：官方域名 `zcode.z.ai`，产品自称 Agentic Development Environment（ADE），围绕 GLM-5.3 构建，以 desktop 为主，另有 Remote 与 Bot Channel；公开仓库还列出 browser 与 terminal 客户端（C）。下载页当前版本 3.16.3。官方文档的 Agent 页明确说 ZCode Agent 是默认自研 agent，能读取 workspace、task list、file references、model picker、execution modes 与 Git branch state。[S09][S10]

另有零散第三方项目也使用 "zcode" 之名（编辑器插件、代码生成器），没有统一官方文档，本文不把它们当作同一产品。选择 Z.ai ZCode 的理由：有可核验的公司主体与产品页、与 Claude Code/Codex 同属 coding agent 品类、中文社区常用 zcode 指代它。

### 4.2 是否有 worktree 机制

截至 2026-10-28，**未发现官方 worktree 机制**：官方 docs 的 Get Started、Core Features、Integration、Support 目录与关键字检索中，没有 worktree 页面、`--worktree`/`-w` 旗标、`.zcode/worktrees` 固定目录、`worktree-<name>` 分支命名约定，也没有 worktree 创建/清理 UI 或 API。这是"未发现"，不是"确认不存在"；若之后新增，需要重新核验。[S11]

ZCode 的组织单位是 **workspace + task**，不是 worktree。一个 workspace 对应项目目录，多个 task 共享同一 workspace；官方 Agent 页明确说 fork 只影响对话历史，"does not roll back files on disk. Both sessions operate on the same workspace." 也就是说，fork 出来的两个 session 仍会在同一批文件上读写。[S10]

### 4.3 它实际提供的隔离

隔离主要是 **会话级权限与执行模式**，不是 Git checkout 级隔离：`Ask before changes` 默认每次编辑/命令都确认，`Edit automatically` 自动改文件但命令仍需确认，`Plan mode` 先出计划，`Full access` 减少打断；敏感命令、文件变更和高权限动作走 **Safety Confirmation**。这些控制"agent 能不能做"，不控制"两个 agent 是否写同一份文件"。[S10]

Remote Development 可把 agent 放到服务器、开发机或容器执行，改变的是执行位置与运行环境，不是每个 task 的 Git 索引隔离；官方没有说 remote task 会获得独立 worktree（B）。任务归档有 3/7/14/30 天保留期，但归档的是 task，不会删除 checkout——因为没有 per-task checkout 可删（B）。[S11]

### 4.4 生态中的第三方 worktree 插件

社区插件 **Git Worktrees for ZCode**（作者 agallardol）补上了这一层：它声称每个新 thread 自动获得 worktree，默认集中存放在 `~/.zcode/worktrees`，分支形如 `zcode/sess-…`；提供 `/worktree`、`/worktree:new`、`/worktree:status`、`/worktree:remove`、`/worktree:cleanup`、`/worktree:pr`、`/worktree:end` 等命令，以及 9 个 MCP tools（`worktrees_create`、`worktrees_list`、`worktrees_remove`、`worktrees_cleanup` 等）。配置在 `.zcode/worktree.json`，支持 `autoSession`、`copyFiles`、`setupCommands`、`preRemoveCommands`；默认 max age 14 天、每项目最多 15 个 worktree，删除前 snapshot，dirty/locked/active 的 worktree 不自动删（C，第三方 README；要求 ZCode ≥ 3.8.1）。[S12]

这不是官方能力，不能写成"ZCode 支持 worktree"。它的价值是证明 ZCode 的 plugin/MCP/hooks 生态足以外挂一套 worktree 管理；同时它的命令名、`.worktreeinclude` 语义、snapshot 与 retention 明显借鉴 Claude Code/Codex，说明三类产品正在收敛出一套共同模式。

## 5. 其它工具

| 工具                | 创建 / 位置                                                                                                                                                                  | 生命周期 / 清理                                                                                                                               | 合并 / 落地                                                     | UI                                                                                | 置信 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---- |
| Cursor              | Agents Window 原生 worktree；IDE 用 `/worktree`、`/best-of-n`、`/apply-worktree`、`/delete-worktree`；`.cursor/worktrees.json` 三键 + `$ROOT_WORKTREE_PATH`；根目录 `未验证` | 3.5 起机器级 `cursor.worktreeMaxCount` 默认 25 + `worktreeCleanupIntervalHours`；会重新发现根目录，手工 `git worktree add` 也可能被计入并删除 | diff view → commit/PR；结果可 apply 回主工作区                  | Agents Window 的 agents 列表 + diffs view；具体状态词未公开                       | A    |
| Gemini CLI          | `未验证` 有内置 worktree；单 cwd + `--include-directories`                                                                                                                   | —                                                                                                                                             | 走 Git/PR                                                       | 终端                                                                              | C    |
| Conductor           | 每 workspace 一 worktree；`<project>/...` 目录（确切路径未验证）；workspace 以分支名标识                                                                                     | History 归档/恢复；无公开 TTL                                                                                                                 | Checks 汇总 git/CI/deploy/comments；Create PR + merge + Archive | 左 project/workspace sidebar、中 chat、右 review；Diff Viewer `Cmd+Shift+D`       | B    |
| Sculptor            | workspace 在 `~/.sculptor/workspaces/<id>/code`；分支 `<user>/<slug>`；支持 worktree/clone/in-place                                                                          | 删除时分支三档：never / only-when-safe / always                                                                                               | Commit（不 push）、逐文件 discard、PR                           | workspace tabs；顶栏 `repo › branch → target`；Files panel Browse/Changes/Commits | A    |
| Claude Squad        | 每 instance 一个 tmux + worktree；根目录未验证；配置 `~/.claude-squad/config.json`                                                                                           | `D` kill/delete；`c` commit 后暂停、`r` resume；无 GC                                                                                         | `s` commit + push；无 merge 队列                                | TUI 列表 + preview/diff tab；键位 `n/N/↵/o/ctrl-q/s/c/r/tab/D/q`                  | A    |
| Crystal → Nimbalyst | 每 session 独立 worktree；Crystal 2026-02 弃用                                                                                                                               | 随会话恢复                                                                                                                                    | rebase/squash、PR                                               | 原版视觉细节未验证；后继加 kanban + inline diff approve                           | A/C  |
| Vibe Kanban         | workspace = branch + terminal + dev server；每 issue 一个                                                                                                                    | 孤儿 + 过期回收，`DISABLE_WORKTREE_CLEANUP` 可关；官方已 sunsetting                                                                           | PR + merge（GitHub）                                            | kanban 六列 + 卡片；空列 `+`                                                      | A    |
| worktrunk           | `wt switch/list/merge/remove`；路径模板；按分支名寻址                                                                                                                        | `wt remove` 显式；hooks；`--full` CI + AI 摘要                                                                                                | `wt merge` 单发，无队列                                         | CLI 表格，列含 ahead/behind/CI/age                                                | A    |
| uzi                 | `~/.local/share/uzi`（worktrees 子路径未验证）；`uzi ls` 列 AGENT/MODEL/STATUS/DIFF/ADDR/PROMPT                                                                              | `uzi kill` 清理；无 GC                                                                                                                        | `uzi checkpoint` commit + rebase（手动、单发）                  | CLI 表格 + tmux + dev server                                                      | A/C  |

**横向结论**

1. **worktree 是并行 agent 的主流隔离单位**：Cursor、Conductor、Sculptor、Claude Squad、Crystal、Vibe Kanban 都是一任务/一 workspace 一 checkout；Claude Code 与 Codex 把它做成会话/线程的启动选项。
2. **位置与命名正在收敛**：多数放在产品自己的 home 下（`$CODEX_HOME/worktrees`、`~/.sculptor/workspaces`、`~/.local/share/uzi`），少数放在仓库内（`.claude/worktrees`）。放在仓库内容易污染主 checkout，需要 `.gitignore` 约束；放在 home 下更干净但可发现性差。
3. **清理策略普遍弱**：多数只有"归档即删"或"显式删"；Cursor 的按数量淘汰会误删未合并工作；Vibe Kanban 的"孤儿 + 过期"更合理；没有一家同时检查"已合并 + 干净 + 有未推送提交"。
4. **合并语义分两类**：一类交给 GitHub PR（Claude Code、Codex、Cursor、Conductor、Vibe Kanban），一类只做本地 commit/push（Sculptor、Claude Squad、uzi、worktrunk）。**没有一家有 Ultimate 的 per-source 队列 + 检查绑定 SHA + push + report + 自愈**。
5. **UI 成熟度分化**：Git 客户端（VS Code、GitKraken、GitHub Desktop）在 inventory 与 diff 上成熟；agent 工具多停在"session 列表 + diff"；landing 回执与队列只有 Ultimate 完整。

## 6. Skill / 插件生态

### 6.1 `obra/superpowers` 的 `using-git-worktrees`

这是一个**用户级 skill**，不是产品功能。其流程比"直接 `git worktree add`"严格得多：

1. 先检测是否已在隔离环境：比较 `git rev-parse --git-dir` 与 `--git-common-dir`；submodule 要单独判断。
2. 取得用户同意后才创建；**原生工具优先**（Claude Code 的 `EnterWorktree` / `WorktreeCreate`），不要绕过 harness 直接 `git worktree add`，否则会产生 harness 不知道的"幽灵状态"。
3. 目录优先级 `.worktrees/` > `worktrees/` > 默认；创建前用 `git check-ignore` 确认被忽略，并把 `.gitignore` 变更提交。
4. 自动探测 setup（`package.json`/`pnpm-lock.yaml`/`Cargo.toml` 等）并跑基线测试。
5. 没有 Git 时降级到 sandbox。

**对 Ultimate 的启示**：如果 `workspace` 是唯一原生入口，skill 会自然让路；允许 agent 直接 `git worktree add` 是孤儿 worktree 的根因。文档应明确"不要绕过 workspace 工具"。

### 6.2 其它 skill / 插件

- Claude Code 的 worktree skill/plugin：官方文档强调 `--worktree` 与桌面开关，未发现独立插件规范；社区 skill 多以 `using-git-worktrees` 为模板。
- VS Code：`git.detectWorktrees` **默认关闭**（opt-in 扫描，`git.detectWorktreesLimit` 默认 50）；`git.worktreeIncludeFiles` 是实验特性，只有"glob 命中且在 `.gitignore`"才复制；`git.worktreeSymlinkFolders` 是相反的 symlink 策略。Create Worktree 在 SCM Repositories → More Actions → Worktrees。[S32]
- `git-worktree-runner`：`gtr new/list/remove` + hook/编辑器集成（C，未读原文）。
- `gwq`：`add/list/remove/cd` + fzf（C，未读原文）。

### 6.3 产品功能 vs 用户约定

| 能力               | 产品内建                                                                | skill/插件                 |
| ------------------ | ----------------------------------------------------------------------- | -------------------------- |
| 创建/删除 worktree | Claude Code、Codex、Cursor、Conductor、Sculptor、Vibe Kanban、worktrunk | `using-git-worktrees` 等   |
| 生命周期/GC        | Cursor（数量）、Vibe Kanban（孤儿+过期）、Codex（归档）                 | 无（skill 只能约束创建时） |
| 合并/落地          | 只有 PR 或单发 merge                                                    | 无                         |
| 队列/检查门        | 只有 Ultimate                                                           | 无                         |

**关键结论**：skill 能约束"创建时怎么做"，但**没有任何 skill 能强制生命周期**；这就是 Ultimate 把 worktree 生命周期放进 harness、而不是放进 skill 的理由。

## 7. 机制模式与采纳决策

| #   | 模式                             | 谁实现                                                              | 对 Ultimate 的决策                                                                                  | 落点                   |
| --- | -------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------- |
| P1  | 一任务一 worktree                | Cursor/Conductor/Sculptor/Claude Squad/Crystal/Vibe Kanban/Ultimate | **ADOPT**：已被全行业验证                                                                           | `50` §3.2、§5.1        |
| P2  | 确定性命名                       | worktrunk/Sculptor/uzi/Ultimate                                     | **ADOPT**：路径与分支由 id 派生，禁止 UI 临时拼                                                     | `50` §4.4、§7.1        |
| P3  | Setup hook（复制 + 命令 + 缓存） | Cursor/VS Code/Sculptor/worktrunk/Ultimate                          | **ADAPT**：Ultimate 只有命令数组；增加"复制清单"与 CoW 缓存共享为可选层                             | `50` §6.6、§7.2        |
| P4  | 可恢复生命周期状态机             | Ultimate/Sculptor/Vibe Kanban                                       | **ADOPT**：状态由 harness 持久化，UI 只是投影；拒绝用看板列当状态源                                 | `50` §5.1–§5.4         |
| P5  | 队列 / 串行合并                  | **只有 Ultimate**                                                   | **ADOPT**：结构性优势，不替换                                                                       | `50` §3.4、§7.6–§7.7   |
| P6  | Agent 拥有的落地                 | **只有 Ultimate**                                                   | **ADOPT + 硬边界**：agent 只在隔离 checkout 动作，冲突/超限必须停                                   | `50` §7.7–§7.8         |
| P7  | 孤儿回收（保守 GC）              | Cursor/Vibe Kanban/Sculptor                                         | **ADAPT**：已合入 + 干净 + 超过 N 天，默认 dry-run；有未推送提交不删；拒绝按数量淘汰                | `50` §7.10、新增 §7.13 |
| P8  | 清单 / 仪表盘                    | Claude Squad/Sculptor/worktrunk/uzi                                 | **ADOPT（UI 侧）**：一屏列出 id/分支/target/状态/ahead/behind/变更数/最后活动/磁盘                  | `60` §7.2、§7.4        |
| P9  | 每 workspace diff                | Cursor/Conductor/Sculptor/Crystal/Vibe Kanban                       | **ADOPT**：review 必须在合并前发生；基线用最新 merge-base                                           | `50` §3.4、`60` §7.8   |
| P10 | 环境间 handoff                   | Cursor/Codex/Ultimate（上下文 handoff）                             | **ADAPT**：增加 `workspace handoff <id> --to <agent>`，转移所有权而非复制；前置干净/快照/目标不存在 | `50` §6.5（未来）      |
| P11 | 合并前检查门                     | **只有 Ultimate**                                                   | **ADOPT**：检查与落地绑定同一 SHA，任何路径不得绕过                                                 | `50` §2.2、§7.7        |

**决策汇总**：ADOPT 7、ADAPT 4、REJECT 2（按数量淘汰、用 UI 列当状态源）。优先级：P4/P5/P6/P11 是正确性核心，保持不动；P3/P7/P8/P9 是可用性短板，优先补；P2/P10 是中期增强。

## 8. 差距分析

### 8.1 其它工具都没有、而 Ultimate 有的

1. **Lander 队列**：per-source FIFO + 串行锁；多 agent 的提交排队落地。没有第二家；worktrunk `wt merge`、uzi `uzi checkpoint` 都是单发。
2. **检查绑定 SHA**：检查在集成 checkout 上跑，跑完校验 `HEAD === merged.sha` 且工作区干净；CI 做不到（CI 跑的是 push 之后的代码）。
3. **push + report 回投递者**：落地后把成功/失败/冲突/路径投回提交会话，形成闭环。
4. **失败自动修复循环**：`handOver` → lander agent 修 → 重跑检查 → 再 ff，带 attempt 与 `pushRetried` 上限。

### 8.2 Ultimate 缺、而它们有的

1. **清单式 UX**：没有"所有 workspace 一屏"；缺 ahead/behind、变更数、最后活动、磁盘、最近检查结果。worktrunk `wt list`、uzi `uzi ls`、Claude Squad TUI 证明这是刚需。
2. **清理 GC 策略**：有 `release`/`discard`，但没有 TTL、没有"已合并则回收"、没有磁盘水位告警、没有 `git worktree prune` 兜底。
3. **Setup 可移植性**：`setup()` 存在 `.ultimate/settings.json`，换机器/换克隆要重配。Cursor `.cursor/worktrees.json`、VS Code `worktreeIncludeFiles`、Sculptor 仓库级 setup 都是"仓库内可提交"的契约。
4. **命名与位置可见性**：用户看不出 worktree 落在哪、叫什么、为什么叫这个名；Sculptor 的 `repo › branch → target` 一行解决，Ultimate 没有等价物。

### 8.3 综合判断

Ultimate 在**落地正确性**上领先一个身位（队列 + 检查绑定 + 回报 + 自愈），在**日常可用性**上落后于最轻量的 CLI（清单、清理、setup 可移植）。下一阶段投入建议 **7:3**——七成补可用性，三成加固正确性，而不是继续堆落地特性。

## 9. 来源表

> 访问日期均为 2026-10-28。A=官方文档/源码；B=官方页面经索引/摘要；C=二手；D=未验证。

| #   | 断言                                                                                                                                        | URL                                                                                                                  | 发布者                                | 版本/日期                                  | 置信                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ | --------------------- |
| S01 | Claude Code `--worktree`/`-w`、`.claude/worktrees/`、`.worktreeinclude`、cleanup、subagent isolation                                        | https://code.claude.com/docs/en/worktrees                                                                            | Anthropic                             | 文档含 v2.1.212–v2.1.302                   | A                     |
| S02 | 桌面 Worktree 开关、location、branch prefix、Changes 卡、diff 评论、archive/30 天                                                           | https://code.claude.com/docs/en/desktop                                                                              | Anthropic                             | 要求 Desktop v1.2581.0+                    | A                     |
| S03 | Agent view 分组、状态、行摘要、PR 标签、peek/attach、空态                                                                                   | https://code.claude.com/docs/en/agent-view                                                                           | Anthropic                             | research preview                           | A                     |
| S04 | Agent teams 的 agent panel、split panes、权限冒泡、限制                                                                                     | https://code.claude.com/docs/en/agent-teams                                                                          | Anthropic                             | experimental                               | A                     |
| S05 | Web session 侧栏、Changes 卡、diff view、Compare against、archive/delete 确认                                                               | https://code.claude.com/docs/en/claude-code-on-the-web                                                               | Anthropic                             | 文档含 v2.1.223–v2.1.289                   | A                     |
| S06 | Codex worktree 位置、detached HEAD、Handoff、Create branch here、permanent worktree                                                         | https://developers.openai.com/codex/environments/git-worktrees                                                       | OpenAI                                | 未标注；直连 403，索引摘录                 | B                     |
| S07 | Codex app 的 project/thread、Local/Worktree/Cloud、diff pane、inline comment、stage/revert、commit/push/PR、终端                            | https://developers.openai.com/codex/app/features                                                                     | OpenAI                                | 未标注；直连 403                           | B                     |
| S08 | Codex `/review`、findings、base branch / uncommitted                                                                                        | https://developers.openai.com/codex/app/review                                                                       | OpenAI                                | 未标注                                     | A                     |
| S09 | Cursor worktree 仅 Agents Window、`.cursor/worktrees.json`、`$ROOT_WORKTREE_PATH`、symlink 警告                                             | https://cursor.com/docs/configuration/worktrees                                                                      | Cursor                                | Cursor 3.5 文档                            | A                     |
| S10 | Agents Window：multi-workspace、diffs view、parallel agents、handoff、worktrees；GA 2026-04-02                                              | https://cursor.com/docs/agent/agents-window                                                                          | Cursor                                | Cursor 3                                   | A                     |
| S11 | Agent Review、Quick/Deep、Source Control tab                                                                                                | https://cursor.com/docs/agent/agent-review                                                                           | Cursor                                | Cursor 3.11 起                             | A                     |
| S12 | Conductor 概念：workspace、分支、review、PR、archive                                                                                        | https://www.conductor.build/docs                                                                                     | Melty Labs                            | 未标注                                     | A                     |
| S13 | Project/Repository/Workspace/Branch/Working tree 模型；sidebar 以分支名标识                                                                 | https://www.conductor.build/docs/concepts/workspaces-and-branches                                                    | Melty Labs                            | 未标注                                     | A                     |
| S14 | 一个 workspace 一个 shippable unit；Diff Viewer；Checks；PR；Archive/History                                                                | https://www.conductor.build/docs/concepts/workflow                                                                   | Melty Labs                            | 未标注                                     | A                     |
| S15 | Diff Viewer：文件列表、unified、commit 过滤、行内评论、GitHub review comments                                                               | https://www.conductor.build/docs/reference/diff-viewer                                                               | Melty Labs                            | 未标注                                     | A                     |
| S16 | 首次 workspace 截图说明（project sidebar、chat、setup checklist）、Run/`CONDUCTOR_PORT`                                                     | https://www.conductor.build/docs/first-workspace                                                                     | Melty Labs                            | 未标注                                     | A/B                   |
| S17 | Conductor 0.92.0（2026-10-23）、multiplayer、Cloud microVM                                                                                  | https://www.conductor.build/                                                                                         | Melty Labs                            | 0.92.0                                     | A                     |
| S18 | Sculptor 是并行 agent 桌面 app；workspace 概念；`Cmd+K`；终端                                                                               | https://github.com/imbue-ai/sculptor/blob/main/docs/help/README.md                                                   | Imbue                                 | main                                       | A                     |
| S19 | 顶部 `repo › branch → target`、workspace tabs、worktree/clone/in-place、分支清理策略                                                        | https://github.com/imbue-ai/sculptor/blob/main/docs/help/workspaces.md                                               | Imbue                                 | main                                       | A                     |
| S20 | Files panel 三 tab、`Changes 2`、累计 diff、`Commit 2 changes`、逐文件 discard                                                              | https://github.com/imbue-ai/sculptor/blob/main/docs/help/changes.md                                                  | Imbue                                 | main                                       | A                     |
| S21 | PR 创建与状态跟踪                                                                                                                           | https://github.com/imbue-ai/sculptor/blob/main/docs/help/pull_requests.md                                            | Imbue                                 | main                                       | A                     |
| S22 | TUI 列表、preview/diff tab、快捷键、tmux + worktree                                                                                         | https://github.com/smtg-ai/claude-squad                                                                              | smtg-ai                               | 未标注                                     | A                     |
| S23 | Crystal 于 2026-02 弃用、Nimbalyst 取代                                                                                                     | https://github.com/stravu/crystal                                                                                    | Stravu                                | 2026-02                                    | A                     |
| S24 | Nimbalyst：kanban backlog→complete、inline AI diff approve/reject、iOS                                                                      | https://stravu.com/crystal                                                                                           | Stravu                                | 未标注                                     | A                     |
| S25 | Vibe Kanban sunsetting；workspace = branch + terminal + dev server；10+ agents；PR/merge                                                    | https://github.com/BloopAI/vibe-kanban                                                                               | BloopAI                               | sunsetting                                 | A                     |
| S26 | Kanban 列、卡片字段、空列 `+`、拖拽                                                                                                         | https://github.com/BloopAI/vibe-kanban/blob/main/docs/cloud/kanban-board.mdx                                         | BloopAI                               | 未标注                                     | A                     |
| S27 | Terragon 首页仅返回 "Terragon Shutdown"                                                                                                     | https://www.terragonlabs.com/                                                                                        | Terragon                              | 2026-10-28 抓取                            | A                     |
| S28 | Multi-Agent、Sandbox Terminal、Task forking、等待步骤、通知                                                                                 | https://docs.terragonlabs.com/docs/resources/release-notes                                                           | Terragon                              | 2025-07/10                                 | A                     |
| S29 | 云端 sandbox、自动 PR、跨设备、CLI handoff                                                                                                  | https://terragon.devdocs.ai                                                                                          | 文档镜像                              | 未标注                                     | C                     |
| S30 | `uzi ls` 列、checkpoint、auto、broadcast、tmux                                                                                              | https://github.com/devflowinc/uzi                                                                                    | devflowinc                            | 未标注                                     | A                     |
| S31 | worktree 存放 `~/.local/share/uzi/worktrees`、分支命名、`git worktree add -b`                                                               | https://mintlify.com/devflowinc/uzi/concepts/worktrees                                                               | Mintlify 镜像                         | 未标注                                     | C                     |
| S32 | VS Code Source Control Repositories、Create Worktree、`git.detectWorktrees`、`git.worktreeIncludeFiles`                                     | https://code.visualstudio.com/docs/sourcecontrol/branches-worktrees                                                  | Microsoft                             | 未标注                                     | A                     |
| S33 | GitKraken Agent Sessions View、卡片字段、Running/Waiting for input/done、Allow/Deny                                                         | https://help.gitkraken.com/gitkraken-desktop/agents/                                                                 | GitKraken                             | 2026-09                                    | A                     |
| S34 | GitKraken Workspaces：Local/Cloud、多 repo、PR Insights                                                                                     | https://help.gitkraken.com/gitkraken-client/workspaces                                                               | GitKraken                             | 2026-05-13                                 | A                     |
| S35 | GitHub Desktop Worktree 下拉、Main/Linked 分组、目录名+分支名、新建/切换/重命名/删除                                                        | https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-worktrees-in-github-desktop                   | GitHub                                | 未标注                                     | A                     |
| S36 | Tower 侧栏 Worktrees、分支 `+` 徽标、创建/切换/移除                                                                                         | https://git-tower.com/help/guides/worktrees/overview/mac                                                             | Tower                                 | 12.5                                       | A                     |
| S37 | GitButler Branches 页、parallel branches/stacks、Apply/Unapply、lane 拖拽                                                                   | https://github.com/gitbutlerapp/gitbutler-docs/blob/main/content/docs/features/branch-management/branch-lanes.mdx    | GitButler                             | main                                       | A                     |
| S38 | GitButler virtual branches、stacked branches、target branch、apply/unapply                                                                  | https://docs.gitbutler.com/overview                                                                                  | GitButler                             | 未标注；DNS 失败，索引摘录                 | B                     |
| S39 | Fork 2.63（2026-02）加入 worktree；删除有未提交改动直接报错                                                                                 | https://teebe.io/compare/git-worktree-gui-mac                                                                        | teebe（第三方）                       | 2026-08-14                                 | C                     |
| S40 | Sculptor 官网 `sculptor.sh` 无法解析                                                                                                        | https://sculptor.sh/                                                                                                 | —                                     | 2026-10-28 DNS 失败                        | D                     |
| S41 | `using-git-worktrees`：先检测隔离、原生工具优先、`.worktrees/` 优先级、`git check-ignore` + 提交 .gitignore、setup 探测、基线测试、沙箱降级 | https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/SKILL.md                                    | Jesse Vincent                         | main                                       | A                     |
| S42 | worktrunk：`wt switch/list/merge/remove`、路径模板、hooks、`--full` CI + AI 摘要、CoW 缓存                                                  | https://github.com/max-sixty/worktrunk                                                                               | max-sixty                             | 未标注                                     | A                     |
| S43 | git-worktree-runner `gtr new/list/remove` + hook/编辑器集成                                                                                 | https://github.com/git-worktree-runner/git-worktree-runner                                                           | 社区                                  | 未标注                                     | C                     |
| S44 | gwq `add/list/remove/cd` + fzf                                                                                                              | https://github.com/d-kuro/gwq                                                                                        | d-kuro                                | 未标注                                     | C                     |
| S45 | Z Code 产品身份（Z.ai ZCode / ADE）                                                                                                         | https://zcode.z.ai/en/docs/welcome                                                                                   | Z.ai                                  | 下载页 3.16.3                              | A                     |
| S46 | Z Code 官方文档中未见 worktree 机制                                                                                                         | https://zcode.z.ai/en/docs                                                                                           | Z.ai                                  | 2026-10-28                                 | D（未发现）           |
| S47 | Claude Code CLI `--worktree`/`-w` 官方定义与 `--tmux` 配套                                                                                  | https://code.claude.com/docs/en/cli-reference                                                                        | Anthropic                             | 未标注                                     | A                     |
| S48 | Claude `EnterWorktree` 的显式指令约束、`path` 切换与 `ExitWorktree` keep/remove                                                             | https://github.com/fivetaku/claude-code-system-prompts/blob/main/system-prompts/tool-description-enterworktree.md    | 公开系统提示镜像（非 Anthropic 官方） | 未标注                                     | C                     |
| S49 | Codex CLI `--worktree` 支持 interactive/fork/exec、要求 local execution；`--sandbox` 三档                                                   | https://learn.chatgpt.com/docs/developer-commands?surface=cli（由 developers.openai.com/codex/cli/reference 重定向） | OpenAI                                | 未标注                                     | A                     |
| S50 | Codex Local / Worktree / Cloud 三模式与 Cloud 独立工作文件                                                                                  | https://learn.chatgpt.com/docs/environments/modes                                                                    | OpenAI                                | 未标注                                     | A                     |
| S51 | Codex CLI managed worktree 的提交（`codex --worktree`、`codex fork --worktree`）                                                            | https://github.com/openai/codex/commit/40f5276ce68cda09b61972811f0a4286c56aada6                                      | OpenAI（官方仓库）                    | 2026-09-05                                 | A                     |
| S52 | ZCode 是 Z.ai 的 ADE、面向 GLM-5.3、desktop 为主，另有 Remote/Bot Channel；下载 3.16.3                                                      | https://zcode.z.ai/en/docs/welcome                                                                                   | Z.ai                                  | 下载页 3.16.3                              | A（主体）/C（客户端） |
| S53 | ZCode workspace/task 模型、fork 不 rollback 文件、两个 session 共享 workspace、四种执行模式与 Safety Confirmation                           | https://zcode.z.ai/en/docs/agents                                                                                    | Z.ai                                  | 未标注                                     | A                     |
| S54 | ZCode ADE Remote Development 可在 server/development machine/container 执行                                                                 | https://zcode.z.ai/en/docs/ADE-tools                                                                                 | Z.ai                                  | 未标注                                     | B                     |
| S55 | ZCode task 归档保留期 3/7/14/30 天                                                                                                          | https://zcode.z.ai/en/docs/task-management                                                                           | Z.ai                                  | 未标注                                     | B                     |
| S56 | 第三方 Git Worktrees for ZCode 插件：`~/.zcode/worktrees`、`zcode/sess-…`、`/worktree:*`、`.zcode/worktree.json`、14 天/15 个、snapshot     | https://github.com/agallardol/zcode-git-worktrees                                                                    | agallardol（第三方）                  | README 索引 2025-12-05；要求 ZCode ≥ 3.8.1 | C                     |

## 10. 未决问题

1. **Claude Branch prefix 拼接符**：官方未明示前缀与名字之间是 `-` 还是 `/`，`未验证`。
2. **Codex CLI 是否与 app 共用同一 Worktree root**：CLI reference 未单独写明，`未验证`；Worktree root 的 FAQ 本身也只能经索引读取（B）。
3. **Codex Cloud 的 PR/merge 交付细节**：官方 environments 页只说明 Cloud task 有独立工作文件，未说明合并流程，`未验证`。
4. **Codex Handoff 的运行中进程/终端状态/未提交改动**：官方未给完整契约，`未验证`。
5. **ZCode 的"未发现官方 worktree"是负向检索结论**，不等于绝对不存在；第三方插件细节仅 C 级。
6. **Cursor worktree 根目录、Conductor workspace 目录、Claude Squad/uzi 的 worktree 根目录**：`未验证`。
7. **Gemini CLI**：只找到 C 级"无内置 worktree"证据，不能断言绝对没有。
8. **外部产品会变化**：本表所有事实以 2026-10-28 访问为准；复刻前应重新核验关键路径与旗标。

## 11. 对 `50` 的采纳清单

| ID            | 决策   | 内容                                                            | 目标章节                  | 验收                   |
| ------------- | ------ | --------------------------------------------------------------- | ------------------------- | ---------------------- |
| ADOPT-WM-001  | ADOPT  | 一任务一 worktree + 确定性路径/分支                             | `50` §2.2 INV-WM-02、§7.1 | AC-WM-003              |
| ADAPT-WM-002  | ADAPT  | setup 三层：复制清单 + 命令数组 + CoW 缓存（Ultimate 只有命令） | `50` §6.6、§7.2           | AC-WM-005              |
| ADOPT-WM-003  | ADOPT  | 可恢复生命周期状态机；UI 只是投影                               | `50` §5                   | AC-WM-004、AC-WM-008   |
| ADOPT-WM-004  | ADOPT  | per-source FIFO + 串行锁 + 检查绑定 SHA                         | `50` §7.6–§7.7            | AC-WM-013、AC-WM-017   |
| ADAPT-WM-005  | ADAPT  | 失败交给模型诊断/修复，但限一次                                 | `50` §7.8                 | AC-WM-023              |
| ADAPT-WM-006  | ADAPT  | 保守 GC：已合入 + 干净 + N 天 + dry-run；拒绝按数量淘汰         | `50` §7.13（新增）        | AC-WM-035（新增）      |
| ADAPT-WM-007  | ADAPT  | `workspace handoff` 转移所有权（未来）                          | `50` §6.5 NOTE            | —（不在本期）          |
| ADAPT-WM-010  | ADAPT  | 创建时 `baseMode: head \| fresh`，解析后的 `baseSha` 入库       | `50` §7.1                 | AC-WM-003              |
| REJECT-WM-008 | REJECT | 容器/VM 作为唯一隔离                                            | —                         | 与本地工作目录目标冲突 |
| REJECT-WM-009 | REJECT | 用看板列/PR 状态代替 Git 真实状态                               | —                         | 与 INV-WM-03/06 冲突   |

> 建议优先落地：ADOPT-WM-006（GC）与 `60` 的 inventory（清单）是当前最大可用性缺口；ADOPT-WM-004 已是 Ultimate 的结构性优势，不要为了"对齐主流"而改成 PR 流。
