# Worktree / 并行 Agent 工作区可视化调研

## 1. Metadata 与读法

| 字段                        | 值                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 标题                        | Worktree / 并行 Agent 工作区可视化调研                                                                                        |
| 文档 ID                     | AD-R-02（对应 `../01-worktree-plan.md` 的 U-01…U-07）                                                                         |
| 状态                        | final（2026-10-28，供 `../60-worktree-visualization-spec.md` 引用）                                                           |
| 证据基线                    | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`）                                                           |
| 调研日期 / 外部资料访问日期 | 2026-10-28（§10 所有外链均在该日访问）                                                                                        |
| 方法                        | 官方文档与官方仓库优先；官方产品页、官方截图说明次之；二手评测只作线索并显式标注；直连失败的页面记录失败方式，不据记忆补写 UI |
| 语言                        | 中文叙述 + 英文标识符（组件、字段、状态值、命令保持原文）                                                                     |
| 读者                        | 实现或评审 Ultimate worktree 可视化（侧栏、Info、transcript、landing）的 agent / 工程师                                       |

**置信度图例**

| 级别 | 含义                                                                      | 使用方式                            |
| ---- | ------------------------------------------------------------------------- | ----------------------------------- |
| A    | 官方文档正文、官方仓库 README/源码                                        | 可直接作为事实引用                  |
| B    | 官方页面文字、官方截图 alt/说明，或官方页面经搜索索引摘录（页面直连失败） | 可引用，但注明获取路径              |
| C    | 二手来源（评测站、对比站、社区帖、聚合文档）                              | 只作线索，不单独支撑结论            |
| D    | 推断 / 未公开                                                             | 文中写“未公开/未验证”，不得当作事实 |

正文用 `[Sxx]` 指向 §10 的来源行；§10 每行都带 URL 与访问日期，因此 `[Sxx]` 等价于逐条引用。Ultimate 自身的界面事实来自本仓库源码与 `extensions/workspaces/README.md`，不标外部来源。

---

### 1.1 调研目标与读法

本文回答三个问题：

1. 别的产品把“多个 worktree / 多个并行 agent”画成了什么信息结构（列表、看板、树、时间线、详情页）？
2. 每个可见字段背后是什么状态模型，状态词、颜色、排序、队列、失败反馈如何组织？
3. 哪些模式值得 Ultimate 采纳，哪些必须拒绝，落到 `../60-worktree-visualization-spec.md` 的哪一节？

Ultimate 现有四层界面是本文的比较基线（按源码字段重绘，非截图）：

```
① 侧栏（常驻）
┌──────────────────────────────────────────────┐
│ 📁 ultimate #dev-lxy                          │  ProjectPath：<project> #<worktree>
│ ● @ultimate                         …         │
│ ── In flight ─────────────────────────────── │
│ ✻ Fix lander retry      feature   12m         │  Row：状态点 + 标题 + FeatureTag + #id + age
│   #42 · 3 commits · +5 edits            ⋯     │  work 行：N commits / +N edits
│   └ ▪ reviewer #57            working         │  SubagentLine
│ ── Pinned ─────────────────────────────────── │
│ ● @lander   landing · queue 2 · 4m            │  LanderState
└──────────────────────────────────────────────┘

② Info 面板 “Workspace”：lander queue → this checkout（path/branch/target/ahead/landed）→ all checkouts（state/commits/uncommitted/disk）

③ Transcript：`workspace submit` 工具卡 = `submit · <tip> → <target>` + 状态 chip（`queued #2` / 当前 step + spinner / `Landed <sha> · pushed` / `Not landed`）+ N steps 折叠 + lander log + lander report

④ Landing 卡：feature tag + 标题 + summary + headline + Diverged + commits/paths + tone（landed / push failed / failed）+ GitHub compare 链接
```

本文的取舍：**只写能改变设计决策的差异**。产品缺少某能力时写“未公开/未验证”，不拿常识补齐；产品已停运时照常记录其历史 UI，但标注状态，避免把死产品当现役最佳实践。

---

## 2. 可视化维度

| #   | 维度                           | 要回答的问题                                                                                      | Ultimate 对应面                                                                                                                  | 观察重点                                                            |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| D1  | 信息架构                       | 第一屏是什么？列表/看板/树/时间线？详情在右栏、下钻页还是弹层？                                   | 侧栏 → Info 面板 → transcript → landing 卡                                                                                       | 总览与详情的层级；是否允许同屏对照多个 worktree                     |
| D2  | Worktree / workspace inventory | 一共有哪些工作区？按项目、仓库、分支还是 agent 分组？主 checkout 是否单列？                       | 侧栏项目行 + In flight 分组 + Info “all checkouts”                                                                               | 计数口径（含 removed？含 main？）；空/孤儿 worktree 是否可见        |
| D3  | 状态词汇                       | 有哪些状态？词是动词还是形容词？颜色/图标如何映射？是否有“等待人”和“等待机器”的区分？             | `working/awaiting/done/failed/paused`；workspace `preparing/ready/failed/removed`；submission `queued/landing/landed/not landed` | 状态是否互斥；是否把“队列中”与“进行中”分开；颜色是否只表达 tone     |
| D4  | 每工作区详情                   | 一张卡/一行必须有哪些字段？branch、path、target、ahead/behind、WIP、PR、agent、模型、端口、磁盘？ | 行内 `#id`、feature、age、work 行；Info 的 path/branch/target/ahead/landed                                                       | 字段是否可复制/可跳转；长路径如何省略；是否有“最后活动”             |
| D5  | Diff / review                  | 从状态行到 diff 几步？是否支持逐文件、逐 hunk、行内评论、按 commit 过滤、对比基准切换？           | `Review changes` → DiffsHub `branch:<name>` / `uncommitted:<id>`；landing 的 compare 链接                                        | 入口是否贴在 worktree 上；评论能否回流给 agent；diff 是否要求先提交 |
| D6  | 合并 / landing 反馈            | 成功/失败/部分成功如何呈现？是否给 sha、target、push 结果、冲突路径、检查结果？                   | submit chip、lander 步骤、LandingCard tone、LanderReport                                                                         | “落地回执”是否可独立阅读；失败是否给下一步动作                      |
| D7  | 队列 / 进度                    | 有几个人在等？我是第几？当前 step 是什么？耗时多少？                                              | `queued #2`、lander queue、`N steps`、step 行、elapsed                                                                           | 队列位置是否按 source 计算；step 是否带状态与输出尾部               |
| D8  | 通知 / 告警                    | 什么事件通知？应用内 badge、OS 通知、声音、邮件？是否会重复打扰？                                 | 侧栏 age、`Awaiting @ultimate`、失败红色、lander 队列                                                                            | 通知是否可定位到具体 worktree；是否有“需要我”优先层                 |
| D9  | 控制 / 权限                    | 谁能 land/submit/discard/删除？危险动作是否二次确认？权限模式是否可见？                           | `…` 菜单（Workspace details / Review changes）、conclude/resume、lander 唯一写入                                                 | 删除 worktree 时未提交改动的保护；agent 与人的权限边界              |
| D10 | 空 / 错误状态                  | 没有 worktree、setup 失败、worktree 被外部删除、push 被拒时显示什么？                             | `Setup failed`、`Removed`、checkout 错误行、Info 空态 “shared checkout”                                                          | 空态是否给下一步；错误是否可复制；是否区分“可重试/不可重试”         |
| D11 | 密度 / 响应式                  | 一行多高？窄屏折叠什么？是否支持紧凑/舒适模式、虚拟滚动、键盘导航？                               | 行高 28/44/58px 三档、窄屏隐藏元数据、`pointer-coarse` 菜单常显                                                                  | 100+ worktree 时是否仍可扫描；移动端是否只保留状态与标题            |

**文档可验证度矩阵**（● 公开且可核对 / ◐ 部分公开 / ○ 未公开 / — 不适用；这是“文档可验证度”，不是产品质量评分）

| 产品         | D1 架构 | D2 inventory | D3 状态词 | D4 详情 | D5 diff | D6 landing | D7 队列 | D8 通知 | D9 权限 | D10 空态 | D11 密度 |
| ------------ | ------- | ------------ | --------- | ------- | ------- | ---------- | ------- | ------- | ------- | -------- | -------- |
| Claude Code  | ●       | ◐            | ●         | ◐       | ●       | ○          | ○       | ●       | ●       | ●        | ◐        |
| Codex        | ●       | ◐            | ○         | ◐       | ●       | ○          | ○       | ◐       | ◐       | ○        | ○        |
| Cursor       | ●       | ◐            | ○         | ◐       | ●       | ○          | ○       | ◐       | ◐       | ○        | ○        |
| Conductor    | ●       | ●            | ◐         | ●       | ●       | ◐          | ○       | ◐       | ◐       | ◐        | ○        |
| Sculptor     | ●       | ●            | ○         | ●       | ●       | ◐          | ○       | ○       | ◐       | ◐        | ○        |
| Claude Squad | ◐       | ◐            | ○         | ○       | ◐       | ○          | —       | ○       | ○       | ○        | ○        |
| Vibe Kanban  | ●       | ●            | ●         | ●       | ●       | ◐          | ○       | ◐       | ◐       | ●        | ◐        |
| GitKraken    | ●       | ●            | ●         | ●       | ●       | ◐          | ○       | ◐       | ●       | ◐        | ●        |
| VS Code      | ●       | ●            | —         | ◐       | ●       | —          | —       | ○       | ◐       | ●        | ●        |
| **Ultimate** | ●       | ●            | ●         | ●       | ●       | ●          | ●       | ◐       | ◐       | ◐        | ◐        |

这张矩阵暴露两个空白：**D6 landing 只有 Ultimate 完整**，**D7 队列只有 Ultimate 有**；反过来，Ultimate 在 D10 空态与 D11 密度上落后于 GitKraken 与 Vibe Kanban。这决定了采纳策略：landing 与队列不外借，只做自洽性加固；空态、密度、危险动作保护向外借。

**横向结论（先给判断）**：截至 2026-10-28，**没有任何一个产品同时做到** Ultimate 的四层（行内 work 统计 + 队列位置 + 逐步 lander 日志 + 可独立阅读的 landing 回执）。多数产品停在“列表 + diff + PR”三件套；Ultimate 的差异点是 **landing 作为一等公民**。因此外部调研的主要价值不是照搬布局，而是补齐 **inventory 字段、状态词、危险动作保护、空态与密度**。

---

## 3. Claude Code

### 3.1 产品面与入口

Claude Code 目前有四个相关界面，文档把它们分开描述：

| 界面                          | 入口                  | 与 worktree 的关系                                       | 证据  |
| ----------------------------- | --------------------- | -------------------------------------------------------- | ----- |
| Desktop app 的 Code tab       | Claude Desktop → Code | 每个 session 可勾选 **Worktree**，在独立 checkout 运行   | [S02] |
| Web（Claude Code on the web） | `claude.ai/code`      | 云端 session，侧栏 session 列表 + Changes 卡 + diff view | [S05] |
| Agent view                    | 终端 `claude agents`  | 本机后台 session 的总览表，按状态分组                    | [S03] |
| Agent teams                   | 终端内 team           | 一个 lead + 多个 teammate；agent panel 或 split panes    | [S04] |

### 3.2 Worktree 指示

- Desktop：新建 session 时在 prompt 下方打开 **Worktree** 按钮；默认关闭，直接在项目目录工作。worktree 默认放在 `<project-root>/.claude/worktrees/`，可在 Settings 改 **Worktree location**，SSH 连接可设 **Worktree folder**；还可设 **Branch prefix**，统一给 worktree 分支加前缀 [S02]。
- 终端：`claude --worktree <name>`（`-w`）在 `.claude/worktrees/<name>/` 创建，分支名 `worktree-<name>`；`EnterWorktree` 工具可在 session 中进入/切换 worktree [S01]。
- 归档 session 时，若 worktree 有未提交改动，Desktop 会询问 **Archive anyway** 或取消；若 worktree 留在磁盘，本地 session 的 worktree 会在归档或最后一次打开后约 30 天删除（以较晚者为准）[S02]。
- **未公开**：Desktop session 列表里没有文档化的 worktree 徽标、路径、分支或 ahead/behind 字段；也没有“所有 worktree”总览页。文档只描述开关与存储位置 [S01][S02]。这一点与 Ultimate 的 `#<worktree>` 行形成明显差异。

### 3.3 并行 session 列表

Desktop 侧栏是 session 列表：`+ New` 新建，`Ctrl+Tab` 切换；支持 side-by-side split view 与独立窗口；可按 Group by / Sort by 组织，Archived 在单独 tab [S02]。后台任务在 **Background tasks** pane 中列出 subagent、后台 shell、dynamic workflow [S02]。

Agent view 是最接近“并行工作区总览”的公开设计。官方截图说明：顶部一行统计 awaiting input / working / completed；session 按 **Needs input / Working / Completed** 分组；每行显示名称、最新状态或问题、时间；底部是任务输入框与键盘提示 [S03]。官方给出的文本示例可直接作为线框依据：

```
Pinned
  ✽ clawd walk cycle          Drawing the walk-cycle sprite frames          3m

Ready for review
  ∙ jump physics              Opened PR with collision fix                 #2048  2h

Needs input
  ✻ power-up design           double jump or wall climb?                    1m

Working
  ✽ collision detection       Adding swept-AABB checks to CollisionSystem   2m

Completed
  ✻ title screen              menu, options, and credits done               9m
```

状态词汇是明确的两套：**状态**（Working / Needs input / Idle / Completed / Failed / Stopped）与**图标形状**（`✻`/`✽` 进程在跑或需要输入；`∙` 进程已退出但可恢复；`✢` `/loop` 睡眠中）。PR 标签 `#1234` / `!1234` 用颜色表达 checks/review 状态：黄=等待或失败、绿=通过、紫=已合并、灰=draft/closed [S03]。

行摘要是“可扫读”的关键：由 Haiku 级模型生成，工作中最多每 15 秒用 session 自身输出更新一次，turn 结束再生成新摘要；长 turn 中每几分钟重写，避免过期 [S03]。这是 Ultimate 侧栏 `activity` 行可借鉴的成本模型：**高频用本地输出，低频才调模型**。

### 3.4 Diff 与 review

- Desktop：**Changes** 卡显示 `+12 -1` 行数，点开进入 diff view；可逐文件查看、在行号旁 `+` 添加评论，`Cmd/Ctrl+Enter` 一次性提交多条评论，Claude 读取后修改并产生新 diff [S02]。
- Web：Changes 卡同样显示 `+42 -18`；diff view 支持行内评论与 **Compare against** 切换对比分支；diff 由 git blob 原始内容计算，不应用 diff driver/textconv [S05]。
- `/code-review` 产出按文件分组的 **Code review** 卡，可 **Walk through in diff** 逐条跳转，或 **Apply fixes** [S02]。

### 3.5 权限提示

Desktop 的权限模式有 Manual / Accept edits / Plan / Auto / Bypass permissions；Manual 下每次编辑或命令都给 diff 并接受/拒绝 [S02]。Agent view 把“等待权限”归入 **Needs input**，但明确说明：在 peek 面板回复**不能**回答权限对话框，必须 attach 到 session 才能处理 [S03]。Agent teams 中 teammate 的权限提示**冒泡到 lead session**，由用户在 lead 处批准 [S04]。

这对 Ultimate 的含义：Ultimate 的 `workspace submit` 没有“等待用户批准”状态，权限提示发生在 transcript 的工具调用层。若未来在侧栏加“等待人”状态，必须区分 **question** 与 **permission dialog**，否则会出现“点了回复但没生效”的同类问题。

### 3.6 未公开 / 未验证

- Agent teams 的 split panes 依赖 tmux/iTerm2，UI 是终端分屏，不是图形工作区总览 [S04]。
- Agent view 是 research preview，官方声明界面与快捷键可能变化 [S03]。
- 没有公开的“worktree 列表页”“worktree 卡片字段”“merge/landing 队列”；PR 合并交给 GitHub 的 auto-merge / Merge when ready [S02]。

**对 Ultimate 的借鉴**

1. **分组头承担状态语义**：Agent view 的 `Needs input / Working / Completed` 是“按需分组”，不是固定列。Ultimate 的 In flight / Landed / Pinned 也是分组，但缺“需要我”这一组；可考虑把 `awaiting` 会话临时提升到顶部，而不是只靠行内黄色文字。
2. **一行必须能独立回答三件事**：谁、在做什么、多久了。Agent view 用 `名称 + 摘要 + age` 做到；Ultimate 的行有标题、activity、age，但 activity 与 phase 可能同时出现，需明确“第二行只放一个主动作”。
3. **权限提示不能只做 badge**：Claude 明确区分“可 peek 回复的问题”与“必须 attach 的 permission dialog”。Ultimate 若在侧栏标 `awaiting`，点进去应落到具体的工具卡，而不是会话顶部。

---

## 4. OpenAI Codex

### 4.1 Codex app 的 tasks / threads

Codex 桌面端的组织单位是 **thread**（一次 session：prompt + 输出 + 工具调用，可继续追问），一个窗口可跨项目运行多个 thread；左侧按 **project** 组织，每个 project 对应磁盘目录，切换 project 即切换 sandbox、worktree 状态与 thread 历史 [S07]（B）。新建 thread 时必须选模式：**Local**（当前项目目录）、**Worktree**（独立 Git worktree）、**Cloud**（远程环境）；Local 与 Worktree 都在本机运行 [S07]。

Thread 头部（文档描述的能力，非视觉细节）：**Create branch here**（把 detached HEAD 变成命名分支，之后可 commit/push/开 PR）、**Open**（用 IDE 打开 worktree）、**Hand off**（把 task 与代码移到 Local）[S06][S07]。集成终端在每个 thread 内，作用域是当前 project 或 worktree，`Cmd+J` 开关，Codex 可读取终端输出 [S07]。

### 4.2 Worktree 模型

| 项       | 行为                                                                                                                              | 证据  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 位置     | `$CODEX_HOME/worktrees`，Settings > Worktrees 可改 Worktree root                                                                  | [S06] |
| 起点     | 所选 branch 的 `HEAD`；若该 branch 有未提交改动，一并应用到 worktree                                                              | [S06] |
| 分支状态 | 默认 **detached HEAD**，不创建分支，避免污染 branch 列表                                                                          | [S06] |
| 生命周期 | Codex-managed worktree 轻量、一次性，通常一个 task 一个；Permanent worktree 从项目 `…` 菜单创建，作为独立 project，可多 task 共用 | [S06] |
| 清理     | 归档 thread 或超过保留数量时删除；删除前保存 snapshot，重开可恢复（官方未给数量上限；二手教程称保留 15 个，未采信）               | [S06] |

**Handoff** 是 Codex 独有的“工作区搬迁”动作：Git 只允许一个分支同时在一个 worktree checkout，Handoff 负责在 Local 与 Worktree 之间安全移动 task 与代码；移回时 Codex 会回到该 task 原来的 worktree [S06]。

### 4.3 Diff 与 PR

官方 Features 页：diff pane 显示当前 project 或 worktree 的 Git diff；可在 diff 上写行内评论让 Codex 处理、stage/revert 单个 chunk 或整个文件；可直接 commit、push、创建 PR；更复杂的 Git 操作走集成终端 [S07]（B）。Codex Review 是另一条线：`/review` 在本地 checkout 上按 base branch 或 uncommitted changes 评审，输出按优先级排序的 findings，不改工作树 [S08]（A）。

### 4.4 状态 / 活动

已核实：thread 有 running 概念；Scheduled 视图是“inbox”，有未读指示；自动化可选择在 local 或 worktree 运行 [S07]。官方页面没有给出 task 列表的状态词表；可比对的等待态只出现在二手教程与社区帖中（C），不纳入事实。

**未公开/未验证**：task 列表的卡片字段、状态 chip 的具体词、worktree 在列表中的徽标、队列位置、landing/merge 回执；Cloud 模式的 task 列表字段与状态词也没有官方说明。Codex 的合并语义是“开 PR + GitHub 合并”，没有 Ultimate 式的 lander 队列 [S07]。因此 Codex 只能提供 **inventory 与 handoff** 两类借鉴，不能提供 landing 反馈模型。

**对 Ultimate 的借鉴**

1. **模式是新建时的第一等选择**：Codex 把 Local / Worktree / Cloud 放在 composer 下方，用户在建 thread 前就知道隔离级别。Ultimate 由 @ultimate 自动决定分支与 worktree，用户看不到“这次会在哪跑”；Info 的 checkout 行应补一句“isolated checkout / shared checkout”的来源说明。
2. **Handoff 的约束值得写成错误文案**：同一分支不能同时被两个 worktree 检出。Ultimate 的 `workspace land` 与重建路径迟早会遇到这个 Git 错误，应把“分支已在另一个 checkout 检出”作为 `E_*` 文案，而不是透传 git stderr。
3. **永久 worktree 作为 project** 是 Codex 独有的组织方式；Ultimate 不需要，但可借“permanent vs disposable”区分：长期分支与一次性实验在侧栏应有不同的清理策略。

> 获取说明：`developers.openai.com/codex/app/features` 与 `/codex/environments/git-worktrees` 直连返回 **403**；本文的 Codex 事实来自搜索引擎对官方页面的正文摘录（B），并在 §10 标注。未把二手教程的 UI 描述当作官方事实。

---

## 5. Cursor

### 5.1 Agents Window

Cursor 的 agent-first 界面是 **Agents Window**，随 Cursor 3 于 2026-04-02 正式可用；官方列出的独有能力包括：multi-workspace（跨项目 agent）、新版 diffs view（review/commit/manage PR）、parallel agents（云端，多端可达）、local↔cloud handoff、cloud subagents、**Worktrees**（隔离 Git checkout）[S10]。

Worktree 文档写得很明确：**UI 原生的 worktree 功能只在 Agents Window 提供**；在 IDE 里要用 Worktree Skills 命令 [S09]。从 Agents Window 启动或把 agent 移入 worktree 时，Cursor 为该 agent 创建独立 checkout；结束后可在 Agents Window 里 review，继续在 worktree 工作、从该 checkout commit/PR，或把结果带回主工作区 [S09]。

### 5.2 配置与边界

`.cursor/worktrees.json` 控制 setup，查找顺序是 worktree 路径 → 项目根；支持 `setup-worktree-unix`、`setup-worktree-windows`、`setup-worktree`，值为命令数组或脚本路径；示例用 `$ROOT_WORKTREE_PATH` 复制 `.env`；官方明确不建议把依赖 symlink 进 worktree，推荐 bun/pnpm/uv 快速安装 [S09]。

### 5.3 Review

Agents Window 的 diffs view 支持 review、commit、PR 管理 [S10]；Agent Review 可自动或手动触发，分 Quick / Deep 两档，可从 Source Control tab 对全部本地改动跑一遍 [S11]。**未公开**：Agents Window 左侧 agent 列表的状态词、卡片字段、排序与过滤；官方文档没有描述该列表，“sidebar of running agents”一类说法来自二手（C）[S41]，不足以还原 UI。因此 Cursor 的借鉴点限于 **worktree 生命周期**与 **diff 入口位置**，不借鉴其状态模型。

**对 Ultimate 的借鉴**

1. **把“迁移”当显式动作**：Cursor 允许 keep working / commit-PR / bring back 三选一，Codex 有 Hand off；Ultimate 的等价物是 `workspace land`（同步快进）与 `workspace submit`（异步队列）。两者应在 UI 上被解释成不同风险等级，而不是两个并列按钮。
2. **diff 入口贴在 checkout 上**：Cursor 的 diffs view 是 Agents Window 的一等面板，不是 PR 的附属页。Ultimate 的 `Review changes` 已在行菜单里，但 checkout 详情没有同样的入口，导致“看到路径却无法立刻看改动”。
3. **setup 配置属于工作区，不属于 agent**：`.cursor/worktrees.json` 是项目级配置；Sculptor 的 setup command 也是 per-repo。Ultimate 的 `isolates.worktree.setup` 已是同类机制，Info 只需显示“setup 失败”的原因，不必暴露配置编辑。

---

## 6. Worktree 原生应用

这一节的产品把 worktree 当第一等对象。它们最接近 Ultimate 的“多工作区并行”，但多数没有 lander。

### 6.1 Conductor（conductor.build）

- **布局**：左侧项目/工作区 sidebar，中间 workspace chat，右侧 review/changes；官方截图说明为 “project sidebar, workspace chat, and setup checklist” [S16]，首页截图说明为 “collaborative agent chats and a changes panel” [S17]。每个 workspace 以**分支名**为主要标识，目录名是次要名（截图说明：“sidebar showing the scroll-to-bottom-btn workspace on the warsaw-v2 directory”）[S13]。
- **卡片字段**：workspace 名（分支）、目录名；History pane 存归档 workspace，可恢复（含 chat 历史）[S14]。
- **状态模型**：没有公开的状态词表；用 **Checks tab** 汇总 git status、CI、deployments、comments、todos 作为“可合并就绪”信号 [S14][S15]。新建 workspace 走 `Cmd+Shift+N`，可从 branch / PR / GitHub issue / Linear issue 创建 [S14]。
- **Diff / review**：`Cmd+Shift+D` 打开 Diff Viewer；左栏文件列表，支持 unified diff、按 commit 过滤；行内评论成为 composer 附件发回给 agent；GitHub review comments 也会出现在 Conductor，处理后可 resolve [S15]。
- **合并 / 清理**：`Cmd+Shift+P` 创建 PR；可让 Conductor 起草描述、响应评论、修 checks；合并后 **Archive** workspace，History 可恢复 [S14]。
- **终端**：每个 workspace 有独立终端与 Run 按钮；action 可用 `CONDUCTOR_PORT`，让多个 workspace 的 dev server 并行 [S13][S16]。
- **强弱**：强在“workspace = 一个可独立 review/merge 的分支”这一心智模型，以及 diff 评论回流；弱在没有 landing 队列、没有逐 step 的合并日志，状态主要靠 Checks 推断。

### 6.2 Sculptor（Imbue，GitHub: imbue-ai/sculptor）

`sculptor.sh` 在 2026-10-28 **DNS 无法解析**，因此以官方仓库 `docs/help` 为准（A）。

- **布局**：每个 workspace 一个 tab，切换 tab 即切换 repo 与 agent session；顶部 bar 显示 `repo › branch → target-branch`，附改动摘要与 PR 按钮 [S19]。左侧 **Files panel** 默认打开，三个 tab：Browse（文件树）、Changes（未提交改动，带计数如 `Changes 2`）、Commits（workspace 分支历史）[S20]。
- **卡片字段**：workspace 名、分支、目标分支、改动数、PR 状态；分支命名默认 `<user>/<slug>`，可按 repo 配置 [S19]。
- **状态模型**：没有状态词表；以 Changes 计数与 PR 状态表达进度 [S20][S21]。
- **Diff / review**：Changes tab 展示**累计未提交 diff**（不是最后一条消息），点文件在主面板看逐行红绿 diff；不满意就在 chat 让 agent 改，diff 随更新 [S20]。
- **合并 / 清理**：`Commit 2 changes` 按钮让 agent 写 commit message 并提交；提交不 push。每个文件有 **Discard changes**，**没有 discard all**；删除 worktree 时按 Settings 策略决定是否删分支（never / only when safe / always）[S19][S20]。
- **终端**：内建终端，作用域为 workspace [S18]。
- **强弱**：强在“未提交改动是一等对象”和逐文件 discard 的安全感；弱在缺总览状态、缺队列、缺 landing 回执。它证明了一个重要模式：**diff 计数应贴在 workspace 上，而不是藏在详情页**。

### 6.3 Claude Squad（smtg-ai/claude-squad）

- **布局**：终端 TUI，单窗口列出多个 instance；底部是命令菜单；`tab` 在 preview 与 diff 两个 tab 间切换 [S22]。
- **卡片字段**：README 未给出字段表；**推断（D）**：每个 instance 至少有 session 标识、tmux 会话、worktree 分支、preview 内容与 diff [S22]。
- **状态模型**：没有文档化状态词；操作隐含状态：attach、paused（`c` checkout 后暂停）、resume（`r`）[S22]。
- **Diff / review**：diff tab + `shift-↓/↑` 滚动；`c` 会 commit 改动并暂停 session；`s` commit 并 push 分支 [S22]。
- **合并 / 清理**：`D` kill/delete session；没有 merge 队列；push 后走 GitHub [S22]。
- **终端**：tmux 每 agent 一个 isolate session [S22]。
- **强弱**：强在键盘驱动、极低开销；弱在无图形总览、无状态颜色、无 landing。适合作为 “CLI 最小可用 inventory” 的参照。

### 6.4 Crystal（Stravu）→ Nimbalyst

官方仓库顶部声明：**Crystal 已于 2026-02 弃用，由 Nimbalyst 取代** [S23]。历史能力（厂商页）：多 Claude Code session 并行、每 session 独立 worktree、恢复完整对话、per-session diff review 与 build/test 脚本、rebase/squash、桌面通知 [S23][S24]。

- **布局**：原版视觉细节未验证（已弃用）；后继 Nimbalyst 采用 **session 列表 + kanban board**，官方描述为 backlog → complete 的阶段板 [S24]。
- **卡片字段 / 状态模型**：原版未公开字段表；Nimbalyst 以 kanban 列表达阶段，卡片承载 session 与 diff 入口 [S24]。
- **Diff / review**：per-session diff viewer；Nimbalyst 增加任意文件的 inline AI diff，可 approve/reject [S24]。
- **合并 / 清理**：原版支持 rebase from main、squash and rebase to main，执行前用 tooltip 预览命令 [S23]。
- **终端**：原版可配置 run script，在 app 内运行测试/应用 [S23]。
- **强弱**：强在“每个 session 一条可恢复的对话 + 一个 worktree + 一个 diff”的最小闭环；弱在原版已弃用，视觉细节（列表还是卡片、状态颜色）**未验证**，不能作为布局证据。Nimbalyst 的 kanban 是上层视图，不是必需。

### 6.5 Vibe Kanban（BloopAI）

官方仓库顶部声明 **Vibe Kanban is sunsetting**（附公告链接）[S25]，但文档仍可读。

- **布局**：kanban 为主视图；另有 List View 与状态 tab。Cloud 项目的 board 有 Filter Bar、Status Columns、Issue Cards、Column Headers [S26]。
- **状态模型**：默认六列 To do / In progress / In review / Done（Backlog、Cancelled 默认隐藏），列可自定义、改名、改色、隐藏；拖拽改状态，Manual 排序下可拖拽排序 [S26]。
- **卡片字段**：Simple ID（如 ISS-1）、Title、Priority 色标、Assignees 头像、Tags [S26]。
- **Worktree / workspace**：每个 workspace 给 agent 一个 branch、一个 terminal、一个 dev server；支持 10+ agent；diff 行内评论直接回给 agent；内建 browser 预览；可开 PR、在 GitHub review 并 merge [S25]。
- **清理**：官方 README 未描述 workspace 删除/归档流程（未公开）；仓库提供 `DISABLE_WORKTREE_CLEANUP` 环境变量，说明存在自动 worktree 清理机制，但触发条件未文档化 [S25]。
- **强弱**：强在“计划（issue board）→ 执行（workspace）→ review → merge”的完整链路与空列引导（空列显示 `+` 新建）[S26]；弱在 board 是 issue 状态，不是 worktree 状态——**同一列里可能有多个 worktree，无法表达“谁在等谁”**。Ultimate 不应把 board 当主界面，但可借用其空态与列计数。

### 6.6 Terragon

官方域名首页当前只返回标题 **“Terragon Shutdown”**，无可抓取正文 [S27]；据此判定产品已停止服务（页面自述）。历史文档（release notes）仍可读：

- **布局 / 流程**：选择 GitHub repo → 描述任务 → 云端 sandbox clone repo 并运行 agent → 完成后自动开 PR 供 review/merge [S29]（C 级镜像；与官方 release notes 的“isolated sandbox / automatic PR”一致）[S28]。
- **状态 / 活动**：task 状态与 agent 进度实时流到浏览器，完成时浏览器通知；release notes 提到 **“Waiting for assistant to start”** 是用户可见的等待步骤 [S28]。
- **控制**：Multi-Agent Mode（同一 task 多 agent）、Sandbox Terminal、Skip Setup Script、Task forking（fork 后显示 “Forked from …” 深链）、branch creation toggle、多凭证 [S28]。
- **Diff / review**：PR 在 GitHub 上 review/merge；in-app diff 细节未公开/未验证 [S28][S29]。
- **合并 / 清理**：任务完成后自动创建 PR；sandbox 生命周期由平台管理，未文档化 [S28]。
- **强弱**：强在“一个 task 一条时间线 + fork 关系 + 深链”，以及把等待步骤显式化；弱在无本地 worktree 概念（sandbox 隔离）、产品已停运，**live UI 不可验证**。只可作历史模式参考。

### 6.7 uzi（devflowinc/uzi）

- **布局**：纯 CLI，无 GUI；`uzi ls` 输出表格，`uzi ls -w` 每秒刷新；tmux 承载每个 agent [S30]。
- **卡片字段（表格列）**：`AGENT / MODEL / STATUS / DIFF / ADDR / PROMPT`；示例状态为 `ready`，DIFF 形如 `+0/-0`，ADDR 是 `http://localhost:3003` [S30]。这实际上是一张极简的 worktree 清单：**名字、模型、状态、改动量、预览地址、任务**。
- **状态模型**：文档示例只出现 `ready`；完整状态词表未公开 [S30]。
- **Diff / review**：无内建 diff/review；`DIFF` 列只给 `+N/-N` 统计，详情需进 tmux 或 git [S30]。
- **合并 / 清理**：`uzi checkpoint <agent> "<message>"` 把该 agent worktree 的改动 commit 并 rebase 到当前分支；`uzi kill` 终止并清理；`uzi auto` 自动按 Enter 确认工具调用；`uzi broadcast` 群发指令 [S30]。
- **终端**：tmux session + 自动 dev server（`uzi.yaml` 的 `devCommand` 与 `portRange`）[S30]。
- **强弱**：强在**列即字段**的可扫描性与“端口/预览地址”这一较少被 GUI 卡片展示的维度；弱在无逐 worktree 详情、无 diff review、无 landing 反馈。它提示 Ultimate：**端口/预览地址值得成为 checkout 详情字段**。

**横向对比**

| 产品              | 布局                         | 每工作区核心字段                    | 状态模型                 | Diff                                     | 合并/清理                    | 终端              | 主要短板            |
| ----------------- | ---------------------------- | ----------------------------------- | ------------------------ | ---------------------------------------- | ---------------------------- | ----------------- | ------------------- |
| Conductor         | sidebar + chat + diff        | 分支名、目录名、Checks              | 无词表，Checks 推断      | 文件列表、unified、commit 过滤、行内评论 | PR + merge + archive/History | 有，workspace 级  | 无队列/landing      |
| Sculptor          | workspace tabs + Files panel | 分支、target、Changes N、PR         | 无词表，改动计数         | 累计未提交 diff、逐文件                  | Commit、逐文件 discard、PR   | 有                | 无总览、无队列      |
| Claude Squad      | TUI 列表 + preview/diff tabs | session、分支、diff                 | 隐含 attach/paused       | diff tab                                 | commit/push、kill            | tmux              | 无状态颜色/总览     |
| Crystal→Nimbalyst | session 列表 + kanban        | session、worktree、diff             | backlog→complete（后继） | per-session diff、inline approve         | rebase/squash                | 有（原版）        | 原版已弃用          |
| Vibe Kanban       | kanban board + workspace     | issue ID/标题/优先级/assignee/tags  | 六列 issue 状态          | 行内评论、diff                           | PR + merge                   | 有 + dev server   | board≠worktree 状态 |
| Terragon          | 云端 task 列表               | task、repo、PR、fork 来源           | 等待/运行/完成（部分）   | 云端 PR review                           | 自动 PR                      | sandbox terminal  | 已停运              |
| uzi               | CLI 表格                     | AGENT/MODEL/STATUS/DIFF/ADDR/PROMPT | 少量（ready）            | 无                                       | checkpoint rebase、kill      | tmux + dev server | 无详情/评审         |

---

## 7. IDE 与 Git 客户端

| 工具 | Inventory（如何列出工作区） | 分支图 | Diff | 合并 / worktree 操作 | 可借 points |
| --- | --- | --- | --- | --- | --- | --- |
| VS Code | **Source Control Repositories** 视图把每个 worktree 当一个 repository 条目；`git.detectWorktrees` 自动发现，默认上限 50 [S32] | Source Control Graph 显示分支关系与历史 [S32] | 侧栏 diff editor，逐文件 | `...` → Worktrees → Create Worktree；右键 Open Worktree in New/Current Window；`git.worktreeIncludeFiles` 复制 `.env`/`node_modules` [S32] | **“worktree 即 repository 条目”** 的树形清单；创建时复制忽略文件 |
| GitKraken Desktop | 左栏 `List \| Agents` 分段切换；List 是分支/worktree，Agents 是 **Agent Sessions View** [S33] | 中央 commit graph 常驻 [S33] | 独立 diff 视图（官方另有 View Diffs 文档）[S33] | 卡片三点菜单：Open / lock/unlock / remove / remove and delete branch [S33] | **同一批 worktree 的两种视图**（分支视角 / agent 视角）；卡片字段最接近 Ultimate |
| GitHub Desktop | 工具栏 **Worktree** 下拉，仅在有 linked worktree 时出现；列表分 **Main worktree / Linked worktrees**，每项显示目录名 + 分支名，可搜索 [S35] | History 视图 | Changes/History 的逐文件 diff | Repository → New Worktree；创建后自动切换；可重命名、删除 [S35] | **主/链接分组**与“目录名 + 分支名”双字段 |
| Tower | 侧栏 **Worktrees** 区；被 worktree 检出的分支打 `+` 徽标；双击切换；底部按钮新建，右键分支可“turn into Worktree” [S36] | 有（Tower 核心） | 有 | 创建/切换/移除 worktree；Tower 12.5 起支持（官方未标日期；2025-02 见 [S39]，C 级）[S36] | **在分支上打 worktree 徽标**，让“分支是否被占用”一眼可见 |
| Fork | 二手对比称 2.63（2026-02）加入 Create Worktree，worktree 显示在侧栏；官方无可抓取文档 [S39]（C） | 有 | 有 | create/delete/switch；删除有未提交改动会直接报错、无 force [S39] | 仅作“worktree 是 Git 客户端标配”的佐证，不引用细节 |
| GitButler | Branches 页：左栏 parallel branches / stacks / legacy branches / remote / PR；中栏 branch 视图；当前 workspace target 显示 `git log` 与 upstream 未整合提交 [S37] | 以 lane 表达，而非传统图 | 文件/差异作为卡片在 lane 间拖拽 | **Apply / Unapply**（不是 checkout）；commit 时计算“只有该 lane 改动”的文件树；可 push 成独立提交 [S37][S38] | **lane = 可并行分支的看板**；apply/unapply 取代 switch |

**VS Code 扩展的边界**：内置 Source Control 已覆盖 worktree 的创建、检测、打开与忽略文件复制 [S32]；扩展市场中的 worktree 插件没有统一官方文档，本文未逐一验证（未验证）。

**从这一组提取的三条硬结论**：

1. **worktree 的“家”是 repository 列表，不是分支列表。** VS Code 与 Tower 都把 worktree 作为与 repository/branch 并列的实体；只在分支上打徽标（Tower）能让用户知道“这个分支已被占用”，但不能替代清单。
2. **主 checkout 必须显式分组。** GitHub Desktop 的 Main / Linked 两段式是最省认知成本的做法；Ultimate 的 Info “all checkouts” 只有计数，没有主/链接区分。
3. **Git 客户端没有“landing”概念。** 它们的合并是 merge/rebase/push，天然没有队列与回执；Ultimate 不应向它们对齐合并语义，只借 inventory 与 diff。

**映射到 Ultimate 的四个具体动作**

- **侧栏项目行**：显示 `project #worktree` 之外，再显示主 checkout 的 branch（来自 `system` 或 Info），让“当前在哪个 checkout”不需要打开 Info。
- **侧栏 in-flight 行**：`3 commits` 已表达“未落地提交”，但没有 `behind`；当 target 前进而 worktree 未同步时，行上应出现 `behind N`（仅 >0 显示），否则用户不知道需要先同步。
- **Info checkout 卡**：GitKraken 的 `WIP / ahead / behind / PR pill` 四件套可直接映射为 `uncommitted / ahead / behind / landed`；其中 `landed` 已有，`behind` 需新增派生。
- **Landed 分组**：借 GitHub Desktop 的 Main/Linked 分组与 Vibe 的列计数，显示 `Landed · N`，而不是只按时间倒序堆卡片。

---

## 8. 模式库（10–14 个）

下表的产品名均指 §3–§7 已给出 URL 的来源；模式本身是归纳，不引入新事实。

| #   | 模式                            | 机制                                                                                             | 代表产品                                                                                | Ultimate 现状与落点                                                                              |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| P01 | Master-detail list              | 左侧紧凑列表，右侧详情；选中项高亮，详情随选中切换                                               | Claude Desktop、Conductor、GitKraken、VS Code                                           | 已有：侧栏行 → Info/transcript；问题是详情分散在三个面，建议 Info 作为“选中 worktree 的详情”     |
| P02 | Kanban board                    | 列=阶段，卡片=工作项，拖拽改状态                                                                 | Vibe Kanban、Nimbalyst                                                                  | 不采纳为主界面；可借“列计数 + 空列 + 新建”到 Landed 分组                                         |
| P03 | Tree by repo/worktree           | 项目 → worktree → 子 agent/会话的层级树                                                          | VS Code、Tower、Codex permanent worktree、Ultimate                                      | 已有：项目行 → In flight → subagent 行；需补“主 checkout”节点与折叠计数                          |
| P04 | Status chips                    | 一词一色的小 chip，贴在行/卡右侧；颜色只表达 tone                                                | GitKraken（Waiting for input）、Ultimate（queued/landed）、Claude（Needs input）        | 已有但词表分散；建议统一 `stateWord/stateTone` 到一份字典，覆盖 workspace/submission/lander 三域 |
| P05 | Live activity line              | 第二行显示“正在做什么”，高频本地更新、低频模型摘要                                               | Claude agent view（15s/摘要）、Ultimate `activity` 行                                   | 已有；需定义截断、更新频率与“最后回复”前缀规则                                                   |
| P06 | Queue position                  | 明确显示“第几位”，并按 source 计算                                                               | Ultimate `queued #2`（其他产品未公开同类队列位置）                                      | 已有；建议补“队列总长”与“预计等待”禁用说明（无数据不显示）                                       |
| P07 | Step timeline                   | 步骤列表带状态、耗时、输出尾部；运行中展开、结束折叠                                             | Ultimate `N steps`；Conductor Checks（列表形态，弱类比）                                | 已有；建议把 step 状态机抽成 `pending/running/passed/failed/flaky/timeout` 六态                  |
| P08 | Landing receipt card            | 独立卡片：feature/title/summary + headline（sha/target/push）+ divergence + commits/paths + tone | Ultimate LandingCard；GitHub PR merge box（弱）                                         | Ultimate 独有优势；建议加“复制 sha”“打开 compare”“查看 lander 日志”三个动作                      |
| P09 | Diff-first review               | 从工作区直接进 diff，不先跳 PR；支持行内评论回流                                                 | Conductor、Sculptor、Claude Desktop、Cursor                                             | 已有 `Review changes`；建议在 checkout 详情加“未提交/已提交”双入口，并显示 diff 统计             |
| P10 | Command palette actions         | `Cmd+K` 统一搜索/执行：切 workspace、开 diff、archive、新建                                      | Sculptor、Codex、GitKraken                                                              | 部分（Ultimate 有 ⌘K）；建议把 `Workspace details` / `Review changes` 注册为命令，支持键盘直达   |
| P11 | Empty-state guidance            | 空列表不是空白：分区标题 + 一句说明 + 主操作                                                     | Claude agent view、Vibe Kanban 空列、Conductor 首次 workspace                           | 需补：无 worktree、无提交、无 lander 队列、无 landed 四类空态文案与 CTA                          |
| P12 | Destructive-action confirmation | 删除/归档前说明会丢什么；有未提交改动时强确认                                                    | Claude Desktop（Archive anyway）、GitKraken（remove and delete branch）、GitHub Desktop | 需补：`Conclude` 不危险，但删除/重建 worktree 必须确认；当前侧栏无删除入口，Info 也无            |
| P13 | Deep links                      | 每个实体有稳定 URL/引用：`#id/entry`、PR `#1234`、task fork 来源                                 | Ultimate、Claude（PR 标签）、Terragon（Forked from）                                    | 已有 `#<id>/<entry>`；建议 landing 卡与 checkout 行都复制同一深链                                |
| P14 | Density modes                   | 紧凑/舒适切换；窄屏隐藏次要字段；列表虚拟化                                                      | GitKraken（List/Agents）、Vibe（Board/List）、Claude（分组/目录）                       | 需补：侧栏三档行高已有，但没有用户可控密度；>100 行需虚拟滚动                                    |

**三个可直接画的线框**

Master-detail（P01）：

```
┌ list ───────────────┬ detail ────────────────────────────┐
│ ● Fix lander  12m   │ Workspace #42                       │
│   3 commits +5 edits│ path   ~/…/wt/42        [copy]      │
│ ○ Review diff  2h   │ branch feature/lander-retry [copy]  │
│ ● @lander  queue 2  │ target main in ultimate             │
│                     │ ahead  3 commits · landed 1a2b3c4   │
│                     │ [Review changes] [Workspace details]│
└─────────────────────┴────────────────────────────────────┘
```

Landing receipt（P08）：

```
┌ ✓ landed  feature:worktree-ui   Landing cards   #118 ─┐
│ summary: 侧栏补 work 行与 landing 回执 …              │
│ Landed 1a2b3c4 on main · pushed to origin/main        │
│ 3 commits ↗   Changed: extensions/workspaces/…        │
│ Diverged  None                                        │
│ ▸ 3 steps                                             │
└───────────────────────────────────────────────────────┘
```

Queue + step（P06/P07）：

```
submit · 1a2b3c4 → main        ⟳ checks  00:42
  ✓ reset lander checkout        0.8s
  ✓ merge 1a2b3c4                1.2s
  ⟳ pnpm test                   00:42
  · push origin/main
```

**取舍原则**：一个模式能否进入 Ultimate，取决于三件事，而不是“别家有”。第一，**数据是否有源**——没有 doc/action/event/entry 支撑的字段一律不画（例如“预计等待时间”没有可靠数据，直接放弃）；第二，**是否与唯一写入者冲突**——任何允许 UI 直接 merge/push 的模式（Conductor、Vibe Kanban）都必须拒绝，因为 lander 是唯一门禁；第三，**是否放大现有层级**——Ultimate 已有四层，新增模式必须减少而不是增加跳转。按这三条，P01/P04/P06/P07/P08/P11/P12 可直接用，P02/P10/P14 需改造，P13 已具备只差统一入口。

---

## 9. ADOPT / ADAPT / REJECT

目标文档：`../60-worktree-visualization-spec.md`。章节口径：**§6 组件状态**（loading/empty/ready/busy/failed/removed 六态与文案）、**§7 布局**（侧栏、Info、transcript、landing 的组件树与线框）、**§8 算法**（排序、分组、队列位置、step 状态机、刷新）、**§9 性能**（事件驱动、查询上限、虚拟化、渲染预算）。

| ID | 决策 | 借鉴的模式与来源 | 目标章节 | 具体改法 | 理由 / 约束 |
| --- | --- | --- | --- | --- | --- | --- |
| ADOPT-WV-001 | ADOPT | P04 状态 chip；GitKraken 的 Running / Waiting for input / done 三态 [S33] | §6 状态表 | 把 workspace、submission、lander 三域的状态词收敛成一张 `stateWord/stateTone` 字典；`Waiting for input` 映射为 Ultimate 的 `awaiting`，不新造词 | 现有词表已存在但分散在 `sidebar/rows.tsx`、`workspaces/log.tsx`、`lander.tsx`；统一后六态表可判定 |
| ADOPT-WV-002 | ADOPT | P01 + GitKraken 卡片字段（branch、WIP、ahead/behind、PR pill）[S33] | §7 Info 面板 | Info 的 `this checkout` 增加 `WIP`（未提交文件数）、`ahead/behind` 两个字段；`behind` 无数据时不显示 | 字段都已在 `InfoAction`/`StatsAction` 数据面存在或可派生，不新增后端契约 |
| ADAPT-WV-003 | ADAPT | P03 树形 inventory；GitHub Desktop 的 Main / Linked 分组 [S35] | §7 侧栏 | 侧栏 In flight 之上加一个不可点击的 `main checkout` 节点，显示当前分支与 `shared` 标记；worktree 行仍按 branch 分组 | Ultimate 的 main 是 source checkout，不是 workspace；加节点会改变行数，需要 §9 的折叠预算 |
| ADOPT-WV-004 | ADOPT | P06 队列位置；Ultimate 已有 `queued #2` | §8 队列算法 | 明确 `position = indexOf(item in same source queue) + 1`，并显示 `queue N` 总长；`landing` 项不计入 queued 位置 | 现有 `useSubmission` 已按 source 过滤，补总长即可；避免跨 source 误算 |
| ADOPT-WV-005 | ADOPT | P07 六态 step；Ultimate `steps.tsx` | §6 / §8 | step 状态机固定为 `pending → running → passed / failed / flaky / timeout`；`failed` 保留 output tail，`flaky` 用 warning tone | 与 lander README 的 check 语义一致，可直接映射 |
| ADOPT-WV-006 | ADOPT | P08 landing receipt；Ultimate `LandingCard` | §7 landing 卡 | 增加三个动作：复制 sha、打开 GitHub compare、跳到 lander 日志 `#<lander>`；`Diverged` 为空时显示 `None` 而不是隐藏 | 现有卡片已有字段，缺的是动作与空值规范；不改 landing 数据 |
| ADAPT-WV-007 | ADAPT | P09 diff-first；Sculptor 的“Changes 计数贴在 workspace 上” [S20] | §7 侧栏 work 行 | work 行的 `+N edits` 点击直接开 `uncommitted:<id>` review；`N commits` 开 `branch:<name>`；两者都不跳 transcript | 现有 `work.ts` 已生成两个 spec，补点击语义与键盘可达 |
| ADOPT-WV-008 | ADOPT | P11 空态；Claude agent view 的空分区说明 [S03]、Vibe 空列 `+` [S26] | §6 空态 | 四类空态：无 workspace（“works in the shared checkout”）、无提交（“No commits yet”）、无队列（隐藏整段而非空白）、无 landed（“Nothing landed yet”） | 现有 Info 只有一句 shared checkout 文案；其余三处需补 |
| ADOPT-WV-009 | ADOPT | P12 危险动作确认；Claude Archive anyway [S02]、GitKraken remove and delete branch [S33] | §6 removed 态 | 删除/重建 worktree 前，若 `uncommitted > 0` 或 `ahead > 0`，弹确认并列出将丢失的 commits/paths；确认文案给“先 Review changes”链接 | Ultimate 当前没有删除入口；一旦加，必须先有保护，否则违反“不丢工作”不变量 |
| ADAPT-WV-010 | ADAPT | P14 密度；GitKraken List/Agents 双视图 [S33] | §9 性能 | 侧栏提供 `compact / comfortable` 两档（28px / 44px），默认 compact；>50 行启用虚拟滚动；窄屏隐藏 feature/age，仅留状态与标题 | 现有行高三档是内容驱动，不是用户选择；虚拟化会改变“选中滚动到可见”的实现 |
| ADOPT-WV-011 | ADOPT | P10 命令面板；Sculptor `Cmd+K` [S18]、Codex `Cmd+K` [S07] | §7 交互 | 注册 `workspace.details`、`workspace.review`、`workspace.copyPath`、`workspace.copyBranch` 四个命令；命令面板可搜索 worktree 分支名 | 不改现有 ⌘K 框架；只是把菜单项提升为命令，提升键盘效率 |
| ADOPT-WV-012 | ADOPT | P13 深链；Terragon “Forked from …” 深链 [S28]、Ultimate `#id/entry` | §7 landing / checkout | checkout 行、landing 卡、lander log 三处统一复制 `#<conversation>/<entry>`；外部 compare 链接保持 `target="_blank"` + `rel="noreferrer"` | 现有 `Open` 组件已支持 `entry`；只需统一入口与复制文案 |
| REJECT-WV-013 | REJECT | P02 kanban 作为主界面（Vibe Kanban / Nimbalyst） | §7 布局 | 不引入 board；Landed 分组可用“列表 + 计数”，不引入列与拖拽 | Ultimate 的一等对象是 conversation tree，不是 issue；board 会掩盖 coordinator/subagent 的从属关系，且与 lander 串行队列冲突 |
| REJECT-WV-014 | REJECT | 全局多项目 dashboard（Cursor multi-workspace、GitKraken Workspaces）[S10][S34] | §7 布局 | 不新增跨项目首页；项目切换仍走现有 project 入口 | Ultimate 一个 server 服务一个项目，引入多项目会改变 `system.project.root` 与权限模型；超出 worktree 可视化范围 |
| REJECT-WV-015 | REJECT | 应用内 merge 按钮（Conductor / Vibe 的 Merge） | §7 landing | 不提供“Merge”按钮；合并只能经 `workspace submit` → lander | lander 是唯一写入者与最终门禁；应用内 merge 会绕过 checks、watchdog、ff-only 与 push 策略 |
| ADAPT-WV-016 | ADAPT | Cursor / Codex 的 local↔cloud handoff [S06][S10] | §8 状态迁移 | 不实现 handoff；但在 Info 显示 `source` 与 `target`，并在 checkout 被外部移动时给 `Removed` 态与“重新创建”动作 | Ultimate 无云端执行面；handoff 的“同一分支只能在一个 checkout”约束对本地同样成立，需在错误态说清 |

**决策汇总**：ADOPT 9 项、ADAPT 4 项、REJECT 3 项（共 16）。P05 已由现有 `activity` 行覆盖，不再单列；其余 13 个模式均有对应决策。优先级：`ADOPT-WV-001/004/005/006` 是“把已有信息说清楚”，应先做；`ADOPT-WV-009/010` 涉及交互与性能，放到 §9 预算之后。

---

## 10. 来源表

> 访问日期均为 **2026-10-28**。`⚠` 表示页面不可直连/不可解析，已注明替代获取方式；`C` 表示二手来源。

| #   | 声明（本文字段）                                                                                                                     | URL                                                                                                               | 发布者                 | 日期 / 版本                                                          | 访问       | 置信      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------- | ---------- | --------- |
| S01 | `--worktree`、`.claude/worktrees/`、`.worktreeinclude`、cleanup、subagent isolation                                                  | https://code.claude.com/docs/en/worktrees                                                                         | Anthropic              | 文档含 v2.1.212–v2.1.302 版本说明；无发布日期                        | 2026-10-28 | A         |
| S02 | Desktop Worktree 开关、Worktree location、Branch prefix、Changes 卡、diff 评论、权限模式、archive/30 天                              | https://code.claude.com/docs/en/desktop                                                                           | Anthropic              | 要求 Claude Desktop v1.2581.0+                                       | 2026-10-28 | A         |
| S03 | Agent view 分组、状态/形状、行摘要、PR 标签颜色、peek/attach、空态                                                                   | https://code.claude.com/docs/en/agent-view                                                                        | Anthropic              | research preview；无日期                                             | 2026-10-28 | A         |
| S04 | Agent teams 的 agent panel、split panes、权限冒泡、限制                                                                              | https://code.claude.com/docs/en/agent-teams                                                                       | Anthropic              | experimental；无日期                                                 | 2026-10-28 | A         |
| S05 | Web session 侧栏、Changes 卡 `+42 -18`、diff view、Compare against、archive/delete 确认                                              | https://code.claude.com/docs/en/claude-code-on-the-web                                                            | Anthropic              | 文档含 v2.1.223–v2.1.289                                             | 2026-10-28 | A         |
| S06 | Codex worktree 位置、detached HEAD、Handoff、Create branch here、permanent worktree                                                  | https://developers.openai.com/codex/environments/git-worktrees                                                    | OpenAI                 | 未标注；页面直连 **403**，经搜索索引摘录                             | 2026-10-28 | B ⚠       |
| S07 | Codex app 的 project/thread、Local/Worktree/Cloud、diff pane、inline comment、stage/revert、commit/push/PR、集成终端                 | https://developers.openai.com/codex/app/features                                                                  | OpenAI                 | 未标注；页面直连 **403**，经搜索索引摘录                             | 2026-10-28 | B ⚠       |
| S08 | Codex `/review`、findings、base branch / uncommitted                                                                                 | https://developers.openai.com/codex/app/review                                                                    | OpenAI                 | 未标注                                                               | 2026-10-28 | B         |
| S09 | Cursor worktree 仅 Agents Window、`.cursor/worktrees.json`、`$ROOT_WORKTREE_PATH`、symlink 警告                                      | https://cursor.com/docs/configuration/worktrees                                                                   | Cursor                 | 未标注；Cursor 3 时代                                                | 2026-10-28 | A         |
| S10 | Agents Window 能力：multi-workspace、diffs view、parallel agents、handoff、worktrees；GA 2026-04-02                                  | https://cursor.com/docs/agent/agents-window                                                                       | Cursor                 | Cursor 3，2026-04-02                                                 | 2026-10-28 | A         |
| S11 | Agent Review、Quick/Deep、Source Control tab                                                                                         | https://cursor.com/docs/agent/agent-review                                                                        | Cursor                 | Cursor 3.11 起设置迁移                                               | 2026-10-28 | A         |
| S12 | Conductor 概念：workspace、分支、review、PR、archive                                                                                 | https://www.conductor.build/docs                                                                                  | Melty Labs             | 未标注                                                               | 2026-10-28 | A         |
| S13 | Project/Repository/Workspace/Branch/Working tree 模型；sidebar 以分支名标识                                                          | https://www.conductor.build/docs/concepts/workspaces-and-branches                                                 | Melty Labs             | 未标注                                                               | 2026-10-28 | A         |
| S14 | 一个 workspace 一个 shippable unit；Diff Viewer `Cmd+Shift+D`；Checks；PR `Cmd+Shift+P`；Archive/History                             | https://www.conductor.build/docs/concepts/workflow                                                                | Melty Labs             | 未标注                                                               | 2026-10-28 | A         |
| S15 | Diff Viewer：文件列表、unified、commit 过滤、行内评论、GitHub review comments                                                        | https://www.conductor.build/docs/reference/diff-viewer                                                            | Melty Labs             | 未标注                                                               | 2026-10-28 | A         |
| S16 | 首次 workspace 截图说明（project sidebar、chat、setup checklist）、Run/`CONDUCTOR_PORT`                                              | https://www.conductor.build/docs/first-workspace                                                                  | Melty Labs             | 未标注                                                               | 2026-10-28 | A/B       |
| S17 | Conductor 0.92.0（2026-10-23）、multiplayer、Cloud microVM                                                                           | https://www.conductor.build/                                                                                      | Melty Labs             | 0.92.0，2026-10-23                                                   | 2026-10-28 | A         |
| S18 | Sculptor 是并行 agent 桌面 app；workspace 概念；`Cmd+K`；终端                                                                        | https://github.com/imbue-ai/sculptor/blob/main/docs/help/README.md                                                | Imbue                  | main 分支；未标注                                                    | 2026-10-28 | A         |
| S19 | 顶部 `repo › branch → target`、workspace tabs、worktree/clone/in-place、分支清理策略                                                 | https://github.com/imbue-ai/sculptor/blob/main/docs/help/workspaces.md                                            | Imbue                  | main 分支；未标注                                                    | 2026-10-28 | A         |
| S20 | Files panel 三 tab、`Changes 2`、累计 diff、`Commit 2 changes`、逐文件 discard、无 discard all                                       | https://github.com/imbue-ai/sculptor/blob/main/docs/help/changes.md                                               | Imbue                  | main 分支；未标注                                                    | 2026-10-28 | A         |
| S21 | PR 创建与状态跟踪                                                                                                                    | https://github.com/imbue-ai/sculptor/blob/main/docs/help/pull_requests.md                                         | Imbue                  | main 分支；未标注                                                    | 2026-10-28 | A         |
| S22 | TUI 列表、preview/diff tab、快捷键 `n/N/D/↵/s/c/r`、tmux + worktree                                                                  | https://github.com/smtg-ai/claude-squad                                                                           | smtg-ai                | 未标注                                                               | 2026-10-28 | A         |
| S23 | Crystal 于 2026-02 弃用、Nimbalyst 取代、历史能力                                                                                    | https://github.com/stravu/crystal                                                                                 | Stravu                 | Deprecated 2026-02                                                   | 2026-10-28 | A         |
| S24 | Nimbalyst：kanban backlog→complete、inline AI diff approve/reject、iOS                                                               | https://stravu.com/crystal                                                                                        | Stravu                 | 未标注                                                               | 2026-10-28 | B         |
| S25 | Vibe Kanban sunsetting；workspace = branch + terminal + dev server；10+ agents；PR/merge                                             | https://github.com/BloopAI/vibe-kanban                                                                            | BloopAI                | 页面声明 sunsetting                                                  | 2026-10-28 | A         |
| S26 | Kanban 列（To do/In progress/In review/Done + Backlog/Cancelled）、卡片字段、空列 `+`、拖拽                                          | https://github.com/BloopAI/vibe-kanban/blob/main/docs/cloud/kanban-board.mdx                                      | BloopAI                | 未标注                                                               | 2026-10-28 | A         |
| S27 | 官方域名首页仅返回 “Terragon Shutdown”                                                                                               | https://www.terragonlabs.com/                                                                                     | Terragon               | 2026-10-28 抓取                                                      | 2026-10-28 | A（状态） |
| S28 | Multi-Agent、Sandbox Terminal、Task forking、Waiting for assistant to start、通知                                                    | https://docs.terragonlabs.com/docs/resources/release-notes                                                        | Terragon               | 2025-07-25 / 2025-10-14                                              | 2026-10-28 | B         |
| S29 | 云端 sandbox、自动 PR、跨设备、CLI handoff                                                                                           | https://terragon.devdocs.ai                                                                                       | 文档镜像（非官方主域） | 未标注                                                               | 2026-10-28 | C         |
| S30 | `uzi ls` 列 `AGENT/MODEL/STATUS/DIFF/ADDR/PROMPT`、checkpoint、auto、broadcast、tmux                                                 | https://github.com/devflowinc/uzi                                                                                 | devflowinc             | 未标注                                                               | 2026-10-28 | A         |
| S31 | worktree 存放 `~/.local/share/uzi/worktrees`、分支命名、`git worktree add -b`                                                        | https://mintlify.com/devflowinc/uzi/concepts/worktrees                                                            | Mintlify 镜像          | 未标注                                                               | 2026-10-28 | C         |
| S32 | VS Code Source Control Repositories 列出 worktree、Create Worktree、Open Worktree、`git.detectWorktrees`、`git.worktreeIncludeFiles` | https://code.visualstudio.com/docs/sourcecontrol/branches-worktrees                                               | Microsoft              | 未标注                                                               | 2026-10-28 | B         |
| S33 | Agent Sessions View：每 session 一个 worktree、卡片字段、Running/Waiting for input/done、Allow/Deny、过滤排序、三点菜单              | https://help.gitkraken.com/gitkraken-desktop/agents/                                                              | GitKraken              | Last updated: September 2026                                         | 2026-10-28 | A         |
| S34 | GitKraken Workspaces：Local/Cloud、多 repo 批量 fetch/pull、PR Insights                                                              | https://help.gitkraken.com/gitkraken-client/workspaces                                                            | GitKraken              | 2026-05-13                                                           | 2026-10-28 | B         |
| S35 | GitHub Desktop Worktree 下拉、Main/Linked 分组、目录名+分支名、新建/切换/重命名/删除                                                 | https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-worktrees-in-github-desktop                | GitHub                 | 未标注                                                               | 2026-10-28 | B         |
| S36 | Tower 侧栏 Worktrees、分支 `+` 徽标、创建/切换/移除；12.5 起支持（官方未标日期；2025-02 据 [S39]）                                   | https://git-tower.com/help/guides/worktrees/overview/mac                                                          | Tower                  | Tower 12.5                                                           | 2026-10-28 | B         |
| S37 | GitButler Branches 页：parallel branches/stacks、workspace target、Apply/Unapply、lane 拖拽                                          | https://github.com/gitbutlerapp/gitbutler-docs/blob/main/content/docs/features/branch-management/branch-lanes.mdx | GitButler              | main 分支；未标注                                                    | 2026-10-28 | A         |
| S38 | GitButler 概览：virtual branches、stacked branches、target branch、apply/unapply                                                     | https://docs.gitbutler.com/overview                                                                               | GitButler              | 未标注；`docs.gitbutler.com` 在本机 DNS 解析失败，正文经搜索索引摘录 | 2026-10-28 | B ⚠       |
| S39 | Fork 2.63（2026-02）加入 worktree；删除有未提交改动直接报错                                                                          | https://teebe.io/compare/git-worktree-gui-mac                                                                     | teebe（第三方）        | 2026-08-14                                                           | 2026-10-28 | C         |
| S40 | Sculptor 官网 `sculptor.sh` 无法解析                                                                                                 | https://sculptor.sh/                                                                                              | —                      | 2026-10-28 DNS 失败                                                  | 2026-10-28 | D ⚠       |
| S41 | Cursor Agents Window 有 “sidebar of running agents”、状态列表等描述                                                                  | https://learncursor.dev/learn/cursor-agents/agents-window                                                         | learncursor（第三方）  | 2026-06-24                                                           | 2026-10-28 | C         |

**页面可用性记录**

- `developers.openai.com/codex/app/features`、`.../environments/git-worktrees`：直连 **403 Forbidden**（hnd1 节点）；官方正文经搜索引擎索引可读，故标 B。
- `docs.gitbutler.com`：本机 DNS 解析到非公网地址，直连失败；用官方 GitHub 文档仓库镜像核对（A）。
- `sculptor.sh`：DNS `ENOTFOUND`；改用官方 GitHub `docs/help`（A）。
- `www.terragonlabs.com/`：仅返回标题 “Terragon Shutdown”；历史 UI 以 release notes 为准（A 状态 + A 历史功能）。
- `learn.chatgpt.com`：直连 `fetch failed`，未采用。

---

## 11. 开放问题

1. **“等待人”与“等待机器”是否要分色？** Claude 把 permission dialog 与 question 都归入 Needs input，但明确说 peek 回复不能回答 permission；Ultimate 若加 `awaiting`，需要决定是否再分 `awaiting-input` / `awaiting-permission`，否则用户会误操作。需要一次可用性测试，不是文档能回答的。
2. **worktree 的删除入口放在哪里？** 当前侧栏 `…` 只有 Workspace details / Review changes / Rename / Compact / Conclude；没有 release/discard。若加，必须同时定义“有未提交改动/未推送 commits”的确认文案与恢复路径（见 ADOPT-WV-009）。
3. **主 checkout 是否算一个 worktree？** Info 的 `all checkouts` 统计含 `total - removed`，但侧栏没有 main 节点；GitHub Desktop 明确分 Main/Linked。需要产品决策：main 是“第 0 个 checkout”还是“项目本身”。
4. **队列位置是否需要“总长”与“预计等待”？** `queued #2` 只给位置；总长可算，预计等待没有可靠数据（check 时长波动大），建议只显示总长，不显示 ETA（避免假精确）。
5. **landing 卡的 `Diverged` 文案规范**：现有 README 要求模型文本始终包含 `Diverged: …`，即使为 “None”；UI 是否也始终显示？空值显示 `None` 还是隐藏，会影响卡片高度与扫描。
6. **瞬态 step 的折叠策略**：`N steps` 在 queued/landing 时默认展开、结束后折叠；如果一次提交有 30 个 check，展开会撑高 transcript。需要定义“只展开当前 + 失败，其余折叠”的阈值。
7. **100+ worktree 的性能与可读性**：侧栏当前全量渲染；需要实测 200 行的滚动/选中成本，再决定是否虚拟化（ADAPT-WV-010）。未测量，本文不给数字。
8. **外部产品的版本漂移**：Claude agent view 是 research preview；Codex/Cursor 页面无发布日期；Vibe Kanban 已 sunsetting、Crystal 已弃用、Terragon 已停运。任何 2026-10-28 之后的重用都必须重新核验 URL 与产品状态。
9. **GitKraken Agent Sessions 与 Ultimate 的映射边界**：它的卡片字段（WIP、ahead/behind、PR pill、Allow/Deny）最接近，但它是“worktree 列表”，Ultimate 是“conversation 树 + worktree 附着”。是否把 agent 状态放在 conversation 行、把 git 状态放在 checkout 行，需要一次信息架构评审。
10. **是否记录“磁盘/端口”这类运维字段？** uzi 把 `ADDR` 放进表格，Conductor 用 `CONDUCTOR_PORT`；Ultimate Info 已有 disk 统计。端口/预览地址目前没有数据源，标为 NOTE，不进入本期 spec。
