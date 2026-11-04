# 04 · 监督进程（`bin/`）

> 复刻目标：一个约 530 行的 Node 脚本，负责"项目解析 → 锁 → 公网端口代理 → fork 核心 → 世代切换 → 崩溃恢复 → 终端仪表盘"，并附带逃生 CLI 与浏览器窗口打开。
> 所有行为均来自 `bin/ultimate.ts`、`bin/dashboard.ts`、`bin/cli.ts`、`bin/open-window.ts` 与 `server/lock.ts`、`server/supervisor-protocol.ts`。

## 1. 职责边界

| 做                                                    | 不做                                                |
| ----------------------------------------------------- | --------------------------------------------------- |
| 解析 CLI 与项目目录、计算 home                        | 不打开 SQLite、不装载扩展                           |
| 获取 `ultimate.lock`、处理残留 `storage.lock`         | 不执行业务请求（只做 TCP 代理）                     |
| 监听公开端口并把连接转发给当前 core                   | 不解析 HTTP（崩溃页除外，需读 header 判断是否直连） |
| fork core、发送 `go/release/exit/reacquire`、等待确认 | 不调用模型、不写会话                                |
| 类型检查 + 启动新 core 完成热替换                     | 不直接修改 agent 状态                               |
| 监听源码/配置变化、重试崩溃的 core                    | 不自动重载自身（`bin/` 变更需人工重启）             |
| 终端仪表盘 + `supervisor.log`                         | 不写业务日志                                        |

## 2. CLI 契约

```
ultimate [dir] [--port N] [--no-open]
ultimate --cli [pi args…]
```

- `--cli` 必须在最前（`process.argv[2]`），直接 `import('./cli.ts')`，不获取任何锁（`bin/ultimate.ts:24-29`）。
- 位置参数最多 1 个，否则抛用法错误（`:35-36`）。
- `--no-open` 或 `ULTIMATE_NO_OPEN=1` 禁止打开窗口（`:37`）。
- 端口：`--port` > `ULTIMATE_PORT` > `4747`；必须是 0–65535 的整数（`:78-80`）。
- 项目：`realpath(positionals[0] ?? cwd)`；失败打印 `Cannot open project …: <code>` 并退出 1（`:71-76`）。
- home：`ULTIMATE_HOME` 优先，否则 `projectHome(projectRoot)`（`:77`）。

## 3. 启动流程（逐行级）

```
 1. realpath 项目、计算 home、mkdir(home)
 2. acquireLock(home/ultimate.lock, {pid,port,project})
      · 加锁实现见 §7：SQLite `BEGIN EXCLUSIVE` + JSON sidecar
      · 失败且允许开窗 → readOwner(lock).port → openWindow(port) → exit 0
      · 其他失败 → stderr + exit 1
 3. 若 home/reset.json 存在 → 关锁、报错"reset/restore 未完成"、exit 1
 4. 若 lock.stale（上次的锁文件还在）→ retireStorageOwner(home/storage.lock)
 5. dashboard(home/supervisor.log)  ← 终端 UI + JSONL 日志
 6. 监听 proxy: createServer(socket => route(socket))
      · 端口被占且未显式指定 → port++ 重试（最多到 65535）
      · 成功后 lock.update({port})，display.url(publicUrl)
 7. recover(): 指数退避（0.5s,1s,2s）最多 3 次
      boot() → wait('prepared', 60s) → send({type:'go'}) → wait('ready')
      · 成功：active=core，flush 挂起连接，打印 URL，首次 openWindow
      · 3 次失败：crashPage=true，返回 503 页面，等待文件变化
 8. 安装 watcher：server/ shared/ extensions/（recursive）+ 项目 .ultimate/（存在时）
 9. SIGINT/SIGTERM → shutdown(): 关 watcher、销毁 socket、proxy.close、逐个 exit(child)、lock.close
```

## 4. 连接路由（`route`）

三种状态：

1. **active 存在**：为每个客户端 socket 建立到 `127.0.0.1:<core.port>` 的上游连接，双向 `pipe`。
   任一端 error/close 都销毁另一端；`socket.resume()` 确保流启动（`:129-138`）。
2. **crashPage**：核心无法启动时的兜底页。
   - 读取请求头直到 `\r\n\r\n`（最多 16KB）；
   - 判断是否"直连"：非代理头、`Host` 是回环地址且端口匹配；
   - 直连返回 503 HTML（"Ultimate core could not boot"，附 stderr 尾部）；非直连返回空 503；
   - 5s 超时销毁。
   - 若期间 core 恢复，则把已读字节 `unshift` 回 socket 并重新路由（`:139-177`）。
3. **其他（启动/换代空窗）**：`socket.pause()` 放入 `pending` 集合，flush 时重放（`:178-186`）。

> 复刻提示：不要用 `http-proxy` 之类库，原始 `net.connect + pipe` 最简单，也避免代理层改写请求。

## 5. Core 进程管理

### 5.1 Core 数据结构

```ts
type Core = {
  child: ChildProcess
  port: number // core 实际监听端口（OS 分配）
  generation: number
  stderr: string // 尾部 200 行
  messages: ChildMessage[] // 生命周期消息队列（不含 report）
  reports: Map<'web' | 'services', CoreReport>
}
```

### 5.2 启动（`boot`）

```ts
fork(join(ultimateRoot, 'server/main.ts'), [], {
  cwd: projectRoot,
  env: {
    ...process.env,
    MIMALLOC_ALLOW_THP: '0',
    ULTIMATE_HOME: home,
    ULTIMATE_PROJECT: projectRoot,
    ULTIMATE_SUPERVISED: '1',
    ULTIMATE_GENERATION: String(++generation),
    ULTIMATE_PUBLIC_URL: publicUrl,
    ...(previousBuild ? { ULTIMATE_PREVIOUS_BUILD: JSON.stringify(previousBuild) } : {}),
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
})
```

- stdout/stderr 逐块转发到仪表盘；stderr 保留尾部用于错误页。
- `child.on('message')`：`CoreReport`（log/web/services）进 `reports` 并刷新仪表盘；`swap` 触发 `swap()`；
  其余进 `messages` 队列供 `wait()` 消费。
- `child.on('exit')`：若不是 swap/stop 期间退出，标记 crashed 并 `recover()`。

### 5.3 `wait(core, type, requestId?, timeout=60s)`

- 轮询 `core.messages` 中匹配的消息；若出现 `failed` 立即拒绝；
- 监听 `message` 与 `exit`，超时拒绝并附 stderr 尾部；
- 消费即 `splice` 出队列（一次性）。

## 6. 世代切换（swap）协议

### 6.1 消息定义（`server/supervisor-protocol.ts`）

```ts
type CoreReport =
  | { type: 'log'; level: 'info' | 'warn' | 'error'; source: string; text: string }
  | { type: 'web'; state: 'preparing' | 'ready' | 'stopped' }
  | { type: 'services'; services: ServiceInfo[] }

type ChildMessage =
  | CoreReport
  | { type: 'prepared'; port: number }
  | { type: 'ready' | 'released' }
  | { type: 'failed'; error: string }
  | { type: 'swap'; requestId: string; build?: BuildInfo }
  | { type: 'swap-ack'; requestId: string; ok: boolean; error?: string }

type SupervisorMessage =
  | { type: 'go' | 'release' | 'exit' }
  | { type: 'reacquire'; error: string }
  | { type: 'swap-result'; requestId: string; ok: false; error: string }
  | { type: 'swap-result'; requestId: string; ok: true; generation: number }
```

`CoreReport` 不进入生命周期确认队列（`isCoreReport`），避免日志把 `wait` 搞乱。

### 6.2 成功路径

```
1. 若已有 swap 进行中 → 立即回 swap-result ok:false "A core swap is already in progress."
2. checkTypes(): spawn node node_modules/typescript/bin/tsc --noEmit -p tsconfig.swap.json
   失败 → swap-result ok:false（附带 tsc 输出尾部）
3. next = boot(previousBuild)（generation+1）
4. await prepare(next)  ← 'prepared' 消息带 port
5. 旧 core: send({type:'swap-result', requestId, ok:true, generation: next.generation})
6. 等待旧 core 的 'swap-ack'：
   - 旧 core 收到 ok 后调用 approved(generation) 持久记录（工具的 replay 结果）
   - 成功回 swap-ack ok:true；失败回 ok:false + error
7. active=undefined；display.lifecycle('swapping')
8. 旧 core: send({type:'release'}) → 等 'released'（10s）
   · 旧 core release(): extensions.released() → api.close()（关闭 SSE、停 watcher）→ http.closeAllConnections() → host.close()（关 Harness + storage lock）
9. start(next): send({type:'go'}) → 等 'ready' → active=next → flush 挂起连接
10. exit(old): 若还未退出，10s 内等自然退出，否则 SIGKILL
```

### 6.3 失败路径

- **步骤 1–6 失败**（旧 core 未释放）：kill(next)（若已启动），把所有失败文本写 `stderr`，向旧 core 发送
  `swap-result ok:false`，它继续服务。
- **步骤 8 之后失败**（旧已 release，storage lock 已释放）：向旧 core 发送 `reacquire`（带错误文本）；
  旧 core 重新 `open storage` 并 `go(error)`；`system.activationError` 展示给 UI。
  若 reacquire 也失败 → kill(old)，active=undefined，进入 recover()。
- 任何情况下 `swapping=false`，最后刷新仪表盘；若仍无 active 且未 stopping → `recover()`。

### 6.4 核心侧配合（`server/main.ts:285-314`）

```ts
process.on('message', async (message) => {
  if (message.type === 'go' || message.type === 'reacquire') {
    await server.go(message.type === 'reacquire' ? message.error : undefined)
    send({ type: 'ready' })
  }
  if (message.type === 'release') {
    await server.release()
    send({ type: 'released' })
  }
  if (message.type === 'exit') {
    await close()
    process.exit(0)
  }
})
```

`server.release()` 与 `server.go()` 都经 `serial()` 串行化（`server/main.ts:145-154,219-237`）。

`requestSwap(approved, build)`（`supervisor-protocol.ts:33-62`）在 core 侧：

- 无 `process.send` → 返回 "Restart requires pnpm start (the supervisor)."（`pnpm dev` 下不可用）
- 发 `swap`，等 `swap-result`；
- 成功后先 `await approved(generation)`（持久记录），再发 `swap-ack`；失败则回 ok:false。

## 7. 锁的实现（`server/lock.ts`）

为什么不用 `flock`：Node 无跨平台文件锁。这里用 **SQLite 排他事务当互斥体**：

```
acquireLock(path, value, waitMs=0):
  db = new DatabaseSync(path + '.db')     // 例：ultimate.lock.db
  PRAGMA busy_timeout = 0
  BEGIN EXCLUSIVE                          // 失败 errcode 5 = SQLITE_BUSY
     → 读 sidecar JSON 得到 owner；等待；超时报 "Ultimate is already running (pid …)"
  成功后：
     stale = sidecar 已存在（说明上一个进程异常退出）
     atomic write sidecar: JSON {pid,port,project}
  close():
     若 sidecar.pid === 本进程 → unlink sidecar
     ROLLBACK; db.close()
```

- `retireStorageOwner(path)`：先尝试获取（说明没人持有），否则读 owner：
  - 进程不存在 → 返回；
  - 读 `/proc/<pid>/cmdline`，必须包含 `server/main.ts` 才允许发信号（防误杀）；
  - SIGTERM → 最多等 10s → SIGKILL。
- `alive(pid)`：`process.kill(pid,0)`，`ESRCH` 为死，其他错误视为活。

## 8. 文件监听与自动恢复

```ts
watch(join(ultimateRoot,'server'), {recursive:true}, retry)
watch(join(ultimateRoot,'shared'), …)
watch(join(ultimateRoot,'extensions'), …)
if (exists(projectRoot/.ultimate)) watch(projectRoot/.ultimate, {recursive:true}, retry)
watchRoots([projectConfig], watchConfig)   // 处理目录稍后创建的情况
```

- `retry()` 仅在 `crashPage && !recovering && !stopping` 时生效：清空失败计数，重新 recover。
- 运行中修改 `server/` 不会自动重启 core（`system.coreStale` 标记，UI 提示需要 restart）；
  只有 crashPage 状态下的修改才会触发重试。
- `bin/` 变更不被监听：必须人工 `pnpm start`（README 明示）。

## 9. 终端仪表盘（`bin/dashboard.ts`）

TTY 模式下用 `log-update` 原地重绘：

```
Ultimate: http://127.0.0.1:4747
  supervisor  ready
  core        generation 3 · PID 12345 ready
  web         ready · embedded Vite
  automations/ready  ready · durable scheduler
  last        core 3: ...
  log         ~/.ultimate/projects/foo-1a2b3c4d/supervisor.log
```

- 非 TTY：不重绘，但 info 也逐行打印（重定向日志友好）。
- 每条日志同时追加 JSONL 到 `supervisor.log`：`{at,level,source,text}`。
- 日志写入失败只警告一次，不影响监督。
- 所有子进程文本先 `stripVTControlCharacters` 并过滤控制字符，防终端注入。
- `lifecycle()` 在 generation 变化时重置 web/services 显示。

## 10. 逃生 CLI（`bin/cli.ts`）

用途：UI/服务/数据库坏掉时，用 Pi 的终端 TUI 修复。

```
ultimate --cli [args…]
  → cliArgs(host, args):
      --no-context-files --no-skills
      --skill <每个合并后的技能路径>
      --no-extensions --extension <pi-claude-code 源码入口>
      --session-dir <home>/cli-sessions
      --system-prompt <recoveryPrompt>
      --model <默认 provider/model>（若设置）
      …用户参数（覆盖前面）
  → main(args)  // Pi 自己的交互模式
```

`recoveryPrompt` 明确告知：不打开数据库、不读 secrets/auth.json、提供 reset 建议前必须征得用户同意、
列出 home 下 `state.sqlite/trace.sqlite/supervisor.log/ultimate.lock/storage.lock`。

## 11. 打开窗口（`bin/open-window.ts` + `openWindow`）

- 目标 URL：`http://ultimate.localhost:<port>`（app 模式）；无 Chrome 家族时退化为 `http://127.0.0.1:<port>` 标签页。
- Windows：`pwsh -NoProfile -NonInteractive -Command "Start-Process -FilePath $args[0]" -- <url>`。
- macOS：`open`；若存在 `/Applications/Google Chrome.app` 则 `open -na "Google Chrome" --args --app=<app>`。
- Linux：优先 `omarchy-launch-webapp`，否则在 `google-chrome-stable|google-chrome|chromium|chromium-browser|brave|brave-browser|microsoft-edge|vivaldi` 中找第一个，用 `--app=<app>`。
- 启动后 `detached + stdio:'ignore' + unref()`，打开失败只打印错误。

## 12. 复刻检查清单（可执行）

- [ ] `ultimate --port 0` 能启动并打印实际端口（0 表示随机，但代码只接受整数；`--port 0` 会监听 0 并由 OS 分配）。
- [ ] 重复启动同项目：第二个进程读 lock 并打开窗口后退出 0。
- [ ] kill -9 core：supervisor 在 ~0.5s 后启动新 generation，浏览器 SSE 重连成功。
- [ ] 修改 `server/main.ts` 制造语法错误并 `restart`：tsc 失败，旧 core 继续服务，UI 显示错误。
- [ ] 修改为可运行但启动即抛错：新 core `prepared` 失败，旧 core 不受影响（未 release）。
- [ ] 让新 core 在 `go` 阶段抛错：旧 core 已 release → reacquire 成功并展示 `activationError`。
- [ ] `home/reset.json` 存在时拒绝启动并给出明确命令。
- [ ] 非 TTY 输出为纯文本且不带 ANSI 控制序列。

## 13. 证据索引

- `bin/ultimate.ts:23-29`（--cli）、`30-96`（参数/项目/home/锁）、`97-112`（reset/stale）、`113-222`（dashboard/proxy/端口）
- `bin/ultimate.ts:224-393`（Core/wait/boot/prepare/start）、`394-457`（swap）、`459-532`（recover/watch/shutdown）
- `server/supervisor-protocol.ts`（全部消息与 requestSwap）
- `server/lock.ts`（acquireLock/retireStorageOwner）
- `bin/dashboard.ts`、`bin/cli.ts`、`bin/open-window.ts`
