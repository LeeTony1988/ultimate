# Ultimate Worktree 管理与可视化：分析与复刻计划

| 字段             | 值                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| 文档 ID          | AD-01                                                                                                |
| 状态             | active                                                                                               |
| 版本             | 1.0                                                                                                  |
| 证据基线         | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`）                                  |
| 外部资料访问日期 | 2026-10-28                                                                                           |
| 读者             | 需要复刻 Ultimate worktree 机制、实现 worktree 可视化界面，或评估其它 agent 方案的 AI agent / 工程师 |
| 语言             | 中文叙述 + 英文契约标识符（类型、字段、API、事件名保持源码原名）                                     |

本文件是 `agent_design/` 第二批文档（worktree 专题）的总计划。第一批见 [`00-plan.md`((00-plan.md)（自进化、子 agent 编排、任务/子 agent 可视化桌面应用）。

## 1. 目标

产出四类**可执行**文档，而不是综述：

1. **机制分析**：Ultimate 如何创建、准备、门禁、提交、合并、回收、重建 worktree；谁拥有写权限；失败如何恢复。
2. **机制复刻 spec**：一个没有本仓库上下文的 agent，只读 spec 就能重建同等机制，并通过验收测试。外部优秀机制可有依据地融入，但必须标为 `ADOPT` 并给出理由。
3. **可视化分析 + 复刻 spec**：Ultimate 把 worktree 状态呈现在哪些界面、用什么数据、什么交互、什么折叠/排序/刷新算法；一个 agent 只读 spec 就能复刻。
4. **调研参考文档**：Claude Code、Codex、Z Code 等 agent 工具，以及主流 skill / 插件 / 独立应用对 worktree 的管理与可视化方案，作为对比证据与选型依据。

"可复刻"的硬性判定：

- 每个行为都有**输入、输出、状态迁移、失败路径**四要素。
- 每个结论都有 `文件:行`、命令输出或外部 URL 证据；推断必须显式标注 `推断:`。
- 每个模块都有**文件清单、公开契约、实施顺序、验收命令**。
- 验收项二元（pass/fail），不写"体验良好"这类不可判定描述。
- 读者不需要访问本会话，也不需要读 Ultimate 源码才能开始实现。
- 同一字段在管理 spec、可视化 spec、样例 JSON 中类型一致。

## 2. 范围

### 2.1 包含

| 编号 | 范围                                                                                                                                                                        | 对应文档                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| WM   | Ultimate worktree 使用与管理：隔离创建、准备任务、setup、工具门禁、同步 land、submit/lander 队列、检查、快进、推送、回收、重建、嵌套、并发、可观测性                        | `50-worktree-management-spec.md`           |
| WR   | 其它 agent 工具的 worktree 管理调研：Claude Code、Codex、Z Code、Cursor、Gemini CLI、Conductor、Sculptor、Claude Squad、Crystal、Vibe Kanban、worktrunk 等，以及 skill/插件 | `research/worktree-management-research.md` |
| WV   | Ultimate worktree 可视化：侧栏 in-flight 行、Info 面板、submit 工具卡、lander 日志、landing 卡、root note、review 入口、状态映射与刷新算法                                  | `60-worktree-visualization-spec.md`        |
| WU   | 其它产品的 worktree 可视化调研：Claude Code / Codex / Cursor 桌面端、Conductor、Sculptor、Vibe Kanban、Crystal、VS Code、GitKraken、GitHub Desktop、Tower 等                | `research/worktree-ui-research.md`         |

### 2.2 不包含

- 不修改 Ultimate 产品代码；本任务只产出 `agent_design/` 下的文档。
- 不实现 worktree 管理器或可视化应用本体，只交付可复刻 spec 与验证方案。
- 不复刻 Pi Durable 的完整存储/事务引擎；只定义复刻所需的最小持久化契约与可替换边界。
- 不评估模型能力/价格；模型只作为可配置参数。
- 不把外部产品当作"正确答案"：外部方案只作为机制与交互证据，采纳必须走 §3.4 的决策流程。

## 3. 方法

### 3.1 源码优先（source-first）

1. 先读**契约面**：`extensions/workspaces/api.ts`、`refs.ts`、`types.ts`、`README.md`、`docs/worktrees.md`、`agents/*.md`、`.ultimate/settings.json`。
2. 再读**实现面**：`workspaces.ts`、`lander.ts`、`server.ts`、`setup.ts`、`paths.ts`、`lib/git.ts`、`lib/shell.ts`，确认文档没有说谎。
3. 再读**消费面**：`extensions/subagents/*`、`extensions/conversations/*`、`extensions/sidebar/*`、`extensions/info/*`、`extensions/status-line/*`、`extensions/review/*`，确认谁在什么时机调用。
4. 最后读**验证面**：`test/workspaces*.test.ts`、`test/lander-checkout.test.ts`、`test/e2e/workspaces*.test.ts`，把测试当作可执行规格。
5. 证据格式：`path:line` 或 `path:start-end`；命令证据给出命令与关键输出；外部证据给 URL + 访问日期 + 版本/发布日期（若可得）。

### 3.2 机制分析五视角

对每条 worktree 行为，固定回答：

| 视角   | 问题                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| 触发   | 谁在什么条件下启动它？同步还是异步？在哪个事务/任务里？                       |
| 所有权 | 哪个 conversation 拥有它？谁是唯一写入者？谁能 land/submit/discard？          |
| 状态   | 有哪些持久记录？唯一真相在哪？状态如何迁移？                                  |
| 失败   | 崩溃、超时、脏工作区、分支漂移、并发 add、setup 失败、push 失败分别发生什么？ |
| 恢复   | 下一次输入/工具调用/重启如何自愈？会重试几次？会不会丢工作？                  |

### 3.3 三角验证

同一关键结论至少两种证据：

1. 源码（实现）；
2. 扩展 README / docs（设计意图）；
3. 测试或运行行为（`test/`、命令输出、截图）。

三者冲突时以**源码 + 测试**为准，并在文档中记录冲突（如 `docs/worktrees.md` 说 X，代码实际是 Y）。

### 3.4 外部调研协议

1. **一手优先**：官方文档、官方仓库源码/README、release notes；博客/二手文章只作线索，结论必须回到一手来源。
2. 每个产品记录：产品名、版本或发布日期、访问日期、URL、worktree 的**创建方式、存放位置、生命周期、隔离粒度、合并/回收策略、UI 呈现**。
3. 区分「产品内建」「插件/skill 提供」「用户脚本」三种来源，不混为一谈。
4. 对每个可借鉴机制写 `ADOPT / ADAPT / REJECT` 决策：
   - `ADOPT`：直接纳入 spec，给出目标章节与验收项；
   - `ADAPT`：改造后纳入，写清改造点与代价；
   - `REJECT`：不纳入，写清与 Ultimate 不变量冲突之处。
5. 无法验证的功能写「未验证」，不猜测；产品名歧义（如 `zcode`）必须列出候选并说明本文采用哪一个。

### 3.5 可视化分析方法

1. **先信息架构，后视觉**：列出用户问题（这个分支在哪？有多少未落地提交？现在谁在合并？为什么失败？），再映射到界面层级。
2. **数据先行**：每个可见字段必须能追到 doc / action / event / entry / tool output 之一；没有数据源的视觉元素标为 `NOTE` 或删除。
3. **状态穷举**：每个组件列出 loading / empty / ready / busy / failed / removed 六种状态及文案。
4. **交互可验收**：点击、折叠、刷新、复制、跳转都写清触发与结果；不用"友好""直观"描述。
5. **性能有预算**：明确刷新触发（事件驱动，不用定时轮询）、单次查询上限、渲染复杂度。

## 4. 文档规范（AI-first）

### 4.1 固定骨架

每份 spec（`50`、`60`）必须包含：

```
0. Metadata（ID、版本、状态、证据基线、前置依赖）
1. 目标与非目标
2. 术语、不变量、边界
3. 架构与数据流（含时序图）
4. 数据契约（TypeScript + JSON 示例）
5. 状态机（状态、事件、迁移表、非法迁移）
6. 接口契约（工具/action/API/事件，含错误码）
7. 算法与伪代码（关键路径，逐行可实现）
8. 文件清单（路径、职责、依赖方向）
9. 实施顺序（M0…Mn，每步可运行）
10. 测试计划（单元/集成/e2e，命令与期望）
11. 验收 checklist（二元）
12. 失败矩阵与恢复
13. 证据索引
14. 未决问题与假设
```

### 4.2 需求编号

- `REQ-WM-001`：worktree 管理需求；`REQ-WV-001`：worktree 可视化需求。
- 每条需求至少被一个验收项覆盖：`AC-WM-001 ← REQ-WM-001`。
- 禁止无编号的"应该"；要么需求，要么建议（`NOTE`）。
- 外部采纳项格式：`ADOPT-WM-001 ← 来源`，并映射到 `REQ-WM-*`。

### 4.3 契约写法

- 类型用 TypeScript；跨进程/跨重启契约同时给 JSON 示例。
- 状态机用表格：`当前状态 | 事件 | 守卫 | 下一状态 | 副作用`。
- 伪代码编号步骤，每步只做一件事；禁止"处理一下"。
- 错误命名 `E_*`，给出触发条件、可重试性、用户可见文案。
- 所有默认值必须写死（超时、重试次数、路径模板、分支模板）。

### 4.4 证据纪律

- 不允许"Ultimate 会……"而没有 `path:line`。
- 外部产品事实必须给 URL + 访问日期；版本敏感事实给版本号/发布日期。
- 性能数字说明测量环境；没有测量写「未测量」。
- 任何"更好/更快/更简单"必须给比较基线与判据。

## 5. 工作分解与 Checklist

状态：`todo` / `doing` / `done` / `blocked`。机器可读版本见 [`checklist-worktree.yaml`((checklist-worktree.yaml)。

### P — 计划与基线

| ID   | 检查项                                                                           | 产出 / 证据                                | 状态 |
| ---- | -------------------------------------------------------------------------------- | ------------------------------------------ | ---- |
| P-01 | 确认仓库基线、分支、工具链                                                       | `git rev-parse HEAD`、`node -v`、`pnpm -v` | done |
| P-02 | 定义文档骨架、需求编号、证据格式、外部调研协议                                   | 本文件 §3–§4                               | done |
| P-03 | 定义文档索引与阅读路径                                                           | `README.md` worktree 专题段                | done |
| P-04 | 建立机器可读 checklist                                                           | `checklist-worktree.yaml`                  | done |
| P-05 | 补充 worktree 术语（workspace/isolate/source/target/lander/submit/land/release） | `90-glossary.md` 增补                      | done |

### M — Ultimate worktree 管理机制（`50-worktree-management-spec.md`）

| ID   | 检查项                                                                                  | 产出 / 证据           | 状态 |
| ---- | --------------------------------------------------------------------------------------- | --------------------- | ---- |
| M-01 | 盘点入口：谁创建 workspace、谁使用、谁 land/submit/discard/release                      | 调用图 + `rg` 证据    | done |
| M-02 | 数据模型：Workspace/QueueEntry/Landed/LanderStep/LanderOutcome/Index/Info/Stats/Disk    | 类型表 + JSON         | done |
| M-03 | 生命周期状态机：record、preparation task、queue entry、lander task                      | 4 张迁移表 + 非法迁移 | done |
| M-04 | 创建与准备：路径/分支/base、`git worktree add`、setup、失败回滚、幂等                   | 算法 + 失败矩阵       | done |
| M-05 | 工具门禁与自愈：`unavailable`、`ready` 重建、失败重试、注册检查                         | 决策表 + 伪代码       | done |
| M-06 | 同步 `land`：守卫、fast-forward、结果、restart 提示                                     | 前置条件表 + 算法     | done |
| M-07 | `submit` 队列：divergence、breadcrumb、去重、position、立即返回                         | 算法 + 事务边界       | done |
| M-08 | lander 任务：reset、merge、checks、watchdog、flaky、ff、push、report、onFailure、deploy | 分步算法 + 状态机     | done |
| M-09 | 回收：release/discard/reconcile/嵌套/descendant/busy；重建规则                          | 决策树 + 不变量       | done |
| M-10 | 并发与持久化：per-source 串行队列、事务、memo、跨重启恢复                               | 竞态表 + 恢复表       | done |
| M-11 | 可观测性：events/entries/actions 字段与触发点                                           | 事件表 + 字段映射     | done |
| M-12 | 失败矩阵：E_* 错误、重试性、用户文案、恢复动作                                          | 完整表                | done |
| M-13 | 写出复刻 spec：模块、接口、算法、文件清单、M0–Mn、测试、验收                            | `50` §3–§12           | done |
| M-14 | 证据审计：每条 REQ-WM 至少一条 `path:line`                                              | `50` §13              | done |
| M-15 | 外部机制采纳：把 WR 的 ADOPT/ADAPT 项并入 `50`，标来源与验收                            | `50` §14 + 变更记录   | done |

### R — 其它 agent 的 worktree 管理调研（`research/worktree-management-research.md`）

| ID   | 检查项                                                                                                | 产出 / 证据                                | 状态 |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---- |
| R-01 | 定义对比维度：创建、位置、分支、生命周期、合并、回收、权限、UI、生态                                  | 维度表                                     | done |
| R-02 | Claude Code：`--worktree`、agent teams、desktop/app、hooks、skills                                    | 事实表 + URL                               | done |
| R-03 | Codex：CLI/app/cloud 的 worktree 或环境隔离                                                           | 事实表 + URL                               | done |
| R-04 | Z Code（zcode）：确认产品身份与 worktree 能力（含歧义说明）                                           | 事实表 + URL                               | done |
| R-05 | 其它工具：Cursor、Gemini CLI、Conductor、Sculptor、Claude Squad、Crystal、Vibe Kanban、worktrunk、uzi | 对比表 + URL                               | done |
| R-06 | skill/插件生态：superpowers、worktree 相关 skill、VS Code 扩展、git-worktree-runner 等                | 清单 + 机制摘要                            | done |
| R-07 | 综合：提炼 8–12 个机制模式，给 ADOPT/ADAPT/REJECT 决策                                                | 决策表                                     | done |
| R-08 | 写出参考文档并做 URL 可打开性抽查                                                                     | `research/worktree-management-research.md` | done |

### V — Ultimate worktree 可视化（`60-worktree-visualization-spec.md`）

| ID   | 检查项                                                                                     | 产出 / 证据         | 状态 |
| ---- | ------------------------------------------------------------------------------------------ | ------------------- | ---- |
| V-01 | 盘点所有 worktree 可见面：侧栏、Info、transcript、root note、review、status line、titlebar | 界面清单 + 入口路径 | done |
| V-02 | 数据接入：docs/actions/events/entries/tool output 与刷新触发                               | 字段来源表          | done |
| V-03 | 侧栏：项目行、in-flight 行、work 行、lander 行、菜单项、Landed 分组                        | 线框 + 状态映射     | done |
| V-04 | Info 面板：checkout 卡、lander queue、all checkouts、disk                                  | 线框 + 组件树       | done |
| V-05 | Transcript：`workspace` 工具卡、status chip、Steps、lander log、lander-ask                 | 组件树 + 状态机     | done |
| V-06 | Landing：LandingCard、root note、report、tone、divergence、commit link                     | 字段表 + 线框       | done |
| V-07 | Review 集成：`branch:<name>`、`uncommitted:<id>`、`range`、DiffsHub                        | 契约 + 交互         | done |
| V-08 | 交互与状态：loading/empty/ready/busy/failed/removed、折叠、复制、跳转                      | 六态表              | done |
| V-09 | 算法：in-progress/superseded、duration、landedAt、inFlight、分组、排序                     | 伪代码 + 复杂度     | done |
| V-10 | 性能与可访问性：事件驱动刷新、单查询、aria、键盘、移动端                                   | 预算 + 检查表       | done |
| V-11 | 写出复刻 spec：模型、组件、页面、M0–Mn、测试、验收                                         | `60` §3–§12         | done |
| V-12 | 证据审计：每条 REQ-WV 至少一条 `path:line`                                                 | `60` §13            | done |
| V-13 | 外部可视化采纳：把 WU 的 ADOPT/ADAPT 项并入 `60`                                           | `60` §14            | done |

### U — 其它产品的 worktree 可视化调研（`research/worktree-ui-research.md`）

| ID   | 检查项                                                                       | 产出 / 证据                        | 状态 |
| ---- | ---------------------------------------------------------------------------- | ---------------------------------- | ---- |
| U-01 | 定义可视化维度：总览、分支/工作区列表、状态、diff、合并、队列、告警、操作    | 维度表                             | done |
| U-02 | Claude Code / Codex / Cursor 的并行 agent 工作区 UI                          | 截图/文档证据 + URL                | done |
| U-03 | Conductor / Sculptor / Claude Squad / Crystal / Vibe Kanban / Terragon       | 对比表 + URL                       | done |
| U-04 | IDE 与 Git 客户端：VS Code、GitKraken、GitHub Desktop、Tower/Fork、GitButler | 模式表 + URL                       | done |
| U-05 | 提炼信息架构与交互模式（列表/看板/树/时间线/详情）                           | 模式库                             | done |
| U-06 | 给 ADOPT/ADAPT/REJECT 决策并映射到 `60`                                      | 决策表                             | done |
| U-07 | 写出参考文档并做 URL 抽查                                                    | `research/worktree-ui-research.md` | done |

### Q — 交叉校验与交付

| ID   | 检查项                                                                 | 产出 / 证据                   | 状态 |
| ---- | ---------------------------------------------------------------------- | ----------------------------- | ---- |
| Q-01 | 术语一致：同一概念在五份文档用同一名字                                 | 对照表                        | done |
| Q-02 | 契约一致：`50` 的字段能直接喂给 `60` 的组件                            | 映射表                        | done |
| Q-03 | 每条 REQ 有 AC 覆盖，每条 AC 可执行                                    | 覆盖矩阵                      | done |
| Q-04 | 链接检查：内部链接、外部 URL 抽查                                      | 脚本输出                      | done |
| Q-05 | 冷读测试：未参与写作的 agent 只读 `50`/`60` 复述目标、模块、前三里程碑 | 试读记录 + 修订               | done |
| Q-06 | 更新 `README.md` 索引与阅读路径                                        | `README.md`                   | done |
| Q-07 | 回填 checklist 与质量报告                                              | YAML 全 done / 有理由 blocked | done |

## 6. 里程碑

| 里程碑 | 内容                              | 完成判据                              |
| ------ | --------------------------------- | ------------------------------------- |
| M0     | 计划、checklist、基线、术语       | `01` + `checklist-worktree.yaml` 可读 |
| M1     | Ultimate 管理机制分析与 spec 初稿 | M-01…M-12 完成，M-13 可评审           |
| M2     | 外部管理调研与采纳                | R-01…R-08 完成，ADOPT 项并入 `50`     |
| M3     | Ultimate 可视化分析与 spec 初稿   | V-01…V-10 完成，V-11 可评审           |
| M4     | 外部可视化调研与采纳              | U-01…U-07 完成，ADOPT 项并入 `60`     |
| M5     | 交叉校验与交付                    | Q-01…Q-07 完成                        |

## 7. 质量门

| 门        | 判据                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| 证据门    | 随机抽查 5 条结论，均能按 `path:line` 找到原文；外部事实 URL 可打开             |
| 可执行门  | 按"实施顺序"从零开始，前两步能在 30 分钟内跑通（或有明确环境前置）              |
| 失败门    | 每条正常路径至少一条失败路径与恢复策略                                          |
| 一致性门  | 同一字段在 `50`、`60`、样例 JSON 中类型一致                                     |
| 覆盖门    | 每条 REQ 至少一条 AC；每条 AC 有命令或判定方法                                  |
| AI 试读门 | 一个未参与写作的 agent 能复述目标、模块边界、前三个里程碑，不提出"缺少关键信息" |

## 8. 风险与应对

| 风险                                                                         | 影响          | 应对                                                     |
| ---------------------------------------------------------------------------- | ------------- | -------------------------------------------------------- |
| worktree 机制横跨 workspaces/subagents/conversations/sidebar，容易写成流水账 | 文档不可用    | 以"复刻者要做什么"组织；每节先给契约再给证据             |
| 外部产品 worktree 功能快速变化、名称歧义                                     | 调研过期/失真 | 记录版本与访问日期；`zcode` 列候选；只写可验证事实       |
| UI 文档退化为截图描述                                                        | 无法复刻      | 强制字段来源表、六态表、组件树、算法与验收               |
| 把外部方案硬塞进 Ultimate                                                    | 与不变量冲突  | 每个采纳项必须过 §3.4 决策，写 ADOPT/ADAPT/REJECT 与理由 |
| 文档间字段漂移                                                               | 复刻失败      | Q-01/Q-02 交叉校验；以 `types.ts` 为唯一命名源           |
| 长文档无人能冷读                                                             | 交付失败      | 每份 spec 开头给"10 分钟摘要"，Q-05 冷读测试             |

## 9. 交付物

| 文件                                       | 内容                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `01-worktree-plan.md`                      | 本计划                                                   |
| `checklist-worktree.yaml`                  | 机器可读进度账本                                         |
| `50-worktree-management-spec.md`           | Ultimate worktree 管理机制分析 + 复刻 spec（含外部采纳） |
| `research/worktree-management-research.md` | 其它 agent / skill / 插件的 worktree 管理调研            |
| `60-worktree-visualization-spec.md`        | Ultimate worktree 可视化分析 + 复刻 spec（含外部采纳）   |
| `research/worktree-ui-research.md`         | 其它产品的 worktree 可视化调研                           |
| `research/worktree-source-map.md`          | Ultimate worktree/lander 源码证据地图（含 G1–G18 冲突）  |
| `README.md`                                | 更新索引与阅读路径                                       |

## 10. 变更控制

- 证据基线变更时，先更新 `checklist-worktree.yaml` 的 `baseline_commit`，再重跑受影响章节的证据审计。
- 新增/删除 REQ 必须同步更新对应 spec 的验收表与本计划 §5。
- 外部采纳项必须保留来源 URL 与访问日期；来源失效时标 `stale` 并重新核验。
- 文档版本：初稿 `0.x`，通过质量门 `1.0`；破坏性契约变更升主版本。
