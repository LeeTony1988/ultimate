# 08 · 扩展系统

> 扩展系统是 Ultimate 的产品骨架：**目录即功能**，服务端与浏览器两半各自独立加载、独立失败、独立热更新。
> 本章是"新增一个扩展需要建哪些文件、导出什么、如何被发现/装载/卸载/追踪"的完整规格。

## 1. 目录与位置

```
<root>/extensions/<name>/
├─ server.ts     # 服务端 facet（可选）：Pi Durable Extension + actions/docs/secrets
├─ web.tsx       # 浏览器 facet（可选）：export default defineWebExtension({…})
├─ api.ts        # 服务端契约（可选；core tier 标记也在这里）
├─ refs.ts       # 浏览器安全契约：docRef / actionRef / defineEvent
├─ ui.tsx        # 供其他扩展浏览器代码使用的组件/hooks/refs
├─ README.md     # 必需；第一段（到空行）会显示在 Extensions 面板
├─ types.ts      # 扩展内部共享类型（可选）
└─ *.ts / *.tsx  # 拆分的实现文件（.ts 属服务端，.tsx 属浏览器）
```

三个来源，同名后者**整体替换**（两个 facet 一起）：

| 来源      | 路径                              | 用途                             |
| --------- | --------------------------------- | -------------------------------- |
| `builtin` | `<clone>/extensions/`             | 内置功能                         |
| `user`    | `~/.ultimate/extensions/`         | 个人跨项目扩展                   |
| `project` | `<project>/.ultimate/extensions/` | 项目专属，随仓库提交，优先级最高 |

项目层只在 `useProjectSetup(projectRoot,userHome) === true`（`~/.ultimate/trust.json` 批准过该根）时参与发现。
worktree 共享主 checkout 的决策（`decisionRoot`）。

## 2. 发现（`server/discovery.ts`）

```ts
discoverExtensions(ultimateRoot, projectRoot, userHome, includeProject=false, settings?)
  for root of [builtin, user, project]:
     若 project 且未信任且 !includeProject → skip
     readdir(root/extensions)
     对每个目录/符号链接目录：
        files = readdir(path)
        core = files.includes('api.ts') && /^export const tier = 'core'$/m.test(api.ts)
        winners.set(name, {name,path,source,files,core?})
  settings ??= extensionSettings(...)
  enabled = core || (overrides.get(name) ?? !(builtin && defaultOff.includes(name)))
  返回按 compareExtensions 排序的数组 + settings
```

排序：`order ?? 0` → source(`builtin`0,`user`1,`project`2) → `name.localeCompare`。
`includeProject=false` 时，未信任项目的扩展完全不可见；`includeProject=true` 用于"项目扩展盘点"（Extensions 面板）。

## 3. 启用/禁用（`server/extension-settings.ts`）

读取 `~/.ultimate/settings.json` 与 `<project>/.ultimate/settings.json`（后者仅信任后）：

```json
{ "extensions": { "disable": ["tailscale", "claude-code"], "enable": ["voice-live"] } }
```

- 合并顺序：用户 → 项目（后者覆盖前者）；数组内按出现顺序，`enable` 与 `disable` 同时出现时后处理的键生效（同一文件内 `disable` 先、`enable` 后，见实现循环顺序）。
- 解析失败 → `notices` 进入 `system.extensionDiagnostics`，不阻塞启动。
- `core` 扩展忽略 disable，并产生诊断 "`<name> is core and stays enabled; extensions.disable ignores it`"。
- 未知名称 → "`Unknown extension: <name>`"。
- 文件变化 → `reloadSettings()`（只重装 enablement/path/`reloadOnSettings` 变化过的扩展）。

`defaultOff`（`shared/extension-api.ts:61-70`）：`cloud, parallel, tailscale, health, classify, phase, sounds, voice-live`。

## 4. 服务端 facet 的加载

### 4.1 模块形状

```ts
// extensions/hello/server.ts
import type { Extension } from '@earendil-works/pi-durable'
import type { ExtensionHost } from '../../server/extensions.ts'

export default function hello(host: ExtensionHost): Extension {
  return {
    name: 'hello', // 必须等于目录名
    tools: [/* ToolRegistration[] */],
    sections: [/* PromptSection[] */],
    hooks: [/* HookRegistration[] */],
    wraps: [/* Wrap[] */],
    tasks: [/* AnyTask[] */],
  }
}
// 也可以直接 export default { name:'hello', tools:[…] } satisfies Extension
```

同文件还可以导出：

| 导出               | 类型                                                                       | 作用                                                                 |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `actions`          | `Record<string, (args, ctx:ActionContext)=>JsonValue\|Promise<JsonValue>>` | UI/agent 可调用的动作                                                |
| `userActions`      | `string[]`                                                                 | 仅允许用户（UI）调用；agent 调用会被拒绝                             |
| `pollActions`      | `string[]`                                                                 | 只读轮询动作：trace 只计数不写行                                     |
| `docs`             | `ConversationDocToken<JsonObject>[]`                                       | 该扩展导出的会话文档（必须在 `defineDoc` 时 `scope:'conversation'`） |
| `secrets`          | `{name,description,url?}[]`                                                | 需要的用户密钥声明（名称 `^[A-Z][A-Z0-9_]*$`）                       |
| `reloadOnSettings` | `true`                                                                     | 设置变化时也重装该 facet                                             |

### 4.2 装载流程（`server/extensions.ts:503-601`）

```
对每个 winner：
  record = ExtensionInfo{name,path,source,enabled,core?,layer,actions,readme, facets}
  若 enabled 且含 server.ts 且（未限定 servers 或选中）：
     facetHost = scope(name)                 // 每 facet 独立 host + provider 表 + 生命周期集合
     module = await vite.ssrLoadModule(path/server.ts)
     extension = typeof module.default === 'function' ? await module.default(facetHost) : module.default
     校验 extension.name === name
     校验 docs 全部 scope==='conversation'
     校验 actions 全为函数
     校验 userActions/pollActions 是已注册 action 名
     secrets = validateSecrets(module.secrets ?? [])
     host.registry.install(trace.tools(extension))   // 工具注册并包 trace
     previousHost = facetHosts.get(name)
     facetHosts.set(name, facetHost)
     把 staging 的 providers 提交到全局 providers
     await dispose(previousHost)             // 旧 facet 的订阅/资源/清理
     若 harness 已打开 → 立刻跑新 facet 的 onOpen
     actions/userActions/pollActions/docs/reloadOnSettings 记录
     installed.set(name, module.order ?? 0)
     record.server = {loadedAt, tools, sections, hooks, docs, secrets}
  失败：
     await dispose(facetHost)
     record.server = {...previous?.server, error:String(error)}   // 保留旧工具/服务
  若 disabled 或没有 server.ts：
     unload(name)                            // 卸载 registry、docs、actions、settingsReloads
```

### 4.3 卸载（`unload`）

```ts
await dispose(facetHosts.get(name)) // apis.dispose、移除 providers、停订阅、跑 facet cleanups、清 notices
facetHosts.delete(name)
if (installed.delete(name)) host.registry.uninstall({ name })
documents.delete(name)
actions.delete(name)
userActions.delete(name)
pollActions.delete(name)
settingsReloads.delete(name)
```

`dispose` 顺序很重要：**先**注销 API/provider/订阅，**再**跑 cleanup，防止 cleanup 里再触发旧服务。

## 5. 扩展宿主（`ExtensionHost`）

服务端工厂收到的全部能力（`server/extensions.ts:36-101`）：

| 字段                                                         | 说明                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `ultimateRoot / projectRoot / userHome / home`               | 代码根、工作根、用户根、实例状态根                    |
| `modelRuntime / settings / models()`                         | 模型运行时、Pi 设置、模型列表                         |
| `skills(cwd)`                                                | 合并后的技能（含 scope/overrides）                    |
| `restart(approved)`                                          | 请求核心换代；`approved(generation)` 在激活前持久记录 |
| `build() / system() / extensions()`                          | 构建信息、系统快照、扩展信息                          |
| `conversations()`                                            | 所有会话摘要（harness 未开时为空）                    |
| `harness()`                                                  | Pi Durable Harness（未开时抛错）                      |
| `uiState(context)`                                           | root 的 `ultimate.ui` 快照                            |
| `doc(kind)`                                                  | 按 kind 找文档 token（含事件 feed）                   |
| `metadata`                                                   | `ultimate.metadata` token                             |
| `implement(api,value) / need(api) / want(api) / catalogue()` | 类型化服务                                            |
| `provide/use`                                                | 未类型化逃生口（lint 禁止在 extensions/ 使用）        |
| `emit/react/eventLog`                                        | 持久事件                                              |
| `trace`                                                      | 调用追踪读取器                                        |
| `access.allow({origin,verify})`                              | 注册受信 HTTP 来源（facet 卸载自动移除）              |
| `notice(message)`                                            | 提示 + 诊断；每个 facet 每条消息只记录一次            |
| `resource(key,create)`                                       | 进程级共享资源（跨 reload 存活）                      |
| `onOpen(cb) / onRelease(cb) / onClose(cb)`                   | 生命周期                                              |
| `projects()`                                                 | 其他项目 home 的清单（不打开其 SQLite）               |
| `projectSetup() / projectSettings() / projectExtensions()`   | 项目信任/设置/扩展盘点                                |
| `setProjectDecision(local)`                                  | 写入信任并立即应用                                    |
| `reloadExtensions()`                                         | 重载设置/浏览器 facet/CSS                             |
| `invoke(name,action,args,signal,conversationId)`             | agent 代表会话调用 action（拒绝 user-only）           |

### 5.1 服务契约（`defineApi`）

```ts
// extensions/echo/api.ts
/** Echo: says text back. */
import { defineApi } from '../../shared/extension-api.ts'
export type EchoService = { echo(text: string): string }
export const Echo = defineApi<EchoService>()('echo')
export { Echoed } from './refs.ts'
```

- provider：`host.implement(Echo, { echo: t => t })`；
- consumer：`const echo = host.need(Echo)`（硬依赖）或 `host.want(Echo)`（可选，可能 undefined）。
- 返回的是 **Proxy 句柄**：每次成员访问都解析当前 provider，所以 reload 后仍有效；方法调用统一走 trace。
- `need` 在 setup 阶段不抛（provider 可能稍后加载），运行期缺失抛
  `<ext> needs <api>, which no enabled extension provides`。
- `catalogue()` 返回 `{apis,missing,cycles}`；cycles 用 Tarjan SCC（>1 成员）计算。

### 5.2 扩展点（dependency inversion）

低层扩展声明契约并 `want` 它；高层扩展 `implement`：

```ts
// conversations/api.ts
export const Trees = defineApi<TreeService>()('conversations.trees')
// conversations/server.ts
const trees = host.want(Trees)          // 可能没有
// lineage/server.ts
host.implement(Trees, { … })
```

- 名称必须 `<owner>.<point>`；catalogue 中该行带 `owner`，其 provider 也算依赖 owner（避免环）。
- 现有服务端点：`conversations.trees`、`conversations.release`（conversations 声明）、`workspaces.handoff`（workspaces 声明）。
- 浏览器对应物是 `definePoint` + `<Provided>`/`<AllProvided>`（见 07 章）。

### 5.3 事件

```ts
// refs.ts
export const Landed = defineEvent<{ sha:string; branch:string }>('workspaces.landed')
// server: 在同一事务内
await host.emit(tx, Landed, { sha, branch })
// 订阅
host.react('notify-lineage', [Landed], async (tx, event) => { … })
```

- `react` 只能在 facet scope 内调用（注册名为 `<extension>/<reactor>`）。
- 语义见 05 章 §6；`from:'now'` 用于"只关心新事件"的反应器。
- 事件要少而小（它们是历史）。

### 5.4 文档

```ts
// refs.ts
export const PlanDoc = docRef<{ epics: Epic[] }>('ultimate.plan')
// server.ts
export const docs = [defineDoc({ kind: PlanDoc.kind, … })]
// 读写
await conversation.commit(async tx => { const plan = await tx.doc(PlanDoc, id); plan.epics.push(…) }, context)
```

浏览器：`useDoc(PlanDoc)` / `useDocOf(1, PlanDoc)`；Documents 面板通过 `documents: [{kind,title,component}]` 渲染。

### 5.5 动作

```ts
// refs.ts
export const InfoAction = actionRef<{ id: number }, WorkspaceInfo | null>('workspaces', 'info')
// server.ts
export const actions = {
  info: implementAction(InfoAction, async (args, ctx) => {
    const id = Number((args as {id?:unknown})?.id)
    …
  }),
}
// 浏览器
const { data } = useAction(InfoAction, { id })
```

- `ActionContext`：`{host, conversationId?, device?, signal, exec(command,args,{cwd,timeout})}`；
- `exec` 限制 30s、1MB 输出、SIGKILL；
- 动作经 trace（`kind:'action'`），`pollActions` 只计数；
- `userActions` 里的动作 agent 不能调用；
- `test/refs.test.ts` 保证每个 ref 有实现、每个 doc ref 有导出。

### 5.6 生命周期

| 回调        | 时机                                 | 作用域                                    |
| ----------- | ------------------------------------ | ----------------------------------------- |
| `onOpen`    | harness 每次打开（已打开则注册即跑） | facet；在 `resource()` 创建中注册则进程级 |
| `onRelease` | harness 关闭前（核心换代；进程继续） | 同上；用于停 commit 订阅                  |
| `onClose`   | facet 卸载/替换/服务关闭             | facet 清理；失败产生 notice               |

`resource(key,create)` 是**跨 reload 存活**的进程级共享对象（运行中的子进程、in-flight Promise、flag）。
注意：不要把文档 token 或 facet 函数捕获进 resource（reload 后会失效）。

## 6. 浏览器 facet 的加载

### 6.1 虚拟模块

`server/vite-extensions.ts` 在构建期生成：

```js
export const loaders = {
  "/abs/path/extensions/hello/web.tsx": () => import("/@fs//abs/path/extensions/hello/web.tsx"),
  …
}
```

只包含 `enabled && files.includes('web.tsx')` 的扩展；项目层需信任。
同时给 `web/src/index.css` 追加 `@source "<extensions dir>";`，让 Tailwind 扫描项目扩展的类名。

### 6.2 加载与校验

`registry.setLoaders()`：

- 并行 `import()`；每个 facet 独立 settle；
- `validate()` 检查每个 contribution 的形状（`shapes` 表）；
- 失败：`fail(name,error)`，记录 `error`，保留上一版本；
- 新增/删除目录：虚拟模块 HMR → 重新 `setLoaders`；
- 单文件热更新：`vite:afterUpdate` → 动态 import 带 `?t=` → `registry.replace`；
- 编译错误：`vite:error` → `registry.fail` 并移除 Vite overlay（错误显示在扩展卡片上）。

### 6.3 错误隔离

- `App` 的 `SurfaceBoundary` 捕获 surface 崩溃，回退到下一个 surface（最终回退到裸 `Frame`），并发 warning notice；
- `ExtensionBoundary` 包裹每个 slot/panel/document/tool/entry 贡献；
- registry 的 `version` 递增会重置 boundary（热更新后自动重试）。

## 7. 扩展顺序、覆盖与冲突

- 发现顺序：builtin → user → project，再按 `order` 与名称；
- **同 id 覆盖**（后者赢）：surface、command、document renderer；
- **嵌套组合**（按顺序）：tool renderer、entry renderer、link renderer、composer；
- **最后赢**：toolLine、inbox、intro、point provider；
- **并列**：slot items（按 order 排序后全部渲染）、messageActions/details/answerLabels/userBubble；
- **合并**：compact（多个 facet 的规则合并）。

## 8. 依赖与分层约束

`docs/extensions.md:75-101` 定义 core tier 及 9 层依赖（低 → 高）：

1. prompt、coding-tools、documents、notices、secrets、theme
2. models
3. conversations
4. workspaces
5. subagents
6. lineage
7. messages
8. onboarding、agent
9. sidebar

规则：

- core tier 只能 import/need/want core tier（lint `core-tier-deps`）；
- 依赖图不得有环（`pnpm deps` / `scripts/deps.ts`，Tarjan 检测）；
- 低层需要高层信息 → 声明扩展点/事件，由高层填充；
- 服务端 `.ts` 只能 runtime import 其他扩展的 `api.ts`；浏览器 `.tsx` 只能 import 其他扩展的 `ui.tsx`；
  类型可用 `import type`，纯 helper 放 `lib/`（lint `api-only-imports`）。

## 9. `api.ts` / `refs.ts` 的硬性形状（lint）

`ultimate/api-file-shape`：

- 文件开头必须有文档注释，第一句是一行摘要；
- 只允许：import（`shared/`、包、自己的 `refs.ts`、其他扩展的 `api.ts`；其他一律 `import type`；禁止 `node:*`）、
  类型、`export const X = defineApi/defineDoc/defineEntry`、自己的 `refs.ts` 的 re-export、`export const tier='core'`；
- 每个导出的 token 与 service 类型的每个成员都要有文档注释。

`ultimate/api-naming`：`defineApi<…>()('<folder>')` 或 `'<folder>.<point>'`；`defineEvent('<folder>.<event>')`；
`actionRef('<folder>',name)`。
`ultimate/no-raw-services`：`extensions/` 内禁止 `host.provide`/`host.use`。
`ultimate/replay-safe-reason`：每个 `replay:'safe'` 前必须有原因注释。

## 10. 内置扩展清单（53 个）

| 组        | 扩展                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 核心/基础 | agent, prompt, coding-tools, documents, notices, secrets, theme, models, conversations, workspaces, subagents, lineage, messages, onboarding, sidebar |
| 编排      | plan, tasks, todos, phase, automations, goal, pause, review                                                                                           |
| 上下文    | context, recall, dream, side-chat, keep-warm, questions, classify                                                                                     |
| 运维/观察 | status, status-line, health, info, setup, update, instance, watchdog, system, debug, activity, codemode                                               |
| 集成      | cloud, tailscale, browser, voice, voice-live, parallel, claude-code, fast, sounds, splash                                                             |

逐项规格见 `10-extension-catalog.md` 与 `parts/ext-*.md`。

## 11. 复刻一个最小扩展（验收用）

```
extensions/hello/
├─ README.md         "Says hello in the status line."
├─ server.ts         export default { name:'hello', tools:[hello] }
└─ web.tsx           export default defineWebExtension({ slots:{'statusline.left':[Badge]} })
```

验收：

- [ ] 保存后在 Extensions 面板出现，`server.tools` 有 `hello`；
- [ ] 状态栏立即出现 Badge（无需刷新）；
- [ ] 删除 `README.md` 后仍加载，但面板无摘要；
- [ ] 让 `web.tsx` 抛错 → 出现错误卡，其余 UI 正常，修复后自动恢复；
- [ ] 让 `server.ts` 抛错 → `server.error` 显示，旧工具仍可用；
- [ ] 禁用后工具从 agent 的工具列表消失（下一个请求生效），状态栏消失。

## 12. 证据索引

- `server/discovery.ts:22-82`、`server/extension-settings.ts:12-58`、`server/project-setup.ts:53-86`
- `server/extensions.ts:36-101`（host 类型）、`108-312`（scope/invoke）、`313-428`（extensionHost）、
  `445-615`（reload/unload/discover）、`616-725`（settings/watch）、`726-775`（返回 API）
- `server/extension-apis.ts:36-133`（typed services/catalogue/cycles）
- `server/vite-extensions.ts:13-146`（虚拟模块/CSS/HMR）
- `extensions/README.md:45-83`（位置/优先级）、`85-256`（host/API/events/生命周期）、`259-356`（文件/贡献）
- `docs/extensions.md:1-152`（机制/事件/core tier/API）
- `lint/ultimate.ts`（形状/命名/导入规则）
