# 05 · 核心服务（`server/`）

> 复刻目标：一个无状态（除 SQLite 外）的 Node HTTP 服务，把 Pi Durable 的能力以 HTTP/SSE 暴露给浏览器，并承载扩展系统。
> 逐项证据见文末索引；本章按"启动 → HTTP → API → SSE → 事件 → 系统信息 → 追踪 → 工具参数防护 → 安全"组织。

## 1. 启动与对象图

```ts
prepareServer(options) {
  ultimateRoot = options.ultimateRoot ?? <repo>/server/..
  projectRoot  = realpath(options.projectRoot ?? ULTIMATE_PROJECT ?? ultimateRoot ?? cwd)
  events       = new Events()                    // 进程内事件总线（SSE 广播）
  host         = await prepareHarness({...})     // 见 06 章
  access       = createAccess(() => system.changed())
  http         = createHttpServer(handler)       // 所有请求先 admit → api.handle → vite.middlewares
  hmr          = createHttpServer()              // 仅用于 Vite HMR upgrade
  vite         = createViteServer({ middlewareMode:true, root:<repo>/web, cacheDir:home/vite,
                                     plugins:[extensionModules(...), ultimate:watchers] })
  extensions   = await loadExtensions(vite, host, ...)
  http.listen(port ?? ULTIMATE_PORT ?? 4747, '127.0.0.1')
  system       = await createSystem(host, watch, url, extensions.info, emit, notice, processInfo, access.origins)
  return { http, vite, host, extensions, events, url, port,
           release(), go(activationError?), close() }
}
```

- `go()`：`writeProject(home)` → `host.open(false)`（打开 SQLite/harness）→ `serve()`：
  提交 `ultimate.started` 事件 → `extensions.opened()`（跑 onOpen）→ `system.changed()` →
  `createApi(...)` → `harness.resume()` → `reportCore({type:'web',state:'ready'})`。
- `release()`：`extensions.released()`（跑 onRelease、关 trace）→ `api.close()` → 关闭所有连接 →
  `host.close()`（关 harness 与 storage lock）→ `reportCore stopped`。
- `go/release` 经 `serial()` 串行，防止并发切换。
- 独立运行（`pnpm dev`）时 `ULTIMATE_SUPERVISED` 未设置：直接 `prepareServer()` + `go()`，打印 URL；
  此时无 supervisor，`restart` 工具返回 "Restart requires pnpm start"。

## 2. HTTP 层

### 2.1 请求管线（`server/main.ts:62-85`）

```
request
 → admit(request, publicPort, access.rules)      // 403 Forbidden
 → api 尚未建立？ 503 Preparing
 → api.handle(request,response)                   // 处理 /api/*，返回 true 表示已处理
 → vite.middlewares(request,response)             // 其余：HTML/静态/模块/HMR
异常：headersSent ? destroy : 500 Internal server error
```

### 2.2 Vite 的挂载方式

- `middlewareMode: true`，`allowedHosts: true`，`appType: 'spa'`，`root = <repo>/web`。
- `fs.allow = [ultimateRoot, projectRoot, ~/.ultimate]`：允许加载项目内扩展与其资源。
- `cacheDir = <home>/vite`：每个 home 独立，避免测试/实例污染。
- 别名 `@` → `<repo>/web/src`。
- HMR 走单独的 `hmr` HTTP server，upgrade 同样经过 `admit`（防止跨站 WebSocket）。
- `extensionModules` 插件（`server/vite-extensions.ts`）：
  - `config()` 把 `node_modules` 下所有包加入 `resolve.dedupe`（保证项目外扩展与 clone 共用同一份 React 等）；
  - `resolveId()`：项目/用户扩展里的裸导入解析到 clone 的 `node_modules`；`@/` 解析到 `web/src`；
  - `load()`：虚拟模块 `virtual:ultimate/web-facets` 生成 `{ "<abs>/web.tsx": () => import("/@fs/<abs>") }`；
    同时给 `index.css` 追加 `@source` 指令，让 Tailwind 扫描各扩展目录；
  - `configureServer()`：监听扩展根与 settings/trust 文件，结构变化时使虚拟模块与 CSS 失效并重载。

## 3. REST API（`server/api.ts`）

所有 `/api/*` 先 `admit`；JSON 请求体上限默认 1 MiB，扩展动作与 `submit` 为 12 MiB。
错误统一 `{ error: string }`；未知端点 404；动作错误消息截断到 500 字符。

| 方法 | 路径                                                    | 请求                         | 响应                                           | 说明                                                                  |
| ---- | ------------------------------------------------------- | ---------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| GET  | `/api/events?conversation=<id>&docs=<k1,k2>`            | —                            | SSE                                            | 主实时流；缺省 conversation = root(1)                                 |
| GET  | `/api/conversations/:id/history?before=<id>&after=<id>` | —                            | `{entries, before?}`                           | 历史分页；新→旧；`after` 时页大小 512，否则 64                        |
| GET  | `/api/models`                                           | —                            | `ModelsResponse`                               | provider/模型/认证状态/成本/思考级别                                  |
| POST | `/api/extensions/:name/actions/:action`                 | `{args, conversationId?}`    | `{result}`                                     | 扩展动作；要求浏览器来源头                                            |
| POST | `/api/ui`                                               | `{set?, delete?}`            | `{ok, rev}`                                    | 写 root 的 `ultimate.ui`；键限 `[A-Za-z0-9_.:-]{≤200}`；总大小 ≤256KB |
| POST | `/api/restart`                                          | —                            | `202 {ok,generation}` / `500 {ok:false,error}` | 请求核心换代                                                          |
| POST | `/api/conversations`                                    | `{cwd?, title?}`             | `201 {id}`                                     | 创建 ownerless 会话，继承 root 的 model/thinking                      |
| POST | `/api/conversations/:id/inbox/:sid/cancel`              | —                            | `{ok:true}`                                    | 取消排队输入；已处理/已完成 → 409                                     |
| POST | `/api/conversations/:id/submit`                         | `{text, images?, whenBusy?}` | `202 {submissionId}`                           | 提交输入；支持 steer/followUp                                         |
| POST | `/api/conversations/:id/abort`                          | —                            | `{ok:true}`                                    | 中止本会话自己的非后台任务，保留队列                                  |
| POST | `/api/conversations/:id/configure`                      | `{model?, thinkingLevel?}`   | `{ok:true}`                                    | 切换模型/思考级别（校验可用性与支持级别）                             |
| POST | `/api/conversations/:id/compact`                        | `{instructions?}`            | `202 {taskId}`                                 | 触发压缩                                                              |

### 3.1 Submit 的细节（复刻重点）

1. `whenBusy` 仅允许 `steer` / `followUp`。
2. 图片：≤4 张；MIME 限 png/jpeg/webp/gif；base64 长度 4 的倍数、严格正则、解码后 ≤2 MiB、重编码必须等于原串。
3. 文本与图片至少一个非空。
4. `/skill:<name> <args>` 展开为 `<skill name location>…</skill>` + args（`server/skills.ts:61-70`）。
5. `conversation.submit({type:'input', content, whenBusy})`；`content` 为 string 或 `[{type:'text'}, {type:'image'}]`。
6. 提交后立刻读 `submission.status()`，据此判定事件 kind：非 queued = `prompt`，queued + steer = `steer`，否则 `follow-up`；
   在**独立 commit** 中发 `user.input` 事件（不含文本，只含 conversation/entry|submission/length/device）。
7. 返回 submission id；客户端据此渲染排队输入。

### 3.2 Abort 的语义

不调用 `conversation.abort()`（会撤回队列）；循环找出该会话 `!owner && !background` 的任务，
`harness.abortTask` + `waitForTask`，直到没有；排队 follow-up 保留，Pi 会在下一次输入时把它们排在前面。

### 3.3 Configure 的语义

- `model` 必须是 `available` 的 provider/id；
- 若换模型且未指定 thinkingLevel → `clampThinkingLevel(model, 当前级别)`；
- 若指定 thinkingLevel → 必须在该模型 `getSupportedThinkingLevels` 中，否则 400；
- 调用 `conversation.configure({model?, thinkingLevel?})`。

## 4. SSE 协议（`ServerEvents`，`shared/protocol.ts:200-211`）

| 事件            | 载荷                    | 时机                                     |
| --------------- | ----------------------- | ---------------------------------------- |
| `system`        | `SystemInfo`            | 连接建立、系统变化（git/扩展/设置/文件） |
| `conversations` | `ConversationSummary[]` | 初始、创建/更新会话、busy 变化           |
| `view`          | `StreamedView`          | 连接建立/窗口重算；`older` 为历史游标    |
| `ops`           | `Op[]`                  | 会话视图增量（Pi/chord delta）           |
| `ui`            | `{value}`               | root `ultimate.ui` 快照                  |
| `uiOps`         | `{ops}`                 | UI 文档增量                              |
| `doc`           | `{kind,value}`          | 扩展文档快照（含 null）                  |
| `docOps`        | `{kind,ops}`            | 扩展文档增量                             |
| `tasks`         | `TaskGraph`             | 任务图变化（100ms 去抖）                 |
| `notice`        | `{level,message}`       | 扩展/服务端提示                          |

连接实现（`server/api.ts:266-346`）：

1. 校验会话；对每个 doc kind：取 token → 确保文档已创建（`tx.doc`）→ `harness.watchDoc`；未知 kind 发 notice。
2. watch root 的 `UiState` 与 `conversation.watch()`。
3. 立即发送 system/conversations/view/ui/tasks/doc。
4. 订阅：view ops（经 `windowOps` 重定位；无法增量则重发 `view`）、ui ops、doc ops、
   `events.listeners`（全局广播）。
5. 15s 心跳；连接关闭时依次 stop 所有 watch 并从 streams 集合移除。

**窗口化**（`server/view-window.ts`）：每个视图最多 150 条非 head 条目；被裁掉的条目通过
`/history?before=<older>` 分页取回；增量 ops 中新增条目位置需减去 `trimmed`，遇到 replace/head marker 则整视图重发。

## 5. 会话列表与任务图

`createApi` 维护 `summaries: ConversationSummary[]`：

- 来源：`tx.scanConversations` 全量扫描 + 每个会话的 `AgentDoc`（cwd）与 `Metadata`（title/label/inputAt/answerAt）。
- 过滤：`metadata.label === 'events'` 的事件日志会话不出现在任何列表。
- owner 关系：`record.owner` → `parentConversationId`/`ownerTaskId`；无 owner 但有 `parent` → `branchOf`。
- `busy`：任务图中该会话存在 `!background` 的任务。
- 触发刷新：`subscribeCommits` 中 conversation 变更、`ultimate.metadata` 变更、`pi.agent` 的 cwd 变更。
- 去抖：任务图变化 100ms 合并；只有 JSON 变化才广播。
- 写 `conversations.json`（`project.conversationIndex`，1s 去抖）供其他项目/实例读取。

## 6. 事件日志与 Reactor（`server/events.ts`）

设计：**事件日志是一个永不运行的 ownerless conversation**；每个事件是 kind=`event.<name>` 的 entry，
因此天然拥有全局递增 id、可历史/搜索/同步。

### 6.1 两个根文档

```ts
EventLog = defineDoc<{ conversation?: number; cursors: Record<string, number> }>('ultimate.events')
EventFeed = defineDoc<{ events: EventRecord[] }>('ultimate.event-feed') // 最近 100 条，给 useEvents()
```

两者都 `checkpointWhen: () => false`, `history:'latest'`, `fork:'initial'`，放在 root（id=1）。

### 6.2 emit

```ts
emit(tx, token, data):
  stamp = traceContext()
  entry = tx.appendEntry(logConversation, {
    kind: token.kind,
    data: { v: token.version, at: ISO, data, ...(stamp && {context: stamp}) }
  })
  feed.push(record); 若 >100 则裁掉最旧
  return record
```

`host.emit` 会先调 `trace.keep(traceContext())`，保证即使该调用是"轮询"也被写入 trace（reactor 需要父节点）。

### 6.3 Reactor

```ts
react(name, tokens, handler, {from='start'}):
  active = { kinds:Set(kind), handler, from }
  onOpen → subscribeCommits(若提交含匹配 entry → drain(name)); drain(name)
  onRelease/dispose → stop(): 取消订阅、清 active、等待 chain

drain(name):
  chain = chain.then(async () => {
    loop:
      commit(tx => {
        若 cursor 未定义且 from==='now' → cursor = 最新 entry id（或 0），返回 false
        从 cursor+1 起按 256 分页扫描，找到第一条匹配 kind 的 entry
        trace({kind:'reactor',...}, () => handler(tx, event), event.context)
        若扫描到最后一条，cursor = 最后扫描到的 entry.id
        return pending !== undefined
      })
      成功 → failure=undefined；没有 pending → 结束
      失败 → failure={error,at,entryId}；事务已回滚（含 cursor），事件保持待处理
  })
```

关键性质：

- **精确一次**：handler 的写入与 cursor 前进在同一事务；
- **至少一次**：事务外的副作用（文件/进程/网络）可能重复；
- **串行**：每个 reactor name 一条链；
- **可恢复**：崩溃/重载后从 cursor 继续；`from:'now'` 只对"从未有 cursor"的 reactor 生效。

### 6.4 事件清单

核心：`ultimate.started`、`ultimate.notice`、`user.input`、`ui.navigated`。
业务：`lineage.branched`/`lineage.rooted`、`workspaces.landed`、`models.login-changed`、`subagents.started`、
`board.sent`、`workspaces.check`、`conversations.compacted`、`health.changed`、`cloud.backup`、
`coding-tools.committed`。详见 `docs/extensions.md:38-62` 与 10 章。

## 7. 系统信息（`server/system.ts`）

`SystemInfo`（`shared/protocol.ts:111-163`）包括：

- `build`：BuildInfo（见 §8）
- `machine`：hostname/home/platform/release/arch/cpuModel/cpuCount/totalMemory/freeMemory/user
- `process`：pid/node/startedAt/generation/url/activationError?
- `access.origins`：注册的额外来源
- `persistence`：`{kind:'sqlite', path, sizeBytes, walBytes}`
- `execution`：`{kind:'node-local', defaultCwd}`
- `project`：root/name/config/decision/readme/settings/settingsError?
- `code`：ultimateRoot/branch/sha/dirty/coreStale?
- `extensionDiagnostics`：settings 通知、未知扩展名、core 被禁用、facet 通知、缺失 API、项目诊断
- `extensions`：`ExtensionInfo[]`
- `skills` / `skillDiagnostics` / `contextFiles`

刷新策略：

- `watch(host.home)` 监听存储大小变化；
- `watchRepo` 监听 clone、项目 `.ultimate`、用户 extensions/skills、项目 `.agents/skills`、`.pi/skills`；
- 去抖 ≥100ms 且距上次 git 查询 ≥2s 才重新执行 git；
- 修改 `server/` 或 `shared/` 会把 `coreStale=true`（UI 提示需要 restart）；
- 只有 JSON 变化才 emit。

## 8. 构建指纹（`server/build.ts`）

- `core`：`server/**` + `shared/**` + `package.json` + `pnpm-lock.yaml` 的 sha256（排序、含路径与长度）；
- `lib`：`lib/**` 每次 refresh 重算（因为 lib 随扩展热重载）；
- `extensions[name]`：该扩展目录全文件哈希；
- `id = sha256([core, lib, sortedExtensions, enablement])[0:12]`；
- `changed`：与上一 BuildInfo 比较得出 `core`/`lib`/`extensions/<name>`；
- `history` 保留最近 20 条；generation 来自 env。

用途：`system.build` 展示；热替换后 `changed` 说明改了什么；缓存破坏与"核心是否陈旧"。

## 9. 调用追踪（`server/trace.ts`）

- 每行记录：kind(service/action/reactor/tool/model)、caller、callee、name、args 摘要、result 摘要、
  duration、ok、error、traceId、conversationId、taskId、entryId、parentCall、seq、at。
- 上下文：`AsyncLocalStorage<TraceContext>`；嵌套调用以 `parentCall` 组成树。
- 写入：批量写入 `<home>/trace.sqlite`，**不在 Pi commit 内**，harness 打开期间才写；失败只记录一次，不影响调用。
- 保留：7 天、最多 200,000 行。
- 脱敏：参数/结果 JSON 摘要约 300 字符；键名匹配 `/secret|token|password|key|auth/i` 的值替换为 `[redacted]`；
  `SEALED` 扩展（secrets/models）完全不存参数、结果与错误消息，只存错误类名。
- 轮询抑制：成功且在同一分钟内重复（同名+同参数摘要）的 action/service 调用只计数；
  `pollActions` 声明的 action 总是只计数；失败/model/tool/被 keep 的调用总是写入。
- 模型行：由 `modelTrace` 包装 `ModelRuntime`，记录 provider/model、时长、输入/输出/cache token、stop reason；
  错误只记分类（stop reason、HTTP 状态、白名单错误码）。
- 读取：`trace.query({trace?,conversation?,since?,limit?})`、`trace.page({before?,after?,since?,until?,kinds?,conversation?,errors?,text?,limit?})`、
  `trace.tree(traceId)`、`trace.polls()`。

## 10. 工具参数防护（`server/tool-arguments.ts`）

两个职责：

1. `guardToolArguments(models, trace)`：包装 `ModelRuntime`，在流式工具调用参数出现病态时中止：
   - 限制连续空白 run（`MAX_WHITESPACE_RUN=1000`）；
   - `guardStream()` 检测参数退化（例如无限重复同一 JSON 片段），以错误结束流并 abort；
   - 每个模型流写一条 trace 行（成功/错误/中止）。
2. `modelTrace`：把 provider session id 映射到 conversation（`beforeRequest` 钩子），使 Pi 在 trace 之外发起的请求也能归因；
   扩展自己的调用归到其所在 trace 的调用。

## 11. 安全（`server/request-security.ts`）

- `createAccess()`：注册 `{origin, verify(request)}`；`allow()` 校验完整 HTTP origin，返回 disposer（扩展卸载时自动移除）。
- `admit()`：
  - 回环直连（host 端口匹配、无 Origin 或回环 Origin）→ true；
  - 有 `Sec-Fetch-Site` 且非 same-origin/none → 仅允许"根导航"（GET `/`、navigate、document、无 upgrade）；
  - 否则匹配 access 规则：host 必须等于规则 origin 的 host，Origin（若有）必须相等，`verify()` 返回 login。
- `deviceOf(headers)`：`phone|desktop` + `edge|firefox|chrome|safari|other`；经 Tailscale 时附 `login` 与
  `X-Forwarded-For` 最右端且属于 CGNAT/ULA 的地址。
- `proxied()`：出现任一 `x-forwarded-*`/`forwarded` 即视为代理，回环捷径失效（防伪造）。
- 扩展动作额外检查 `sec-fetch-site`。

## 12. 其他小模块

| 文件                           | 作用                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `server/metadata.ts`           | `ultimate.metadata` 文档：title/label/inputTitle/inputAt/answerAt                          |
| `server/ui-state.ts`           | `ultimate.ui` 文档：`history:'rewindable'`, `fork:'asOf'`                                  |
| `server/models.ts`             | 把 ModelRuntime 转成 `ModelsResponse`（仅 chat 模型）                                      |
| `server/skills.ts`             | 合并 clone/project(.pi)/user/project(.agents,.ultimate) 技能；后者同名覆盖；`/skill:` 展开 |
| `server/actions.ts`            | 扩展 action 类型与 `actionExec`（execFile，30s 上限，1MB buffer，SIGKILL）                 |
| `server/project.ts`            | home 计算、project.json/conversations.json 原子写、项目列表、发现根                        |
| `server/project-setup.ts`      | 项目信任（ProjectTrustStore）、`.ultimate` 配置探测、worktree 共享决策根                   |
| `server/extension-settings.ts` | 用户/项目 settings.json 的 enable/disable 合并与诊断                                       |
| `server/watch-roots.ts`        | 监听"尚不存在"的目录（向上找存在的祖先，出现时回调）                                       |
| `server/http.ts`               | 复制 Pi 的 undici dispatcher 配置（代理、空闲超时、压缩兼容）                              |
| `server/build.ts`              | 构建指纹                                                                                   |
| `server/vite-logger.ts`        | 把 Vite 日志转成 core report（warning/error 进仪表盘）                                     |

## 13. 复刻顺序建议

1. `http.ts`（可直接复制）→ `main.ts` 骨架 → `admit`。
2. `harness.ts` + `harness.open`（先只做 root 与一个空扩展注册表）。
3. `api.ts` 的 `/api/events` + `/api/conversations/:id/submit|abort|configure|compact` + `/api/ui`。
4. `events.ts`（日志/emit/react）→ `system.ts` → `trace.ts`。
5. 最后接 `extensions.ts`（依赖前四者提供的 host 能力）。

## 14. 证据索引

- `server/main.ts:33-257`（prepare/go/release/serve）、`259-320`（CLI 入口/supervised 分支）
- `server/api.ts:37-145`（Events/body/runAction）、`147-346`（列表/流）、`347-667`（路由表）
- `server/view-window.ts`（窗口化）
- `server/events.ts:1-360`（事件日志/reactor）
- `server/system.ts:55-205`
- `server/build.ts:1-83`
- `server/trace.ts:1-106,519-520` 与 `docs/extensions.md:154-197`
- `server/tool-arguments.ts:15-184`
- `server/request-security.ts:15-138`
- `server/vite-extensions.ts:13-146`
- `shared/protocol.ts`（所有 HTTP/SSE 类型）
