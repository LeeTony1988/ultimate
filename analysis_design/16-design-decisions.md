# 16 · 关键设计决策（ADR 风格）

> 复刻时最容易"改错"的地方往往不是实现，而是这些选择背后的取舍。每条给出：背景 → 决策 → 代价 → 复刻建议。
> 依据来自源码与文档；"动机"部分为基于代码结构的合理解释（标注推断）。

## ADR-1 双进程：Supervisor + Core

**背景**：Ultimate 要能修改自己的 `server/` 并在对话不中断的情况下生效。
**决策**：Supervisor 持有公开端口与锁，Core 是 fork 出来的子进程；换代码时启动新 Core，旧 Core 释放存储后退出，代理把连接切到新 Core。
**代价**：两套生命周期、IPC 协议、端口代理、崩溃页；调试更复杂。
**为什么值得**：单进程无法在替换自身代码时保持监听与连接；代理层让浏览器无感。
**复刻建议**：先实现"代理 + IPC + 单 active"三件套；不要在 Core 里再监听公开端口。

## ADR-2 SQLite 作为唯一真相，先提交后展示

**背景**：agent 运行可能在任何一步崩溃；UI 要能断线重连恢复。
**决策**：会话、条目、文档、任务、提交都写入 `state.sqlite`；SSE 只广播已提交的变更；恢复从 Storage 读。
**代价**：写入延迟、WAL 管理、迁移复杂。
**复刻建议**：任何"看起来成功"的操作都必须先 `await commit`；不要在内存里维护可变的会话副本作为真相。

## ADR-3 文档（Document）而非全局 Store

**背景**：扩展需要持久、可观察、可 fork 的状态，且不同状态保留策略不同。
**决策**：每个状态是 `defineDoc({kind, scope, history, fork, checkpointWhen})`；支持快照、增量 ops、watch、as-of。
**代价**：需要理解 base/delta、version/migrate、fork 语义。
**复刻建议**：高频小状态用 `history:'latest'` + `checkpointWhen:()=>false`；需要回溯/分叉的用 rewindable/asOf；不要把大数组塞进一个文档（256KB UI 限制）。

## ADR-4 SSE 快照 + ops，而非 WebSocket 双向

**背景**：浏览器只需要读实时状态，写操作是低频 HTTP POST。
**决策**：`/api/events` 单向 SSE，首帧快照 + 后续 chord ops；写走 REST。
**代价**：无双向推送、需要处理重连与窗口化。
**复刻建议**：保持"单主 EventSource + 每会话文档流"；不要为聊天另开 WebSocket；所有 ops 必须能从快照重放。

## ADR-5 扩展目录即功能，core 只做框架

**背景**：项目需要按项目特化，且用户要能看懂/修改。
**决策**：所有功能（包括 Agent surface）都是 `extensions/<name>/`；`server/` 不知道任何功能名；扩展可热加载。
**代价**：跨扩展契约、加载顺序、依赖图、lint 约束。
**复刻建议**：从第一天就用"新建扩展"而不是"改 web/ 加页面"；核心只保留 surface host、transcript、composer、palette、SSE 客户端。

## ADR-6 服务/文档/事件/动作四条通道

**背景**：扩展之间需要不同强度的耦合。
**决策**：

- 服务（`defineApi`）：同步/异步调用，强类型；
- 文档（`defineDoc`）：持久状态，UI 读；
- 事件（`defineEvent`）：已发生的事实，reactor 异步处理；
- 动作（`actionRef`）：UI/用户边界，HTTP 调用。
  **代价**：需要判断该用哪条；误用会导致环/重复/丢失。
  **复刻建议**：按 `docs/extensions.md` 的"Pick the channel"表执行；跨扩展只 import `api.ts`/`ui.tsx`。

## ADR-7 root 不跑 turn，branch 是一等会话

**背景**：一个项目需要多条并行工作线，且要共享项目记忆。
**决策**：root（#1）只存记忆/tally/事件/UI 状态；branch 是独立 conversation，由 coordinator 执行；subagent 是有界子会话。
**代价**：需要 lineage/messages/workspace 的复杂协作。
**复刻建议**：先把"root + 一个 branch + 一个 subagent"跑通，再实现 tally/landing；不要让 branch 变成 subagent。

## ADR-8 工作区隔离用 Git worktree，不用容器

**背景**：本地单用户，隔离的目标是"不污染用户 checkout"，不是安全沙箱。
**决策**：`<home>/worktrees/<child id>`；lander 在集成 checkout 串行合并；`workspace submit` 是唯一落地路径。
**代价**：依赖 Git 状态；绝对路径仍可越界（明确说明不是 sandbox）。
**复刻建议**：保留"land 前必须 clean、base..head 不可变、lander 跑全量检查"；不要自动 rebase/force push。

## ADR-9 失败隔离三层

**背景**：扩展是用户可写的，必然会坏。
**决策**：进程级（crash/recover/rollback）、扩展级（保留旧 facet）、组件级（error boundary）。
**代价**：错误处理代码多；需要版本号触发重试。
**复刻建议**：每个 contribution 都包 boundary；registry 记录 `version`；服务端 facet 失败保留旧工具。

## ADR-10 追踪与事件日志内置

**背景**：agent 要能解释"为什么没发生"，开发者要能定位跨扩展问题。
**决策**：所有 service/action/reactor/tool/model 调用写 `trace.sqlite`；所有"发生了"写持久事件；`system` 合并成一条流。
**代价**：写入量、脱敏、轮询抑制。
**复刻建议**：trace 异步批量写、绝不阻塞调用；参数摘要 300 字符并脱敏；轮询只计数。

## ADR-11 系统提示稳定 + 变更走输入条目

**背景**：prompt cache 决定长会话成本与延迟。
**决策**：系统提示的 section 跨构建稳定；构建/指令/文档/landing 变化作为 `prompt.build` 条目附在输入前。
**代价**：需要 `SeenBuild` 文档与哈希比较。
**复刻建议**：不要每次请求重新拼接动态内容到 system；把变化放在 user 侧条目。

## ADR-12 源码直跑（Node 26 + Vite middleware）

**背景**：项目要能修改自己并立即生效；打包会增加一层延迟与缓存问题。
**决策**：服务端 `.ts` 直接由 Node 执行；浏览器由 core 内嵌 Vite 编译；类型检查只在 swap 前做核心子集。
**代价**：依赖新 Node；生产部署需要 Node 环境；首屏编译稍慢。
**复刻建议**：保持 `erasableSyntaxOnly`；不要引入需要转译的语法（enum/装饰器）；热替换只检查 `server/`+`shared/`。

## ADR-13 UI 状态 ui.rev 协议

**背景**：多标签页/多设备共享 UI 状态，服务端提交异步且可能乱序。
**决策**：本地乐观写入 + 批量 POST + 服务端每批递增 `ui.rev` + 客户端按 rev 释放覆盖层/丢弃旧快照。
**代价**：实现复杂（epoch/restarting/overlay）。
**复刻建议**：直接照搬 `ui-state.ts` 的算法；不要用"最后写入时间"或简单覆盖。

## ADR-14 项目信任（trust.json）

**背景**：项目 `.ultimate/` 会执行代码。
**决策**：首次遇到项目配置时询问；决策按"主 checkout"记录，worktree 共享；未信任时项目扩展/技能完全不加载。
**代价**：多一步 onboarding；跨机器需要重新信任。
**复刻建议**：信任检查放在 discovery 层，而不是加载后再过滤；worktree 用 `decisionRoot` 共享。

## ADR-15 扩展的 core tier

**背景**：某些扩展是其他扩展的硬依赖（conversations/workspaces/subagents…）。
**决策**：`api.ts` 中 `export const tier='core'`；永远启用；只依赖 core；可选扩展通过 point/event 插入。
**代价**：core 变大需谨慎；lint 约束。
**复刻建议**：先把 15 个 core 扩展做稳，再补可选层；任何"可选依赖 core"的方向都是错的。

## ADR-16 本地单用户安全模型

**背景**：Ultimate 只监听回环，但浏览器仍可能被恶意网页跨源请求。
**决策**：回环 + Origin/Sec-Fetch 校验 + 可选 Tailscale 身份；扩展动作额外要求同源；密钥 0600。
**代价**：无多用户/权限系统。
**复刻建议**：不要因为"本地"就省略 Origin 校验；Tailscale 只允许显式 allowlist。

## 复刻时的决策检查表

- [ ] 我是否把某个功能写进了 `server/`/`web/`，而不是扩展？
- [ ] 我是否在 commit 之前就更新了 UI？
- [ ] 我是否用轮询替代了事件/SSE？
- [ ] 我是否让扩展直接 import 了另一个扩展的实现？
- [ ] 我是否把动态内容拼进了系统提示？
- [ ] 我是否在 fork 后复制了不该复制的文档？
- [ ] 我是否让 lander 自动 rebase/force push？
- [ ] 我是否忽略了跨源请求校验？

## 证据索引

- `docs/extensions.md`、`extensions/README.md`、`AGENTS.md`
- `server/main.ts`、`bin/ultimate.ts`、`server/harness.ts`
- `web/src/sdk/store.ts`、`ui-state.ts`
- `extensions/subagents/README.md`、`extensions/workspaces/README.md`
- `docs/durability.md`、`docs/worktrees.md`、`docs/settings.md`
