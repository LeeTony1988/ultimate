# 14 · 复刻蓝图（路线图、任务分解与验收）

> 目标：把前 13 章的设计变成可执行的工程计划。按里程碑推进，每个里程碑都有**可运行的验收**；先机制、后产品。
> 估算基于"1 名熟悉 Node/React 的资深工程师，复用 Pi Durable"的前提；自研运行时需额外 2–3 倍。

## 0. 复刻策略选择（先做这一个决定）

| 方案                           | 做法                                              | 工作量           | 风险                      | 建议                        |
| ------------------------------ | ------------------------------------------------- | ---------------- | ------------------------- | --------------------------- |
| **A. 复用 Pi Durable**（推荐） | 固定 `@earendil-works/*@1.4.0`，按第 6 章装配     | 8–12 人周达到 M4 | 上游 API 变动；需 Node 26 | 复刻本仓库 90% 的价值在这里 |
| B. 复用 Pi 但自研持久层        | 用 pi-ai/pi-coding-agent，自己写 SQLite 会话/任务 | +6–10 人周       | 恢复/任务状态机极易出错   | 不推荐                      |
| C. 全自研                      | 自己写 agent loop、存储、任务、扩展               | +20 人周以上     | 高                        | 除非有强约束，否则不做      |

**建议**：先按 A 做，把 Pi Durable 当黑盒；所有耦合点集中在 `server/harness.ts`，便于日后替换。

## 1. 里程碑总览

```
M0 骨架          1 周    进程/端口/锁/空页面
M1 持久内核      2 周    SQLite + Harness + 提交/恢复 + SSE
M2 扩展系统      2 周    发现/装载/契约/事件/文档/动作 + Web registry
M3 Web 外壳      2 周    surface/transcript/composer/palette/UI state
M4 智能体产品    2–3 周  prompt/tools/models/conversations + branch/subagent/workspace
M5 编排与上下文  1–2 周  plan/tasks/todos/questions/context/compact…
M6 运维与集成    2 周    status/health/setup/system/debug/codemode/automations…
M7 加固与发布    1–2 周  安全/性能/恢复测试/文档
```

最小可用克隆（MVP）= **M0–M4**；完整产品 = M0–M7。

## 2. M0：骨架（1 周）

### 交付

1. `package.json`（Node 26、pnpm、ESM、scripts）
2. `tsconfig.json` / `tsconfig.web.json` / `tsconfig.swap.json`
3. `vite.config.ts`（root=web、react、tailwind、alias `@`）
4. `bin/ultimate.ts`：CLI → home → lock → TCP proxy → fork core → IPC → 崩溃页
5. `bin/dashboard.ts`、`bin/open-window.ts`、`bin/cli.ts`
6. `server/main.ts`：prepare → Vite middleware → http.listen(0) → IPC go/release
7. `server/lock.ts`、`server/supervisor-protocol.ts`、`shared/protocol.ts`（先放最小类型）
8. `web/index.html` + `web/src/main.tsx` + 一个空白 App

### 验收

```bash
pnpm start
# 终端显示 Ultimate: http://127.0.0.1:4747
curl -s localhost:4747/ | head      # 返回 HTML
kill -9 <core pid>                  # supervisor 自动拉起新 generation
ultimate --port 0 --no-open         # 随机端口
```

- [ ] 重复启动同项目会打开已有窗口并退出 0
- [ ] 端口占用自动 +1
- [ ] `home/reset.json` 存在时拒绝启动

### 风险

- Windows 进程组/信号差异（见 `lib/windows-process-group.ts`；M0 可先不接）。
- `fork` 的 IPC 消息类型必须一开始就定好（`ChildMessage`/`SupervisorMessage`），后面所有换代码都依赖它。

## 3. M1：持久内核（2 周）

### 交付

1. `server/harness.ts`：`ModelRuntime`、`SettingsManager`、`registry`、`Harness.open`、`root()`、`UiState`、storage lock
2. `server/build.ts`、`server/metadata.ts`、`server/ui-state.ts`
3. `server/events.ts`：事件日志/emit/reactor
4. `server/api.ts`：`/api/events`、`/api/conversations/:id/submit|abort|configure|compact|history`、`/api/ui`、`/api/models`
5. `web/src/sdk/store.ts`：EventSource 复制 + ops
6. 一个最小的 faux provider（测试用）与脚本化对话

### 验收

```bash
# 用 curl 提交
curl -X POST localhost:4747/api/conversations/1/submit \
  -H 'content-type: application/json' -d '{"text":"hello"}'
curl -N localhost:4747/api/events | grep -E 'event: (view|ops|doc)'
```

- [ ] 提交后 `state.sqlite` 里有 entry；重启后 `/history` 能读到
- [ ] 流式响应以 `ops` 增量到达，窗口裁剪正确（>150 条时 `older` 游标）
- [ ] `abort` 中止当前 run 但保留 queued follow-up
- [ ] `kill -9` core 后恢复，未完成任务继续
- [ ] 两个标签页同时打开，`/api/ui` 写入按 `ui.rev` 有序
- [ ] 事件 emit/reactor：写入与 cursor 同事务，故意抛错后事件重试

### 关键决策

- `HarnessSettings.followUpMode='all'`；
- `EnvTarget` 按 cwd 复用 `NodeExecutionEnv`；
- `onReport` 统一映射 notice。

## 4. M2：扩展系统（2 周）

### 交付

1. `server/discovery.ts`、`project-setup.ts`、`extension-settings.ts`、`project.ts`
2. `server/extensions.ts`：scope/facetHost、provide/need/want、actions、docs、secrets、reload/unload
3. `server/extension-apis.ts`（Proxy 句柄/catalogue/cycles）
4. `server/vite-extensions.ts`（虚拟模块 + CSS @source + HMR）
5. `server/trace.ts` + `server/tool-arguments.ts`
6. `server/actions.ts` + `lib/actions.ts`
7. `web/src/sdk/registry.ts`、`types.ts`、`extensions.ts`、`hooks.ts` 的基础部分
8. `web/src/app/boundary.tsx`（ExtensionBoundary/Provided/AllProvided）

### 验收

- [ ] 新建 `extensions/hello/{README.md,server.ts,web.tsx}`，状态栏出现、工具可用、面板列出
- [ ] 改 `web.tsx` 后 HMR 立即更新，页面不刷新
- [ ] 改 `server.ts` 后工具替换，旧调用完成、新调用用新代码
- [ ] `web.tsx` 抛错：错误卡 + 其他 UI 正常 + 旧版本保留
- [ ] `server.ts` 抛错：`server.error` 展示，旧工具仍可用
- [ ] 禁用扩展：工具/面板/状态项消失；core 扩展拒绝禁用并产生诊断
- [ ] `host.need` 缺失时报 `<ext> needs <api>`；`catalogue()` 有 missing/cycles
- [ ] `trace.query` 能看到 action/service/tool/reactor 行
- [ ] 项目未信任时 `.ultimate/extensions` 完全不加载；信任后加载

### 关键难点

- **虚拟模块**：项目/用户扩展的裸导入要 dedupe 到 clone 的 node_modules；`@/` 指向 `web/src`；
- **facet 生命周期**：staging provider、旧 facet dispose 顺序、`resource` 跨 reload；
- **HMR 与 React Refresh**：`__getReactRefreshIgnoredExports`、`vite:afterUpdate`。

## 5. M3：Web 外壳（2 周）

### 交付

1. `web/src/app/App.tsx`（surface host/boundary/ready）
2. `primitives.tsx`（Header/Sidebar/Panels/Dock/StatusLine/Conversation）
3. `transcript.tsx` + `compact.ts` + `model.ts` + `tool-call.tsx` + `message-actions.tsx` + `user-turn.tsx`
4. `composer.tsx` + `queued.ts` + `image-paste.tsx`
5. `titlebar.tsx`、`palette.tsx`、`keyboard.ts`、`boundary.tsx`、`fork.ts`、`follow.ts`
6. `sdk/ui-state.ts`、`actions.ts`、`api.ts`、`client.ts`、`resume.ts`、`viewport.ts`
7. `components/ai/*`（conversation/message/reasoning/tool/prompt-input/code-block）
8. `index.css` 主题

### 验收

- [ ] 发送消息，流式文本/思考/工具卡/图片正常
- [ ] 工具卡可折叠，长时间运行显示计时；错误/中断状态正确
- [ ] 上滚不被拉回；发送后回到底部；刷新后恢复滚动
- [ ] 历史分页到最开始；compact 模式折叠/展开
- [ ] `mod+k` 命令面板、`mod+1…9` surface、`mod+b`/`mod+alt+b`
- [ ] 手机宽度（390px）布局正常
- [ ] 多标签页 UI 状态同步，无回跳
- [ ] 任一 surface 崩溃回退 Agent；任一工具卡崩溃只坏自己

## 6. M4：智能体产品（2–3 周）

按依赖顺序实现 core-tier：

```
prompt → coding-tools → documents → notices → secrets → theme
      → models → conversations → workspaces → subagents → lineage → messages
      → onboarding → agent → sidebar
```

### 交付

- `prompt`：系统提示 section、`prompt.build` 注入、指令热更新
- `coding-tools`：read/write/edit/bash(powershell)、shell 卡、commit trailer 事件
- `models`：登录/模型/思考级别/fast/健康
- `conversations`：标题/摘要/overview/conclude/resume
- `workspaces`：worktree、submit、lander、landing 事件
- `subagents`：start/message/wait/stop/list、reporter、standing agents、isolate
- `lineage`：root/branch/tally/memory/note
- `messages`：message/branch/note/notify、questions
- `onboarding`：首启 Get ready、setup 卡、Extensions 面板
- `agent` + `sidebar`：Agent surface、@ultimate 行、树视图

### 验收（端到端）

- [ ] 首启走完 Get ready → @ultimate → 项目记忆 → 第一个 branch
- [ ] branch 的 coordinator 能做 assessment 并等待用户决策
- [ ] coordinator 委派 worker（worktree）→ 提交 → 报告 → review → submit
- [ ] lander 检查失败时诊断/修复，成功时 fast-forward + 推送
- [ ] @ultimate 用问题卡向用户提问，回答回到分支
- [ ] 重启后分支/子智能体/消息全部恢复
- [ ] 侧栏显示树、tally/History 页可读

## 7. M5：编排与上下文（1–2 周）

实现：`plan`、`tasks`、`todos`、`questions`、`context`、`compact`（会话压缩 UI）、`keep-warm`、`side-chat`、`dream`、`phase`、`classify`、`recall`。

验收：

- [ ] `plan` 的 epic/task 在 prompt 中可见，状态推进正确
- [ ] To-dos 面板可勾选，@ultimate 回合开始注入变更
- [ ] 上下文头显示 agent/model/token 预算
- [ ] compact 后 transcript 正确折叠，go-back 排除条目
- [ ] side chat 可丢弃/总结注入
- [ ] dream handoff/pass/proposals 全流程

## 8. M6：运维与集成（2 周）

实现：`status`、`status-line`、`health`、`info`、`setup`、`system`、`debug`、`activity`、`codemode`、`automations`、`watchdog`、`instance`、`update`、`pause`、`review`、`browser`、`voice`、`voice-live`、`parallel`、`claude-code`、`fast`、`sounds`、`splash`、`cloud`、`tailscale`。

验收：

- [ ] `system` 流合并事件/trace，支持过滤/分页
- [ ] `debug` 能回答"为什么没发生"（事件、reactor lag、catalogue、trace）
- [ ] automations 的 schedule/script/event/condition 四类触发都能工作且重启恢复
- [ ] instance 能启动第二个 Ultimate 做预览
- [ ] tailscale 只允许 allowlist 登录；cloud 备份/恢复闭环

## 9. M7：加固与发布（1–2 周）

- **崩溃矩阵**：core crash、swap 失败、storage lock 残留、扩展加载失败、SSE 断线、页面崩溃
- **安全**：Origin/Sec-Fetch、扩展动作同源、secrets 0600、trace 脱敏、Tailscale 身份
- **性能**：>1000 条会话列表、>5000 条 transcript、流式 60fps、SSE 广播去抖
- **可观测**：trace 行数/延迟、reactor lag、事件积压、启动时间
- **文档**：README、扩展指南、运行/设置/持久化、迁移说明

## 10. 任务分解（可按 issue 建）

### 10.1 核心（server/）

| #   | 任务                          | 依赖  | 验收                |
| --- | ----------------------------- | ----- | ------------------- |
| S1  | lock.ts + supervisor-protocol | —     | 双进程启停          |
| S2  | harness.ts 装配               | S1    | root + UI 文档      |
| S3  | api.ts 基础端点               | S2    | curl 提交/历史      |
| S4  | events.ts                     | S2    | emit/react 重试     |
| S5  | extensions.ts                 | S2,S3 | hello 扩展          |
| S6  | extension-apis.ts             | S5    | need/want/catalogue |
| S7  | trace.ts                      | S2    | 查询到行            |
| S8  | system.ts                     | S5    | system 快照         |
| S9  | request-security.ts           | S3    | 跨源 403            |
| S10 | vite-extensions.ts            | S5    | 项目扩展 HMR        |

### 10.2 Web（web/）

| #   | 任务                | 依赖 | 验收               |
| --- | ------------------- | ---- | ------------------ |
| W1  | store.ts            | S3   | 事件复制           |
| W2  | registry.ts + types | S5   | slot/panel/surface |
| W3  | App/primitives      | W2   | 空 surface         |
| W4  | transcript          | W1   | 流式渲染           |
| W5  | composer            | W1   | steer/followUp     |
| W6  | palette/keyboard    | W2   | 命令               |
| W7  | ui-state            | S3   | 多标签同步         |
| W8  | resume              | W4   | 刷新无白屏         |

### 10.3 产品扩展（按 core 层）

| #      | 任务                         | 依赖  |
| ------ | ---------------------------- | ----- |
| E1     | prompt + coding-tools        | S5    |
| E2     | models + conversations       | E1    |
| E3     | workspaces                   | E2    |
| E4     | subagents                    | E2,E3 |
| E5     | lineage + messages           | E4    |
| E6     | onboarding + agent + sidebar | E5    |
| E7–E12 | 其余按 M5/M6 分组            | E6    |

## 11. 验收测试清单（复刻完成的定义）

1. **持久性**：任意时刻 `kill -9` core，重启后对话/任务/子智能体/消息不丢，且不重复投递。
2. **热替换**：改 `server/` → `restart` → 类型检查 → 新 generation 服务，SSE 自动重连，旧对话继续。
3. **扩展隔离**：同时破坏 server/web facet，其他功能不受影响；修复后自动恢复。
4. **树模型**：一个 root 下 3 个 branch 并行，各自 worktree，landing 后 tally 正确更新。
5. **消息语义**：@ultimate 的问题卡、分支回复、`reply:false` 通知、跨项目 `tell` 全部正确。
6. **安全**：从恶意网页发起跨源请求被 403；密钥不出现在 trace/日志；Tailscale 只允许 allowlist。
7. **性能**：1000 条会话侧栏滚动流畅；5000 条 transcript 分页可用；流式渲染不卡顿。
8. **可恢复**：`pnpm reset` 后可从头开始；`pnpm restore` 能回到备份状态。

## 12. 风险清单

| 风险                    | 影响                | 缓解                                                          |
| ----------------------- | ------------------- | ------------------------------------------------------------- |
| Pi Durable API 不稳定   | 升级即破坏          | 精确版本 + 把耦合集中在 harness.ts + 读 `docs/pi-upstream.md` |
| Node 26 未普及          | 无法启动            | 固定 engine；CI/开发机统一版本                                |
| Vite HMR + 虚拟模块复杂 | 扩展热更新不稳      | 先做整页 reload 兜底，再逐文件 HMR                            |
| SSE 快照/增量竞态       | UI 回跳/丢消息      | `ui.rev` 模式 + 快照 raw 去重 + 窗口重发                      |
| 事件 reactor 重复副作用 | 重复发消息/提交     | 事务内写 cursor；外部副作用幂等                               |
| worktree/lander 竞态    | landing 冲突/丢提交 | 单 lander、串行队列、base..head 不可变                        |
| Windows 进程组/信号     | 子进程杀不干净      | 用 `lib/windows-process-group.ts` 的 Job Object 实现          |
| 模型成本                | 长会话费用高        | compaction、cache、fast 模式、keep-warm                       |

## 13. 反模式（不要这样复刻）

1. **把功能写进 `server/` 或 `web/`**：核心会膨胀，热重载失效；一切功能进 `extensions/`。
2. **绕过 commit 直接改 UI 状态**：刷新/重启即丢；所有状态先落库。
3. **用轮询代替 SSE/事件**：trace 会被轮询淹没，UI 抖动。
4. **扩展之间直接 import 实现**：破坏契约与热替换；只能 `api.ts`/`ui.tsx`。
5. **在扩展里长期持有 provider/文档 token**：reload 后失效；每次调用重新解析。
6. **手写 SQL 改 `state.sqlite`**：破坏 Pi 的 id/版本/文档语义；只经 `tx`。
7. **为兼容旧形状写 shim**：项目哲学是"向前改，更新调用方"。
8. **把用户可见结果直接塞 Markdown**：必须有与现有卡片一致的渲染器。

## 14. 建议的第一周（可直接执行）

| 天  | 任务                                  | 产出                           |
| --- | ------------------------------------- | ------------------------------ |
| D1  | 初始化工程、tsconfig/vite、空 App     | `pnpm dev` 出页面              |
| D2  | supervisor + lock + proxy + dashboard | `pnpm start`，kill core 能恢复 |
| D3  | harness + root + `/api/events` 空流   | SSE 心跳                       |
| D4  | submit/history + faux provider        | curl 一轮对话                  |
| D5  | store + transcript 最简渲染           | 浏览器看到消息                 |
| D6  | 扩展发现 + hello server/web           | 状态栏出现 hello               |
| D7  | 复盘、补测试、写 ADR                  | 可演示的 M0/M1 雏形            |

## 15. 证据索引

- 全部前序章节；特别是 `02-architecture.md`（时序）、`06-durable-runtime.md`（依赖边界）、
  `08-extension-system.md`（扩展契约）、`10-extension-catalog.md`（功能清单）。
- `README.md`、`AGENTS.md`、`docs/running.md`、`docs/worktrees.md`。
