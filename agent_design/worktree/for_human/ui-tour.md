# 界面导览：worktree 在界面上长什么样

Worktree 的难点不是"画一个状态"，而是让用户在任何位置都能回答五个问题：

1. 这个分支在哪？
2. 还有多少工作没落地？
3. 现在谁在合并？
4. 为什么失败？
5. 到底落地了什么？

Ultimate 的界面用五层信息架构来回答它们。

## 一、五层结构

```
① 项目身份        标题栏 / 侧栏头部：<project> #<conversationId>
② 侧栏            in-flight 分支行：标题 · 状态词 · 最新输入年龄
                  └─ N commits（可点开 branch diff） +N edits（可点开未提交 diff）
                  @lander 行：landing / fixing / diagnosing · queue N · last landed 年龄
                  Landed 区：按 feature 分组、按最新排序
③ Info 面板       Workspace 区：checkout 卡、lander 队列、统计与磁盘
④ transcript      workspace 工具卡（含 Steps）· lander 日志 · LandingCard · root note
⑤ review          点 commit 数 / edits / sha，打开对应 diff
```

层与层之间的关系是**从概览到证据**：侧栏告诉你"有事发生"，Info 告诉你"现在什么状态"，transcript 告诉你"过程"，review 告诉你"具体改了什么"。

## 二、逐层看

### ① 项目身份

标题栏和侧栏显示项目名。如果项目的根本身就是一个 worktree，会显示 `<project> #<conversationId>`，让你一眼知道"我不是在主检出里"。

状态行也遵循同一原则：显示 `#<id>` 而不是一长串 cwd，鼠标悬停才显示完整路径和分支。

### ② 侧栏

#### in-flight 分支行

一行只放四样东西：标题、feature、状态词、最新输入年龄。

下面还有一行**工作量**：

```
补登录页错误提示 · auth        working · 3m
12 commits ↗   +345 edits ↗
```

- `N commits` 是这个分支相对目标分支的未落地提交，点开是 branch diff；
- `+N edits` 是当前未提交的改动，点开是 uncommitted diff；
- 两者都是 0 时整行不显示——没有工作就不占位。

这一行的价值在于：**不需要点进任何页面，就知道这个分支欠了多少债。**

#### @lander 行

固定置顶，显示：

- 当前动作：`landing` / `fixing` / `diagnosing`；
- 队列长度 `queue N`；
- 上次落地的年龄。

它是"谁在合并"这个问题的唯一答案。没有它，用户只能去翻 lander 会话。

#### Landed 区

落地记录按 feature 分组、按最新排序；连续的几次落地可以合成一个 review range，点一下看整段差异。

### ③ Info 面板

Workspace 区包含三块：

| 块          | 内容                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| Checkout 卡 | path、branch、target、ahead、landed；复制路径/分支；手动刷新                |
| Lander 队列 | 最旧优先：会话、tip、当前步骤或目标                                         |
| 统计        | checkouts 数、状态分布、commits、未提交文件、磁盘占用（btrfs 支持真实占用） |

Info 面板是**只读**的：不提供 land / submit / discard 按钮。这些动作通过 agent 工具或明确的用户操作完成，不在一个信息面板里放危险按钮。

### ④ transcript

这是信息最密的一层，四种卡片：

**`workspace` 工具卡**：显示 action、`tip → target`、状态 chip、耗时。它不是普通工具输出，而是一张有结构的卡。

**submit 卡**：标题是 `submit · <tip> → <target>`，右上角状态 chip，卡内嵌一个可折叠的 `Steps` 列表。排队和落地中默认展开，结束后折叠。

`Steps` 有两个关键算法：

- `superseded`：`checking: X` 后面出现 `checked: X`，前者被取代，不再显示；
- `inProgress`：最后一个非 check 步骤，或并发组里还没有结果的步骤，标为进行中。

每步耗时 = 下一步的 `at` − 本步的 `at`；check 的耗时从对应的 `checking:` 算起。

**lander 日志**：按 submission 分组。`started` 行是分组头（分支 subject + `tip → target`），`queued` 行默认不单独显示，`fixing` / `diagnosing` 交给对应的 ask 行。

**LandingCard**：统一的结果卡，三种 tone——`landed`（绿）、`pushFailed`（黄，本地已落地但推送失败）、`failed`（红）。同一个组件用在 lander 日志、提交者报告和 root note 里。

root note 是根会话里的落地说明，复用同一张卡，可展开 "State at landing" 看当时的统计。

### ⑤ review

三种入口：

- `branch:<name>`——分支 diff；
- `uncommitted:<id>`——未提交 diff；
- `<base>...<sha>`——一段 commit range。

没有 review 扩展时，退化成纯文本或外部 diff 工具，而不是死链接。

## 三、状态词只有四组

界面不发明新词，全部来自一张统一字典：

| 域        | 词                                                                                        |
| --------- | ----------------------------------------------------------------------------------------- |
| checkout  | `Setting up…` / `Ready` / `Setup failed` / `Removed`                                      |
| 分支      | `landing` / `submitted` / `working` / `awaiting @ultimate` / `failed` / `idle` / `paused` |
| submit    | `queued #N` / `<当前步骤>` / `Landed <sha> · pushed` / `Not landed`                       |
| 落地 tone | `landed` / `push failed` / `not landed`                                                   |

同一个状态在任何地方用同一个词、同一个颜色 tone。这条规则看起来琐碎，却是界面可信度的基础：如果侧栏说"落地中"、卡片说"提交中"、日志说"merging"，用户就无法判断它们是不是同一件事。

## 四、刷新：事件驱动，不轮询

所有数据刷新都由事件触发：

- 侧栏工作量在 `coding-tools.committed`、worktree 索引变化、run 开始/结束时重取；
- 一次 `progress` 查询覆盖所有 in-flight 分支（≤100 个 id）；
- `stats` 只在状态串变化时重取；
- `disk` 缓存 60 秒。

唯一的本地计时器是运行中的 elapsed（1 秒）和年龄显示（60 秒），它们只改文字，不发请求。

## 五、空态、错误与可达性

- 没有 worktree：明确写"当前会话在共享检出中工作"，而不是留白；
- 队列为空：不渲染整个 section；
- Info 失败：一行 `role="alert"` 的错误，不阻塞其他区域；
- 非 GitHub 仓库：commit 数退化成纯文本，不显示无效链接；
- 所有图标按钮有 `aria-label`，当前会话有 `aria-current`，可点击行是 `<button>`；
- 颜色不是唯一信号：状态同时有文字和图标；
- 手机宽度下折叠、单列、不横向滚动。

## 六、常见误解

**"状态越细越好。"**
不是。状态词越多，用户越难比较。四组词覆盖了所有需要用户决策的状态，细节放在时间线和日志里。

**"实时就是每秒刷新。"**
不是。数据按事件刷新；只有计时器每秒动。

**"Info 面板应该能直接 land。"**
不应该。只读面板放危险按钮，误触成本太高。

## 七、想深入

- 五层信息架构与数据流：`../60-worktree-visualization-spec.md` §3
- 视图模型与字段来源：§4
- 状态机与统一状态字典：§5
- 组件 props 与交互契约：§6
- 布局与每个组件的细节：§7
- 算法（stateLabel、workOf、Steps、groupLandings）：§8
- 性能、可访问性、响应式：§9
