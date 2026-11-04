# 10 · Ultimate 自进化机制分析与复刻 Spec

| 字段     | 值                                                     |
| -------- | ------------------------------------------------------ |
| 文档 ID  | AD-10                                                  |
| 需求前缀 | `REQ-S-*` / 验收 `AC-S-*`                              |
| 状态     | 1.0（通过质量门）                                      |
| 证据基线 | `3f7b7bec`（2026-10-27）                               |
| 前置阅读 | `00-plan.md` §4（文档规范）、`90-glossary.md`          |
| 读者     | 要实现"会修改自己的 agent harness"的 AI agent / 架构师 |

---

## 0. 一句话结论

Ultimate 的自进化不是"模型随时改自己"，而是一条**有持久状态、有闸门、可回滚、可验证**的自我修改回路：

```
观察（trace / conversations / tally）
  → 反思（dream 六 passes、memory review）
  → 决策（用户批准，或 hands-off goal 代决）
  → 编码（memory / skill / agent definition / extension / core code）
  → 验证（preview / tests / review / lander）
  → 生效（hot reload / core swap / upstream update）
  → 记录（memory / landing note / dream.decide）
  → 回到观察
```

复刻时最重要的不是某个工具，而是**把"修改什么"按生效代价分层**，并给每层配一个**唯一写入口 + 生效机制 + 失败回滚**。

> 注意：Ultimate 没有名为 `self-evolution` 的单一模块。它是跨扩展的组合：`lineage`（记忆/brief/蒸馏）、`dream`（反思）、`prompt`（上下文与变化说明）、`lib/agents` + `subagents`（定义/委派）、`server/extensions`（facet 热重载）、`self` + supervisor（核心换代）、`update`（上游同步）。`extensions/self` 只负责"知道自己跑的是哪份代码并请求换代"，不是全部机制。

---

## 1. 目标与非目标

### 1.1 目标

| ID     | 目标                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------- |
| G-S-01 | 解释 Ultimate 的六类自修改面（记忆、技能、agent 定义、扩展/表面、核心代码、上游更新）及它们的关系 |
| G-S-02 | 给出每类修改面的**持久化模型、写入口、生效时机、验证方式、回滚方式**                              |
| G-S-03 | 给出可被 agent 直接执行的复刻 spec：模块边界、接口、算法、文件清单、实施顺序、验收测试            |
| G-S-04 | 解释为什么这套机制不会在自改时丢掉正在进行的对话/任务                                             |
| G-S-05 | 给出安全边界：哪些动作只能由用户做，哪些由 @ultimate 做，哪些必须走 branch                        |

### 1.2 非目标

- 不推导 Ultimate 的产品路线，不评价模型好坏。
- 不复刻 Pi Durable 的完整事务/恢复引擎；只定义它必须提供的原语（事务、文档、任务、事件、提交）。
- 不要求逐行照抄源码；复刻者可以用不同语言/框架，但必须保留 §2.2 的不变量。
- 不把 dream 做成无人监督的自动改代码；Ultimate 明确禁止这一点（`extensions/dream/DREAM.md:5-7`）。

### 1.3 需求清单

| ID        | 需求                                                                      | 优先级 |
| --------- | ------------------------------------------------------------------------- | ------ |
| REQ-S-001 | 系统必须把自修改面分为 L1–L6 六层，并为每层定义写入口、生效方式、回滚方式 | P0     |
| REQ-S-002 | 系统提示必须由可注册的 section 组成，跨构建保持字节稳定                   | P0     |
| REQ-S-003 | 构建/指令/文档变化必须作为输入条目说明，不得写入 system prompt            | P0     |
| REQ-S-004 | 记忆必须使用 `{kind,line,body,source,updated}` 结构，slug/长度/总数受限   | P0     |
| REQ-S-005 | 记忆写入必须整批校验、全有或全无                                          | P0     |
| REQ-S-006 | 只有 standing primary agent 能写项目记忆                                  | P0     |
| REQ-S-007 | 任意 agent 可读记忆索引与单条全文                                         | P1     |
| REQ-S-008 | 从有记忆的 root 分叉的新 branch 必须以 brief 开始，而非完整 tally         | P0     |
| REQ-S-009 | 每次 landing 必须最多触发一次记忆蒸馏，失败不阻塞 landing                 | P1     |
| REQ-S-010 | dream 必须支持用户触发、上下文阈值触发、handoff 与超时启动                | P1     |
| REQ-S-011 | dream 会话必须有 open/ended/asleep 状态机与并发门                         | P1     |
| REQ-S-012 | dream 必须运行六个固定 pass，并记录每个 pass 的状态                       | P1     |
| REQ-S-013 | journal 只归档一次；proposal 状态必须可审计、可自动标记 landed            | P1     |
| REQ-S-014 | agent 定义必须支持三目录发现、同名覆盖、overlay 追加                      | P0     |
| REQ-S-015 | 定义保存必须回读校验；内置定义不可改写                                    | P0     |
| REQ-S-016 | 技能必须支持多目录覆盖与 `/skill:` 展开                                   | P1     |
| REQ-S-017 | 扩展必须以目录为部署单位，server/web 分离                                 | P0     |
| REQ-S-018 | 扩展热重载必须失败隔离，且不影响进行中的调用                              | P0     |
| REQ-S-019 | 核心代码变更必须走 restart，不得依赖热重载                                | P0     |
| REQ-S-020 | core swap 必须类型检查、prepare、ack、release、start，并可回滚            | P0     |
| REQ-S-021 | restart 工具必须 replay-safe，重放不得再次 swap                           | P0     |
| REQ-S-022 | upstream update 必须只 fast-forward，并列明拒绝条件                       | P1     |
| REQ-S-023 | 代码/UI 修改必须经过 check/test/preview/review/lander 闸门                | P0     |
| REQ-S-024 | 系统必须支持基于运行证据的改进提案闭环                                    | P2     |
| REQ-S-025 | 记忆审查必须只读，返回变更集而非直接写入                                  | P1     |
| REQ-S-026 | 上下文压缩前必须能触发 handoff/dream                                      | P2     |
| REQ-S-027 | 自进化过程必须可观测：谁、改了什么、为什么、结果                          | P1     |
| REQ-S-028 | 用户专属动作（forget/rewind/compact/asleep/end）不得由 agent 代做         | P0     |
| REQ-S-029 | 单层失败不得拖垮整个 host                                                 | P0     |
| REQ-S-030 | 复刻必须提供可执行的验收测试与失败注入                                    | P0     |

---

## 2. 术语、不变量与边界

### 2.1 术语

| 术语                      | 定义                                                                           | 唯一真相                                  |
| ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| 自进化（self-evolution）  | agent 在不丢失会话的前提下，修改自己的知识、指令、工具或运行时代码，并验证结果 | 本 spec                                   |
| 记忆（memory）            | root 会话上的持久决策/事实/教训，按 slug 索引                                  | `lineage.memory` 文档                     |
| brief                     | 新 branch 从 root 记忆开始的压缩上下文（索引 + 最近 landing）                  | 由 `memoryBrief()` 生成                   |
| tally                     | root 会话累积的 branch/abstract/landing 历史                                   | `lineage.tally` 文档 + root entries       |
| dream                     | 一次反思工作会话：读历史、跑六 passes、写 journal、提 proposals                | `dream.sessions` 文档                     |
| handoff                   | @ultimate 在上下文满之前写下的交接文本（≤12,000 字符）                         | `dream.sessions[session].handoff`         |
| code swap                 | supervisor 用新 core 进程替换旧 core，保留同一 SQLite                          | supervisor + generation                   |
| hot reload                | 不重启进程，重新加载 extension/facet 或指令                                    | Vite / facet registry                     |
| facet                     | 扩展的 server 侧或 web 侧实现                                                  | `extensions/<name>/server.ts` / `web.tsx` |
| generation                | 每次 core 启动递增的代号                                                       | `ULTIMATE_GENERATION`                     |
| self-modification surface | 一类可被 agent 修改的东西                                                      | §3.1 表                                   |

### 2.2 不变量（复刻时必须保持）

| ID       | 不变量                                                                                                              | 强制点                                                                                          | 违反症状                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| INV-S-01 | 记忆只存在于 root 会话的 `lineage.memory`；fork 初始为空                                                            | `Memory` doc `fork: 'initial'`（`extensions/lineage/memory.ts:27-35`）                          | 子会话各自有一份记忆，branch 行为漂移      |
| INV-S-02 | 记忆批次全有或全无：先对"批次完成后的状态"整体校验，再写                                                            | `applyMemoryOps`（`extensions/lineage/memory.ts:156-192`）                                      | 半批写入，索引与正文不一致                 |
| INV-S-03 | 只有 standing `ultimate` 能写记忆；其他 agent 只能读/请求                                                           | `remember` 工具检查 `Standing['ultimate']`（`extensions/lineage/server.ts:1738-1747`）          | branch 绕过 @ultimate 改项目记忆           |
| INV-S-04 | 记忆上限 150；slug `^[a-z0-9][a-z0-9-]{0,47}$`；line ≤120；body ≤2000                                               | `extensions/lineage/memory.ts:20-24,72-112`                                                     | 记忆无限膨胀，brief 撑爆上下文             |
| INV-S-05 | 系统提示在构建之间保持不变；构建/指令/文档变化作为**输入条目**注入，不改 section                                    | `prompt.build`（`extensions/prompt/server.ts:215-262`）；README 说明                            | 每次热重载重写 prompt cache，成本暴涨      |
| INV-S-06 | 只有 @ultimate 的定义文本会热更新到运行中的会话；其他 agent 保持启动时指令                                          | `instructionChanges()`（`prompt/server.ts:139-164`）                                            | 运行中的 worker 被悄悄换指令，行为不可复现 |
| INV-S-07 | 定义发现顺序 builtin → user → project，后者同名覆盖；overlay 只能追加，不能删/改基础指令                            | `discoverAgents()`（`lib/agents.ts:330-420`）；`parseOverlay()`（`300-317`）                    | 项目覆盖丢失基础能力，或无法审计           |
| INV-S-08 | 扩展以目录为部署单位；server facet 失败保留上一版本，web facet 失败显示错误卡，其余继续                             | `server/extensions.ts`；registry                                                                | 一个扩展拖垮整个 UI                        |
| INV-S-09 | `server/`、`shared/` 变更必须 restart；`web/`、`extensions/`、`agents/` 热重载                                      | `extensions/self/server.ts:19-38`；`AGENTS.md` reload 表                                        | 改了核心但没生效，或为 UI 改动重启丢流     |
| INV-S-10 | restart 必须：类型检查 → 新 core prepared → 旧 core 持久记录批准 → 旧 core release → 新 core 打开同一存储           | `bin/ultimate.ts:394-457`；`server/supervisor-protocol.ts:32-61`                                | 新旧 core 同时写库，数据损坏               |
| INV-S-11 | restart 的 replay 安全：swap 前 memo 目标 generation，重放只报告不再次 swap                                         | `extensions/self/server.ts:64-102`                                                              | 重启后重放工具调用导致无限重启             |
| INV-S-12 | 行为/代码修改必须走 branch → coordinator →（worker/designer）→ review → lander → submit；@ultimate 不直接改产品代码 | `agents/ultimate.md:36-42`；`agents/coordinator.md:8-71`                                        | 未经审查的代码直接进主分支                 |
| INV-S-13 | UI 变更必须经过用户预览批准（`ui-preview-round`）；检查、review、截图都不等于批准                                   | `agents/coordinator.md:79`                                                                      | 用户没看过的 UI 被提交                     |
| INV-S-14 | dream 本身不改代码、记忆、设置；只产出 journal 和 proposals                                                         | `extensions/dream/DREAM.md:5-7,58-62`                                                           | 反思变成无人监督的自动改写                 |
| INV-S-15 | 每次 landing 最多触发一次记忆蒸馏；失败不阻塞 landing                                                               | `Memorized` receipt family（`extensions/lineage/memory.ts:37-50`）；`memorizeTask`（`320-431`） | 重复蒸馏/landing 被记忆失败拖垮            |
| INV-S-16 | upstream update 只 fast-forward，不 stash/rebase/reset；拒绝条件优先于执行                                          | `extensions/update/README.md` "Updating" 节                                                     | 更新覆盖本地未提交工作                     |

### 2.3 安全边界（治理模型）

| 动作                              | 谁能做                                             | 生效方式                              | 证据                                                                             |
| --------------------------------- | -------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| 写项目记忆                        | 仅 standing `ultimate`                             | 立即（文档提交）                      | `lineage/server.ts:1738-1747`                                                    |
| 删除记忆 / go back / compact root | 仅用户（见 §6.5）                                  | 立即                                  | `lineage/server.ts:102-103,1340-1349`                                            |
| 保存/删除 agent 定义              | 用户或 agent（经 UI action / 文件写入）            | 下一次启动子 agent 时读取             | `subagents/README.md` "Definitions are shared profiles"；`lib/agents.ts:486-618` |
| 写技能                            | 用户或 @ultimate（配置层）                         | 下一次请求的技能列表                  | `server/skills.ts:13-54`                                                         |
| 写扩展/表面                       | 必须走 branch（即使放在 `.ultimate/`）             | server facet 重载；web facet HMR      | `agents/ultimate.md:40`；`docs/extensions.md:3-8`                                |
| 改核心代码                        | 必须走 branch → review → lander                    | restart（core swap）                  | `self/server.ts:41-129`；`AGENTS.md`                                             |
| 上游更新                          | 用户点击或 agent 调用 `update`                     | fast-forward + 可选 install + restart | `extensions/update/README.md`                                                    |
| 批准 dream proposal               | 用户（hands-off goal 时 @ultimate 代决并记录理由） | 生成 branch 或 `remember`             | `extensions/dream/DREAM.md:38-51`                                                |

> 关键设计：**权限不是靠提示词，而是靠写入口**。`remember` 即使被 branch 用 `tool_search` 找到，也会在 execute 里检查调用者；这是"模型可能不守规则"时的最后一道门。

---

## 3. 机制分析

### 3.1 六类自修改面

| 层           | 修改对象                                           | 持久化                          | 生效代价                          | 谁可以改                     | 回滚                           |
| ------------ | -------------------------------------------------- | ------------------------------- | --------------------------------- | ---------------------------- | ------------------------------ |
| L1 记忆      | 决策/事实/教训                                     | `lineage.memory`（SQLite 文档） | 立即；下一次 branch 的 brief 生效 | @ultimate（用户可 `forget`） | 再写一批相反 op；用户 forget   |
| L2 指令      | `agents/*.md`、技能 `SKILL.md`、`AGENTS.md`        | 文件系统                        | 下一次请求/下一次子 agent 启动    | 用户 / @ultimate（配置）     | 删文件或改回；项目层覆盖       |
| L3 配置      | settings、扩展开关、trust、模型                    | JSON 文件                       | 热重载（部分需重启）              | 用户 / @ultimate             | 改回 JSON                      |
| L4 扩展/表面 | `extensions/<name>/{server,web,api,refs,ui}.ts(x)` | 文件系统                        | server facet 重载；web HMR        | 只能走 branch                | 删除目录 / 回滚提交            |
| L5 核心      | `server/`、`shared/`、`web/`                       | Git 仓库                        | restart（core swap）              | 只能走 branch + lander       | 回滚提交 + restart             |
| L6 上游      | clone 的 `origin`                                  | Git                             | fast-forward + install + restart  | 用户 / agent `update`        | 不自动回滚；拒绝执行是主要保护 |

**分层原则**：能用 L1 解决的不要用 L2，能用 L2 解决的不要用 L4，能用扩展解决的不要改 L5。原因不是"代码更贵"，而是**每上升一层，验证面、回滚成本和用户可见风险都指数上升**。`agents/ultimate.md:36-42` 把这条写成产品规则："配置自己写，会运行的代码交给 coordinator branch"。

### 3.2 上下文与指令装配

#### 3.2.1 系统提示的组成

Ultimate 的 system prompt 由多个 section 组成，每次请求前渲染（`extensions/prompt/server.ts:264-374`）：

| 顺序 | section           | 内容                                                       | 复刻要点                      |
| ---- | ----------------- | ---------------------------------------------------------- | ----------------------------- |
| 1    | `identity`        | 身份、项目专属化目标、`.ultimate/` 路径                    | 让 agent 知道"改哪里、为谁改" |
| 2    | `principles`      | 先理解再改、最小实现、快速验证、不谎报成功、审美           | 行为准则，不是代码            |
| 3    | `self_awareness`  | 长会话、压缩、steering/follow-up、durable task、build note | 让 agent 理解自己的运行机制   |
| 4    | `tools`           | 按可用工具生成指引                                         | 工具描述与真实能力一致        |
| 5    | `project_context` | `AGENTS.md` 等，带 `<project_instructions path>`           | 项目规则优先于通用规则        |
| 6    | `skills`          | 技能名+描述+路径；无读取工具则不列                         | 技能是"按需加载的过程知识"    |
| 7    | `building_blocks` | 已安装但关闭的扩展及一句话说明                             | 让 agent 知道可启用的能力     |
| 8    | `environment`     | cwd、host project、running host、UI URL                    | 区分"工作区"与"运行中的 host" |
| 9    | `cwd`             | 当前工作目录                                               | 工具相对路径的锚              |

扩展还可以追加 section（如 `self`、`subagent_state`、`lineage`、`plan`、`workspace_workflow`）。复刻时保留**section 注册机制**，不要把所有文本硬编码进一个大字符串。

#### 3.2.2 为什么构建变化不写进 system prompt

热重载/重启会改变 build id。如果 build id 出现在 system prompt 里，每次重载都会让整个 prompt cache 失效，成本和延迟都会爆炸。Ultimate 的做法：

1. system prompt 跨构建保持字节稳定；
2. `prompt.build` 文档记录每个会话上次看到的 build id、clone HEAD、指令/文档文件哈希（`prompt/server.ts:31-40,218-261`）；
3. 在下一次输入提交的同一事务里，插入一条 `prompt.build` entry，模型文本说明 "Build changed: a → b · generation N · changed: …" / "Instructions changed: …" / "Docs changed: …" / "landed: …"；
4. 这条 entry 在用户输入之前，因此模型先看到变化说明，再看到用户请求。

复刻要点：**变化说明是"输入的一部分"，不是"系统提示的一部分"**。这是缓存稳定与自我感知的折中。

#### 3.2.3 指令热更新

只有 primary agent（standing `ultimate`）会在每次输入前重新应用其定义文本：

```ts
// 伪代码，对应 prompt/server.ts:144-164
if (standing['ultimate'] !== conversationId) return noChanges
definition = discoverAgents().find('ultimate')
if (agentDoc(conversationId).instructions !== definition.instructions)
  configure(tx, conversationId, { instructions: definition.instructions })
```

其他 agent（worker/scout/...）保持启动时指令，直到下一次启动。这是一个**有意的可复现性选择**：运行中的任务不应在背后换规则。

#### 3.2.4 触发与失败

- 触发：每次 `GenerationTask.beforeInput`（包括排队输入）。
- 失败：文件读不到按"已删除"处理；hash 记录仍更新；不会阻塞输入。
- 证据：`prompt/server.ts:215-262`、`prompt/server.ts:120-197`、`extensions/prompt/README.md`。

### 3.3 记忆子系统

#### 3.3.1 数据模型

```ts
type MemoryKind = 'decision' | 'fact' | 'lesson'
type MemoryItem = {
  kind: MemoryKind
  line: string // 1 line, ≤120 chars
  body: string // ≤2000 chars
  source?: string // "#<conversation>/<entry>"
  updated: number // epoch ms
}
type MemoryDoc = { memories: Record<string, MemoryItem> } // ≤150
```

约束（`extensions/lineage/memory.ts:20-24,72-112`）：

- slug：`^[a-z0-9][a-z0-9-]{0,47}$`
- `add` 必须带 kind/line/body；`update` 至少改一个字段；`delete` 只带 slug
- `source` 必须匹配 `^#\d+(/\d+)?$`
- 整批校验通过才写；任一条不合法 → 整批拒绝，错误带 op 序号

#### 3.3.2 写路径

```
agent 调 remember {ops}
  → 检查 caller == Standing['ultimate']（else 拒绝）
  → 解析 root：显式 root > 调用者树根 > 项目唯一 root > 错
  → api.commit(tx => applyMemoryOps(tx, root, ops))
      → 校验 root 在 lineage.roots
      → 逐 op 在副本上应用，校验 add 重复 / update/delete 缺失 / 上限
      → 一次性写 doc.memories
  → 返回 "Added x; updated y; deleted z in #R's memory."
```

注意：`remember` 是 deferred tool，但不是安全边界；安全边界是 execute 内的 caller 检查（`lineage/server.ts:1739-1744`）。复刻时不要只靠"工具不暴露给 branch"。

#### 3.3.3 读路径与 brief

- `memory` 工具：无 `read` 返回索引（按 slug 排序，一行一条）；有 `read` 返回全文 + source（`lineage/server.ts:1697-1727`）。
- 新 branch 从 root 分叉时：
  - 若 root 有记忆 → 生成 `memoryBrief`：`<project_memory root="#R">` + 索引 + 最近 10 条 landing + 指向完整 tally 的说明（`extensions/lineage/memory.ts:240-257`）。
  - 在 fork 点之后插入一个 `pi.reset`（`head:'self'`），模型文本就是 brief；branch 的模型上下文从这里开始（`lineage/server.ts:912-960`）。
  - 若 root 无记忆 → 沿用 tally 上下文。
- brief 的 token 数会记录在 `lineage.tally.briefTokens`，sidebar 的 Memory 行显示"新 branch 从多少 token 开始"（`lineage/README.md` "Tally" 节）。

复刻要点：**brief 不是摘要，是索引**。完整正文仍可通过 `memory {read}` 读取，完整历史仍可通过 `ultimate.entries(root)` 读取。这样 brief 小、可导航、不会丢信息。

#### 3.3.4 自动蒸馏（landing → memory）

每次 `workspaces.landed`：

1. `lineage/memorize` reactor 在 root 上创建一个后台 `lineage.memorize` task；
2. `Memorized` receipt family 以 submission 为 key，保证一个 landing 只蒸馏一次，永不驱逐（`extensions/lineage/memory.ts:37-50`）；
3. task 读取 landing note、submitter 的 abstract（冻结或开放的）、当前全部记忆；
4. 调 summary model，system prompt 要求只输出 JSON `{"ops":[...]}`，默认 `{"ops":[]}`，优先 update 而非重复 add，达到上限时合并（`extensions/lineage/memory.ts:259-272`）；
5. 解析答案（允许一个 code fence / 裸数组；两个 fence 或多对象拒绝）；
6. `normalizeMemoryOp` 先修剪超长 line/body、kebab-case 非法 slug（自动路径不拒绝，宁可缩短）；
7. `applyMemoryOps` 在同一 completion commit 中应用；失败则重试一次（带拒绝原因），再失败只发 notice，不影响 landing。

这是"自进化"里最像生物记忆的一环：**不需要人教，每次合并代码都会沉淀项目知识**。

#### 3.3.5 记忆审查

- 由 @ultimate 启动一个 review branch，读索引/正文、项目上下文、旧会话、代码、`git log`；
- 逐条事实核查：仍成立 / 过时（带证据）/ 被后续决策推翻；
- 只返回 add/update/delete ops + 一行理由 + 证据，不写；
- @ultimate 转述给用户，用户决定后用一批 `remember` 应用（`lineage/README.md` "Memory review"）。

复刻要点：**写入与审查分离**。审查 branch 没有写权限，避免"自己审自己"。

### 3.4 Dream 反思子系统

#### 3.4.1 定位

Dream 是"工作会话"，不是自动改代码。它读回项目历史、记忆、失败、工具使用，写一份 journal，提出变更建议；用户逐条决定，批准的变成普通 branch。`extensions/dream/DREAM.md:1-7` 明确："Nothing changes code, memory or storage by itself."

#### 3.4.2 触发

| 触发         | 条件                                                                      | 入口                                      |
| ------------ | ------------------------------------------------------------------------- | ----------------------------------------- |
| 用户按 Dream | Memory 面板 / ⌘K "Dream…"                                                 | user-only `start` action                  |
| 上下文将满   | `context` condition `of: '@ultimate', above: 70`                          | 内置 automation "Dream before compaction" |
| 用户离开很久 | "Dream after a pause"：50% + 8h idle                                      | 内置 automation                           |
| 自动开始     | handoff 记录后，且没有其他会话在工作；30 分钟没 handoff 则无 handoff 启动 | `dream.started` input                     |

#### 3.4.3 会话状态机

```
(none)
  └─ start/handoff request → waiting
       ├─ handoff 记录 → 等待所有会话空闲 → session created
       ├─ 30min 超时 → session created (handoff.missing)
       └─ 用户 end → ended
session:
  open ──journal filed──> open (proposals open)
    ├─ 每条 proposal: open → approved/rejected/applied/landed
    ├─ 全部 settled → endedAt = now
    └─ 用户 end → ended
ended:
  └─ asleep（仅当 journal 已归档、所有 proposal settled、无其他工作、gate 通过）
       phases: seeding → checking → backing up → switching → asleep
                └─ 失败 → failed（保留原因）
```

证据：`extensions/dream/refs.ts:41-95`、`extensions/dream/server.ts:55-87,126-144,185-288,384-470`。

#### 3.4.4 六 passes

Dream branch 并行启动 6 个 `dream-pass` 子 agent（`agents/dream-pass.md`），每个聚焦一个维度：

| pass        | 问题                                                          | 产出                           |
| ----------- | ------------------------------------------------------------- | ------------------------------ |
| memory      | 哪些记忆过时/矛盾/重复/太模糊？哪些教训没人记？               | 记忆 ops + 理由 + 证据         |
| failures    | 什么经常失败？watchdog/trace/retry/lander rejection/用户 stop | 按原因分组，top 原因给修复建议 |
| tools       | 工具调用数、失败率、耗时、从未调用的工具                      | 教/删/补工具的建议             |
| corrections | 用户重复纠正什么？agent 反复手做什么？                        | 流程/工具/指令改进             |
| codify      | 哪些记忆应变成代码/lint/定义/技能，而不是继续靠记？           | 代码/规则/定义/技能/保留记忆   |
| project     | 这个项目里反复出现的手工步骤、环境坑、用户重复要求            | 在 `.ultimate/` 构建什么       |

每个 pass 的 brief 必须先读 @ultimate 的 handoff，再用 codemode/trace/memory/git 验证 handoff，不能盲信。每条主张引用 `#conversation/entry`、trace error、commit 或 `path:line`（`extensions/dream/DREAM.md:81-115`）。

#### 3.4.5 Journal 与决策

`journal` 只写一次（重复调用返回已归档的 journal）：

- `learned`：恰好三行，Ultimate 自己的口吻；
- `text`：Markdown，每个 pass 一节；
- `proposals`：每条 `{id, pass, title, size, risk, retire?}`；
- `chapter`：2–3 个 lowercase、dash-separated 的词，≤40 字符。

`decide` 的合法状态：`approved`（带 branch）、`rejected`、`applied`（记忆已改）、`landed`（带 sha；branch 在 lander 之外落地）。`landed` 由 `dream/landed` reactor 在 branch submission 落地时自动标记。

#### 3.4.6 Fall asleep（章节切换）

只有用户能按；agent 只能询问。条件：

- journal 已归档；
- 所有 proposal settled；
- 没有其他会话在工作；
- gate 通过：seed → scratch preview（一次修复机会）→ final backup → 再次确认无工作 → journaled restart。

`restartChapter` 用 `host.restart` 做 journaled restart；成功后进程直接进入新 generation，失败则回滚并 settle。复刻时这是最高风险动作，必须保留"journal + 审批 + 回滚"三件套。

### 3.5 Agent 定义与技能

#### 3.5.1 Agent 定义

格式：Markdown + YAML frontmatter（`lib/agents.ts:245-275`）：

```yaml
---
name: worker
description: Implement one bounded task...
model: provider/model # 可选；Pi resolveCliModel 支持模糊名/:thinking
thinking: high # off|minimal|low|medium|high|xhigh|max
tools: [read, bash, edit] # 可选；省略=继承父级
denyTools: [instance] # 可选；从显式或继承集合移除
isolate: worktree # none|worktree
resident: true # 常驻 agent
onFailure: diagnose # 仅 lander
fast: true # 优先队列
summaries: false # 关闭自动摘要
---
<instructions>
```

发现顺序（`lib/agents.ts:330-343`）：

1. clone `agents/`
2. 启用扩展自带的 `agents/`
3. `~/.ultimate/agents/`
4. `<project>/.ultimate/agents/`（仅项目 setup 已信任）

后面的同名文件覆盖前面的；但如果文件含 `addTools`，它是 **overlay**：

- 只能覆盖 settings、追加 `addTools`、追加 `denyTools`、追加 body；
- 不能声明 `tools`，不能删除基础工具，不能改写基础指令；
- 基础定义保持唯一指令来源（`lib/agents.ts:295-317,345-420`）。

保存（`lib/agents.ts:486-618`）：

- 先按 discovery 的读取方式回读校验；失败不写；
- 内置定义永不改写：保存时写到 user/project scope，形成同名覆盖；
- 若已有 overlay，保存为 overlay diff，只写与基础不同的部分；
- overlay 无法表达"删除基础工具/重写基础指令"，此时报错并提示 Duplicate 或直接编辑基础文件。

生效时机：

- 子 agent：每次 `start` 重新读取定义（`subagents/README.md` "Definitions are reread on every start"）；
- 常驻 agent：每次 `standing(name)` 刷新配置，但已选模型/思考级别保留，除非定义 pin 了；
- @ultimate：下一次输入前热更新指令（§3.2.3）。

#### 3.5.2 技能

- 目录：`<clone>/skills/<name>/SKILL.md`、`<cwd>/.pi/skills`、`~/.ultimate/skills`、项目信任后的 `.agents/skills` 与 `.ultimate/skills`；后者同名覆盖（`server/skills.ts:13-54`）。
- `SKILL.md` frontmatter：`name`、`description`，可选 `disable-model-invocation`。
- 系统提示只列名称+描述+路径；agent 需要时用 `read`/shell 读取全文。
- `/skill:<name> args` 在提交时展开为 `<skill name location>…</skill>` + args（`server/skills.ts:61-70`）。

复刻要点：技能是**过程知识**，不是项目事实。项目事实进 memory；可复用的多步流程进 skill；会改变行为的代码进 extension/core。

### 3.6 扩展与 Surface

#### 3.6.1 目录与契约

```
extensions/<name>/
├─ api.ts       # 服务端契约（defineApi/defineDoc/defineEvent），供其他扩展 import
├─ refs.ts      # 浏览器安全契约（docRef/actionRef/defineEvent）
├─ ui.tsx       # 浏览器公共组件/hooks/points
├─ server.ts    # 服务端 facet：sections、tools、actions、hooks、tasks
├─ web.tsx      # 浏览器 facet：surfaces、panels、slots、renderers、commands
└─ README.md    # 机制与使用说明
```

- server facet：`defineExtension({ name, sections, tools, actions, docs, tasks, hooks })`；失败保留上一版本。
- web facet：`defineWebExtension({ ... })`；Vite HMR 原地替换；失败显示错误卡，其余继续。
- 扩展之间只允许通过 `api.ts`（server）或 `ui.tsx`（web）运行时导入；`pnpm deps` 检查循环与 core-tier 方向（`docs/extensions.md:64-101`）。

#### 3.6.2 热重载矩阵

| 变更                          | 生效方式                                                    | 是否丢会话                           | 证据                                              |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| `extensions/<name>/web.tsx`   | Vite HMR，registry.replace                                  | 否                                   | `web/src/extensions.ts`；`AGENTS.md`              |
| `extensions/<name>/server.ts` | 重新 `ssrLoadModule`，staging providers 后 dispose 旧 facet | 否；运行中的工具调用用旧代码完成     | `server/extensions.ts:108-775`                    |
| `extensions/<name>/api.ts`    | 随导入它的 facet 重载                                       | 否                                   | `docs/extensions.md`                              |
| `agents/*.md`                 | 下一次子 agent start / @ultimate 下一次输入                 | 否                                   | `subagents/README.md`；`prompt/server.ts:144-164` |
| `skills/*/SKILL.md`           | 下一次请求的技能列表                                        | 否                                   | `server/skills.ts`                                |
| `web/`                        | Vite HMR                                                    | 否                                   | `AGENTS.md`                                       |
| `server/`、`shared/`          | **必须 restart**                                            | 是（进程换代），但会话从 SQLite 恢复 | `self/server.ts:19-38`；`AGENTS.md`               |
| `bin/`                        | 人工 `pnpm start`                                           | 是                                   | `AGENTS.md`                                       |

#### 3.6.3 新 Surface

Surface 是整屏应用，通过 `web.tsx` 注册；对话本身是内置 `agent` surface。项目专属 surface 放 `<project>/.ultimate/extensions/`。复刻时保留：

- surface 注册表 + `mod+1…9` 切换；
- surface 只能由 SDK primitives 组合（Header/Sidebar/Conversation/Panels/StatusLine）；
- 失败回退到 Agent surface。

### 3.7 核心代码与热替换

#### 3.7.1 进程拓扑

```
supervisor (bin/ultimate.ts)
  ├─ TCP proxy :4747 (or next free)
  ├─ fork core (server/main.ts) generation N
  │    ├─ HTTP + Vite middleware + SSE
  │    ├─ Pi Durable Harness + SQLite state.sqlite
  │    └─ extensions loader
  └─ browser (React + SSE)
```

关键点：supervisor 不执行 agent 逻辑；core 无固定端口（`listen(0)`），对外始终是 supervisor 端口；一次只有一个 active core。

#### 3.7.2 restart 时序

```
agent: restart
  → self/server.ts 检查隔离 workspace（source/landed/clean/HEAD）
  → memo('restart:<taskId>', {generation, fromGeneration, build})
  → host.restart(approved)
      → requestSwap(approved, build)
          → send {type:'swap', requestId, build}
supervisor.swap:
  1. tsc --noEmit -p tsconfig.swap.json
  2. boot(previousBuild) → 新 core，generation+1
  3. prepare(next) → 等 'prepared'（已 listen）
  4. send old {swap-result ok:true, generation}
  5. 等 old 'swap-ack'（旧 core 已持久记录 approved）
  6. active=undefined；send old 'release'；等 'released'（≤10s）
  7. start(next)：send 'go' → 新 core 打开同一 SQLite → 'ready'
  8. exit(old)
失败:
  - 1-5 失败 → 不释放旧 core；返回错误，旧 core 继续
  - 6 之后失败 → send old 'reacquire'；旧 core 重新 open storage；还不行则 kill + recover
```

证据：`bin/ultimate.ts:394-457`、`server/supervisor-protocol.ts:32-61`、`server/main.ts:219-250`、`server/harness.ts:190-192`。

#### 3.7.3 为什么不会丢会话

- 所有对话/工具调用/子 agent 在展示前已提交到 SQLite；
- 换代的唯一空窗是 storage lock 释放到新 core 打开；supervisor 用 `pending` 队列挂起连接；
- 浏览器 SSE 断开后自动重连，新 core 从同一 SQLite 恢复；
- 旧 core 在 release 前必须持久记录 approved，保证重放不会再次 swap。

#### 3.7.4 失败矩阵

| 失败点                             | 行为                                                    | 用户可见                          |
| ---------------------------------- | ------------------------------------------------------- | --------------------------------- |
| 无 supervisor（`pnpm dev`）        | `requestSwap` 返回 "Restart requires pnpm start"        | 工具错误                          |
| 类型检查失败                       | 不启动新 core；返回 tsc 尾部                            | 工具错误 + 旧 core 继续           |
| 新 core prepare 失败               | kill next；旧 core 继续                                 | 错误 + 旧 core                    |
| 旧 core release 后新 core 启动失败 | `reacquire` 旧 core；重开 storage，带 `activationError` | 状态行 `restart failed` + popover |
| reacquire 也失败                   | kill + `recover()`（指数退避 3 次）                     | 崩溃页                            |
| 隔离 workspace 未 land             | 拒绝并提示先 land                                       | 工具错误                          |
| 重放时 generation 不符             | 返回 `rolledBack` + activationError                     | 工具卡显示回滚                    |

### 3.8 上游更新

`extensions/update` 的职责：让 clone 跟 `origin` 保持同步，但**只 fast-forward**。

检查：

- 每 5 分钟 + 启动后 30 秒比较 `origin/<default>`；本地比较不花钱；
- 只有 `.git/FETCH_HEAD` 超过 1 小时才 fetch；clone-wide lock 防并发；
- 新 range 用 summary model 生成 2–4 行摘要，缓存到 `.git/ultimate-update-summary.json`。

更新（`update` action）：

1. fetch origin；
2. `git merge --ff-only`；
3. 若 `pnpm-lock.yaml` 与已安装不同 → `pnpm install --frozen-lockfile`。

拒绝条件（不改变任何东西）：

- clone 有 tracked 文件未提交；
- 不在默认分支 / detached；
- 与 origin 分叉；
- lander 正在 landing 到 clone；
- 另一个 Ultimate 持有 clone lock。

更新后：若改了 `server/` 或 lockfile，状态行提示 `updated · restart`；不自动重启。若分叉且 clone 就是当前项目，提供 "Update with @ultimate"：启动一个 coordinator branch 做正常 merge（绝不 rebase/reset/force push），解决冲突、跑检查、`workspace submit`。

复刻要点：**更新是"用户可见的、可拒绝的、非破坏性的"**。不要把自动更新做成静默 force pull。

### 3.9 验证闭环

自进化的质量不取决于"能改"，而取决于"改完怎么知道没坏"。Ultimate 的验证栈：

| 闸门          | 工具/扩展                              | 作用                                       | 证据                                                        |
| ------------- | -------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| 静态检查      | `pnpm check`（format/lint/types/deps） | 提交前必过                                 | `AGENTS.md`                                                 |
| 单元/集成测试 | `pnpm test`                            | 快速、无真实等待                           | `AGENTS.md`                                                 |
| e2e           | `test/e2e`                             | 真实进程/浏览器                            | `AGENTS.md`                                                 |
| 预览          | `instance start`                       | 起第二个 Ultimate，真实 UI 验证；最多 3 个 | `extensions/instance/README.md`                             |
| UI 预览轮     | `ui-preview-round` skill               | 用户点击批准；检查/review 不算批准         | `agents/coordinator.md:79`                                  |
| 代码评审      | `reviewer` / review team               | 只读 commit range，返回一个裁决            | `agents/reviewer.md`；`extensions/subagents/README.md`      |
| 落地          | `workspace submit` → lander            | 合并、全量检查、fast-forward、push         | `extensions/workspaces/README.md` "Lander"                  |
| 运行监控      | `watchdog`                             | provider 失败重试/失败卡；idle branch 提示 | `extensions/watchdog/README.md`                             |
| 自我诊断      | `debug` / `trace` / `system`           | 事件、reactor lag、API catalogue、调用树   | `extensions/debug/README.md`；`extensions/system/README.md` |

复刻顺序建议：先有静态检查和测试，再有 preview，再有 review/lander。没有验证栈的自进化等于让模型直接改生产。

### 3.10 自我改进的"提案回路"

`agents/ultimate.md:107-109` 要求：当 agent/flow 不稳定（丢答案、重复唤醒、规则被忽略）或看到更顺的路径时，用 `debug` 收集证据，向用户提**一个具体改进**，由用户决定，批准后开 branch。

这条规则把"自进化"从"改代码"提升为"**基于运行证据的改进循环**"：

```
症状（用户抱怨/失败卡/重复唤醒）
  → debug: events / reactor lag / trace / API catalogue
  → 定位机制缺口（不是表面 bug）
  → 一个具体提案（含证据、影响、风险）
  → 用户批准
  → branch（评估 → 计划 → 实现 → review → land）
  → 下次 dream 复盘是否真的改善
```

复刻时，把"提案"做成持久记录（dream proposal 或 goal decision），否则改进会停留在聊天里。

### 3.11 并发与串行化点

| 资源          | 串行化方式                                      | 原因                           |
| ------------- | ----------------------------------------------- | ------------------------------ |
| core 生命周期 | supervisor 单 `swapping` 标志；一次只换一个     | 两个 core 同时写 SQLite 会损坏 |
| 扩展 reload   | 单 Promise 链，失败继续下一个                   | 避免新旧 facet 交错            |
| 事件 reactor  | 每个 reactor 一条链，一次一个事件、一事务一事件 | cursor 与写入同事务            |
| 记忆写入      | 单 SQLite 事务；`applyMemoryOps` 全有或全无     | 批次原子性                     |
| dream 启动    | `waiting` 只允许一个；open session 只允许一个   | 防止并发反思                   |
| 上下文压缩    | 每个会话最多一个 compaction task                | 防止摘要互相覆盖               |
| UI 状态写入   | 单批 in-flight；服务端 `ui.rev` 递增            | 防止 last-write 乱序           |
| 预览实例      | 最多 3 个；每实例独立 home                      | 防止端口/存储冲突              |

复刻时如果宿主没有事务，用"单写线程 + outbox + 幂等键"替代；不要用内存锁假装持久化。

### 3.12 非功能预算（设计目标）

| 指标         | 预算          | 说明                              |
| ------------ | ------------- | --------------------------------- |
| 记忆批量写入 | p95 < 20 ms   | 150 条以内、单事务                |
| 记忆索引读取 | p95 < 10 ms   | 索引已在内存/文档快照             |
| brief 生成   | p95 < 50 ms   | 10 条 landing + 150 条索引        |
| prompt 装配  | p95 < 50 ms   | 不含 provider 网络                |
| facet 热重载 | < 2 s         | 单扩展，Vite 已热                 |
| core swap    | < 10 s        | 含 tsc + prepare + release + open |
| 崩溃恢复     | < 5 s         | SQLite 打开 + onOpen 扫描         |
| 记忆上限     | 150 条 / root | 超过必须合并/删除                 |

这些是设计目标，不是实测；复刻后必须用基准脚本替换为实测值。

---

## 4. 复刻数据契约

以下类型是**语言无关的逻辑契约**；TypeScript 仅作为精确表达。

### 4.1 记忆

```ts
export type MemoryKind = 'decision' | 'fact' | 'lesson'

export interface MemoryItem {
  kind: MemoryKind
  line: string
  body: string
  source?: string
  updated: number
}

export interface MemoryDoc {
  memories: Record<string, MemoryItem>
}

export type MemoryOp =
  | { op: 'add'; slug: string; kind: MemoryKind; line: string; body: string; source?: string }
  | { op: 'update'; slug: string; kind?: MemoryKind; line?: string; body?: string; source?: string }
  | { op: 'delete'; slug: string }
```

JSON 示例：

```json
{
  "memories": {
    "pnpm-only": {
      "kind": "decision",
      "line": "The project uses pnpm, never npm",
      "body": "Install and run scripts with pnpm.\nnpm lockfiles are deleted.",
      "source": "#12/345",
      "updated": 1761580800000
    }
  }
}
```

蒸馏回执（每个 landing 一条，永驱逐；key 为 submission id）：

```ts
export interface MemorizedReceipt {
  task?: number // 已创建的蒸馏 task id
}
export type MemorizedDoc = Record<string, MemorizedReceipt>
```

文档版本：`version: 1`；迁移只向前，不自动降级；存储迁移前必须备份（dream 的 Fall asleep gate 含 final backup）。

### 4.2 构建/指令变化说明

```ts
export interface BuildNote {
  from?: string // previous build id
  to?: string // current build id
  landed?: { sha: string; title: string; conversation?: number }[]
  instructions?: string[] // changed definition files
  docs?: string[] // changed docs/context files
}

export interface SeenBuild {
  id?: string
  head?: string
  files?: Record<string, string> // absolute path -> digest
}
```

### 4.3 Dream

```ts
export type PassName = 'memory' | 'failures' | 'tools' | 'corrections' | 'codify' | 'project'
export type PassState = { status: 'waiting' | 'running' | 'done' | 'failed'; note?: string }

export interface Proposal {
  id: string
  pass: PassName
  title: string
  size: 'S' | 'M' | 'L'
  risk: string
  retire?: string
  status: 'open' | 'approved' | 'rejected' | 'applied' | 'landed'
  branch?: number
  sha?: string
  reason?: string
}

export interface Journal {
  learned: string[]   // exactly 3
  text: string        // markdown
  chapter?: string    // 2-3 lowercase dash words, <=40 chars
  at: number
}

export interface Handoff {
  task: number
  text?: string
  at?: number
  missing?: string
}

export interface DreamSession {
  id: number
  startedAt: number
  endedAt?: number
  dreamer?: number
  passes: Record<PassName, PassState>
  journal?: Journal
  proposals: Proposal[]
  handoff?: Handoff
  sleep?: { phase: 'seeding' | 'checking' | 'backing up' | 'switching' | 'asleep' | 'failed'; ... }
}

/** `dream.sessions` on conversation 1: the next id, every session, and the one waiting for a handoff. */
export interface DreamSessionsDoc {
  next: number
  sessions: DreamSession[]
  waiting?: {
    at: number
    task: number
    automation?: { id: number; name: string }
    handoff?: { text: string; at: number }
  }
}
```

### 4.4 扩展清单

```ts
export interface ExtensionInfo {
  name: string
  path: string
  source: 'builtin' | 'user' | 'project'
  enabled: boolean
  core: boolean
  files: string[]
  tools?: string[]
  sections?: string[]
  docs?: string[]
  server?: { error?: string }
  web?: { error?: string }
}
```

### 4.5 重启请求

```ts
export interface RestartMemo {
  generation: number
  fromGeneration: number
  build: string
}
```

### 4.6 配置（L3）

```ts
export interface SettingsFile {
  extensions?: { enable?: string[]; disable?: string[] }
  summaryModel?: { provider: string; modelId: string } | null
  instance?: { model?: string | null }
  isolates?: { worktree?: { setup?: string[] } }
  defaultSurface?: string
}
```

规则：

- 两个文件：`~/.ultimate/settings.json`（用户）与 `<project>/.ultimate/settings.json`（项目）；项目优先，但只有项目 setup 已信任才加载（`server/project-setup.ts`）。
- `core` tier 扩展永远启用；`disable` 里的 core 项被忽略并成为 diagnostic。
- 配置变化经 `reloadSettings()` 生效；扩展启用/禁用热重载，影响 `bin/` 或依赖安装的变更需 restart（`extensions/update/README.md`）。
- 配置写入必须先回读校验；非法 JSON 不覆盖旧文件。

### 4.7 宿主原语（复刻的最小依赖）

复刻不需要 Pi Durable，但必须提供等价语义。以下接口是**唯一允许依赖的宿主能力**：

```ts
export interface DurableHost {
  /** One serializable transaction: docs/tasks/events/conversations written together or not at all. */
  commit<T>(fn: (tx: Tx) => Promise<T>): Promise<T>

  /** Conversation-scoped document with rewindable history and fork policy. */
  doc<T>(ref: DocRef<T>, conversationId: number): Promise<T>

  /** A durable task with phase/checkpoint, background/ownership and replay-safe execution. */
  createTask<I, S>(def: TaskDef<I, S>, input: I, options: TaskOptions): Promise<TaskId>

  /** Append a durable event inside a commit; reactors consume it exactly once per cursor. */
  emit<E>(tx: Tx, event: EventDef<E>, data: E): Promise<void>

  /** Create/fork a conversation, configure agent, and read/write entries. */
  conversation(id: number): Promise<Conversation>
}

export interface TaskOptions {
  ownership: { kind: 'conversation' } | { kind: 'task'; taskId: TaskId }
  background: boolean
}

export interface Conversation {
  id: number
  submit(input: Input, ctx: Context): Promise<Submission>
  waitForIdle(ctx: Context): Promise<void>
  viewState(ctx: Context): Promise<{ value: { entries: Entry[] }; dispose(): void }>
}

// Minimal supporting types; a host may map these to its own records.
type DocRef<T> = { kind: string }
type TaskDef<I, S> = {
  name: string
  version: number
  initial: (input: I) => S
  phases: Record<string, unknown>
}
type EventDef<E> = { name: string; version?: number }
type Entry = { id: number; kind: string; data?: unknown }
type Input = { type: 'input'; content: string; requestId?: string; whenBusy?: 'steer' | 'followUp' }
type Submission = {
  id: number
  status: 'queued' | 'placed' | 'done' | 'unanswered'
  answer?: number
}
```

不变量：

- `commit` 是唯一的持久写边界；任何跨文档/任务/事件的写必须在一个 commit 内。
- `doc` 必须有 `fork: 'initial' | 'asOf' | 'current'` 语义；记忆/索引类文档用 `initial`。
- `createTask` 必须支持 `background` 与 `checkpoint`；replay 从最后 checkpoint 继续。
- `emit` 必须与状态变更同 commit；reactor 的 cursor 与写入同事务。
- `conversation.submit` 必须支持 `requestId` 去重与 `whenBusy: 'steer' | 'followUp'`。

---

## 5. 状态机

### 5.1 记忆写入

| 当前       | 事件                 | 守卫                                         | 下一              | 副作用                 |
| ---------- | -------------------- | -------------------------------------------- | ----------------- | ---------------------- |
| idle       | `remember(ops)`      | caller == @ultimate；root 合法；批次校验通过 | committed         | 写 doc；返回摘要       |
| idle       | `remember(ops)`      | 任一 op 非法                                 | idle              | 抛错，零写入           |
| committed  | 重放同一 task        | memo 命中                                    | committed         | 返回同一结果，不再写   |
| idle       | `forget(root, slug)` | 用户 action；slug 存在                       | committed         | 删除一条               |
| idle       | landing event        | receipt 不存在                               | distilling        | 建 task                |
| distilling | model answer ok      | ops 可解析且 apply 成功                      | committed         | 写记忆；receipt        |
| distilling | model answer bad     | 第一次                                       | distilling(retry) | 带拒绝原因重问         |
| distilling | retry bad            | 第二次                                       | idle              | notice；不阻塞 landing |

### 5.2 Dream 会话

| 当前    | 事件                     | 守卫                                          | 下一    | 副作用                                     |
| ------- | ------------------------ | --------------------------------------------- | ------- | ------------------------------------------ |
| none    | start                    | 无 open session；无其他工作                   | waiting | 记录 waiting；向 @ultimate 发 handoff 请求 |
| waiting | handoff                  | 文本 ≤12000                                   | waiting | 记录 handoff                               |
| waiting | 30min timeout / all idle | —                                             | open    | 创建 session；发 `dream.started`           |
| open    | pass                     | status running/done/failed                    | open    | 更新 passes                                |
| open    | journal                  | 未归档                                        | open    | 写 journal；发 `dream.journal`             |
| open    | decide                   | proposal 存在；状态合法                       | open    | 更新 proposal；若全部 settled → ended      |
| open    | end                      | 用户                                          | ended   | endedAt                                    |
| ended   | asleep                   | journal 存在；全部 settled；无工作；gate 通过 | asleep  | seed → preview → backup → restart          |
| ended   | asleep                   | gate 失败                                     | failed  | 保留错误；可重试                           |

### 5.3 Core swap

| 当前               | 事件          | 守卫                                                | 下一       | 副作用                                   |
| ------------------ | ------------- | --------------------------------------------------- | ---------- | ---------------------------------------- |
| serving            | restart       | 隔离 workspace 已 land；clone clean；HEAD == landed | checking   | tsc                                      |
| checking           | tsc ok        | —                                                   | preparing  | boot next                                |
| checking           | tsc fail      | —                                                   | serving    | 返回错误                                 |
| preparing          | prepared      | —                                                   | acking     | 通知旧 core                              |
| acking             | swap-ack ok   | —                                                   | releasing  | 旧 core 已 memo                          |
| acking             | swap-ack fail | —                                                   | serving    | 旧 core 继续                             |
| releasing          | released      | ≤10s                                                | starting   | active=undefined                         |
| starting           | ready         | —                                                   | serving    | 新 generation                            |
| releasing/starting | error         | 旧 core 可 reacquire                                | serving    | 旧 core 重开 storage，带 activationError |
| releasing/starting | error         | 旧 core 不可用                                      | recovering | kill + recover                           |

### 5.4 上游更新

| 当前     | 事件         | 守卫                      | 下一                 | 副作用               |
| -------- | ------------ | ------------------------- | -------------------- | -------------------- |
| current  | check        | fetch 年龄 >1h            | current/behind       | fetch；summary cache |
| behind   | update       | 无未提交/分叉/lander/lock | updating             | fetch + ff + install |
| behind   | update       | 任一拒绝条件              | behind               | 零改动，返回原因     |
| updating | install fail | —                         | updated-install-owed | 下次 update 重试     |
| updated  | restart      | 用户/agent                | serving(new)         | core swap            |

---

## 6. 接口契约

### 6.1 Agent 工具

| 工具       | 参数                               | 返回                    | 错误                                                     |
| ---------- | ---------------------------------- | ----------------------- | -------------------------------------------------------- |
| `memory`   | `{read?: string, root?: number}`   | 索引文本或单条全文      | `#R has no memory <slug>`                                |
| `remember` | `{root?: number, ops: MemoryOp[]}` | 变更摘要                | caller 非 @ultimate；op 校验失败；root 不唯一            |
| `restart`  | `{}`                               | generation/build 前后值 | 无 supervisor；workspace 未 land；类型检查失败；激活失败 |
| `update`   | `{}`（agent action）               | 更新结果                | 五类拒绝条件                                             |

### 6.2 Dream actions

| action    | 参数                                                  | 返回                   | 备注                           |
| --------- | ----------------------------------------------------- | ---------------------- | ------------------------------ |
| `start`   | `{}`                                                  | `{task}`               | user-only；请求 handoff        |
| `handoff` | `{text}`                                              | `{task}`               | ≤12,000 字符；第二次替换第一次 |
| `pass`    | `{session, pass, status, note?}`                      | `{session}`            | dream branch 专用              |
| `journal` | `{session, learned, text, proposals, chapter?}`       | `{session, proposals}` | 只归档一次                     |
| `decide`  | `{session, proposal, status, branch?, sha?, reason?}` | —                      | status 见 §5.2                 |
| `end`     | `{session}`                                           | —                      | user-only                      |
| `asleep`  | `{session, name?}`                                    | —                      | user-only；gate 通过才切换     |

### 6.3 定义/技能接口

| 接口                | 输入                                                | 输出                                               | 校验                        |
| ------------------- | --------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| `definitions`       | —                                                   | 定义列表 + 解析错误 + 主会话模型/工具 + scope 路径 | 无                          |
| `definition {name}` | name                                                | 生效定义 + raw + files                             | 未知名称报错                |
| `saveDefinition`    | `{name, scope, frontmatter, instructions, create?}` | 保存后的定义                                       | 回读校验；create 拒绝已存在 |
| `deleteDefinition`  | `{name, scope}`                                     | `{path}`                                           | 不存在报错                  |
| `/skill:<name>`     | 文本                                                | 展开后的 `<skill>` 块 + args                       | 未知技能按普通文本          |

### 6.4 事件

| 事件                      | 数据                                                           | 消费者                                                   |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| `workspaces.landed`       | submission, sha, base, target, commits, paths, divergence, ... | lineage（记忆/笔记）、update（install）、dream（landed） |
| `subagents.started`       | id, agent, model?, thinking?, parent?, kind                    | system lanes、UI、审计                                   |
| `lineage.branched`        | id, from, at, intent, title?                                   | tally、sidebar                                           |
| `conversations.compacted` | conversation, entry, reason?                                   | dream 触发、记忆                                         |
| `ultimate.started`        | generation, build                                              | 状态行、审计                                             |
| `dream.*`                 | 见 `extensions/dream/refs.ts`                                  | UI、@ultimate                                            |

### 6.5 用户专属动作（agent 调用必须被拒绝）

| action            | 参数                             | 语义                                             | 拒绝文案                            |
| ----------------- | -------------------------------- | ------------------------------------------------ | ----------------------------------- |
| `forget`          | `{root, slug}`                   | 删除一条记忆，走 `applyMemoryOps` 的 delete 路径 | `Only the user can forget a memory` |
| `compact`         | `{id, instructions?}`            | 压缩一个 root 的 tally；不删历史                 | `Only the user can compact a root`  |
| `rewind`          | `{conversation, at, summarize?}` | 把 `at` 之后的路径设为 aside；不删文件/提交      | `Only the user can go back`         |
| `end`（dream）    | `{session}`                      | 提前结束 dream session                           | `Only the user can end a dream`     |
| `asleep`（dream） | `{session, name?}`               | 章节切换（gate 通过才执行）                      | `Only the user can fall asleep`     |

复刻要点：这些动作在 UI action 层标记 `userOnly`，服务端 handler 还要检查调用者不是 agent；**UI 不暴露 ≠ 安全**。

---

## 7. 算法与伪代码

### 7.1 `applyMemoryOps`（全有或全无）

```text
function applyMemoryOps(tx, root, ops, now):
  assert root in lineage.roots
  parsed = ops.map(parseOp)                  # 任一条失败 -> 抛错，带 op 序号
  doc = tx.doc(Memory, root)
  next = clone(doc.memories)
  done = {add: [], update: [], delete: []}
  for (i, op) in parsed:
    current = next[op.slug]
    if op.op == add:
      assert current == null                  # 已存在 -> update it instead
      next[op.slug] = {...op, updated: now}
    else:
      assert current != null                 # 不存在 -> no memory
      if op.op == delete: next.delete(op.slug)
      else: next[op.slug] = {...current, ...fields, updated: now}
    done[op.op].push(op.slug)
  assert next.size <= 150                    # 超出 -> merge or delete
  if parsed.length == 0: return "No changes."
  doc.memories = next                         # 单次写
  return summary(done, root)
```

### 7.2 `memoryBrief`

```text
function memoryBrief(tx, root):
  memories = tx.doc(Memory, root).memories
  if memories.empty: return undefined
  tip = newest entry id of root
  landings = newest 10 lander notes of root
  text = [
    '<project_memory root="#R">',
    ...memoryIndex(memories),                 # sorted slug [kind] — line (updated date)
    '</project_memory>',
    ...(landings ? ['Recent landings (newest first):', ...landings] : []),
    'The full project context ... read with ultimate.entries(R) ...'
  ].join('\n')
  return {text, tip}
```

### 7.3 构建说明

```text
function beforeInput(input, tx, conversationId):
  build = host.build()
  seen = tx.doc(SeenBuild, conversationId)
  changes = instructionChanges(host, tx, conversationId, seen)
  previous = seen.id
  seen.id = build.id
  built = previous != null && previous != build.id
  if seen.head == null || built:
    head = git HEAD
    if built && head != seen.head: landed = landings(seen.head, head)
    seen.head = head
  text = join([built && buildNote(build, previous, landed), instructionNote(changes)])
  if text == '': return
  return entry { kind: 'prompt.build', data: {...}, model: [user text] }
```

### 7.4 Dream 启动

```text
function startDream(request):
  assert no open session
  assert no other conversation working        # UI 先检查，服务端再检查
  doc.waiting = {at: now, task: createWait()}
  deliver dream.handoff input to @ultimate
  # 等待：handoff 记录 或 30 分钟
  on handoff: doc.waiting.handoff = {text, at}
  when all conversations idle or timeout:
    session = createSession({handoff})
    deliver dream.started input to @ultimate
```

### 7.5 Core swap

```text
function swap(old, requestId, build):
  assert !swapping
  swapping = true
  try:
    tsc --noEmit
    next = boot(previousBuild)                # supervisor assigns generation+1
    await prepare(next)                       # listen(0), 'prepared'
    send(old, swap-result ok, generation=next.generation)
    ack = await old 'swap-ack'
    assert ack.ok
    active = undefined
    send(old, release)
    await old 'released' (10s)
    await start(next)                         # open same SQLite, 'ready'
    await exit(old)
  catch e:
    if next: kill(next)
    if !released && old.connected: send(old, swap-result fail, e)
    else:
      send(old, reacquire, e)
      if old becomes ready: active = old
      else: kill(old); recover()
  finally:
    swapping = false
    if !active: recover()
```

### 7.6 修改路由（agent 决策）

```text
function routeChange(request):
  if request is knowledge/decision/lesson: -> memory (L1)
  if request is a repeated procedure:        -> skill (L2)
  if request is role/behaviour instruction:  -> agent definition (L2)
  if request is project-specific capability:
    if config-only:                          -> settings (L3)
    else:                                    -> extension/surface via branch (L4)
  if request fixes host internals:            -> core via branch (L5)
  if upstream has it:                         -> update (L6)
```

---

## 8. 复刻文件清单与模块边界

以下是一个**参考实现**的目录。可以映射到 Ultimate 的扩展系统，也可以用独立服务实现；关键是职责边界与不变量。

```
selfevo/
├─ state/
│  ├─ memory-store.ts        # Memory 文档、applyMemoryOps、索引/全文
│  ├─ dream-store.ts         # sessions、proposals、journal、decide
│  └─ seen-build.ts          # SeenBuild 文档
├─ context/
│  ├─ prompt-assembler.ts    # sections 注册、渲染顺序、缓存稳定性
│  ├─ build-note.ts          # build/instruction/doc 变化说明
│  └─ instruction-reload.ts  # @ultimate 定义热更新
├─ registry/
│  ├─ agent-registry.ts      # 解析、发现、overlay、save/delete
│  └─ skill-registry.ts      # 技能发现、覆盖、/skill 展开
├─ runtime/
│  ├─ extension-host.ts      # facet 装载/卸载/失败隔离
│  ├─ reload.ts              # 文件监听 -> 受影响 facet 集合
│  ├─ supervisor.ts          # 双进程、proxy、generation、swap 状态机
│  └─ protocol.ts            # swap/ack/release/reacquire 消息
├─ reflect/
│  ├─ dream-session.ts       # 触发、gate、六 passes 调度
│  ├─ journal.ts             # journal 校验/归档
│  └─ memory-review.ts       # 只读审查 -> ops 变更集
├─ verify/
│  ├─ gates.ts               # check/test/preview/review/lander
│  └─ evidence.ts            # 命令输出、截图、trace 证据
├─ update/
│  └─ upstream.ts            # fetch/ff/install/refusal
└─ telemetry/
   └─ evolution-log.ts       # 每次自修改的记录（who/what/why/evidence/result）
```

模块依赖方向：

```
state ← context ← registry ← runtime ← reflect ← verify ← update
                         ↘ telemetry（只读，任何层可写）
```

禁止：`state` 依赖 `runtime`；`runtime` 依赖 `reflect`；`verify` 修改状态（只产证据）。

### 8.1 与 Ultimate 源文件的映射

| 参考模块           | Ultimate 对应                                            | 说明                                    |
| ------------------ | -------------------------------------------------------- | --------------------------------------- |
| `memory-store`     | `extensions/lineage/memory.ts`                           | 文档 + applyMemoryOps + brief + distill |
| `dream-store`      | `extensions/dream/refs.ts`, `server.ts`                  | 会话/提案/journal/decide                |
| `prompt-assembler` | `extensions/prompt/server.ts`                            | sections + beforeInput                  |
| `agent-registry`   | `lib/agents.ts`                                          | 解析/发现/overlay/save                  |
| `skill-registry`   | `server/skills.ts`                                       | 技能合并与展开                          |
| `extension-host`   | `server/extensions.ts`                                   | facet 装载/热重载                       |
| `supervisor`       | `bin/ultimate.ts` + `server/supervisor-protocol.ts`      | swap 协议                               |
| `reflect`          | `extensions/dream/*` + `extensions/lineage`              | dream + memory review                   |
| `verify`           | `workspaces` lander + `review` + `instance` + `reviewer` | 验证栈                                  |
| `update`           | `extensions/update`                                      | 上游同步                                |
| `telemetry`        | `extensions/system` + `server/trace.ts` + event log      | 证据面                                  |

---

## 9. 实施顺序（M0–M8）

每个里程碑结束时必须可运行、可演示、可测试；不允许"全部搭完再验证"。

### M0 — 持久化与记忆（1–2 天）

- 实现 `MemoryDoc`、`applyMemoryOps`、`memory`/`remember` 工具（含 caller 检查）。
- 单测：合法批次、重复 add、缺失 update、超限、超长 line/body、非法 slug、空批次。
- 验收：`AC-S-001`、`AC-S-002`。

### M1 — brief 与 branch 上下文（1–2 天）

- 实现 `memoryBrief`，在 fork 时插入 reset + brief。
- 验证：有记忆/无记忆两个 branch，模型上下文首条分别是 brief/tally。
- 验收：`AC-S-003`、`AC-S-004`。

### M2 — prompt 装配与变化说明（1–2 天）

- 实现 section 注册、渲染顺序、`SeenBuild`、`beforeInput` 说明注入。
- 验证：改 build id / 改 `AGENTS.md` / 改 `agents/ultimate.md` 后，下一输入出现对应说明；system prompt 字节不变。
- 验收：`AC-S-005`、`AC-S-006`。

### M3 — agent 定义与技能（2 天）

- 实现解析、发现、overlay、save/delete、技能发现与 `/skill` 展开。
- 验证：同名覆盖、overlay 追加、非法字段拒绝、保存回读、删除回退。
- 验收：`AC-S-007`、`AC-S-008`。

### M4 — 扩展装载与热重载（2–3 天）

- 实现 facet 生命周期、失败隔离、文件监听、受影响集合计算。
- 验证：改 web facet 不刷新页面；改 server facet 下一个工具用新代码；坏 facet 保留旧版本。
- 验收：`AC-S-009`、`AC-S-010`。

### M5 — 核心 swap（3–5 天，最高风险）

- 实现 supervisor/core 双进程、proxy、swap 协议、generation、reacquire、recover。
- 验证：类型检查失败不换；新 core 启动失败回滚；旧 core 释放失败 reacquire；重启后会话继续。
- 验收：`AC-S-011`、`AC-S-012`、`AC-S-013`。

### M6 — dream（2–3 天）

- 实现 session、handoff、六 passes 调度、journal、decide、landed reactor。
- 验证：完整 dream 一轮；journal 只归档一次；proposal 状态机；无 handoff 的 30 分钟超时。
- 验收：`AC-S-014`、`AC-S-015`、`AC-S-016`。

### M7 — 验证栈（2–3 天）

- 接入 check/test/preview/review/lander；实现"检查 ≠ 批准"。
- 验证：坏改动被 check 拦住；UI 未批准不能 submit；lander 失败有完整日志。
- 验收：`AC-S-017`、`AC-S-018`。

### M8 — 上游更新与治理（1–2 天）

- 实现 update 检查/拒绝/ff/install；实现权限矩阵与审计。
- 验证：五类拒绝条件；ff 成功；lockfile 变化提示 restart；审计可查。
- 验收：`AC-S-019`、`AC-S-020`。

### 验收项归属（防止验收脱节）

| 里程碑 | 覆盖的 AC                                                            |
| ------ | -------------------------------------------------------------------- |
| M0     | AC-S-001, AC-S-002, AC-S-021, AC-S-022, AC-S-026, AC-S-034, AC-S-035 |
| M1     | AC-S-003, AC-S-004, AC-S-027                                         |
| M2     | AC-S-005, AC-S-006, AC-S-028, AC-S-031                               |
| M3     | AC-S-007, AC-S-008, AC-S-029                                         |
| M4     | AC-S-009, AC-S-010, AC-S-033                                         |
| M5     | AC-S-011, AC-S-012, AC-S-013                                         |
| M6     | AC-S-014, AC-S-015, AC-S-016, AC-S-023, AC-S-024, AC-S-032           |
| M7     | AC-S-017, AC-S-018, AC-S-025, AC-S-030                               |
| M8     | AC-S-019, AC-S-020, AC-S-036                                         |

---

## 10. 测试计划

参考实现以 Node/pnpm 为例；命令名可按技术栈替换，但**测试分组与断言必须保留**。

```bash
pnpm test -- self/memory          # UT-S-01..07
pnpm test -- self/prompt          # UT-S-08..12
pnpm test:e2e -- self/reload       # E2E-S-01
pnpm test:e2e -- self/restart      # E2E-S-02
pnpm test:e2e -- self/dream        # E2E-S-03
```

### 10.1 单元测试

| 编号    | 测试         | 输入                                | 期望                                            |
| ------- | ------------ | ----------------------------------- | ----------------------------------------------- |
| UT-S-01 | 记忆批次合法 | add a, update b, delete c           | 一次写入；摘要正确                              |
| UT-S-02 | 重复 add     | add 已存在 slug                     | 抛 `exists; update it instead`；零写入          |
| UT-S-03 | 缺失 update  | update 不存在 slug                  | 抛 `no memory`；零写入                          |
| UT-S-04 | 超限         | 151 条                              | 抛 `exceed the limit`；零写入                   |
| UT-S-05 | 超长字段     | line 121 / body 2001                | 抛错；零写入                                    |
| UT-S-06 | 非法 slug    | `Bad Slug!`                         | 抛错；零写入                                    |
| UT-S-07 | brief        | root 有 3 条记忆 + 2 个 landing     | 文本含索引、landing、tally 指针；token 计数正确 |
| UT-S-08 | 定义 overlay | base + addTools                     | 工具并集；指令追加；settings 覆盖               |
| UT-S-09 | overlay 非法 | overlay 声明 tools                  | 抛 `addTools, not tools`                        |
| UT-S-10 | 技能覆盖     | 两个同名 SKILL.md                   | 后者生效；overrides 记录前者                    |
| UT-S-11 | 构建说明     | build 变化 + landed                 | 文本含 `Build changed` + `landed`               |
| UT-S-12 | 指令说明     | `AGENTS.md` 变化                    | 文本含 `Docs changed`；hash 更新                |
| UT-S-13 | 配置优先级   | 用户 enable + 项目 disable 同一扩展 | 项目生效；core 项忽略 disable                   |

### 10.2 集成测试

| 编号    | 场景               | 步骤                                             | 期望                                                                |
| ------- | ------------------ | ------------------------------------------------ | ------------------------------------------------------------------- |
| IT-S-01 | 记忆 → branch      | @ultimate remember → branch                      | branch 首条模型消息是 brief；`memory read` 可取全文                 |
| IT-S-02 | landing → 蒸馏     | 模拟 `workspaces.landed`                         | 只建一个 memorize task；记忆更新；receipt 存在                      |
| IT-S-03 | 蒸馏失败           | summary model 返回非法 JSON                      | 重试一次；仍失败只 notice；landing 成功                             |
| IT-S-04 | 定义热更新         | 改 `agents/ultimate.md` → 用户输入               | 下一次输入前 `configure(instructions)`；出现 `Instructions changed` |
| IT-S-05 | 子 agent 定义固定  | 启动 worker 后改定义                             | 运行中的 worker 指令不变；下一个 worker 用新指令                    |
| IT-S-06 | facet 失败隔离     | 让 web.tsx 抛错                                  | 该 facet 显示错误卡；其他 surface 正常；旧版本保留                  |
| IT-S-07 | core swap 成功     | 改 server/ → restart                             | generation+1；会话继续；新代码生效                                  |
| IT-S-08 | core swap 类型失败 | 写类型错误 → restart                             | 旧 core 继续；返回 tsc 输出                                         |
| IT-S-09 | core swap 激活失败 | 新 core 启动即崩                                 | reacquire 旧 core；`activationError` 可见                           |
| IT-S-10 | restart 重放       | 重启后重放同一 tool task                         | 不再 swap；返回同一 generation 结果                                 |
| IT-S-11 | dream 完整         | 用户 Dream → handoff → branch → journal → decide | session ended；proposal 状态正确；landed 自动标记                   |
| IT-S-12 | dream 并发拒绝     | 另一个会话在跑时 start                           | 拒绝并列出阻塞会话                                                  |
| IT-S-13 | update 拒绝        | 未提交改动                                       | 拒绝；零改动                                                        |
| IT-S-14 | update ff          | 落后 3 个提交                                    | fast-forward；lockfile 变化提示 restart                             |

### 10.3 E2E（真实进程/浏览器）

| 编号     | 场景            | 命令/操作                                | 期望                                       |
| -------- | --------------- | ---------------------------------------- | ------------------------------------------ |
| E2E-S-01 | 自改 UI 热重载  | 改 `extensions/<name>/web.tsx`，看浏览器 | 无整页刷新；组件即时更新；失败有错误卡     |
| E2E-S-02 | 自改核心        | 改 `server/` → restart → 继续对话        | 会话不丢；新行为生效；generation 增加      |
| E2E-S-03 | 完整 dream      | 按 Dream，等待 branch                    | journal 卡出现；提案可决策；落地后自动标记 |
| E2E-S-04 | memory review   | 启动 review branch                       | 返回 ops + 证据；未写记忆；用户批准后应用  |
| E2E-S-05 | upstream update | 模拟落后 origin                          | 拒绝/成功路径符合 §5.4                     |

### 10.4 失败注入

- 在 swap 的每个阶段 kill 新/旧 core；
- 在 reporter/记忆写入的 commit 前后 kill；
- 让 summary model 超时/返回非法 JSON；
- 让文件写入失败（只读目录）；
- 让 SSE 断开/浏览器刷新；
- 让两个 branch 同时 landing 同一文件。

每条失败注入都必须有"期望状态 + 用户可见文案 + 恢复动作"。

---

## 11. 验收 Checklist

| ID       | 验收项（二元）                                                                                           | 覆盖 REQ             |
| -------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| AC-S-001 | 记忆批次非法时零写入，错误含 op 序号                                                                     | REQ-S-004, REQ-S-005 |
| AC-S-002 | 只有 standing `ultimate` 能成功调用 `remember`；branch 调用报错                                          | REQ-S-006            |
| AC-S-003 | 有记忆的 root 的新 branch，首条模型可见消息是 brief 而非 tally                                           | REQ-S-008            |
| AC-S-004 | brief 含索引、最近 10 landing、完整 tally 读取指引                                                       | REQ-S-008            |
| AC-S-005 | 构建变化时下一输入出现 `Build changed`，system prompt 字节不变                                           | REQ-S-002, REQ-S-003 |
| AC-S-006 | 改 `AGENTS.md` 后出现 `Docs changed`；改 `agents/ultimate.md` 后出现 `Instructions changed` 且指令已更新 | REQ-S-003            |
| AC-S-007 | 同名定义覆盖顺序为 builtin < user < project；overlay 只能追加                                            | REQ-S-014            |
| AC-S-008 | 保存非法定义不写文件；保存内置同名生成覆盖而非改写内置                                                   | REQ-S-015            |
| AC-S-009 | 改 web facet 无整页刷新；坏 facet 只影响自己                                                             | REQ-S-018            |
| AC-S-010 | 改 server facet 后下一次工具调用用新代码；运行中的调用用旧代码完成                                       | REQ-S-018            |
| AC-S-011 | 改 `server/` 后 restart 成功，generation+1，会话继续                                                     | REQ-S-019, REQ-S-020 |
| AC-S-012 | 类型检查失败时旧 core 继续，返回 tsc 尾部                                                                | REQ-S-020            |
| AC-S-013 | 激活失败时旧 core reacquire，`activationError` 可见；重放不再次 swap                                     | REQ-S-020, REQ-S-021 |
| AC-S-014 | dream 六 passes 都运行并记录状态                                                                         | REQ-S-011, REQ-S-012 |
| AC-S-015 | journal 只能归档一次；重复调用返回已归档 journal                                                         | REQ-S-013            |
| AC-S-016 | 所有 proposal settled 后 session 自动结束；`landed` 由 landing 自动标记                                  | REQ-S-013            |
| AC-S-017 | 未通过 check/test 的改动不能 submit                                                                      | REQ-S-023            |
| AC-S-018 | UI 改动未经用户预览批准不能 submit                                                                       | REQ-S-023            |
| AC-S-019 | update 五类拒绝条件均零改动                                                                              | REQ-S-022            |
| AC-S-020 | update 成功后若 lockfile 变化，状态提示 restart，且不自动重启                                            | REQ-S-022            |
| AC-S-021 | 记忆蒸馏对同一 landing 只执行一次（receipt 唯一）                                                        | REQ-S-009            |
| AC-S-022 | 蒸馏失败不阻塞 landing，且最多重试一次                                                                   | REQ-S-009            |
| AC-S-023 | 记忆审查 branch 不写任何记忆                                                                             | REQ-S-025            |
| AC-S-024 | dream 本身不修改代码/记忆/设置                                                                           | REQ-S-014            |
| AC-S-025 | 自改提案必须带证据（trace/事件/复现）并记录结果                                                          | REQ-S-024, REQ-S-027 |
| AC-S-026 | 六层自修改面各自有写入口、生效方式、回滚方式，且有一条对应测试或检查                                     | REQ-S-001            |
| AC-S-027 | 任意 agent 可读记忆索引与单条全文；branch 可读其 root                                                    | REQ-S-007            |
| AC-S-028 | 用户 Dream、70% 上下文、离开 8h 三种触发都可启动；无 handoff 30 分钟超时                                 | REQ-S-010            |
| AC-S-029 | 技能多目录同名覆盖正确；`/skill:<name>` 展开为 skill 块 + args                                           | REQ-S-016            |
| AC-S-030 | 扩展目录含 README/api/refs/server/web；facet 契约检查通过                                                | REQ-S-017            |
| AC-S-031 | 上下文越过 70% 时自动请求 handoff 并启动 dream                                                           | REQ-S-026            |
| AC-S-032 | `forget`/`rewind`/`compact`/`asleep`/`end` 对 agent 调用报错                                             | REQ-S-028            |
| AC-S-033 | 单个 facet 加载失败时其余 facet 正常，旧版本保留                                                         | REQ-S-029            |
| AC-S-034 | §10 的失败注入可全部执行，且每项有期望状态/文案/恢复                                                     | REQ-S-030            |
| AC-S-035 | 配置优先级正确；core 扩展忽略 disable；非法 JSON 不覆盖旧文件                                            | REQ-S-001            |
| AC-S-036 | §3.12 非功能预算达标（写入/读取/brief/装配/热重载/swap/恢复）                                            | REQ-S-030            |

---

## 12. 失败矩阵与恢复

| 失败           | 原因                             | 检测                  | 恢复                               | 用户可见                |
| -------------- | -------------------------------- | --------------------- | ---------------------------------- | ----------------------- |
| 记忆批次被拒   | 非法 op / 超限 / 重复            | `applyMemoryOps` 抛错 | 修正后重试整批                     | 工具错误，含 op 序号    |
| 蒸馏失败       | 模型超时/非法 JSON/批量被拒      | task 捕获             | 重试一次；仍失败 notice            | 不阻塞 landing；notice  |
| brief 过大     | 记忆太多/正文太长                | `briefTokens`         | 合并/删除记忆；降低上限            | sidebar 显示 token      |
| 指令未生效     | 改的是子 agent 定义              | 下一次 start 才读     | 重启子 agent                       | 旧行为继续              |
| 热重载失败     | 语法/类型/导入错误               | Vite/registry         | 保留上一版本                       | 错误卡/日志             |
| 核心 swap 失败 | 类型检查/启动/激活               | supervisor            | 旧 core 继续 / reacquire / recover | `restart failed` + 原因 |
| 重启丢流       | SSE 断开                         | 浏览器                | 自动重连；快照恢复                 | 短暂断线                |
| dream 无法开始 | 其他会话在跑 / 已有 open session | start gate            | 等空闲 / end 旧 session            | 列出阻塞项              |
| handoff 缺失   | 30 分钟超时                      | timer                 | 无 handoff 启动，journal 说明      | 卡片提示 missing        |
| proposal 卡住  | branch 未落地                    | reactor               | 用户决定 / 手动 `landed`           | 提案保持 open           |
| update 被拒    | 未提交/分叉/lander/lock          | 前置检查              | 解决后重试                         | 明确原因                |
| install 失败   | 网络/依赖                        | 命令退出码            | 下次 update 重试                   | `install owed`          |
| 权限绕过       | branch 找到 deferred `remember`  | caller 检查           | 抛错                               | 明确提示找 @ultimate    |

---

## 13. 证据索引

| REQ       | 主题                         | 证据                                                                                                          |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| REQ-S-001 | 六类修改面                   | `agents/ultimate.md:36-42`；`AGENTS.md` Layers 表；`extensions/self/server.ts:19-38`                          |
| REQ-S-002 | prompt sections              | `extensions/prompt/server.ts:264-374`                                                                         |
| REQ-S-003 | build/instruction/doc 说明   | `extensions/prompt/server.ts:120-262`；`extensions/prompt/README.md`                                          |
| REQ-S-004 | 记忆 schema/限制             | `extensions/lineage/memory.ts:20-112`                                                                         |
| REQ-S-005 | 原子批次                     | `extensions/lineage/memory.ts:156-192`                                                                        |
| REQ-S-006 | 只有 @ultimate 写            | `extensions/lineage/server.ts:1738-1747`                                                                      |
| REQ-S-007 | 读索引/全文                  | `extensions/lineage/server.ts:1697-1727`                                                                      |
| REQ-S-008 | brief                        | `extensions/lineage/memory.ts:240-257`；`lineage/server.ts:912-960`                                           |
| REQ-S-009 | landing 蒸馏                 | `extensions/lineage/memory.ts:37-50,259-431`；`lineage/server.ts:1478+`                                       |
| REQ-S-010 | dream 触发/handoff           | `extensions/dream/README.md:5-40`；`extensions/dream/DREAM.md:16-56`                                          |
| REQ-S-011 | dream session                | `extensions/dream/refs.ts:41-95`；`extensions/dream/server.ts:55-144`                                         |
| REQ-S-012 | 六 passes                    | `extensions/dream/DREAM.md:58-115`；`agents/dream-pass.md`                                                    |
| REQ-S-013 | journal/decide               | `extensions/dream/refs.ts:9-27,103-160`；`extensions/dream/server.ts:185-288,498-526`                         |
| REQ-S-014 | 定义解析/发现                | `lib/agents.ts:245-420`                                                                                       |
| REQ-S-015 | 保存/删除/overlay            | `lib/agents.ts:486-618`                                                                                       |
| REQ-S-016 | 技能                         | `server/skills.ts:13-54`                                                                                      |
| REQ-S-017 | 扩展布局                     | `docs/extensions.md:3-8`；`extensions/README.md`                                                              |
| REQ-S-018 | facet 热重载                 | `server/extensions.ts:108-775`；`web/src/extensions.ts`                                                       |
| REQ-S-019 | 核心变更检测/restart         | `extensions/self/server.ts:41-129`；`server/system.ts:62-159`                                                 |
| REQ-S-020 | swap 协议/回滚               | `bin/ultimate.ts:394-457`；`server/supervisor-protocol.ts:32-61`                                              |
| REQ-S-021 | restart replay               | `extensions/self/server.ts:64-102`                                                                            |
| REQ-S-022 | update                       | `extensions/update/README.md` "Checking/Updating" 节；`extensions/update/server.ts`                           |
| REQ-S-023 | 验证栈                       | `agents/coordinator.md:60-71,79`；`extensions/workspaces/README.md` "Lander"；`extensions/instance/README.md` |
| REQ-S-024 | 自我改进提案                 | `agents/ultimate.md:107-109`                                                                                  |
| REQ-S-025 | 记忆审查                     | `extensions/lineage/README.md` "Memory review" 节                                                             |
| REQ-S-026 | 压缩/dream before compaction | `extensions/dream/before-compaction.ts`；`extensions/dream/README.md` "Dream before compaction"               |
| REQ-S-027 | 可观测性                     | `extensions/system/README.md`；`server/trace.ts`                                                              |
| REQ-S-028 | 用户专属动作                 | `extensions/lineage/server.ts:102-103,1340-1349`；`extensions/dream/refs.ts:103-111`                          |
| REQ-S-029 | 失败隔离                     | `server/extensions.ts`；`web/src/sdk/registry.ts:240-257`                                                     |
| REQ-S-030 | 复刻验收                     | 本文 §10-§11                                                                                                  |

---

## 14. 未决问题与假设

| ID     | 类型 | 内容                                                                       | 处理                                                      |
| ------ | ---- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| Q-S-01 | 假设 | 复刻宿主提供事务、文档、任务、事件、提交五类原语                           | 若不提供，先用 SQLite + outbox 实现最小替代               |
| Q-S-02 | 假设 | 复刻者可以接受"单机单用户"安全模型                                         | 若要多人/远程，必须重新设计权限与隔离                     |
| Q-S-03 | 未决 | 是否复刻 `prompt.build` 的 landing 归因（`Ultimate-Conversation` trailer） | 建议复刻；否则变化说明缺少上下文                          |
| Q-S-04 | 未决 | dream 的六 passes 是否必须并行                                             | 不是；并行是延迟优化，串行也可满足语义                    |
| Q-S-05 | 未决 | 记忆自动蒸馏是否必须用 summary model                                       | 不是；可用规则/人工；但会失去"每次 landing 沉淀"的自动化  |
| Q-S-06 | 风险 | 复刻 supervisor 双进程成本高                                               | 若宿主本身支持热替换，可跳过 L5，只保留 L1-L4+L6          |
| Q-S-07 | 未决 | 是否要求 Git worktree 隔离                                                 | 建议要求；否则代码自改无法安全回滚                        |
| Q-S-08 | 未决 | 是否复刻 update 的 GitHub 专用逻辑                                         | 可抽象为"上游 remote + fast-forward"；GitHub 只是 UI 优化 |

---

## 15. 复刻者最小可行路径（如果时间有限）

如果只能做 20% 的工作，按以下顺序：

1. **记忆 + brief**（L1）：让新 branch 从项目知识开始，而不是从零。
2. **prompt.build 说明**（L2）：让 agent 知道自己被热替换了。
3. **agent 定义 + 技能**（L2）：让行为可配置、可复用。
4. **扩展热重载**（L4）：让新能力不用重启。
5. **branch + review + lander**（L5 的前置）：让代码修改可审查、可回滚。
6. **restart**（L5）：最后再做，且必须有 rollback。

不要先做 dream。没有记忆、没有验证栈、没有 branch 的 dream 只会产出无法执行的建议。
