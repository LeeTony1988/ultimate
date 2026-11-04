# 02 · 总体架构

> 本文给出复刻所需的系统结构：进程拓扑、模块分层、一次请求/一次运行/一次换代的完整时序、端口与文件布局、失败恢复。
> 证据以 `文件:行` 标注；无法从代码直接确认的推断会注明"推断"。

## 1. 进程拓扑

```
                      ┌──────────────────────────────────────────────┐
                      │ Supervisor  (bin/ultimate.ts, 主进程)         │
                      │  · CLI 解析、项目解析、home、锁(ultimate.lock)  │
                      │  · 监听 127.0.0.1:<port> 的 TCP 代理(原始 socket)│
                      │  · fork/监督 Core 子进程，一次只 active 一个     │
                      │  · 换代：tsc 检查 → boot next → prepared → 切换  │
                      │  · 文件监听(server/shared/extensions/.ultimate)  │
                      └───────────────┬──────────────────────────────┘
                                      │ IPC (child_process fork)
                      ┌───────────────▼──────────────────────────────┐
                      │ Core  (server/main.ts, Node 子进程)           │
                      │  · HTTP server + Vite middleware (同一端口)    │
                      │  · Pi Durable Harness + SQLite (state.sqlite) │
                      │  · 扩展装载/热重载 (server/extensions.ts)      │
                      │  · API/SSE (/api/*) + 静态资源                │
                      │  · trace.sqlite、事件日志、system 快照         │
                      └───────────────┬──────────────────────────────┘
                                      │ HTTP / SSE
                      ┌───────────────▼──────────────────────────────┐
                      │ Browser (React 19 + Vite dev/HMR)             │
                      │  · store(EventSource 复制) + registry(web facet)│
                      │  · surface/slot/panel/transcript/composer      │
                      └──────────────────────────────────────────────┘
```

要点：

1. **Supervisor 永不执行 agent 逻辑**，只做三件事：端口代理、进程生命周期、文件变化触发重试/换代。它自身变更需要人工重启（`README.md:98`）。
2. **Core 无固定端口**：`prepareServer({ port: 0 })` 让 OS 分配（`server/main.ts:287`），通过 IPC 把端口报给 supervisor；对外始终是 supervisor 的端口，代理做原始 TCP 转发（`bin/ultimate.ts:129-137`）。
3. **一次只服务一个 core**：`active` 指针；`pending` 队列缓存换代/崩溃期间的连接（`bin/ultimate.ts:123,178-186`）。
4. **浏览器只与 supervisor 端口通信**；core 换代会断开 SSE，前端自动重连并收到新的 `system`（含新 `generation`）。

## 2. 模块分层（源码目录）

```
bin/            # 监督者 + 逃生 CLI + 终端仪表盘 + 打开窗口
server/         # 核心进程：HTTP/API/SSE、harness、扩展装载、系统信息、trace、锁
shared/         # 服务端与浏览器共享的协议/事件/扩展契约（browser-safe）
lib/            # 纯工具：exec、git、进程组、JSON 文件、密钥、settings、远程调用
web/src/sdk/    # 浏览器 SDK：store、registry、hooks、actions、api、ui-state、resume
web/src/app/    # shell：App、primitives、transcript、composer、titlebar、palette…
web/src/components/ # AI/UI 原语（button、dialog、tool、code-block…）
extensions/     # 53 个内置扩展（每个含 server.ts/web.tsx/README）
agents/         # 9 个智能体定义（Markdown + frontmatter）
skills/         # 内置技能
docs/           # 架构/运行/设置/持久化/子智能体/上游说明
scripts/        # setup-machine/reset/restore/deps
lint/           # 自定义 oxlint 规则（导入边界、测试约束）
```

依赖方向（`pnpm deps` 会检查，`scripts/deps.ts`）：

```
shared/ ← lib/ ← server/ ← bin/
shared/ ← web/src/sdk ← web/src/app ← extensions/*/web.tsx
server/ ← extensions/*/server.ts （只允许 type import 核心；runtime 走 ExtensionHost）
extensions 之间只允许 runtime import 对方的 api.ts（服务端）或 ui.tsx（浏览器）
```

## 3. 启动时序（`pnpm start` / `ultimate`）

```
1. bin/ultimate.ts
   ├─ 解析 --port/--no-open/positionals；realpath(project)
   ├─ home = ULTIMATE_HOME ?? ~/.ultimate/projects/<basename>-<sha256(root)[0:8]>
   ├─ mkdir(home)
   ├─ acquireLock(home/ultimate.lock)  ← SQLite BEGIN EXCLUSIVE 作为互斥体
   │    · 已运行：若允许打开窗口，读 owner.port 并 openWindow()，退出 0
   │    · stale：retireStorageOwner(home/storage.lock)（校验 cmdline 后 SIGTERM/SIGKILL）
   ├─ 检查 home/reset.json  ← 半途的 reset/restore 拒绝启动
   ├─ dashboard(home/supervisor.log)  ← 终端仪表盘
   ├─ 监听 proxy 端口（默认 4747，占用则 +1），写 lock.update({port})
   ├─ recover():
   │    boot() → fork(server/main.ts, env: ULTIMATE_HOME/PROJECT/SUPERVISED/GENERATION/PUBLIC_URL)
   │    wait('prepared') ← core 已完成 prepareServer 并 listen(0)
   │    send('go') → wait('ready') ← core 打开 SQLite、装载扩展、开始服务
   │    active = core; flush() 挂起的 socket
   └─ openWindow(publicPort)（首次）
2. server/main.ts (supervised)
   ├─ prepareServer():
   │    ├─ prepareHarness(): ModelRuntime、SettingsManager、registry、trace、build
   │    ├─ createAccess() / createHttpServer() / Vite(middlewareMode)
   │    ├─ loadExtensions(vite, host, ...)  ← 先装载 server facet
   │    ├─ http.listen(0)
   │    └─ createSystem(...)  ← git 信息、skills、project settings、extensions 快照
   ├─ 等待 supervisor 'go'
   ├─ host.open(false) → acquire storage.lock → openNodeSqliteStorage(state.sqlite)
   │    → Harness.open(...) → root() → 提交 UiState + AgentDoc.model
   ├─ serve(): 提交 ultimate.started 事件 → extensions.opened() → system.changed()
   │    → createApi() → harness.resume() → reportCore({type:'web',state:'ready'})
   └─ send('ready')
3. 浏览器
   ├─ GET / → Vite 转 index.html → React 启动
   ├─ loadExtensions(): import('virtual:ultimate/web-facets') 逐个动态 import
   └─ EventSource('/api/events?…') → system/conversations/view/ui/docs/tasks…
```

证据：`bin/ultimate.ts:30-222,290-393`；`server/main.ts:33-210,285-314`；`server/harness.ts:214-296`。

## 4. 端口、URL 与安全边界

- 只监听 `127.0.0.1`（`server/main.ts:176`、`bin/ultimate.ts:200`）。
- 外部 URL 形如 `http://127.0.0.1:<port>`；`ultimate.localhost` 仅用于打开无边框窗口（`bin/ultimate.ts:42-43`），
  `loopbackAuthority` 接受 `*.localhost`（`server/request-security.ts:115-130`）。
- 每个请求先 `admit(request, port, access.rules)`（`server/main.ts:69`、`server/api.ts:357`）：
  1. 本机回环 + 无 Origin 或回环 Origin → 放行；
  2. 否则要求 `Sec-Fetch-Site` 为 same-origin/none，或"根导航"特例（仅 GET `/`，document）；
  3. 否则遍历 `access.rules`（由 `tailscale` 等扩展注册）：host 必须匹配 origin，`verify()` 返回登录名。
- WebSocket upgrade 走同一 `admit`（`server/main.ts:87-99`）。
- 扩展 action 额外要求 `sec-fetch-site: same-origin` 或存在 `origin`（`server/api.ts:111`）。
- 密钥：`~/.ultimate/secrets.json`，POSIX 0600/目录 0700（`extensions/secrets`、`lib/secrets.ts`）。

## 5. 数据流一：浏览器打开一个会话

```
EventSource /api/events?conversation=<id>&docs=<k1,k2>
  → server/api.ts:stream
     ├─ 校验 conversation 存在
     ├─ 对每个 doc kind: extensions.doc(kind) → tx.doc(token,id) → harness.watchDoc
     ├─ root 的 UiState watch
     ├─ conversation.watch()
     ├─ 立即发送: system / conversations / view(windowed) / ui / tasks / doc(s)
     ├─ 订阅: watch.start(ops) → 发送 'ops'（或 window 重发 'view'）
     ├─ ui.start(ops) → 'uiOps'；doc.watch.start(ops) → 'docOps'
     ├─ events.listeners.add(send) → conversations/tasks/notice 广播
     └─ 15s 心跳 ': heartbeat'
```

客户端 `createStore`（`web/src/sdk/store.ts`）：

- 每个事件名注册监听，`view` 直接替换快照，`ops` 用 `applyImmutable` 增量应用；
- `show(id)` 切换会话：优先用最近 6 个视图缓存立即绘制（`recent`），再重连取快照；
- `watchDoc(kind)` / `watchDocOf(id,kind)` 引用计数，按会话合并成一条 EventSource；
- `conversations`、`tasks`、`system` 全局广播；
- 断线：`EventSource` 自动重试；服务端返回错误状态导致 CLOSED 时，1s 后手动重连；从未打开过且无视图则回退 root。

## 6. 数据流二：一次用户输入

```
Composer submit
 → api.submit(text, whenBusy, id, images)
 → POST /api/conversations/:id/submit
    ├─ 校验 text/images（≤4 张、每张 ≤2MiB、base64 严格校验）
    ├─ `/skill:name` 展开为技能指令
    ├─ conversation.submit({type:'input', content, whenBusy})
    ├─ 读 submission.status 判断 prompt/steer/follow-up
    ├─ 单独 commit 发 UserInputEvent（不含文本，只含长度/设备）
    └─ 202 { submissionId }
 → Pi Durable: 接纳输入 → Entry(user) → 运行 generation（模型流、工具）
 → commit 发布 → harness.subscribeCommits → API 层推送 view ops
 → Browser: store.applyImmutable → 渲染
```

停止：`POST /abort` 不是 `conversation.abort()`，而是循环中止该会话自己的非后台任务并等待，
保留 queued follow-up（`server/api.ts:578-596`）。

## 7. 数据流三：核心热替换（自改代码）

```
agent 调 restart 工具 → host.restart(approved) → requestSwap(approved, builds.current())
   → IPC {type:'swap', requestId, build}
Supervisor.swap():
   1. tsc --noEmit -p tsconfig.swap.json          （类型检查失败 → swap-result ok:false）
   2. boot(previousBuild)  ← 新 core 进程，env ULTIMATE_GENERATION+1
   3. wait 'prepared'                              （新 core 已完成 prepare 并监听 0）
   4. 向旧 core 发 swap-result ok:true,generation
   5. 旧 core 的 approved(generation) 持久记录"已批准"→ 回 swap-ack
   6. active=undefined；旧 core release()：extensions.released() → api.close() → closeAllConnections → host.close()
   7. 旧 core 回 'released'；start(next)：send go → 新 core 打开同一 SQLite → ready
   8. 旧 core exit（10s 宽限，最后 SIGKILL）
失败：
   - 第 1-5 步失败 → 旧 core 继续服务（swap-result ok:false）
   - 第 6 步后失败（旧已释放）→ 向旧 core 发 reacquire，旧 core 重新 open storage（error 传入 system.activationError），
     若还不行则 kill 并 recover()
```

证据：`bin/ultimate.ts:394-457`、`server/main.ts:219-250`、`server/supervisor-protocol.ts:33-62`、`server/harness.ts:190-192`。

**关键不变量**：对话、工具调用、子智能体在展示前已提交；换代的唯一"空窗"是 storage lock 释放到新 core 打开之间，
supervisor 用 `pending` 队列挂起连接，浏览器 SSE 断线重连后从新 generation 的快照恢复。

## 8. 扩展装载与热重载

### 8.1 发现

`discoverExtensions(ultimateRoot, projectRoot, userHome, includeProject?, settings?)`（`server/discovery.ts`）：

- 根顺序：`builtin`(clone) → `user`(~/.ultimate) → `project`(<project>/.ultimate)；同名后者覆盖前者（整扩展替换）。
- 每个目录读文件名列表；`api.ts` 含 `export const tier = 'core'` 即核心层。
- 启用规则：`core` 恒开；否则 `settings.overrides.get(name) ?? !(builtin && defaultOff.includes(name))`。
- 项目层仅当 `useProjectSetup()` 为 true（用户在 `~/.ultimate/trust.json` 里批准过该根）才参与发现。

### 8.2 装载（server facet）

`loadExtensions`（`server/extensions.ts:108-775`）：

1. 扫描 + 排序（`compareExtensions`: order → source → name）。
2. 对每个启用且有 `server.ts` 的扩展：
   - `vite.ssrLoadModule(path/server.ts)`（Vite 负责 TS 转译与依赖图）；
   - 默认导出可以是对象或工厂 `(host) => Extension`；`extension.name` 必须等于目录名；
   - 校验 `docs`（必须是 conversation scope）、`actions`（函数）、`userActions`、`pollActions`、`secrets`；
   - `host.registry.install(trace.tools(extension))` 安装工具；
   - 用新 facetHost 替换旧的：先 staging providers，再 `dispose(previous)`，成功后提交 providers；
   - 记录 `ExtensionInfo.server`（tools/sections/hooks/docs/secrets）。
3. 失败：保留上一个 facet 的工具与服务；`record.server.error` 记录错误供 UI 展示。
4. 文件变化：Vite watcher → 计算受影响的扩展集合（沿 importer 图反向遍历到 `server.ts`）→ 只 reload 这些；
   新增/删除目录 → 全量 reload；`settings.json`/`trust.json` 变化 → `reloadSettings()`。

### 8.3 装载（web facet）

- 构建期插件 `server/vite-extensions.ts` 生成虚拟模块 `virtual:ultimate/web-facets`：
  `{ "<abs path>/web.tsx": () => import(...) }`。
- 浏览器 `registry.setLoaders()` 并行加载；每个 facet 校验 contribution 形状；失败保留上一版本并记录错误；
  8s 超时或"全部 settle + 收到 system"即 `ready`。
- HMR：`web/src/extensions.ts` 监听 `vite:afterUpdate`，对单个 `web.tsx` 重新 import 并 `registry.replace`；
  编译错误走 `vite:error` → `registry.fail`；新增/删除目录触发虚拟模块更新 → 重新 `setLoaders`。
- `window.__getReactRefreshIgnoredExports` 让 `web.tsx` 的 default 导出不参与 Fast Refresh 校验，从而原地热替换。

## 9. 数据与文件布局

```
~/.ultimate/
├─ secrets.json                 # 用户全局密钥 (0600)
├─ trust.json                   # 项目信任决策（ProjectTrustStore）
├─ settings.json                # 用户设置（extensions.enable/disable、remotes、fastModels…）
├─ health.json                  # 每台机器的 provider 健康
├─ projects/
│  └─ <name>-<hash8>/
│     ├─ ultimate.lock          # supervisor 锁 (JSON + .db 排他事务)
│     ├─ storage.lock           # core 的 SQLite 排他锁
│     ├─ state.sqlite           # Pi Durable：条目/文档/任务/提交
│     ├─ trace.sqlite           # 调用 trace（7 天 / 20 万行）
│     ├─ project.json           # {root,name,openedAt}
│     ├─ conversations.json     # 公开会话索引（侧栏/其他项目读取）
│     ├─ supervisor.log         # JSON lines 日志
│     └─ vite/                  # 依赖预构建缓存（每 home 独立）
<project>/.ultimate/
├─ extensions/<name>/{server.ts,web.tsx,api.ts,refs.ts,ui.tsx,README.md}
├─ agents/<name>.md
├─ skills/<name>/SKILL.md
├─ settings.json                # 项目设置（defaultSurface、extensions…）
└─ README.md                    # 首次信任时展示
```

Pi 自身数据：`PI_CODING_AGENT_DIR` 或 `~/.pi/agent`（credentials/models/settings），Ultimate 与其共享登录。

## 10. 失败与恢复矩阵

| 故障                        | 行为                                                                | 证据                                                  |
| --------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| 端口被占用（未显式 --port） | 端口 +1 重试，直到可用                                              | `bin/ultimate.ts:205-210`                             |
| 已有实例运行同项目          | 读取 lock.owner.port，打开新窗口，退出 0                            | `bin/ultimate.ts:87-96`                               |
| 旧 core 残留 storage.lock   | 校验 `/proc/<pid>/cmdline` 确为 `server/main.ts` 后 SIGTERM→SIGKILL | `server/lock.ts:13-47`                                |
| core 启动失败               | 指数退避重试 3 次（0.5s/1s/2s），然后 503 崩溃页，文件变化后重试    | `bin/ultimate.ts:459-507`                             |
| core 运行中崩溃             | 标记 crashed，自动 recover；期间连接挂起                            | `bin/ultimate.ts:336-346,459`                         |
| 热替换类型检查失败          | 不启动新 core，返回错误给调用者，旧 core 继续                       | `bin/ultimate.ts:349-370,408`                         |
| 热替换激活失败（已释放）    | `reacquire` 旧 core；失败则 kill + recover                          | `bin/ultimate.ts:424-456`                             |
| 单个扩展 server facet 失败  | 保留上一版本；`server.error` 展示；其余扩展不受影响                 | `server/extensions.ts:584-590`                        |
| 单个 web facet 失败         | error card + 日志，其余 UI 正常；上一版本保留                       | `web/src/sdk/registry.ts:240-257`                     |
| SSE 断开                    | EventSource 自动重连；关闭则 1s 后手动重连；回退 root               | `web/src/sdk/store.ts:239-259`                        |
| UI 状态写失败               | 本地回滚该批写入并提示 notice                                       | `web/src/sdk/ui-state.ts:107-113`                     |
| 事件 reactor 抛错           | 事务回滚（含游标），记录 failure，下次匹配提交或 harness 打开时重试 | `server/events.ts:228-232`                            |
| reset/restore 中断          | 存在 `reset.json` 时拒绝打开存储，提示重跑脚本                      | `bin/ultimate.ts:97-104`、`server/harness.ts:223-227` |

## 11. 并发与串行化点

- **核心生命周期串行**：`switching` Promise 链（`server/main.ts:145-154`），`go`/`release` 不并发。
- **扩展 reload 串行**：`chain`（`server/extensions.ts:437-444`），失败也继续后续。
- **facet 生命周期**：`dispose` 先清理旧 facet 的 subscriptions/providers/cleanups，再安装新 facet。
- **事件 reactor**：每个 name 一条 Promise 链（`state.chain`），一次一个事件、一事务一事件（`server/events.ts:174-235`）。
- **UI 状态写入**：单批 in-flight（`web/src/sdk/ui-state.ts:76-115`），服务端每批一个 commit 并递增 `ui.rev`。
- **会话列表刷新**：`refreshing` 链合并并发提交（`server/api.ts:260-265`）。

## 12. 复刻要点（本章结论）

1. 先复刻 **supervisor/core 双进程 + 原始 TCP 代理 + IPC 协议**，它是"自改代码不丢对话"的物理基础。
2. **SQLite 是唯一真相**：core 可在任意时刻被杀死；所有 API 读都从 harness/文档快照来。
3. **扩展系统是产品的骨架**，不是插件系统：server facet 用 Vite SSR 加载，web facet 用虚拟模块 + HMR；两者都以"目录"为部署单位。
4. **SSE 是唯一的实时通道**：快照 + ops 增量 + 文档 ops，前端 store 是纯复制器；不要引入额外 WebSocket 业务通道。
5. **失败必须局部化**：进程级、扩展级、组件级三层隔离，任何一层都不能拖垮整个应用。
6. **安全按"本机单用户"设计**：回环监听、Origin/Sec-Fetch 校验、可选身份代理；不要假设公网暴露。

## 13. 证据索引

- `bin/ultimate.ts`：全部生命周期（30-222 启动，224-393 core 管理，394-457 换代，459-532 恢复/关闭）
- `server/main.ts:33-257`：prepare/ serve/release/go
- `server/harness.ts:124-297`：host 能力与 open
- `server/api.ts:147-667`：HTTP/SSE 全量端点
- `server/extensions.ts:108-775`：扩展装载/重载
- `server/events.ts:105-360`：事件日志与 reactor
- `server/discovery.ts`、`server/project.ts`、`server/lock.ts`、`server/request-security.ts`
- `web/src/sdk/store.ts`、`registry.ts`、`ui-state.ts`、`client.ts`
