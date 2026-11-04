# 01 · 产品模型与概念体系

> 证据基准：`README.md`、`AGENTS.md`、`extensions/README.md`、`docs/*`、`agents/*.md` 以及各扩展 README。
> 本文回答"Ultimate 到底是什么、由哪些概念组成、用户看到的状态如何流转"，是后续架构与复刻蓝图的语义基础。

## 1. 一句话定义

**Ultimate 是一个"可自我特化的本地编码智能体"**：它是一个跑在你自己仓库里的 Web 应用，内核是 Pi 的编码 agent（基于 Pi Durable 的持久化运行时），外壳由 53 个可热加载的扩展拼成；你可以让 Ultimate 修改它自己，把项目专属的工具、面板、子智能体、技能写进 `<project>/.ultimate/`，并随仓库提交，从而让"同一个内核、每个项目不同形态"成立。

三个不可混淆的层次：

| 层次                                                    | 是什么                                                     | 是否可替换           |
| ------------------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| 内核（Pi Durable + Pi Coding Agent）                    | 会话、条目、工具调用、任务、模型调用、提交（commit）与恢复 | 外部依赖，版本固定   |
| 外壳（本仓库 `server/`、`shared/`、`web/`、`bin/`）     | 进程监督、HTTP/SSE、扩展装载、浏览器框架                   | 是，且可运行时热替换 |
| 产品（`extensions/` 53 个内置 + `agents/` + `skills/`） | 用户实际感知的全部功能                                     | 是，逐扩展可关       |

## 2. 核心概念（术语表）

| 术语                                 | 定义                                                                                                                                                | 关键实现位置                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Project（项目）**                  | 启动 Ultimate 时传入的目录；agent 的默认 cwd、Git 工作区、`.ultimate/` 配置根                                                                       | `bin/ultimate.ts`（positionals[0]）、`server/project.ts`     |
| **Home（实例状态目录）**             | 每个项目独立的 SQLite/锁/日志目录：`~/.ultimate/projects/<name>-<hash8>/`，可被 `ULTIMATE_HOME` 覆盖                                                | `server/project.ts:projectHome`、`bin/ultimate.ts:77`        |
| **Root（根会话）**                   | 项目的主对话，id 固定为 `1`（`ROOT_CONVERSATION_ID`），**不运行任何 turn**；保存项目记忆、事件日志、UI 状态等根级文档                               | `server/harness.ts:265`、`web/src/sdk/api.ts:28`             |
| **@ultimate（常驻智能体）**          | 用户直接对话的 standing agent，定义在 `agents/ultimate.md`；启动/指挥 branch、向用户提问、维护记忆                                                  | `agents/ultimate.md`、`extensions/sidebar`                   |
| **Branch（分支）**                   | 从某个 root 的记忆索引 + 最近 landing 出发的一条独立工作线，由一个 `coordinator` 智能体执行；是一个独立 conversation                                | `extensions/lineage`、`extensions/messages`（`branch` 工具） |
| **Coordinator**                      | 分支的负责人：理解问题、做计划与决策、委派 worker/scout/designer、最终裁决、`workspace submit`                                                      | `agents/coordinator.md`                                      |
| **Tally（台账 / 上下文）**           | root 上只读的"项目上下文"：每条 branch 的 intent、最新 abstract、notes、landings（含 divergence 与 `#conversation/entry` 面包屑）；UI 的 History 页 | `extensions/lineage`                                         |
| **Landing（落地）**                  | 一次通过检查并被合并进主分支的提交；`workspace submit` 执行，lander 是最后一道门                                                                    | `extensions/workspaces`、`docs/worktrees.md`                 |
| **Worktree / Isolate（隔离工作区）** | 每个 branch 默认在自己的 Git worktree 中工作；`workspace` 扩展负责创建、同步、清理、落地                                                            | `extensions/workspaces`                                      |
| **Subagent（子智能体）**             | 由工具 `subagent` 启动的独立 conversation，拥有自己的模型/思考级别/工具集；`fork` 可继承父上下文                                                    | `extensions/subagents`、`agents/*.md`                        |
| **Standing agent（常驻智能体）**     | 不属于某次运行、可被 `message` 唤醒的命名 agent（如 @ultimate）                                                                                     | `extensions/messages`、`agents/ultimate.md`                  |
| **Side chat（侧聊）**                | @ultimate 的临时无主副本，用于探索；可丢弃或"总结并注入"回主会话                                                                                    | `extensions/side-chat`                                       |
| **Turn（回合）**                     | 一次用户输入触发的完整 agent 运行（模型流 + 工具调用 + 可能的压缩）                                                                                 | Pi Durable；`web/src/sdk/hooks.ts` 的 `live.run`             |
| **Task（任务）**                     | Pi Durable 的持久任务节点：generation、tool call、子会话等，构成 `TaskGraph`                                                                        | Pi Durable；`server/api.ts` 的 tasks 事件                    |
| **Submission（提交记录）**           | 一次输入的持久记录：queued / answered / aborted 等状态；支持 steer / followUp                                                                       | Pi Durable `conversation.submit`                             |
| **Entry（条目）**                    | 会话中的一条持久记录：消息、工具调用、事件、文档快照等；有全局递增 id                                                                               | Pi Durable                                                   |
| **Document（文档）**                 | 绑定到某个 conversation 的 JSON 状态（`defineDoc`），支持增量 ops、快照、fork 策略                                                                  | Pi Durable；`server/events.ts`、各扩展 `docs`                |
| **Durable event（持久事件）**        | 以 entry（kind=`event.<name>`）形式写入事件日志的"这件事发生了"，可在同一事务内 emit，reactor 按游标精确一次地处理                                  | `server/events.ts`、`shared/events.ts`                       |
| **Reactor（反应器）**                | 订阅事件并按游标串行处理的函数，cursor 与写入同事务提交                                                                                             | `server/events.ts:drain`                                     |
| **Extension（扩展）**                | 一个目录：`server.ts`（服务端 facet）+ `web.tsx`（浏览器 facet）+ `api.ts`/`refs.ts`/`ui.tsx`（契约）+ `README.md`                                  | `server/extensions.ts`、`extensions/README.md`               |
| **Facet（facet）**                   | 扩展的某一半：server facet 或 web facet；各自独立加载、失败互不影响                                                                                 | 同上                                                         |
| **Core tier（核心层）**              | `api.ts` 中 `export const tier = 'core'` 的扩展，永远启用，且只依赖核心层                                                                           | `shared/extension-api.ts:coreTier`、`docs/extensions.md`     |
| **Service / API token**              | `defineApi<Service>()('name')` 定义的进程内服务契约，provider `implement`，consumer `need`/`want`                                                   | `shared/extension-api.ts`、`server/extension-apis.ts`        |
| **Extension point（扩展点）**        | 低层扩展声明、由高层扩展填充的契约（如 `conversations.trees`），避免反向依赖                                                                        | `docs/extensions.md`                                         |
| **Action（动作）**                   | 扩展 server facet 导出的 `actions`，UI 通过 `POST /api/extensions/:name/actions/:action` 调用                                                       | `server/api.ts:runAction`、`lib/actions.ts`                  |
| **Surface（界面）**                  | 全屏应用，由扩展贡献；内置 `agent` 是首页，`documents`/`review`/`system` 等是其他 surface                                                           | `web/src/sdk/registry.ts`、`web/src/app/App.tsx`             |
| **Slot（插槽）**                     | shell 中命名的挂载点（`sidebar`、`statusline.left`、`composer.toolbar` 等 15 个）                                                                   | `web/src/sdk/types.ts:SlotName`                              |
| **Panel（面板）**                    | 右侧面板的标签页（To-dos、Tasks、Activity、Automations、Agents、Documents、Info、Extensions…）                                                      | `web/src/sdk/types.ts:PanelContribution`                     |
| **UI state（界面状态）**             | root 会话的 `ultimate.ui` 文档：跨标签页/设备持久的扁平 JSON（当前会话、面板、surface、dock 宽度…），用 `ui.rev` 排序防回退                         | `web/src/sdk/ui-state.ts`、`server/api.ts:/api/ui`           |
| **Build / Generation**               | 构建指纹（core/lib/extensions 的 sha256 组合）与核心进程代数；热替换后 generation +1                                                                | `server/build.ts`、`server/supervisor-protocol.ts`           |
| **Dream（做梦）**                    | 一次"睡眠式"工作会话：@ultimate 先写 handoff，再启动 dream branch 处理学到的东西                                                                    | `extensions/dream`                                           |
| **Hands-off goal（离线目标）**       | 用户离开时交给 @ultimate 的目标：它代用户做决定、记录理由、留下报告                                                                                 | `extensions/goal`、`AGENTS.md`                               |
| **Automation（自动化）**             | 持久调度：cron/间隔、事件、上下文阈值、受监督脚本；可唤醒会话或发起 prompt run                                                                      | `extensions/automations`                                     |

## 3. 产品形态：用户实际看到什么

### 3.1 首次启动（First run）

1. `ultimate` 启动 → 监督进程监听 `127.0.0.1:4747`（被占用则递增），锁文件写入 home。
2. 核心进程启动，打开 SQLite，装载扩展，Vite 以 middleware 模式挂在同一端口。
3. 浏览器打开 `http://ultimate.localhost:<port>`（Chrome 家族无边框窗口）或 `http://127.0.0.1:<port>`。
4. 首启显示 **Get ready**：登录 provider、选择模型（`extensions/onboarding`）。
5. Continue 后进入 @ultimate 会话：它用 inline setup 卡走完 onboarding（项目信任、Git、扩展选择），读项目并写入第一批记忆，然后建议 3 个以内的项目专属 agent/扩展/设置，最后把用户说的第一件事作为 coordinator branch 启动。

### 3.2 日常循环

1. 用户在 @ultimate 会话输入需求。
2. @ultimate 判断规模：
   - 小改动：让 coordinator 直接改（无 epic/worker/review）。
   - 功能/探索：coordinator 先做 assessment（复杂度、代码增量、复用、推荐方案、替代方案、风险、编号决策），@ultimate 转述给用户，用户决定后再开工。
3. coordinator 用 `plan` 建 epic + 二元验收标准 + 任务；按需 `subagent` 委派 scout/worker/designer；在 worktree 中实现；`workspace submit` 触发检查与 lander。
4. lander 跑全套检查、合并、推送；branch 报告 landing sha 与 divergence；@ultimate 通知用户。
5. root 的 tally 累积 branch intent、abstract、landing；memory 由 @ultimate 用 `remember` 维护。
6. 需要用户决策时，@ultimate 发一条 reply-expected 的 `message {to:'user', questions}`，问题卡出现在会话与 To-dos 面板，直到回答或 dismiss。

### 3.3 多项目 / 多机器

- 每个项目一个独立 Ultimate 进程与 home；`ultimate.projects()` 列出同机所有项目及其 URL。
- `remotes` 用户设置列出跨机器实例 `{machine: {project: url}}`。
- codemode 可只读读取其他实例（conversations/entries/search/trace/doc）、`ultimate.tell` 给其他项目的 @ultimate 发消息。
- `tailscale` 扩展把实例暴露到 tailnet，只允许显式 allowlist 的登录。

## 4. 会话树模型（本项目最独特的部分）

```
project root (conversation #1, runs no turns)
├── memory (slug → body)         ← @ultimate 用 remember 维护；branch 启动时读取
├── tally (root history)         ← branch intents / abstracts / notes / landings
├── standing agents (@ultimate…) ← 常驻、可被 message 唤醒
├── branch #12  coordinator  ── subagent #13 (scout)
│                              ├─ subagent #14 (worker, worktree)
│                              └─ subagent #15 (reviewer)
├── branch #20  coordinator
└── event log conversation (ownerless, label=events)
```

关键规则（来自 `AGENTS.md`、`agents/ultimate.md`、`extensions/lineage/README.md`）：

1. **root 不跑 turn**。它承载记忆索引、事件日志、UI 状态、tally。`server/harness.ts` 打开时创建 root 并只写 `UiState` 与 `AgentDoc.model`。
2. **branch 不是 subagent**。branch 是一等 conversation，拥有 coordinator；subagent 只是有界执行/侦察。
3. **branch 从记忆开始**：启动时注入 root 的 memory brief（无记忆则 tally）再给 prompt；恢复 branch 时补发其树的 tally 增量（旧更新会折叠）。
4. **只有 @ultimate 能 message 用户**。coordinator 的答案/决策回到 @ultimate，由它转述。
5. **结论（conclude）**：分支完成并落地后，在其 report run 空闲时自动 conclude；conversation 仍可读、可 resume。
6. **状态分歧（divergence）**：报告与 `workspace submit` 必须说明结果与任务给定的差异，没有就写 "None"。

## 5. 关键状态机

### 5.1 核心进程（supervisor 视角）

```
starting → preparing → ready → (swap: checking → swapping → ready')
                     ↘ crashed → recovering → ready | failed(waiting for changes)
stopping → stopped
```

证据：`bin/ultimate.ts` 的 `recover/start/swap/shutdown` 与 `dashboard.lifecycle`。

### 5.2 一次输入（Pi Durable）

```
HTTP POST submit → Submission(queued) → Pi 接纳 → Entry(user) → run(generation)
  → 模型流（partial）→ tool call(s) → tool result(s) → … → assistant entry → idle
queued 时可 cancel；busy 时可 steer（插入当前 run）或 followUp（当前 run 后一起开始）
```

证据：`server/api.ts` submit 分支、`web/src/sdk/api.ts:submit`、`hooks.ts:inbox`。

### 5.3 Branch 生命周期

```
created(by branch tool) → coordinator run → assessment? → plan → workers → review
   → workspace submit → checks → lander merge/push → landed → report → concluded
                                    ↘ failed → report → 修复/重试
```

### 5.4 工作区

```
isolate created (worktree + branch) → 编辑/提交 → submit(推送候选)
  → lander: fetch/merge/rebase 检查 → 全量检查 → fast-forward 合并 → 推送 → 清理
```

## 6. 设计哲学（复刻时必须保留的"味道"）

1. **先持久化再展示**：任何 UI 可见状态都必须先提交到 SQLite；崩溃/重启后从提交恢复，不依赖内存。
2. **一切皆扩展**：核心只提供框架（surface host、transcript、composer、palette、live data），功能都在 `extensions/<name>/`；新增 UI 不改 `web/`。
3. **契约先行、依赖单向**：`api.ts`/`refs.ts` 是唯一跨扩展面；core tier 只依赖 core tier；低层通过扩展点调用高层。
4. **故障隔离**：单个扩展加载失败保留上一版本，UI 每个贡献有 error boundary；核心启动失败回滚到旧 generation。
5. **可观测**：trace 记录每次服务调用/动作/reactor/工具/模型调用；事件日志有全局顺序；system 扩展把两者合成一条流。
6. **极简内核、可自我修改**：`server/` 尽量小；改变行为优先写扩展；Ultimate 能改自己的代码并通过 `restart` 热替换继续对话。
7. **单用户、本地优先、回环监听**：没有多租户；安全边界是"本机 + 浏览器同源 + 可选 Tailscale 身份"。

## 7. 用户可见的"完整功能面"清单（复刻范围基线）

- 会话：流式消息、思考、工具卡、diff、终端、图片、折叠、compact 模式、历史分页、fork/go back、复制引用
- 模型：provider 登录、模型选择、思考级别、fast 模式、健康检查、用量/成本状态行
- 工作：worktree 隔离、landing、review surface、plan/tasks/todos、automations、goal、pause
- 协作：@ultimate、branch、subagent、messages、questions、side chat、dream、watchdog
- 记忆与上下文：lineage tally/memory、recall、context 头、compact、keep-warm
- 平台：extensions 面板、secrets、settings、update、instance、cloud backup、tailscale、voice、sounds、splash
- 观察：status/status-line/info/health/system/debug/activity

> 每个功能的精确规格见 `10-extension-catalog.md` 与 `parts/ext-*.md`。

## 8. 复刻时的"不可删减"与"可裁剪"

**不可删减（决定架构成立）**：supervisor/core 双进程与换代协议、SQLite 提交模型、扩展发现/装载/契约/事件/文档/动作、SSE 复制协议、surface/slot/panel 体系、transcript + composer、root/branch/tally 模型、worktree + lander。

**可裁剪（产品厚度）**：voice-live、cloud、tailscale、classify/phase/recall（依赖外部 API）、dream、goal、automations、review/designer 等。裁剪时保持契约与 UI 槽位不变，避免破坏核心依赖。

## 9. 证据索引

- `README.md:11-42`（定位与自我特化）、`README.md:100-137`（项目/多实例）
- `AGENTS.md`（树模型、层与重载、评审质量）
- `agents/ultimate.md`（@ultimate 全部行为规则）
- `agents/coordinator.md`（分支工作流）
- `docs/extensions.md:64-102`（core tier 与依赖分层）
- `docs/extensions.md:154-197`（trace）
- `extensions/README.md:45-83`（扩展位置与优先级）
- `server/harness.ts:214-296`（root 创建、打开/恢复）
- `web/src/sdk/types.ts:6-23`（15 个 slot）
