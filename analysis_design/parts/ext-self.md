# self 扩展分析笔记

## 1. 概览

`self` 让 Ultimate 意识到"自己正在运行哪份代码"：提供 replay-safe 的 `restart` 工具请求核心热替换，渲染重启结果、构建信息与 transcript 重载标记，并在状态行提示"core changed · restart"。它不是 core-tier（无 `api.ts`/`tier`），但依赖 `workspaces`（`host.need(WorkspacesApi)`），因此 workspaces 必须存在。

## 2. 规格

### 2.1 职责与用户可见行为

- Agent 修改 `server/`/`shared/` 后调用 `restart`，Supervisor 做类型检查并启动新 generation；失败则回滚并返回诊断。
- 状态行右侧显示 `core changed · restart`（仅当本进程启动后 `server/` 或 `shared/` 有变更），点击触发重启；失败变 `restart failed`，popover 里给原因。
- 构建信息（build id、core/lib hash、每个扩展 hash、history）可在 UI 中查看。
- Vite 热更新后，状态行上方出现 3 秒的安静 toast，列出被重新执行的模块；Tailwind 样式表仅在无其他变化时单独提示。
- transcript 渲染 `restart` 工具卡与重载标记。

### 2.2 服务端（`server.ts`）

- `section('self', …)`：向系统提示注入路径与规则：
  - `Project (your work)` = 当前 cwd；`Host project`；`Ultimate (running host)`；
  - 项目专属扩展/agent/skill/surface 放 `<cwd>/.ultimate/`；
  - 运行中的 host 从 `projectRoot/.ultimate/` 与 `ultimateRoot/extensions/` 加载；
  - 改 `server/`/`shared/` 才 restart；`web/`/`extensions/`/`agents/` 热重载即可；
  - 隔离 workspace 必须先 land 到运行中的 clone。
- `restart` 工具：
  - 参数 `{}`；`replay:'safe'`；原因注释说明目标 generation 在 swap 前 memo 化，重放只报告不重启；
  - 先检查隔离 workspace：`own.source === ultimateRoot` 且 `own.landed` 存在且 clone clean 且 `HEAD === own.landed`，否则拒绝；
  - `memo('restart:<taskId>')` 记录 `{generation, fromGeneration, build}`；
  - 重放时：若当前 generation ≠ 记录的 generation → 说明激活失败被回滚，返回 `rolledBack` 详情；
  - 否则返回成功详情（from/to generation、from/to build）；
  - 首次执行：`host.restart(approved)`，`approved` 里写 memo，等待 supervisor 结果。

### 2.3 浏览器（`web.tsx`）

- `tools: { restart: RestartCall }`：工具卡显示重启前后 generation/build，失败显示回滚原因。
- `slots['statusline.right']`：
  - `CoreStale`（`phone:true`）：`core changed · restart` / `restart failed`，用 `useRestart()` 的 `busy/error/run`；
  - `Build`（order 1）：build id 与详情 popover（core/lib/扩展 hash、history）。
- `overlay: HotReloaded`：监听 Vite HMR 事件，3 秒 toast。
- 重启后的 transcript 重载标记来自 `prompt` 扩展的 `prompt.build` entry（`self` 只负责工具卡与状态）。

### 2.4 依赖与协作

- `WorkspacesApi`：`need`（隔离 workspace 的 source/landed 校验、git 状态）。
- `host.restart`：核心能力，通向 `server/supervisor-protocol.ts` 的 `requestSwap`。
- `prompt`：构建变化说明（`prompt.build` entry）。
- `status-line`：同在 `statusline.right`，发现顺序让 `self` 排在 `live · gen N` 左侧。

### 2.5 失败与恢复

- `pnpm dev`（无 supervisor）：`host.restart` 返回 "Restart requires pnpm start"，工具报错。
- 类型检查失败：不启动新 core，工具返回错误与 tsc 输出尾部。
- 激活失败：旧 core reacquire，系统信息带 `activationError`；重放的工具调用报告 `rolledBack`。
- workspace 未 landing：拒绝并提示先 land。

### 2.6 关掉它

非 core，可禁用；禁用后没有 `restart` 工具（agent 无法请求热替换）、状态行没有 core 陈旧提示、没有构建详情与 HMR toast；热替换仍可由 `POST /api/restart` 触发。

### 2.7 复刻要点

- `replay:'safe'` 必须有 memo：否则重启后重放会再次触发 swap（无限重启）。
- 隔离 workspace 的四个校验（source/landed/clean/HEAD）缺一不可。
- 状态行提示依赖 `system.code.coreStale`（`server/system.ts` 在 `server/`/`shared/` 变更时置位）。
- HMR toast 去重/合并，避免每个模块一条。

### 2.8 证据

`extensions/self/README.md:1-10`；`server.ts:1-200`（section、restart 工具、memo、workspace 校验）；`web.tsx:40-102`（RestartCall）、`102-179`（CoreStale）、`179-261`（Build）、`261-356`（HotReloaded）、`357-367`（contributions）。
