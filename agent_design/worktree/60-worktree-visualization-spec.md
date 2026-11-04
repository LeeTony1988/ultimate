# 60 · Ultimate Worktree 可视化实现与复刻 Spec

| 字段     | 值                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文档 ID  | AD-60                                                                                                                                                                                                   |
| 状态     | final                                                                                                                                                                                                   |
| 版本     | 1.0                                                                                                                                                                                                     |
| 证据基线 | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`）                                                                                                                                     |
| 前置依赖 | [`50-worktree-management-spec.md`](50-worktree-management-spec.md) §4、§6；[`40-subagent-visualization-desktop-spec.md`](../desktop-apps/40-subagent-visualization-desktop-spec.md) 的"时间 × 层级"原则 |
| 目标读者 | 要在 Web/桌面端复刻 Ultimate worktree 界面的 AI agent / 前端工程师                                                                                                                                      |
| 语言     | 中文叙述 + 英文标识符；组件名、字段名、action/event 名保持源码原名                                                                                                                                      |

> **复刻者 10 分钟摘要**
>
> 1. Worktree 可视化有 5 层：**项目身份**（标题栏/侧栏 `<project> #<id>`）→ **in-flight 分支行**（状态 + 工作量）→ **Info 面板**（队列/checkout/统计/磁盘）→ **transcript**（submit 工具卡 + lander 日志 + 落地卡）→ **review**（分支/未提交 diff）。
> 2. 所有数据来自 4 类源：`ultimate.workspaces` 文档、`workspaces.*` actions、`workspaces.landed`/`workspaces.check` 事件、`ultimate.lander`/`ultimate.lander-ask`/`workspaces.lander-report` entries + `workspace` 工具输出。
> 3. 主状态词表只有 4 组：checkout `Setting up… / Ready / Setup failed / Removed`；分支 `landing / submitted / working / awaiting @ultimate / failed / idle / paused`；submit `queued #N / <current step> / Landed <sha> · pushed / Not landed`；landing tone `landed / push failed / not landed`。
> 4. 侧栏的 in-flight 行永远显示"最新输入时间"和"该分支到目前为止的工作"：`N commits`（可点开 branch diff）+ `+N edits`（可点开 uncommitted diff）；两者都为 0 时整行不显示。
> 5. `workspace submit` 工具卡不是普通输出：标题是 `submit · <tip> → <target>`，右边是状态 chip；卡内嵌 `Steps` 折叠列表，queued/landing 时默认展开，结束后折叠。
> 6. `Steps` 的算法核心是 `superseded`（`checking: X` 被后面的 `checked: X` 取代）和 `inProgress`（最后一个非 check 步骤，或并发组里仍无结果的步骤）；耗时 = 下一步 `at` − 本步 `at`，check 的耗时从对应 `checking:` 算起。
> 7. Lander 日志按 submission 分组；`started` 行渲染为分组头（分支 subject + `<tip> → <target>` + open），`queued` 行默认不单独显示，`fixing/diagnosing` 交给 `ultimate.lander-ask` 行。
> 8. 落地卡 `LandingCard` 有 3 种 tone：`landed`（绿）/`pushFailed`（黄，已本地落地但 push 失败）/`failed`（红）；同一组件用于 lander 日志、提交者报告、root note。
> 9. 刷新是事件驱动的：侧栏工作量在 `coding-tools.committed`、worktree 索引变化、run 开始/结束时重取；不按定时器轮询。高频计时只有运行中 elapsed（1s）与年龄显示（60s），都不触发数据请求。
> 10. 空/错状态必须显式：无 worktree 显示"shown conversation works in the shared checkout"；队列为空不渲染 section；info 失败显示 `role="alert"` 的错误行；无 GitHub 仓库时 commit 数退化为纯文本。
> 11. 可访问性基线：所有图标按钮有 `aria-label`，当前会话 `aria-current="true"`，可点击行是 `<button>`，折叠用原生 `Collapsible`，颜色不是唯一信号（同时有文字/图标）。
> 12. 性能预算：一次 `progress` 查询覆盖所有 in-flight 分支（≤100 id）；`stats` 只在状态串变化时重取；`disk` 60s 缓存；单页 worktree 相关请求 ≤3 个/交互。

**路径缩写约定**（正文为可读性使用短名，证据索引可按此展开为仓库相对路径）：

| 短名                                                                                                                 | 完整路径                         |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `root.tsx` / `rows.tsx` / `work.ts` / `lander.tsx` / `landed.tsx` / `landings.ts` / `sidebar.tsx` / `primitives.tsx` | `extensions/sidebar/<name>`      |
| `panel.tsx` / `log.tsx` / `landing.tsx` / `steps.tsx` / `data.tsx` / `web.tsx` / `types.ts` / `refs.ts`              | `extensions/workspaces/<name>`   |
| `info/web.tsx`                                                                                                       | `extensions/info/web.tsx`        |
| `review/*`                                                                                                           | `extensions/review/*`            |
| `status-line/web.tsx`                                                                                                | `extensions/status-line/web.tsx` |
| `titlebar.tsx`                                                                                                       | `web/src/app/titlebar.tsx`       |

## 1. 目标与非目标

### 1.1 目标

1. 让用户在任何界面层级都能回答五个问题：**这个分支在哪？有多少未落地工作？现在谁在合并？为什么失败？落地了什么？**
2. 把 worktree 的复杂状态压缩成可扫描的短标签 + 可展开的细节，不牺牲可诊断性。
3. 让每个可见字段都有确定的数据源和刷新触发，UI 不猜测、不轮询。
4. 让"提交—排队—检查—落地—推送—失败诊断"在 transcript 里成为一条可读的时间线。
5. 同一套卡片在侧栏、Info、transcript、root note 复用，避免四套不一致的视觉语言。

### 1.2 非目标

- 不做 Git 图形化客户端（分支图、提交树、三方合并编辑器不在本文范围）。
- 不在 UI 直接执行 land/submit/discard；这些通过 agent 工具或明确的用户动作完成（`info` 面板只读）。
- 不复制 Ultimate 的完整设计系统；本文给语义 token 与尺寸，复刻者可映射到自己的 design system。
- 不做实时多人协作/权限管理。

### 1.3 需求清单

| ID         | 需求                                                                                                           | 验收      |
| ---------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| REQ-WV-001 | 标题栏与侧栏必须显示项目身份；当项目根是 worktree 时显示 `<project> #<conversationId>`                         | AC-WV-001 |
| REQ-WV-002 | In-flight 分支行必须显示标题、feature、状态词、最新输入年龄                                                    | AC-WV-002 |
| REQ-WV-003 | 分支状态词必须覆盖 landing/submitted/working/awaiting/failed/idle/paused，且有颜色 tone                        | AC-WV-003 |
| REQ-WV-004 | 分支行下方必须有工作量行：`N commits` + `+N edits`，各带 review spec；全为 0 不显示                            | AC-WV-004 |
| REQ-WV-005 | `@lander` 行必须固定置顶，显示 landing/fixing/diagnosing、queue N、last landed 年龄                            | AC-WV-005 |
| REQ-WV-006 | Landed 区必须按 feature 分组、按最新落地排序、连续落地可合成 review range                                      | AC-WV-006 |
| REQ-WV-007 | Info 面板必须有 Workspace section，meta 显示队列数或当前 checkout 状态                                         | AC-WV-007 |
| REQ-WV-008 | Checkout 卡必须显示 path/branch/target/ahead/landed，支持复制与手动刷新；增强版再显示 WIP/behind               | AC-WV-008 |
| REQ-WV-009 | Lander queue 必须按最旧优先显示 conversation、tip、当前步骤/目标                                               | AC-WV-009 |
| REQ-WV-010 | 统计必须显示 checkouts/state/commits/uncommitted/disk，disk 支持 btrfs real                                    | AC-WV-010 |
| REQ-WV-011 | `workspace` 工具卡必须显示 action、`tip → target`、状态 chip、耗时                                             | AC-WV-011 |
| REQ-WV-012 | submit 卡必须内嵌 Steps，queued/landing 默认展开，结束默认折叠，可手动切换                                     | AC-WV-012 |
| REQ-WV-013 | Steps 必须去掉被取代的 running 行、标记进行中、显示每步耗时与总耗时                                            | AC-WV-013 |
| REQ-WV-014 | Lander 日志必须按 submission 分组，显示分组头、步骤、检查结果、outcome                                         | AC-WV-014 |
| REQ-WV-015 | 落地卡必须有 landed/pushFailed/failed 三种 tone 与统一字段                                                     | AC-WV-015 |
| REQ-WV-016 | 根会话的 landing note 必须复用 LandingCard，并可展开 "State at landing"                                        | AC-WV-016 |
| REQ-WV-017 | 提交者必须收到 `workspaces.lander-report` 卡片，含 commits/paths/divergence                                    | AC-WV-017 |
| REQ-WV-018 | `branch:<name>`、`uncommitted:<id>`、`<base>...<sha>` 必须能打开 review；无 review 扩展时退化为纯文本/DiffsHub | AC-WV-018 |
| REQ-WV-019 | GitHub 仓库的 commit 数必须链接 compare range；非 GitHub 不显示链接                                            | AC-WV-019 |
| REQ-WV-020 | 所有 worktree 数据刷新必须事件驱动，不用定时轮询（elapsed/年龄显示除外，它们不触发数据请求）                   | AC-WV-020 |
| REQ-WV-021 | 每个组件必须显式处理 loading/empty/ready/busy/failed/removed 六态（可显式不渲染），不得落到 undefined/空白     | AC-WV-021 |
| REQ-WV-022 | 关键控件必须可键盘操作、有 aria-label/aria-current；颜色不是唯一信号                                           | AC-WV-022 |
| REQ-WV-023 | 手机宽度下侧栏/Info/卡片的布局必须可用（折叠、单列、不溢出）                                                   | AC-WV-023 |
| REQ-WV-024 | 一次 progress 查询覆盖全部 in-flight 分支；stats 只在状态变化时重取；disk 缓存 60s                             | AC-WV-024 |
| REQ-WV-025 | 复制的 path/branch 必须与记录一致，复制成功无额外弹窗                                                          | AC-WV-025 |
| REQ-WV-026 | 点击 conversation/entry 必须能跳转到对应会话与面包屑位置                                                       | AC-WV-026 |
| REQ-WV-027 | 状态行必须显示 `#<id>` 代替 cwd，tooltip 显示 path 与 branch                                                   | AC-WV-027 |
| REQ-WV-028 | 所有字段必须与 `50` §4 的 Worktree 契约同名同类型                                                              | AC-WV-028 |
| REQ-WV-029 | 必须有一张跨 workspace/submission/lander 三域的统一状态字典（词 + tone）                                       | AC-WV-029 |
| REQ-WV-030 | 队列必须显示位置；基线按整条 source 队列计数（含 landing），可选增强显示 queued-only 位置/总长                 | AC-WV-030 |
| REQ-WV-031 | 步骤状态必须固定为 pending/running/passed/failed/flaky/timeout 六态                                            | AC-WV-031 |
| REQ-WV-032 | LandingCard 必须提供复制 sha、打开 compare、跳到 lander 日志三个动作                                           | AC-WV-032 |
| REQ-WV-033 | 四类空态必须有明确文案：无 workspace、无 commits、无 queue、无 landed                                          | AC-WV-033 |
| REQ-WV-034 | `workspace.details/review/copyPath/copyBranch` 必须可从命令面板触发；深链可复制                                | AC-WV-034 |
| REQ-WV-035 | 侧栏必须支持 compact/comfortable 两档密度；>50 行启用虚拟滚动                                                  | AC-WV-035 |

## 2. 术语、不变量、边界

### 2.1 术语

| 术语           | 定义                                                                                                                                         | 数据源                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 项目身份       | 项目名 + 可选 `#<worktree conversation id>`                                                                                                  | `projectTitle/projectName`（`web/src/app/titlebar.tsx:24-58`） |
| in-flight 分支 | 未 conclude 且未在最新输入后落地的 branch                                                                                                    | `inFlight`（`sidebar/root.tsx:36-48`）                         |
| 工作量         | `{unlanded, uncommitted}`                                                                                                                    | `workspaces.progress` → `KeptWork`                             |
| 状态 chip      | submit 卡右上角的短状态                                                                                                                      | `useSubmission` + `StatusChip`（`log.tsx:442-494`）            |
| Steps          | 一次 submission 的步骤折叠列表                                                                                                               | `LanderStep[(`                                                 |
| 落地卡         | 统一的结果卡 `LandingCard`                                                                                                                   | `landing.tsx:186-265`                                          |
| 落地 note      | root 会话里的 `lineage.note`（source=lander）                                                                                                | `web.tsx:10-107`                                               |
| lander 行      | 侧栏固定的 `@lander` standing row                                                                                                            | `sidebar/lander.tsx`                                           |
| review spec    | `branch:<name>` / `uncommitted[:id(` / `<a>...<b>`                                                                                           | `review/refs.ts:5-11`                                          |
| tone           | 语义色：success/warning/error/brand/muted/failed，以及状态扩展 waiting（琥珀）/paused（琥珀）/quiet（低对比灰）；组件只引用 tone，不写死颜色 | 各组件                                                         |

### 2.2 不变量

| ID        | 不变量                                                              | 执行点                                  |
| --------- | ------------------------------------------------------------------- | --------------------------------------- |
| INV-WV-01 | 同一个状态在任何地方用同一个词与 tone                               | `stateLabel`、`StatusChip`、`headline`  |
| INV-WV-02 | 只显示有数据源的字段；没有数据就不渲染该行/该链接                   | 所有组件                                |
| INV-WV-03 | 状态色不是唯一信号：文字/图标必须同时存在                           | `StatusChip`、`StepLine`、`LandingCard` |
| INV-WV-04 | 运行中步骤每秒更新 elapsed，其它数据不按定时器刷新                  | `Elapsed`、`useFlightWork`              |
| INV-WV-05 | 折叠状态属于显示它的 entry，不跨 entry 共享                         | `Fold card={entry.id}`                  |
| INV-WV-06 | 同一 submission 的日志行只在 lander 会话出现一次，提交者只看摘要卡  | `LanderLogEntry`、`LanderReport`        |
| INV-WV-07 | 失败必须显示原因与可选的 output tail；不能只显示红色                | `OutcomeBody`、`OutputTail`             |
| INV-WV-08 | 列表排序稳定：队列最旧优先、landed 最新优先、in-flight 最新输入优先 | `LanderQueue`、`Landed`、`openBranches` |
| INV-WV-09 | 移动端不横向滚动；长路径/分支必须截断并提供 tooltip/copy            | `elidePath`、`truncate`                 |
| INV-WV-10 | 所有可点击元素是 button/link，有 focus ring                         | `rows.tsx`、`landing.tsx`               |
| INV-WV-11 | 空队列/空统计不占位；加载中显示 `measuring…`/`connecting…`          | `panel.tsx`、`info/web.tsx`             |
| INV-WV-12 | 字段名与 `50` 契约一致，不做前端重命名                              | 本文 §4                                 |

### 2.3 边界

1. **只读**：Info 面板的 Workspaces 区不提供 land/submit/discard 按钮；这些动作走 agent 工具。
2. **无全局 worktree 管理页**：入口分散在侧栏、Info、transcript、review；复刻时不要新增一个"Worktrees"顶级页面（除非作为可选扩展）。
3. **数据最终一致**：`progress` 可能短暂落后于 Git；以 `info` 的刷新结果和事件为准。
4. **不展示完整 diff**：卡片只显示 commit 数、路径、files 行数；完整 diff 交给 review surface。

## 3. 架构与数据流

### 3.1 五层信息架构

```
┌────────────────────────────────────────────────────────────────────┐
│ L0 项目身份：titlebar chip `<project> #42` / sidebar ProjectPath    │
├────────────────────────────────────────────────────────────────────┤
│ L1 侧栏 In flight：branch row（title/feature/state/age）            │
│                     work line（N commits · +N edits）               │
│                     subagent lines                                  │
│    @lander row：landing/fixing/diagnosing · queue N · last landed   │
│    Landed section：feature group · commit count · age               │
├────────────────────────────────────────────────────────────────────┤
│ L2 Info 面板 Workspace：lander queue / this checkout / all checkouts│
├────────────────────────────────────────────────────────────────────┤
│ L3 Transcript：workspace tool card（submit chip + steps）           │
│                lander log（分组的步骤/检查/outcome）                 │
│                lander report / landing note（LandingCard）          │
├────────────────────────────────────────────────────────────────────┤
│ L4 Review：branch diff / uncommitted diff / range diff               │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```mermaid
flowchart LR
  D[ultimate.workspaces doc( --> S[sidebar(
  D --> I[Info panel(
  D --> T[transcript cards(
  A[workspaces.* actions( --> S
  A --> I
  A --> T
  E[workspaces.landed/check events( --> L[lineage note / Landed(
  N[ultimate.lander entries( --> T
  R[workspaces.lander-report entry( --> T
  W[workspace tool output( --> T
  G[GitHub repo action( --> C[compare links(
```

### 3.3 刷新触发矩阵

| 界面                  | 读取                          | 何时重取                                                       |
| --------------------- | ----------------------------- | -------------------------------------------------------------- |
| 侧栏 in-flight 工作量 | `workspaces.progress {ids}`   | id 集合变化；`coding-tools.committed` 事件；任一分支 busy 变化 |
| 侧栏 lander 行        | `ultimate.workspaces` doc     | doc 变更（WebSocket store）                                    |
| 侧栏 Landed           | `lineage.recent` per root     | root tally tokens 变化（新 entry）                             |
| Info checkout 卡      | `workspaces.info {id}`        | 记录 state/landed 变化、conversation busy 变化、手动刷新       |
| Info 统计             | `workspaces.stats`            | 所有记录 `id:state:landed` 串变化；窗口 focus                  |
| Info 磁盘             | `workspaces.disk`             | 窗口 focus（服务端 60s 缓存）                                  |
| submit 卡             | `ultimate.workspaces` doc     | doc 变更；`useNow(1000)` 只驱动 elapsed                        |
| lander 日志           | transcript entries            | 新 entry                                                       |
| 根 landing note       | transcript + `lineage.recent` | 新 note/tally                                                  |
| status line           | `useWorkspaceConversations`   | conversations 更新                                             |

## 4. 数据契约（视图模型）

### 4.1 视图模型

```ts
type WorkspaceBadge = {
  state: 'preparing' | 'ready' | 'failed' | 'removed'
  label: 'Setting up…' | 'Ready' | 'Setup failed' | 'Removed'
  tone: 'brand' | 'success' | 'error' | 'muted'
  queued?: { state: 'queued' | 'landing'; step?: string }
}

type WorkLine = {
  commits?: { count: number; spec: `branch:${string}` }
  edits?: { count: number; spec: `uncommitted:${number}` }
}

type SubmissionView = {
  id: string
  conversationId?: number
  subject?: ConversationSubject
  tip: string
  target: string
  steps: LanderStep[(
  position?: number
  step?: string
  landing: boolean
  outcome?: LanderOutcome
}

type LandingView = {
  tone: 'landed' | 'pushFailed' | 'failed'
  headline: string
  subject?: ConversationSubject
  from: number
  sha?: string
  divergence?: string
  commits?: string[(
  paths?: string[(
  flaky?: string[(
  fixed?: string[(
  output?: string
  diagnosis?: string
  needsRestart?: boolean
}

type LandedData = {
  submission: string
  conversationId: number
  at: number
  sha: string
  base: string
  target: string
  lander: number
  divergence: string
  title: string
  summary?: string
  feature?: string
  commits: { sha: string; subject: string }[(
  commitCount: number
  paths: string[(
  pushed?: string
}
```

### 4.2 字段来源

| 字段                                             | 来源                                                               | 备注                     |
| ------------------------------------------------ | ------------------------------------------------------------------ | ------------------------ |
| checkout `state/path/branch/target/landed/error` | `Workspace` record                                                 | 根文档 `items[id(`       |
| `ahead/tip/sourceTip/currentBranch/sourceBranch` | `workspaces.info`                                                  | 实时 Git 读取            |
| `queue[(`                                        | 根文档                                                             | 最旧在前                 |
| `results[id(`                                    | 根文档                                                             | 最近 50                  |
| `unlanded/uncommitted`                           | `workspaces.progress` / `pending`                                  | `KeptWork`               |
| submit 卡 `id/lander/text`                       | `workspace submit` 工具输出                                        | `SubmitResult`           |
| submit 卡 `position`                             | 初始值取 `SubmitResult.position`；之后由 §8.14 从根文档 queue 重算 | 两者必须一致；文档是真相 |
| steps                                            | `QueueEntry.steps` 或 `results[id(.steps`                          | 同一数组                 |
| landing 卡字段                                   | `LanderOutcome` / `LandedData` / note data                         | 见 `50` §6.4             |
| GitHub 仓库                                      | `workspaces.github`                                                | 每次页面加载一次         |
| review 可用性                                    | `workspaces.review` point                                          | 由 review 扩展 provide   |

### 4.3 JSON 示例：submit 卡

```json
{
  "tool": "workspace",
  "args": { "action": "submit", "divergence": "None" },
  "output": {
    "text": "Submitted 9f1c2ab as 42-9f1c2ab-ldq3k2, position 2 in the main queue. The lander (conversation #7) reports back here when it lands or fails; keep working.",
    "id": "42-9f1c2ab-ldq3k2",
    "position": 2,
    "lander": 7
  },
  "doc": {
    "queue": [
      {
        "id": "42-9f1c2ab-ldq3k2",
        "conversationId": 42,
        "tip": "9f1c2ab3d4e5f60718293a4b5c6d7e8f90123456",
        "target": "main",
        "state": "landing",
        "step": "checking: pnpm check",
        "steps": [
          { "step": "queued", "at": 1761600000000 },
          { "step": "started", "at": 1761600001000 },
          { "step": "preparing", "at": 1761600001500 },
          { "step": "merging", "at": 1761600003000 },
          { "step": "setting up", "at": 1761600010000 },
          { "step": "checking: pnpm check", "at": 1761600020000 }
        (
      }
    (
  }
}
```

### 4.4 JSON 示例：landing report

> `data.outcome` 的类型是 `LanderResult`（`LanderOutcome` + `target/tip/lander/steps/conversationId/subject/at/divergence`），由 `50` §4.1 定义；`at` 是提交时的 entry id（面包屑），不是时间戳。

```json
{
  "kind": "workspaces.lander-report",
  "data": {
    "id": "42-9f1c2ab-ldq3k2",
    "outcome": {
      "outcome": "landed",
      "sha": "b7e2d1c0a9f8e7d6c5b4a39281706f5e4d3c2b1a",
      "base": "3f7b7bec2d4713c036d371870b0bea65a9acb8a2",
      "commits": ["9f1c2ab feat: add worktree panel"(,
      "paths": ["extensions/workspaces/panel.tsx"(,
      "flaky": [(,
      "pushed": "origin/main",
      "needsRestart": false,
      "target": "main",
      "tip": "9f1c2ab3d4e5f60718293a4b5c6d7e8f90123456",
      "lander": 7,
      "steps": [(,
      "conversationId": 42,
      "at": 12877,
      "divergence": "None",
      "subject": { "title": "Worktree panel", "feature": "workspaces" }
    }
  }
}
```

## 5. 状态机与状态词

### 5.1 Checkout 状态

| `Workspace.state` | 标签           | tone    | 出现位置  | 行为                             |
| ----------------- | -------------- | ------- | --------- | -------------------------------- |
| `preparing`       | `Setting up…`  | brand   | 侧栏/Info | 不可用；等待 prepare             |
| `ready`           | `Ready`        | success | 侧栏/Info | 正常                             |
| `failed`          | `Setup failed` | error   | 侧栏/Info | 显示 `error`；下一次工具调用重试 |
| `removed`         | `Removed`      | muted   | 侧栏/Info | 下一次请求重建                   |

### 5.2 分支状态词

| 条件                     | 标签                    | tone    | 依据          |
| ------------------------ | ----------------------- | ------- | ------------- |
| queue 中 `state=landing` | `landing`               | success | `root.tsx:62` |
| queue 中 `state=queued`  | `submitted`             | success | `:63`         |
| pause 停住 run           | `paused`                | paused  | `:65`         |
| run 中且有 phase         | phase.word 或 `working` | brand   | `:70-74`      |
| 等待用户回答             | `awaiting @ultimate`    | waiting | `:76`         |
| run 失败                 | `failed`                | failed  | `:77`         |
| 其它                     | `idle`                  | quiet   | `:78`         |

### 5.3 Submit 卡状态

> 统一文案函数：`headline()` 用于卡片正文（长版），`StatusChip` 用于右上角（短版）。两处必须调用同一个 `landed`/`reason` 判定，不得各写一套。

| 条件                             | chip（短）                     | tone    |
| -------------------------------- | ------------------------------ | ------- |
| 无 outcome 且 landing            | 旋转图标 + 当前 step + elapsed | brand   |
| 无 outcome 且 queued             | `queued #<position>/<total>`   | muted   |
| outcome failed                   | `Not landed`                   | error   |
| outcome landed 且 `commits` 为空 | `Nothing new`                  | muted   |
| outcome landed 且 `reason`       | `Landed <sha> · push failed`   | warning |
| outcome landed 且 pushed         | `Landed <sha> · pushed`        | success |
| outcome landed 未 pushed         | `Landed <sha>`                 | success |

`position` 的基线口径见 §8.14：整条 source 队列（含 landing）；`total` 可省略。

### 5.4 Landing tone

| 条件                                       | tone         | 左侧色条 | 图标          |
| ------------------------------------------ | ------------ | -------- | ------------- |
| `outcome=landed`，无 `reason`              | `landed`     | success  | Check         |
| `outcome=landed`，有 `reason`（push 失败） | `pushFailed` | warning  | TriangleAlert |
| `outcome=failed`                           | `failed`     | error    | X             |

### 5.5 组件六态

| 组件          | loading                     | empty                              | ready                | busy                            | failed              | removed     |
| ------------- | --------------------------- | ---------------------------------- | -------------------- | ------------------------------- | ------------------- | ----------- |
| ProjectPath   | 无 system → 空              | —                                  | 项目名               | —                               | —                   | —           |
| FlightRow     | —                           | 不渲染                             | 正常                 | 状态/phase/elapsed              | `failed`            | —           |
| Work line     | —                           | 不渲染                             | N commits / +N edits | —                               | —                   | —           |
| LanderRow     | —                           | —                                  | idle                 | landing/fixing/diagnosing/queue | failed              | —           |
| Checkout card | `info.loading` 时显示记录值 | 无 worktree 显示 "shared checkout" | 正常                 | queued/landing 标签             | 错误行 `role=alert` | `Removed`   |
| Lander queue  | —                           | 不渲染 section                     | 列表                 | 当前步骤高亮                    | —                   | —           |
| Stats         | 无 data → null              | 无记录时显示 0                     | 正常                 | `measuring…`                    | 错误行              | `N removed` |
| WorkspaceCall | 工具 running                | —                                  | action 标题          | 状态 chip + 动态 steps          | error 样式          | —           |
| Lander log    | —                           | —                                  | 步骤                 | 当前步骤 spin                   | 失败行 + output     | —           |
| LandingCard   | —                           | —                                  | 正常                 | —                               | 红色 tone           | —           |

> "—" 表示该组件**显式不渲染**该状态，不是遗漏；每个组件的代码里必须有对应分支或提前 return。REQ-WV-021 的六态要求按此解释。

### 5.6 步骤状态（增强，ADOPT-WV-005）

一次检查的步骤状态固定为六态，避免"running"与"passed"混用：

| 状态      | 显示                            | tone    | 数据                                                                       |
| --------- | ------------------------------- | ------- | -------------------------------------------------------------------------- |
| `pending` | 灰点 + 命令                     | muted   | 尚未开始                                                                   |
| `running` | 旋转图标 + 命令 + elapsed       | brand   | 有 `checking:`/`rerunning:` 行且无对应 `check`                             |
| `passed`  | 绿勾 + 命令 + summary           | success | `check.result=passed`                                                      |
| `failed`  | 红叉 + `· failed` + output tail | error   | `check.result=failed`                                                      |
| `flaky`   | 黄三角 + `· flaky`              | warning | `check.result=flaky`                                                       |
| `timeout` | 黄三角 + `· timeout` + tail     | warning | `workspaces.check` event 的 `timeout`，或 `LanderOutcome` 的 watchdog 文本 |

> **注意**：`LanderStep`/`LanderCheck` 本身没有 `timeout` 字段（见 `50` §4.1）。`timeout` 是 UI 从 `workspaces.check {result:'timeout'}` 事件或 `output` 中的 `Timed out`/`Stalled` 文本**派生**的状态；没有事件且文本不匹配时按 `failed` 显示。不要给 `LanderCheck.result` 增加 `timeout` 值。

### 5.7 统一状态字典（增强，ADOPT-WV-001）

三域状态词收敛为一张表，组件只能引用，不得各自新造：

| 域         | 状态                                                              | 词                           | tone    |
| ---------- | ----------------------------------------------------------------- | ---------------------------- | ------- |
| workspace  | preparing                                                         | `Setting up…`                | brand   |
| workspace  | ready                                                             | `Ready`                      | success |
| workspace  | failed                                                            | `Setup failed`               | error   |
| workspace  | removed                                                           | `Removed`                    | muted   |
| submission | queued                                                            | `queued #N / M`              | muted   |
| submission | landing                                                           | 当前 step 或 `landing`       | brand   |
| submission | landed                                                            | `Landed <sha>`               | success |
| submission | pushFailed                                                        | `Landed <sha> · push failed` | warning |
| submission | failed                                                            | `Not landed`                 | error   |
| branch     | landing / submitted / working / awaiting / failed / idle / paused | 见 §5.2                      | 见 §5.2 |

## 6. 接口契约（UI 侧）

### 6.0 前端运行时契约

复刻不依赖 Ultimate 的 SDK，但需要等价的 hooks/actions。最小接口如下：

```ts
type ConversationSummary = {
  id: number
  title?: string
  busy?: boolean
  inputAt?: number
  answerAt?: number
}

type WorkspaceConversation = ConversationSummary & { workspace?: Workspace }

type KeptWork = {
  id: number
  uncommitted: number
  unlanded: number
  reason?: string
  busy?: string
  descendant?: number
}

// 文档订阅：返回根文档，变化时触发重渲染
function useWorkspaceIndex(): WorkspaceIndex
function useWorkspaces(): Record<string, Workspace>
function useLanderQueue(): QueueEntry[(
function useWorkspaceConversations(): WorkspaceConversation[(

// action 调用：返回 {data?, loading, error?, refetch}
function useAction<I, O>(ref: ActionRef<I, O>, input?: I, options?: {
  enabled?: boolean
  onError?: (error: Error) => void
}): { data?: O; loading: boolean; error?: Error; refetch(): Promise<void> }

function useEvents<E>(query: { events: EventToken<E>[(; limit: number }): { id: number; data: E }[( | undefined
function useTranscript(): EntryRecord[(
function useNow(intervalMs: number): number
function useConversation(): ConversationSummary
function useConversation<T>(select: (c: ConversationSummary) => T): T | undefined   // 重载，不是两个独立 hook
function useSubmission(id: string | undefined): SubmissionView | undefined
```

- `useAction` 在 `input` 变化时自动重取；`refetch` 手动重取；失败不得抛到渲染树（用 `onError`/`error` 展示）。
- `api.action(ref, input)` 是命令式一次性调用，返回 Promise；`useAction` 是它的响应式包装。不要在 render 里直接 `api.action`。
- `useNow(1000)` 只用于运行中 elapsed；`useNow(60_000)` 只用于 `formatAgo` 年龄。两者都不触发数据请求。
- 文档订阅必须按 `doc.kind` 精确失效；**没有订阅机制时用事件钩子 + 显式 `refetch`，不得用定时轮询替代**（REQ-WV-020）。

### 6.1 读取 hooks / actions

> 下表列的是**数据源**。响应式组件用 §6.0 的 `useAction` 包装；命令式动作（按钮点击）才用 `api.action`。

| API                                 | 用途                           | 返回值                      |
| ----------------------------------- | ------------------------------ | --------------------------- |
| `useWorkspaceIndex()`               | 整个根文档                     | `WorkspaceIndex`            |
| `useWorkspaces()`                   | `index.items`                  | `Record<string, Workspace>` |
| `useLanderQueue()`                  | `index.queue`                  | `QueueEntry[(`              |
| `useWorkspaceConversations()`       | conversations + workspace 合并 | `WorkspaceConversation[(`   |
| `api.action(InfoAction, {id})`      | checkout 实时信息              | `WorkspaceInfo \| null`     |
| `api.action(ProgressAction, {ids})` | 侧栏工作量                     | `KeptWork[(`                |
| `api.action(PendingAction, {ids})`  | 结论前警告                     | `KeptWork[(`                |
| `api.action(StatsAction)`           | 统计                           | `WorkspaceStats`            |
| `api.action(DiskAction)`            | 磁盘                           | `WorkspaceDisk`             |
| `api.action(IsolationAction)`       | 能否隔离                       | `{reason?, empty?}`         |
| `api.action(GithubAction)`          | compare 链接根                 | `string \| null`            |

### 6.2 组件 props（复刻契约）

```ts
type LandingCardProps = {
  card: number                 // entry id，用于折叠持久化
  tone: 'landed' | 'pushFailed' | 'failed'
  headline: ReactNode          // "Landed <sha> on <target> · pushed to origin/main"
  subject?: ConversationSubject
  from: number                 // submitting conversation
  sha?: string
  at?: ReactNode               // 右侧时间
  divergence?: string
  sourceEntry?: number         // breadcrumb entry
  children?: ReactNode         // commits/paths/flaky/output/steps
}

type StepsProps = {
  steps: readonly LanderStep[(
  lander: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
  running?: boolean            // submission landing
  ended?: 'landed' | 'failed'
}
```

### 6.3 交互契约

`workspaces.review` 是一个 UI 扩展点，签名固定为：

```ts
type ReviewPoint = {
  provide(fn: (spec: string) => (() => void) | undefined): void
}
// 无 provider 时，所有 review 入口必须退化为纯文本或 DiffsHub 外链。
```

| 交互                  | 触发                  | 结果                                              | 依据                              |
| --------------------- | --------------------- | ------------------------------------------------- | --------------------------------- |
| 打开分支              | 点击 FlightRow        | `switchConversation(id)`                          | `root.tsx:184`                    |
| 打开 commit range     | 点击 `N commits`      | 若 review 可用 → 打开 `branch:<name>`；否则纯文本 | `landing.tsx:96-135`              |
| 打开未提交 diff       | 点击 `+N edits`       | review `uncommitted:<id>`                         | `work.ts:23-25`                   |
| 打开 lander           | 点击 `@lander` 行     | `switchConversation(landerId)`                    | `sidebar.tsx:297-301`             |
| 打开提交者            | 点击 `open #42/12877` | 切到 #42 并滚到 entry 12877                       | `landing.tsx:18-49`               |
| 复制 path/branch      | 点击 Copyable         | `navigator.clipboard.writeText`                   | `panel.tsx:134-147`               |
| 刷新 checkout         | 点击 Refresh 图标     | `info.refetch()`，图标旋转                        | `panel.tsx:88-96`                 |
| 折叠 steps            | 点击 "N steps"        | 展开/折叠，状态存在 card                          | `log.tsx:300-325`                 |
| 展开 output           | 点击 "Output"         | 显示完整 tail                                     | `log.tsx:109-121`                 |
| 展开 State at landing | 点击折叠头            | 显示冻结的 abstract                               | `web.tsx:90-103`                  |
| 查看完整日志          | 点击 "full log in #7" | 切到 lander 会话                                  | `log.tsx:316-322`                 |
| 结论分支              | `…` → Conclude        | 先 `pending`，有工作弹确认框                      | `sidebar.tsx:235-251`、`:460-518` |

### 6.4 文案表

| 场景               | 文案                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 无 worktree        | `shown conversation works in the shared checkout`                                                                       |
| 队列空             | 不渲染                                                                                                                  |
| 统计空             | `none`                                                                                                                  |
| 磁盘测量中         | `measuring…`                                                                                                            |
| 磁盘失败           | `unknown`                                                                                                               |
| 检查进行中         | `checking: <command>`                                                                                                   |
| 检查重跑           | `rerunning: <command>`                                                                                                  |
| 检查通过           | `<command>`（绿勾）                                                                                                     |
| flaky              | `<command> · flaky`（黄三角）                                                                                           |
| 失败               | `<command> · failed`（红叉）                                                                                            |
| 提交排队           | `queued #<n>`                                                                                                           |
| 落地成功           | `Landed <sha> on <target> · pushed to <remote>/<target>`                                                                |
| 已落地但 push 失败 | `Landed <sha> on <target> · Push failed: <reason>`                                                                      |
| 失败               | `Not landed: <reason>`                                                                                                  |
| 无新提交           | `Nothing new to land on <target>`                                                                                       |
| 需重启             | `Needs restart.`                                                                                                        |
| 诊断               | `Diagnosis by lander`                                                                                                   |
| 修复               | `fixed by lander`                                                                                                       |
| 分歧               | `Diverged` + 文本                                                                                                       |
| 结论警告           | `#<id> has <n> uncommitted files and <n> unlanded commits. Its checkout is kept until that work lands or is discarded.` |

## 7. 布局与组件

### 7.1 标题栏与项目身份

**标题栏**（`web/src/app/titlebar.tsx:24-58`）：

- 项目根匹配 `/.ultimate/projects/<name>-<hash8>/worktrees/<id>` 时，chip 显示 `<name> #<id>`；否则显示项目名。
- Ultimate 自己的 checkout 不显示名字（wordmark 已经说明），只显示 `#<id>`（如果是 worktree）。
- 侧栏 `ProjectPath` 同样显示 `<project> #<id>`，hover title 是完整 `system.project.root`。

```
┌──────────────────────────────────────────────┐
│ ULTIMATE            ultimate #42      ⌘K      │
└──────────────────────────────────────────────┘
```

### 7.2 侧栏 In-flight 行

尺寸（桌面）：

- 行高：有状态/phase 时 58px；仅有 metadata 时 44px；极简 28px（`rows.tsx:183-189`）。
- 左边距 8px，右边距 8px；内部左 padding 10px；圆角 6px。
- 标题 12–13px；meta 10px mono；状态 10px mono；年龄右对齐 10px。
- 状态点 6px；working 时 `animate-pulse-dot`。

```
┌────────────────────────────────────────────┐
│ ● Worktree panel                  workspaces │
│   landing · 2m                                │
│   3 commits   + 4 edits                       │
│   ↳ worker #43 · ready                        │
└────────────────────────────────────────────┘
```

组件树：

```
FlightRow
├─ button (aria-current, title)
│  ├─ status dot
│  ├─ title (truncate)
│  ├─ FeatureTag?
│  ├─ state label (tone)
│  └─ age (formatAgo)
├─ WorkLine (data-flight-work)
│  ├─ CommitCount (range=branch:<name>)
│  └─ Edits (spec=uncommitted:<id>)
└─ children (subagent lines)
```

证据：`root.tsx:126-250`、`work.ts:9-28`、`rows.tsx:182-268`。

### 7.3 @lander 行与 Landed 区

- `@lander` 行固定在 standing agents 组，排在其它 standing agent 之前（`sidebar.tsx:172-179`）。
- 状态词：`fixing` / `diagnosing` / `landing` / phase / `working` / `idle` / `failed`。
- 队列数：`queue N`；最后落地年龄：`formatAgo(last.steps.at(-1).at)`。
- 行高 44px；名字 `lander` + `@lander`；presence 点。
- Landed 区：每 feature 一组，`×N` 表示多次落地，commit 数求和；连续落地可生成 `oldest.base...newest.sha` range；首屏 5 组，`More` 展开。

```
@lander  @lander
  fixing · queue 2                         3m

Landed
  [workspaces( Worktree panel   12 commits  2h
  [auth( Login fix               3 commits  1d
```

证据：`sidebar/lander.tsx:12-70`、`sidebar/landed.tsx:54-134`、`landings.ts:9-31`。

**可选增强（ADAPT-WV-003）**：在 `In flight` 上方增加一个不可点击的 `main checkout` 节点，显示 source 的当前分支与 `shared` 标记（数据来自 `info.sourceBranch` 或 `system.code.branch`）。它只做"主 checkout 也是工作区"的提示，不参与 in-flight 计数；若行数预算紧张，可省略。

### 7.4 Info 面板 Workspace 区

Section 顺序：`Workspace → Model → Code → Execution → Machine → Process → Persistence → Skills → Context files`（`info/web.tsx:444-459`）。

```
Workspace                        2 landing
┌ lander queue ─────────────────────────────┐
│ #42  9f1c2ab  landing · checking: pnpm…   │
│ #43  a1b2c3d  queued for main             │
└───────────────────────────────────────────┘
this checkout                    · landing…
  path      …/worktrees/42        ⧉
  branch    ultimate/1a2b3c-42    ⧉
  target    main in D:\repo
  ahead     3 commits
  landed    9f1c2ab
all checkouts
  checkouts 5 · 1 removed
  state     4 ready · 1 setting up
  commits   2 landed · 1 ahead · 1 none yet
  uncommitted 1
  disk      1.2 GB · 800 MB real
```

- `Workspace` section meta：有队列 → `N landing`；否则当前 checkout 的状态小写（`ready`/`setting up…`/`setup failed`/`removed`/`shared checkout`）。
- 队列最多展示全部（通常很短），每行 `ConversationRef + tip 7 + 当前 step/`queued for <target>`。
- **增强（ADOPT-WV-004）**：排队项显示 `queued #<position>/<total>`；基线 position 按整条 source 队列计算（含 landing），总长也是整条队列。若产品只想数 queued，必须在同一界面标 `queued-only`，不能与基线混用。不显示"预计等待"，因为没有可靠的耗时模型。
- Checkout 卡：`path` 用 `shortenPath + elidePath(34)`，branch 完整，target 带 `in <source>`，ahead 只在数值可用时显示，landed 只显示 7 位。
- **增强（ADOPT-WV-002 / ADAPT-WV-007）**：在 `ahead` 下增加 `WIP` 行（该 checkout 的未提交文件数，数据来自 `workspaces.progress {ids:[id(}`，不新增后端字段）；`behind` 只有数据面提供时才显示，否则整行省略。卡片底部增加两个按钮：`Review changes`（`branch:<name>`）和 `Review edits`（`uncommitted:<id>`），与侧栏入口一致。
- 刷新按钮只刷新 `info`；统计在记录串变化时刷新，磁盘在窗口 focus 时刷新。
- 所有错误用 `role="alert"`，等宽 11px，红色。

证据：`panel.tsx:25-268`、`info/web.tsx:426-432`。

### 7.5 `workspace` 工具卡

```
┌ workspace  submit · 9f1c2ab → main      Landed b7e2d1c · pushed ┐
│ [feature( Worktree panel #42                                    │
│ 6 steps                                                     ⌄   │
│  ✓ queued                                          09:12:01     │
│  ✓ started                                         09:12:02     │
│  ✓ preparing                                       09:12:03     │
│  ✓ merging                                         09:12:05     │
│  ✓ setting up                                      09:12:12     │
│  ✓ checking: pnpm check                            09:12:31 19s │
│  full log in #7                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- 标题：有 submission → `<action> · <tip7> → <target>`；否则只显示 action。
- 右上 meta：有 state → StatusChip；否则工具耗时。
- 卡内：`Subject`（若 state 有 subject）+ `Steps`；`ToolContent` 里若有 outcome 再加 `OutcomeBody`，最后是原始 `ToolOutput`。
- 两个折叠是独立的：外层 `Tool` 的 `defaultOpen` 仅当工具 error；内层 `Steps` 的 `open` 默认 = `!state.outcome`（queued/landing 展开，结束折叠），用户一旦手动切换就以用户的值为准。

证据：`log.tsx:496-554`。

### 7.6 Lander 日志

分组规则（`log.tsx:328-412`）：

1. `queued` entry **不作为独立日志行渲染**；它只在 `started` 分组头下方作为历史行出现一次，避免与分组头重复。
2. `started` 行渲染为分组头：`GitMergeIcon` + `Subject` + `<tip7> → <target>` + `Open`；下方先显示 `queued` 历史行，再显示 `started` 行。
3. 普通 step 行：图标 + 文本 + 耗时 + 时间；运行中旋转并显示 elapsed。
4. check 行：通过绿勾；flaky 黄三角 + `· flaky`；失败红叉 + `· failed`；摘要灰字。
5. `fixing`/`diagnosing` 行不渲染（由 `LanderAskEntry` 显示）。
6. outcome 行渲染 `LandingCard`，带 OutcomeBody。
7. 失败的 step 行后若有 `output`，显示折叠的 `OutputTail`。

```
── [workspaces( Worktree panel  #42  9f1c2ab → main   open #42
   ✓ queued
   ✓ started
   ✓ preparing                                      09:12:03
   ✓ merging                                        09:12:05
   ✓ setting up                                     09:12:12
   ✓ checking: pnpm check                19s        09:12:31
   [Landed b7e2d1c on main · pushed to origin/main(
```

### 7.7 LandingCard 与 root note

- 折叠态（`Fold`）：一行 `[icon( <tone label> [feature( <title> #42 · <sha7>`。
- 展开态：header（Subject + open breadcrumb + summary），body（headline + at + Diverged + children）。
- children 顺序：commits（最多 10 条）→ fixed by lander → flaky → Needs restart → hint → diagnosis → output tail → steps（report 卡）。
- tone 左侧 2px 边框；背景 `muted/20`；字体 mono 12px；header 下方分隔线。
- root note 额外有 `State at landing` 折叠：显示冻结的 `abstract.text` 与 `#<from>/<at>` 面包屑。
- **增强（ADOPT-WV-006）**：header 右侧固定三个动作：`copy sha`（复制完整 sha，图标按钮）、`compare ↗`（有 GitHub 仓库时打开 `base...sha`）、`log`（切到 `outcome.lander` 会话）。`Diverged` 字段即使为 `None` 也显示，不隐藏；`commits` 为空时显示 `Nothing new to land`。

```
┌ ✓ landed  [workspaces( Worktree panel  #42 · b7e2d1c ┐
│ Worktree panel                              open #42/12877 │
│ Landed b7e2d1c on main · pushed to origin/main  3 commits │
│ Diverged  None                                             │
│ 9f1c2ab feat: add worktree panel                           │
│ Changed: extensions/workspaces/panel.tsx                   │
│ ▸ State at landing · #42/12877                             │
└────────────────────────────────────────────────────────────┘
```

证据：`landing.tsx:174-265`、`web.tsx:58-107`、`log.tsx:126-152`。

### 7.8 Review 集成

| spec               | 语义                                         | 入口                                   |
| ------------------ | -------------------------------------------- | -------------------------------------- |
| `branch:<name>`    | 分支 vs 它要落地的目标分支                   | 侧栏 `N commits`、`…` → Review changes |
| `uncommitted`      | 当前项目 checkout 的工作区 vs HEAD           | review 范围选择器                      |
| `uncommitted:<id>` | conversation `id` 的 worktree 工作区 vs HEAD | 侧栏 `+N edits`                        |
| `<a>...<b>`        | `b` 相对分叉点 `a` 的 diff                   | landing 卡 commit 数、Landed 组        |

- 若 `workspaces.review` point 没有 provider，`CommitCount` 退化为纯文本或 DiffsHub 外链。
- `branch:` 只在 live worktree 上提供（`review/server.ts:79-82`）；已移除的分支不在范围选择器里。
- review 打开时使用 `switchConversation` 到默认 recipient（分支 owner / landing submitter / commit trailer / primary agent）。

证据：`review/refs.ts:5-11`、`review/server.ts:24-130`、`landing.tsx:70-135`。

### 7.9 Status line 与 titlebar

- Status line 的 `Cwd`：若当前 conversation 有 workspace → 显示 `#<id>`；tooltip 显示完整 `path` 与 `branch`。
- 非 workspace 且在 Ultimate 仓库 → 显示 `branch (dirty*)`；其它显示缩短 cwd。
- Titlebar 的 `projectName`：worktree 时 `<project> #<id>`，Ultimate 自己只显示 `#<id>`。

证据：`status-line/web.tsx:51-85`、`titlebar.tsx:24-58`。

### 7.10 结论确认框

- 触发：`…` → Conclude 且 workspaces 扩展启用。
- 先调 `workspaces.pending {ids:[id(}`；有工作 → 弹 `Conclude #<id>?`。
- 文案列出每个 item 的 `uncommitted` 文件数与 `unlanded` commit 数；子 agent 标注 `, a subagent,`。
- 明确说明"checkout 会保留到工作落地或被丢弃"。
- 检查失败 → `Couldn't check #<id>'s checkout: <failure>. Conclude anyway?`
- 按钮：Cancel / Conclude；进行中显示 `Concluding…`，错误显示在框内。

证据：`sidebar.tsx:217-251`、`:460-518`。

### 7.11 空态与危险动作（增强，ADOPT-WV-008/009）

四类空态（必须区分，不能都用一句 "none"）：

| 场景                | 文案                                                | 下一步            |
| ------------------- | --------------------------------------------------- | ----------------- |
| 当前会话无 worktree | `shown conversation works in the shared checkout`   | 打开分支/了解隔离 |
| 分支尚无提交        | `No commits yet`（work 行不显示 0）                 | 继续工作          |
| lander 队列为空     | 不渲染整段（不是 "no submissions"）                 | —                 |
| 无 landing          | `Nothing landed yet`（Landed section 不渲染空标题） | —                 |

危险动作（如果复刻版提供删除/重建入口）：当 `uncommitted > 0` 或 `ahead > 0` 时，必须二次确认，文案列出将丢失的 commits/paths，并提供 `Review changes` 链接。Ultimate 当前没有删除入口；本文把该规则写进 spec，避免复刻者新增入口时绕过"不丢工作"不变量。

### 7.12 命令与深链（增强，ADOPT-WV-011/012）

注册四个命令，均可从 ⌘K 触发，参数是当前选中/悬停的 worktree：

| 命令 ID                | 行为                                 |
| ---------------------- | ------------------------------------ |
| `workspace.details`    | 切到该 conversation 并打开 Info 面板 |
| `workspace.review`     | 打开 `branch:<name>` review          |
| `workspace.copyPath`   | 复制记录里的 `path`                  |
| `workspace.copyBranch` | 复制记录里的 `branch`                |

深链格式固定为 `#<conversationId>/<entryId>`：landing 卡、lander 日志的 `Open`、侧栏 Landed 行都复用同一个格式；复制按钮的文案与 `Open` 的 title 一致。

## 8. 算法与伪代码

### 8.1 `stateLabel`

```
stateLabel(w):
  switch w.state:
    preparing → 'Setting up…'
    ready     → 'Ready'
    failed    → 'Setup failed'
    removed   → 'Removed'
```

### 8.2 `workOf(id, branch, progress)`

```
if !progress or !branch: return undefined
work = {}
if progress.unlanded > 0: work.commits = {count: progress.unlanded, spec: `branch:${branch}`}
if progress.uncommitted > 0: work.edits = {count: progress.uncommitted, spec: `uncommitted:${id}`}
return (work.commits or work.edits) ? work : undefined
```

### 8.3 `inFlight(conversation, index)`

```
if conversation.busy: return true
if index.queue.some(q => q.conversationId == conversation.id): return true
times = results where result.conversationId==id and outcome=='landed'
        .map(result => result.steps.at(-1)?.at)
        .filter(t => typeof t == 'number')
landed = times.length ? Math.max(...times) : undefined
return landed == undefined or (conversation.inputAt ?? 0) > landed
```

> 只用 `steps.at(-1).at` 的时间戳；`result.at` 是 entry id，不能当时间用（NOTE-WM-01）。`steps: [(` 的旧结果不参与比较，不能把 `undefined` 传给 `Math.max`。

### 8.4 `landedAt(index, id)`

```
times = [(
for result of Object.values(index.results):
  if result.conversationId == id and result.outcome == 'landed':
    t = result.steps.at(-1)?.at
    if typeof t == 'number': times.push(t)
return times.length ? Math.max(...times) : undefined
```

> 源码当前用 `result.at` 兜底，但它是 entry id，不是时间戳；复刻时按本伪代码修正，见 `50` §12 `NOTE-WM-01`。

### 8.5 `superseded(row, later)`

```
m = /^(?:checking|rerunning): (.*)$/s.exec(row.step)
if !m: return false
command = m[1(
return later.some(next => next.check?.command === command)
```

用途：`checking: pnpm check` 在 `checked: pnpm check` 出现后隐藏；`rerunning: pnpm check` 同理。

### 8.6 `inProgress(row, later)`

```
if row.check: return false
m = /^(?:checking|rerunning): (.*)$/s.test(row.step)
if !m: return later.length == 0
// 并发组：如果后面的行全是 check 或 running，则仍在跑
return later.every(next => next.check !== undefined or /^(?:checking|rerunning): /.test(next.step))
```

### 8.7 `Steps` 的行过滤与耗时

```
rows = steps.filter((row, index) => !superseded(row, steps.slice(index + 1)))
took(row, filteredIndex):
  if row.check:
    command = row.check.command
    previous = steps.filter(o => o.check?.command == command && o.at < row.at).at(-1)?.at ?? -Infinity
    start = steps.findLast(o => o.at <= row.at && o.at > previous && runningStep(o.step)?.[1( == command)
    return start ? row.at - start.at : undefined
  next = rows[filteredIndex + 1(     // 注意：用过滤后的下标，不能用原始 steps 下标
  return next and !next.check ? next.at - row.at : undefined
```

> 反例：若写成 `next = rows[originalIndex + 1(`，过滤掉 `checking:` 行后会跳到错误的下一步，耗时和进行中状态都会错位。`Steps` 渲染时必须把过滤后数组的下标传给 `took`。

- 运行中行：`<Elapsed since={row.at}>`，每秒 tick。
- 非运行中：只有 `took >= 1000ms` 才显示 `formatDuration`。
- `ended='failed'` 时最后一个非 check 行标记失败；`ended='landed'` 时最后一个非 check 行视为 done。

### 8.8 `StatusChip`

````
if !outcome:
  if landing: spinner + (step ?? 'landing') + elapsed(steps.at(-1).at)
  else: `queued #${position}`
else if outcome.failed: 'Not landed' (error)
else:
  landed = outcome.commits?.length ? `Landed ${sha7}` : 'Nothing new'
  if outcome.reason: `${landed} · push failed` (warning)
  return `${landed}${outcome.pushed ? ' · pushed' : ''}` (success)```

### 8.9 `headline(outcome, target)`

````

if outcome.failed: `Not landed: ${reason ?? 'failed'}`
on = target ? ` on ${target}` : ''
landed = commits?.length ? `Landed ${sha7}` : `Nothing new to land`
if pushed: `${landed}${on} · pushed to ${pushed}`
else if reason: `${landed}${on} · ${reason}` // reason 由 lander 写成 `Push failed: <detail>`，不是裸错误
else: `${landed}${on} · not pushed`

```

`StatusChip` 的短版只取 `Landed <sha>` + (`· pushed` / `· push failed`)，与长版共用 `outcome.outcome`、`commits.length`、`pushed`、`reason` 四个判定；不允许在组件内重新解释 `reason` 文本。

### 8.10 `steps` 的 took / active（summary）

- 步骤运行到下一步开始；若下一步是 check 结果，则不计（check 自己的耗时另行计算）。
- 检查耗时从同 command 的 `checking:` / `rerunning:` 行起算。
- `StepLine` 的 `done` = 有后续行且不是失败；`failed` = 下一行是 failed outcome。
- `active` = submission 仍在 landing 且 `inProgress(row, after)`。

### 8.11 `groupLandings` / `groupRange`

```

groups = Map()
for landing of landings (newest first):
label = landing.feature ?? landing.title ?? landing.sha.slice(0,7)
push into groups[label(
return groups values (insertion order = newest first)

groupRange(landings):
oldest = landings.at(-1)
contiguous = every(i>0: landings[i-1(.base == landings[i(.sha)
return contiguous && oldest.base ? `${oldest.base}...${landings[0(.sha}` : undefined

```

### 8.12 `stats` 显示串

```

parts(entries) = entries.filter(count>0).map(([n,label() => `${n} ${label}`).join(' · ') || 'none'
checkouts = total - removed, plus ` · N removed` if any
state = parts([ready,'ready'(,[preparing,'setting up'(,[failed,'failed'()
commits = parts([landed,'landed'(,[ahead,'ahead'(,[fresh,'none yet'()

```

### 8.13 刷新调度

```

useFlightWork(branches):
ids = branches where workspace.state == 'ready'
progress = useAction(ProgressAction, {ids}, {enabled: ids.length>0})
commitId = useEvents(Committed, limit 1)?.[0(?.id
runsKey = branches.map(b => `${b.id}:${b.busy?1:0}`).join(',')
useEffect(skip first render; refetch when commitId or runsKey changes)

```

不得使用 `setInterval`；`useNow(60_000)` 只用于年龄显示，`useNow(1000)` 只用于运行中步骤。

### 8.14 队列位置与总长（ADOPT-WV-004）

```

position(item):
same = index.queue.filter(q => q.source == item.source)
return {
position: same.findIndex(q => q.id == item.id) + 1, // 基线：整条 source 队列（含 landing）
total: same.length,
}

```

- **基线语义**：position 是整条 source 队列中的位置，`landing` 项也占位；这与 `useSubmission` 的实现一致。
- **可选增强（ADOPT-WV-004）**：若产品明确区分 `queued #N / M`，可只数 `state='queued'` 的项，并在 UI 上标 `queued-only`；不要在同一界面混用两种口径。
- 没有 total（旧数据）时只显示 `queued #N`；不显示 ETA。

### 8.15 密度与虚拟滚动（ADAPT-WV-010）

```

density = 'compact' | 'comfortable'
rowHeight = density == 'compact' ? 28 : 44
// 有 state/phase 时用 58（两行），与 density 无关
visible = rows.length > 50 ? virtualize(rows, rowHeight) : rows

```

- compact：隐藏 feature 与 age，只留状态点、标题、状态词；hover tooltip 补全。
- comfortable：显示 feature/age/work line。
- 虚拟滚动上线阈值 50 行；滚动容器必须支持键盘 Home/End/PageUp/PageDown。

## 9. 性能、可访问性与响应式

### 9.1 性能预算

| 指标 | 预算 | 做法 |
| --- | --- | --- |
| 侧栏工作量请求 | 1 次/刷新，≤100 id | `ProgressAction` 批量 |
| 侧栏行数 | >50 启用虚拟滚动；compact 28px / comfortable 44px | 见 §8.15 |
| Info 打开 | info + stats + disk 各 1 次 | stats/disk 缓存 |
| submit 卡重渲染 | 仅该 submission 的 doc 变化 | `useSubmission(id)` 按 id 取 |
| lander 日志 | 每个 entry 只渲染自身 | `useTranscript` + `other.id > entry.id` 过滤 |
| 长列表 | 虚拟化（review 已有） | 侧栏用分组折叠，不一次渲染全部 |
| 定时器 | 仅用于显示：elapsed 1s、age 60s | `useNow(1000)` / `useNow(60_000)`；不触发数据请求 |

### 9.2 可访问性

- 所有 icon-only 按钮：`aria-label`（如 `Refresh #42`、`Copy <path>`、`Conversation actions`）。
- 当前会话：`aria-current="true"`。
- 可点击行必须是 `<button>` 或 `<a>`，有 `focus-visible:ring`。
- 状态不只靠颜色：文字标签 + 图标（Check/TriangleAlert/X/Loader）。
- 错误：`role="alert"`。
- 折叠：`Collapsible` 自带 `aria-expanded`/keyboard。
- 对比度：muted 文本不低于 4.5:1（设计 token 保证）。

### 9.3 响应式

- `phone` 断点：review 用 unified diff（`surface.tsx:357`）；侧栏宽度限制由 `sidebarWidthBeyondPhone` 控制（`primitives.tsx`）。
- Info 面板在手机上以单列显示，Rows 自动换行；长 path 用 `elidePath`，不横向滚动。
- 工具卡在窄屏下 Steps 文本截断，耗时/时间右对齐不换行。
- LandingCard 的 header 在窄屏下 `flex-wrap`，Subject 可截断。

## 10. 文件清单与组件树

| 文件 | 组件/职责 |
| --- | --- |
| `extensions/sidebar/root.tsx` | `InFlight`、`FlightRow`、`useFlightWork`、`inFlight`、`landedAt` |
| `extensions/sidebar/rows.tsx` | `Row`、`RowMenu`、`StandingRow`、`saveTitle` |
| `extensions/sidebar/work.ts` | `Work`、`workOf` |
| `extensions/sidebar/lander.tsx` | `LanderState` |
| `extensions/sidebar/landed.tsx` | `Landed`、`LandedRow` |
| `extensions/sidebar/landings.ts` | `groupLandings`、`groupRange` |
| `extensions/sidebar/sidebar.tsx` | `ProjectPath`、standing 排序、Conclude 确认框 |
| `extensions/workspaces/panel.tsx` | `Workspaces`、`Checkout`、`LanderQueue`、`Stats`、`Copyable` |
| `extensions/workspaces/log.tsx` | `WorkspaceCall`、`Steps`、`LanderLogEntry`、`LanderAskEntry`、`LanderReport`、`StatusChip`、`OutcomeBody` |
| `extensions/workspaces/landing.tsx` | `LandingCard`、`Subject`、`CommitCount`、`Open`、`Review` point |
| `extensions/workspaces/steps.tsx` | `runningStep`、`superseded`、`inProgress` |
| `extensions/workspaces/data.tsx` | hooks |
| `extensions/workspaces/web.tsx` | entry/tool 渲染器注册、`LandingNote` |
| `extensions/info/web.tsx` | `Workspaces` section 注册 |
| `extensions/status-line/web.tsx` | `Cwd` |
| `web/src/app/titlebar.tsx` | `projectTitle`、`projectName` |
| `extensions/review/*` | diff surface、spec 解析 |

组件树（Info）：

```

InfoPanel
├─ Section#workspaces (meta=useWorkspacesMeta)
│ └─ Workspaces
│ ├─ LanderQueue
│ ├─ Checkout
│ │ ├─ heading + Refresh
│ │ ├─ Rows > Row(path/branch/target/ahead/landed)
│ │ └─ error alert
│ └─ Stats
│ └─ Rows > Row(checkouts/state/commits/uncommitted/disk)
├─ Section#model …

```

## 11. 实施顺序

### M0 · 数据 hooks 与静态面板（1 天）

1. `data.tsx`：`useWorkspaceIndex`、`useWorkspaces`、`useLanderQueue`、`useWorkspaceConversations`、`stateLabel`。
2. `panel.tsx`：LanderQueue + Checkout + Stats 静态渲染。
3. 验证：用样例 JSON 渲染出所有字段；无数据时显示空态。

### M1 · 侧栏 in-flight 与工作量（1 天）

1. `work.ts`、`inFlight`、`landedAt`、`useFlightWork`。
2. `FlightRow` 状态词、工作量行、subagent 行。
3. 验证：mock doc + progress 返回，行显示 `3 commits + 4 edits`；点击打开 review。

### M2 · Info 交互与刷新（0.5 天）

1. `info` action、刷新按钮、错误行、stats 串变化重取、disk 60s 缓存。
2. 验证：改 state/landed 后卡刷新；窗口 focus 刷新 disk。

### M3 · submit 工具卡与 Steps（1–2 天）

1. `WorkspaceCall`、`StatusChip`、`useSubmission`、`Steps`、`StepLine`、`Elapsed`。
2. 验证：queued → landing → landed 三态；steps 去重/耗时/折叠正确。

### M4 · Lander 日志与 landing 卡（1–2 天）

1. `LanderLogEntry`、`LanderAskEntry`、`LanderReport`、`OutcomeBody`、`OutputTail`。
2. `LandingCard` + tone + Subject + CommitCount。
3. 验证：一次完整 submit 的日志按分组显示；失败卡有 output tail；push 失败为 warning。

### M5 · Root note 与 review 集成（1 天）

1. `LandingNote`、`State at landing`。
2. `Review` point、`branch:`/`uncommitted:`/range 入口、DiffsHub fallback。
3. 验证：root note 打开分支；review 打开正确 diff；无 review 时纯文本。

### M6 · 状态行、标题栏、结论框（0.5 天）

1. `Cwd`、`projectTitle/projectName`、Conclude 确认框。
2. 验证：worktree conversation 状态行显示 `#42`；结论前警告正确列出工作。

### M7 · 可访问性、响应式、性能（0.5 天）

1. aria/focus/键盘、phone 布局、请求预算。
2. 验证：键盘走完侧栏/卡；手机宽度无横向滚动；Network 面板请求数符合预算。

## 12. 测试计划

| 测试 | 覆盖 | 命令 |
| --- | --- | --- |
| `steps.test.ts` | superseded/inProgress/runningStep | `pnpm vitest run test/steps.test.ts` |
| `work.test.ts` | workOf 空/单边/双边 | `pnpm vitest run test/work.test.ts` |
| `landings.test.ts` | groupLandings/groupRange 连续与非连续 | `pnpm vitest run test/landings.test.ts` |
| `panel.test.tsx` | 空态/加载/错误/复制/刷新 | `pnpm vitest run test/panel.test.tsx` |
| `workspace-call.test.tsx` | queued/landing/landed/failed chip 与 steps | `pnpm vitest run test/workspace-call.test.tsx` |
| `landing-card.test.tsx` | 三种 tone、commits/paths/divergence、折叠 | `pnpm vitest run test/landing-card.test.tsx` |
| `in-flight.test.tsx` | inFlight/landedAt/work line 渲染 | `pnpm vitest run test/in-flight.test.tsx` |
| `conclude-warning.test.tsx` | pending 有工作/无工作/失败 | `pnpm vitest run test/conclude-warning.test.tsx` |

UI 测试用 mock store/action，不启动真实 server；截图对比只作为人工验收，不作为唯一判据。

**视觉验收清单**（人工）：

1. 1440px：侧栏 260px，in-flight 行不换行；Info 面板 320px；工具卡不溢出。
2. 390px：侧栏折叠为抽屉；Info 单列；工具卡 Steps 可横向截断但不滚动整页。
3. 深色/浅色：success/warning/error 对比度足够；muted 文本可读。
4. 键盘：Tab 能到达每个 refresh/copy/open/step toggle；focus ring 可见。

## 13. 验收 checklist

| AC | 判据 | 覆盖 |
| --- | --- | --- |
| AC-WV-001 ← REQ-WV-001 | 项目根为 worktree 时标题栏和侧栏都出现 `<project> #<id>`；非 worktree 不出现 | REQ-WV-001 |
| AC-WV-002 ← REQ-WV-002 | 每个 open branch 行显示 title/feature/state/age；缺 feature 不留空标签 | REQ-WV-002 |
| AC-WV-003 ← REQ-WV-003 | 7 种状态各渲染对应词与 tone；颜色之外有文字 | REQ-WV-003 |
| AC-WV-004 ← REQ-WV-004 | `unlanded=3/uncommitted=4` 显示 `3 commits` `+ 4 edits`；都为 0 时整行不渲染 | REQ-WV-004 |
| AC-WV-005 ← REQ-WV-005 | `@lander` 行显示 fixing/diagnosing/landing/queue N/last age | REQ-WV-005 |
| AC-WV-006 ← REQ-WV-006 | 同 feature 多次落地合成一行；连续 range 可点开；非连续无 range | REQ-WV-006 |
| AC-WV-007 ← REQ-WV-007 | 有队列时 meta=`N landing`；否则显示当前 checkout 状态 | REQ-WV-007 |
| AC-WV-008 ← REQ-WV-008 | path/branch 可复制；target 显示 `in <source>`；ahead 数字正确；landed 7 位；增强版 WIP 与 Review 按钮可用 | REQ-WV-008 |
| AC-WV-009 ← REQ-WV-009 | 队列按最旧优先，显示 conversation/tip/step 或 target | REQ-WV-009 |
| AC-WV-010 ← REQ-WV-010 | 统计 5 行齐全；btrfs 时显示 `· N real`；disk 失败显示 unknown | REQ-WV-010 |
| AC-WV-011 ← REQ-WV-011 | submit 卡标题 `submit · tip → target`；chip 状态正确；工具耗时在无 state 时显示 | REQ-WV-011 |
| AC-WV-012 ← REQ-WV-012 | queued/landing 默认展开；outcome 后默认折叠；手动 toggle 保持 | REQ-WV-012 |
| AC-WV-013 ← REQ-WV-013 | `checking:` 被 `checked:` 取代；最后一步/并发组正确 active；耗时正确 | REQ-WV-013 |
| AC-WV-014 ← REQ-WV-014 | 一次 submission 的日志有分组头、步骤、check、outcome；queued 不单独显示 | REQ-WV-014 |
| AC-WV-015 ← REQ-WV-015 | 三种 tone 的色条/图标/标签正确；headline 文案正确 | REQ-WV-015 |
| AC-WV-016 ← REQ-WV-016 | root note 显示 LandingCard；State at landing 可展开 | REQ-WV-016 |
| AC-WV-017 ← REQ-WV-017 | 提交者 transcript 出现 report 卡，含 commits/paths/divergence | REQ-WV-017 |
| AC-WV-018 ← REQ-WV-018 | 三种 spec 都能打开 review；无 provider 时退化正确 | REQ-WV-018 |
| AC-WV-019 ← REQ-WV-019 | GitHub 时 commit 数可点 compare；非 GitHub 不显示↗ | REQ-WV-019 |
| AC-WV-020 ← REQ-WV-020 | 代码中无 worktree 相关 setInterval；committed/run 变化触发重取 | REQ-WV-020 |
| AC-WV-021 ← REQ-WV-021 | 每组件六态均有可渲染分支；无 undefined/空白 | REQ-WV-021 |
| AC-WV-022 ← REQ-WV-022 | 所有 icon 按钮有 aria-label；Tab 可达；aria-current 正确 | REQ-WV-022 |
| AC-WV-023 ← REQ-WV-023 | 390px 宽度无横向滚动；关键信息仍可见 | REQ-WV-023 |
| AC-WV-024 ← REQ-WV-024 | 10 个分支只发 1 次 progress；stats 不按 timer；disk 60s 复用 | REQ-WV-024 |
| AC-WV-025 ← REQ-WV-025 | 复制 path/branch 与记录完全一致 | REQ-WV-025 |
| AC-WV-026 ← REQ-WV-026 | open #id/entry 能切到会话并定位 breadcrumb | REQ-WV-026 |
| AC-WV-027 ← REQ-WV-027 | 有 workspace 时状态行显示 `#id`，tooltip 有 path+branch | REQ-WV-027 |
| AC-WV-028 ← REQ-WV-028 | 所有字段名与 `50` §4 一致；无前端重命名 | REQ-WV-028 |
| AC-WV-029 ← REQ-WV-029 | 三域状态都能映射到 §5.7 的唯一词表，无组件自定义词 | REQ-WV-029 |
| AC-WV-030 ← REQ-WV-030 | 基线 position 与 `useSubmission` 一致（整条 source 队列）；增强版 queued-only 口径标注清楚，不混用 | REQ-WV-030 |
| AC-WV-031 ← REQ-WV-031 | 六种 step 状态各有图标/文案/tone；pending 不显示为 running | REQ-WV-031 |
| AC-WV-032 ← REQ-WV-032 | 复制 sha、compare、log 三个动作可用；无 GitHub 时 compare 隐藏 | REQ-WV-032 |
| AC-WV-033 ← REQ-WV-033 | 四类空态文案正确，且不出现空 section 标题 | REQ-WV-033 |
| AC-WV-034 ← REQ-WV-034 | ⌘K 能搜到四个命令；深链 `#id/entry` 可复制并打开 | REQ-WV-034 |
| AC-WV-035 ← REQ-WV-035 | compact/comfortable 切换生效；51 行时启用虚拟滚动且键盘可达 | REQ-WV-035 |

## 14. 边缘情况、证据索引与外部采纳

### 14.0 与主流产品的差异（先看这张表）

| 维度 | Ultimate | Claude Code | OpenAI Codex | Conductor / GitKraken |
| --- | --- | --- | --- | --- |
| 工作区清单 | 侧栏 in-flight + @lander + Info all checkouts | session 列表 + agent view（按 Needs input/Working/Completed 分组） | project/thread 列表；无 worktree 总览 | workspace 列表；GitKraken Agent Sessions View |
| 状态词 | workspace 4 态 + branch 7 态 + submission 5 态，统一字典 | Working / Needs input / Idle / Completed / Failed / Stopped | 未公开统一词表 | Running / Waiting for input / done（GitKraken） |
| 每工作区详情 | path/branch/target/ahead/landed（增强 WIP/behind） | session 级 diff；无公开 worktree 字段 | diff pane + 终端 | 分支、目录、Checks、PR（Conductor） |
| 队列/进度 | per-source FIFO + position/total + step + elapsed | 无 | 无 | 无（只有 checks） |
| 落地回执 | LandingCard：tone/headline/divergence/commits/paths/push/steps | PR 状态 | PR/commit | PR/Checks |
| 密度 | 28/44/58px 三档；增强 compact/comfortable | 分组/排序 | 未公开 | GitKraken List/Agents 双视图 |

**结论**：外部产品强在 inventory、diff、密度；Ultimate 强在 **landing 作为一等公民**（队列、步骤、回执、失败诊断）。复刻时应保留 Ultimate 的 landing 信息架构，只借外部的清单字段、空态、密度与命令入口，不要把主界面改成看板或全局 dashboard。

### 14.1 边缘情况

| 情况 | 处理 |
| --- | --- |
| 根文档尚未加载 | hooks 返回空索引 `{items:{},queue:[(,...}`；组件显示空态，不崩溃 |
| 记录存在但 info 返回 null | 用记录值兜底（`panel.tsx:64-67`） |
| info 加载中 | 显示记录值，刷新图标旋转 |
| 队列 item 的 subject 缺失 | Subject 退化为 `#<id>` |
| 无 GitHub 仓库 | commit 数纯文本；不显示 compare |
| review 扩展未启用 | `Review` point 无 provider；branch 计数纯文本 |
| lander 报告在旧版本无 conversationId | 使用当前会话 id 兜底（`log.tsx:129-130`） |
| 同一 submission 的 `queued` 行在 doc 中仍在 | 日志里不渲染，避免重复 |
| 步骤被后续 check 取代 | `superseded` 过滤，不显示"幽灵 running" |
| 失败后 output 很长 | 折叠 + `ToolOutput` 限高滚动 |
| 落地 note 的 `base` 缺失 | 用同一 transcript 中上一条 lander note 的 sha 作为 range base（`web.tsx:46-57`） |
| 磁盘测量慢 | 先显示 `measuring…`，成功后替换；失败显示 `unknown` |
| 结论时 pending 查询失败 | 弹 `Couldn't check … Conclude anyway?`，允许继续 |

### 14.2 证据索引

| REQ | 证据 |
| --- | --- |
| REQ-WV-001 | `web/src/app/titlebar.tsx:24-58`、`sidebar/sidebar.tsx:56-68` |
| REQ-WV-002 | `sidebar/root.tsx:126-250` |
| REQ-WV-003 | `sidebar/root.tsx:51-78` |
| REQ-WV-004 | `sidebar/work.ts:9-28`、`sidebar/root.tsx:240-246` |
| REQ-WV-005 | `sidebar/lander.tsx:12-70`、`sidebar/sidebar.tsx:172-179` |
| REQ-WV-006 | `sidebar/landed.tsx:54-134`、`sidebar/landings.ts:9-31` |
| REQ-WV-007 | `info/web.tsx:426-432`、`workspaces/panel.tsx:25-31` |
| REQ-WV-008 | `workspaces/panel.tsx:59-147` |
| REQ-WV-009 | `workspaces/panel.tsx:149-174` |
| REQ-WV-010 | `workspaces/panel.tsx:176-268` |
| REQ-WV-011 | `workspaces/log.tsx:496-554` |
| REQ-WV-012 | `workspaces/log.tsx:526-540` |
| REQ-WV-013 | `workspaces/log.tsx:265-326`、`steps.tsx:1-17` |
| REQ-WV-014 | `workspaces/log.tsx:328-412` |
| REQ-WV-015 | `workspaces/landing.tsx:174-265`、`log.tsx:44-124` |
| REQ-WV-016 | `workspaces/web.tsx:10-107` |
| REQ-WV-017 | `workspaces/log.tsx:126-152` |
| REQ-WV-018 | `review/refs.ts:5-11`、`review/server.ts:24-130`、`landing.tsx:70-135` |
| REQ-WV-019 | `workspaces/landing.tsx:51-68`、`:96-135` |
| REQ-WV-020 | `sidebar/root.tsx:252-285`、`panel.tsx:59-72`、`:183-204` |
| REQ-WV-021 | 本文 §5.5；各组件源码分支 |
| REQ-WV-022 | `rows.tsx:217-226`、`panel.tsx:88-96`、`landing.tsx:33-48` |
| REQ-WV-023 | `review/surface.tsx:357`、`sidebar/primitives.tsx` |
| REQ-WV-024 | `sidebar/root.tsx:257-285`、`panel.tsx:183-204` |
| REQ-WV-025 | `panel.tsx:134-147` |
| REQ-WV-026 | `landing.tsx:18-49`、`sidebar/landed.tsx:85-90` |
| REQ-WV-027 | `status-line/web.tsx:51-85` |
| REQ-WV-028 | `workspaces/types.ts:3-145`、`workspaces/refs.ts:14-35` |
| REQ-WV-029 | §5.7（本文规范）；词源见 `sidebar/root.tsx:51-78`、`workspaces/log.tsx:464-494`、`data.tsx:33-35` |
| REQ-WV-030 | `workspaces/log.tsx:442-454`（position）；§8.14 |
| REQ-WV-031 | `workspaces/steps.tsx:1-17`、`log.tsx:195-263`、`lander.ts:945-1002` |
| REQ-WV-032 | `workspaces/landing.tsx:186-265`、`log.tsx:126-152` |
| REQ-WV-033 | `workspaces/panel.tsx:47-53`；§7.11 |
| REQ-WV-034 | `sidebar/rows.tsx:272-347`、`landing.tsx:18-49` |
| REQ-WV-035 | `sidebar/root.tsx:126-250`、§8.15（增强） |

### 14.3 外部可视化采纳

> 由 [`research/worktree-ui-research.md`](research/worktree-ui-research.md) §9 回填；每条给出来源模式、目标章节与验收。

| ID | 决策 | 模式与来源 | 落地 | 验收 |
| --- | --- | --- | --- | --- |
| ADOPT-WV-001 | ADOPT | 统一状态字典（P04；GitKraken Running/Waiting/done） | §5.7 | AC-WV-029 |
| ADOPT-WV-002 | ADOPT | Checkout 卡增加 WIP/behind（P01；GitKraken 卡片字段） | §7.4 | AC-WV-008 |
| ADAPT-WV-003 | ADAPT | 侧栏主 checkout 节点（P03；GitHub Desktop Main/Linked） | §7.3（可选） | — |
| ADOPT-WV-004 | ADOPT | 队列位置 + 总长（P06；Ultimate 已有 `queued #2`） | §5.3、§7.4、§8.14 | AC-WV-030 |
| ADOPT-WV-005 | ADOPT | Step 六态 pending/running/passed/failed/flaky/timeout（P07） | §5.6 | AC-WV-031 |
| ADOPT-WV-006 | ADOPT | Landing 卡三动作：copy sha / compare / log（P08） | §7.7 | AC-WV-032 |
| ADAPT-WV-007 | ADAPT | work 行直接开 review（P09；Sculptor Changes 计数） | §7.2、§7.8 | AC-WV-004、AC-WV-018 |
| ADOPT-WV-008 | ADOPT | 四类空态（P11；Claude agent view、Vibe 空列） | §7.11 | AC-WV-033 |
| ADOPT-WV-009 | ADOPT | 危险动作二次确认（P12；Claude Archive anyway） | §7.11 | AC-WV-033 |
| ADAPT-WV-010 | ADAPT | compact/comfortable + >50 行虚拟滚动（P14） | §8.15、§9.1 | AC-WV-035 |
| ADOPT-WV-011 | ADOPT | 四个命令面板动作（P10；Sculptor/Codex ⌘K） | §7.12 | AC-WV-034 |
| ADOPT-WV-012 | ADOPT | 深链 `#<id>/<entry>` 统一复制（P13；Terragon fork 深链） | §7.12 | AC-WV-034 |
| REJECT-WV-013 | REJECT | 看板作为主界面（P02；Vibe/Nimbalyst） | — | 与 conversation tree 冲突 |
| REJECT-WV-014 | REJECT | 全局多项目 dashboard（Cursor/Conductor） | — | 单项目 server 模型，超出范围 |
| REJECT-WV-015 | REJECT | 应用内 Merge 按钮（Conductor/Vibe） | — | 绕过 lander 检查与 ff-only |
| ADAPT-WV-016 | ADAPT | 外部移动 checkout 时给 `Removed` 态与"重新创建"提示（Cursor/Codex handoff） | §5.1、§7.11 | AC-WV-021 |

### 14.4 未决问题

1. **多根项目**：一个 Ultimate 进程只有一个 `projectRoot`；如果复刻支持多项目，需要把 `WorkspaceIndex` 的 key 扩为 `(project, conversation)`，本文未覆盖。
2. **实时推送**：当前依赖 WebSocket store 的 doc 更新；若复刻用轮询，需把 `progress` 的刷新预算改成可配置。
3. **国际化**：文案目前英文；复刻时集中到文案表，不要把字符串散落在组件里。
4. **颜色 token**：`success/warning/error/brand/muted` 的精确色值由设计系统决定；本文只约定语义。
5. **超长 lander 日志**：一次提交可能有几十条 check 行；当前全部渲染，若复刻支持 100+ 条，应加虚拟化或分组折叠。
```
