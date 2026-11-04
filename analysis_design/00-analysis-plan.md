# Ultimate 源码分析与复刻设计方案 — 分析方案与 Checklist

> 目标读者：要按本分析结果**从零复刻 Ultimate** 的工程师。
> 分析对象：`D:\learnspace\git\ultimate`（git `3f7b7bec`，2026-10-27）。
> 分析目录：`analysis_design/`。排除：`node_modules/`、`dist/`、`build/`、`test/`（按用户要求过滤）。

---

## 1. 复刻目标的定义（先明确"复刻什么"）

Ultimate 不是一个单体应用，而是四层可替换结构的组合：

| 层         | 复刻产物                                                                             | 判定标准                                          |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 运行时骨架 | 监督进程 + 核心进程 + 嵌入式 Vite + SQLite 持久化                                    | 能 `pnpm start` 起服务、断点续跑、核心热替换      |
| 智能体内核 | 基于 Pi Durable 的会话/工具/子智能体/提交模型                                        | 会话、工具调用、子智能体全部先落库再展示          |
| 扩展系统   | 目录即扩展（`server.ts`/`web.tsx`/`api.ts`/`refs.ts`/`ui.tsx`）+ 契约/事件/文档/动作 | 新增一个扩展目录即可热加载服务端与 UI，无需改核心 |
| 产品外壳   | 53 个内置扩展构成的实际体验（树状会话、工作区、计划、自动化、语音…）                 | 逐扩展功能对齐，可按优先级裁剪                    |

因此本分析同时产出**架构规格**（必须严格对齐）与**功能规格**（可按里程碑裁剪）。

## 2. 分析方法

1. **契约优先（contract-first）**：先读 `shared/*` 与各 `api.ts`/`refs.ts`，得到系统的不变量与跨层协议；再读实现验证。
2. **分层纵切（vertical slice）**：按"浏览器 → HTTP/SSE → 扩展动作 → 服务 → 持久化 → 模型/工具"追踪一条完整请求，再横向铺开。
3. **双视角记录**：每条结论标注 `文件:行` 证据；无法从代码确认的写成"推断"，不写成事实。
4. **可复刻性校验**：设计文档必须能回答"新建哪个文件、导出什么、谁调用谁、失败怎样回滚、数据写到哪里"。
5. **并行分工**：核心层由 Lead 精读；扩展目录（53 个，约 6.8 万行）按依赖分层分组，由并行子分析产出结构化笔记，再汇总去重。

## 3. 产出物清单

```
analysis_design/
├─ 00-analysis-plan.md          # 本文件：方案 + checklist（进度真相源）
├─ README.md                    # 索引：怎么读、文档地图、结论摘要
├─ 01-product-model.md          # 产品模型：概念、术语、用户旅程、状态机
├─ 02-architecture.md           # 总体架构：进程/线程/数据流/分层/生命周期
├─ 03-tech-stack-and-build.md   # 工具链、依赖、脚本、构建与类型检查
├─ 04-supervisor.md             # bin/：监督者、核心换代、锁、端口、窗口
├─ 05-server-core.md            # server/：HTTP、API、事件、安全、trace、system
├─ 06-durable-runtime.md        # Pi Durable 集成：harness、提交、任务、恢复
├─ 07-protocol-and-sdk.md       # shared/protocol + web sdk（store/registry/hooks）
├─ 08-extension-system.md       # 扩展模型：发现、加载、契约、事件、文档、动作、UI 槽位
├─ 09-web-shell.md              # web/：surface、transcript、composer、palette、样式
├─ 10-extension-catalog.md      # 53 个内置扩展的逐项规格（汇总 + 附录）
├─ 11-agents-and-prompts.md     # agents/*.md、系统提示、技能、委派协议
├─ 12-lib-and-infra.md          # lib/：exec、进程组、git、密钥、设置、远程
├─ 13-data-model.md             # SQLite/文件布局、schema 清单、保留策略、备份
├─ 14-replication-blueprint.md  # 复刻路线图：里程碑、任务分解、验收、风险
├─ 15-file-manifest.md          # 全仓库源文件清单（复刻对照）
├─ 16-design-decisions.md       # ADR：关键取舍、代价与复刻建议
├─ 17-acceptance-spec.md        # 可执行验收场景（A–I）
├─ 18-subsystem-notes.md        # 平台层原始分析附录（SDK/Web/库/运行时/工具链）
└─ parts/                       # 原始分析笔记（按扩展分组/按子系统）
```

## 4. 阶段与 Checklist

> 状态标记：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成。完成一项即勾选，最终交付时全部为 `[x]` 或注明"不适用/超出范围"。

### 阶段 A — 摸底与索引

- [x] A1 仓库根目录清单、文件数/行数统计（排除 node_modules/dist/build/test）
- [x] A2 依赖清单与版本（`package.json`、`pnpm-workspace.yaml`、`patches/`）
- [x] A3 文档索引（README、AGENTS.md、docs/*、extensions/README.md）
- [x] A4 扩展清单与规模（53 个目录、行数、README 首段）

### 阶段 B — 运行时核心（Lead 精读）

- [x] B1 `bin/ultimate.ts`：CLI 参数、项目解析、端口、监督循环、核心换代协议
- [x] B2 `bin/cli.ts`、`bin/dashboard.ts`、`bin/open-window.ts`：逃生终端、终端仪表盘、浏览器窗口
- [x] B3 `server/main.ts`：启动顺序、锁、监听、Vite、优雅退出
- [x] B4 `server/harness.ts` + Pi Durable 装配：存储、恢复、提交、任务、模型运行时
- [x] B5 `server/http.ts` + `server/api.ts` + `server/events.ts`：路由表、SSE、鉴权、CSP
- [x] B6 `server/extensions.ts` + `extension-apis.ts` + `vite-extensions.ts`：发现/加载/热重载/服务注册
- [x] B7 `server/request-security.ts`、`lock.ts`、`discovery.ts`、`system.ts`、`trace.ts`、`tool-arguments.ts`
- [x] B8 `shared/protocol.ts`、`shared/events.ts`、`shared/extension-api.ts`：协议与不变量

### 阶段 C — 扩展系统与目录（并行子分析）

- [x] C1 扩展机制规格（目录结构、生命周期、core tier、依赖规则、lint 约束）
- [x] C2 核心层扩展：prompt / coding-tools / documents / notices / secrets / theme / models / conversations / workspaces / subagents / lineage / messages / onboarding / agent / sidebar
- [x] C3 编排与工作流扩展：plan / tasks / todos / phase / automations / goal / pause / review / workspaces
- [x] C4 会话与上下文扩展：context / compact / recall / dream / side-chat / keep-warm / questions / classify
- [x] C5 平台与运维扩展：status / status-line / health / info / setup / update / instance / watchdog / system / debug / activity / codemode
- [x] C6 外部集成扩展：cloud / tailscale / browser / voice / voice-live / parallel / claude-code / fast / sounds / splash / documents
- [x] C7 每个扩展的：职责、工具、动作、文档 kind、事件、UI 槽位、设置项、依赖、失败模式

### 阶段 D — Web 前端（Lead 精读 + 抽样）

- [x] D1 `web/src/sdk`：store、registry、hooks、actions、api、resume、ui-state
- [x] D2 `web/src/app`：App 装配、transcript、composer、titlebar、palette、keyboard、compact
- [x] D3 `web/src/components`：AI 组件与 UI 原语、diff/代码渲染
- [x] D4 样式系统：Tailwind v4、CSS 变量、主题、字体、响应式
- [x] D5 浏览器端持久化：ui-state、草稿、跟随/滚动、断线重连

### 阶段 E — 智能体与提示

- [x] E1 `agents/*.md` 九个角色定义：职责、工具白名单、模型/思考级别、交接协议
- [x] E2 `prompt` 扩展：系统提示组成、缓存稳定策略、技能注入、上下文注入
- [x] E3 子智能体协议：start/message/wait/stop、fork、后台、报告格式
- [x] E4 lineage/messages/note/notify 的跨会话协作语义

### 阶段 F — 数据、外部依赖与运维

- [x] F1 数据布局：`~/.ultimate/`、项目 home、SQLite 库表、文档、trace、事件日志
- [x] F2 Pi 包提供的能力边界（pi-ai/pi-coding-agent/pi-durable/pi-codemode/chord）
- [x] F3 网络面：回环、主机名、Tailscale、远程项目、鉴权模型
- [x] F4 脚本：setup-machine、reset、restore、deps、lint 规则
- [x] F5 安全与隐私：密钥、sealed trace、请求来源校验、项目信任

### 阶段 G — 汇总与可复刻方案

- [x] G1 术语表与概念模型（root/branch/tally/landing/turn/task/submission…）
- [x] G2 关键时序图（首启、发消息、工具调用、子智能体、landing、核心热替换）
- [x] G3 复刻蓝图：里程碑 M0–M7、每步文件清单、验收脚本
- [x] G4 风险清单与"不要这样复刻"的反模式
- [x] G5 全文交叉校对（链接、术语一致、无悬空引用）
- [x] G6 交付：README 索引 + 结论摘要

## 5. 质量门槛

- 每个子系统文档必须包含：**职责 / 对外契约 / 数据结构 / 关键流程 / 失败与恢复 / 复刻要点 / 证据索引**。
- 每个扩展条目必须能独立回答：它监听什么、暴露什么、写什么状态、UI 出现在哪里、关掉它会怎样。
- 设计文档中的路径、导出名、API 名必须与源码一致，可直接用来建文件。
- 明确区分：**必须复刻的机制**（如提交先行、扩展契约）与**可选的产品功能**（如 voice-live）。
