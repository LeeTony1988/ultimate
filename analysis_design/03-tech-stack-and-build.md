# 03 · 技术栈、构建与工具链

> 复刻目标：一套"无打包、源码直跑"的 Node + React 工程：Node 26 原生执行 TypeScript，Vite 只做浏览器侧编译与 HMR，
> 类型检查、lint、测试由 `vite-plus`（vp）统一驱动。

## 1. 运行时基线

| 项     | 值                                                  | 说明                                                                       |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Node   | `>=26`（本机 v24 无法运行）                         | 原生 `.ts` 执行（type stripping）、`node:sqlite`、`import.meta.main`       |
| 包管理 | `pnpm@11.8.0`                                       | 精确锁定、patchedDependencies                                              |
| 语言   | TypeScript `7.0.2`                                  | `erasableSyntaxOnly`、`verbatimModuleSyntax`、`allowImportingTsExtensions` |
| 模块   | ESM（`"type":"module"`）                            | 相对导入必须写 `.ts` / `.tsx`                                              |
| 前端   | React `19.3` + Vite `8.3.5`（vite-plus 1.4.0 封装） | Tailwind v4                                                                |
| 测试   | Vitest `5.0.5`（经 vp）                             | 快测 + 独立 e2e 配置                                                       |

运行方式：

```bash
pnpm install
pnpm start     # node bin/ultimate.ts   （生产式：监督者 + core）
pnpm dev       # node server/main.ts    （无监督者，不能 restart）
pnpm cli       # node bin/cli.ts        （逃生终端）
```

没有 `build` 脚本：服务端直接跑 `.ts`，浏览器由 Vite 在 core 进程内以 middleware 模式实时编译。

## 2. 依赖清单与用途

### 运行时依赖（`dependencies`）

| 包                                  | 版本          | 用途                                                                             |
| ----------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `@earendil-works/chord`             | 1.4.0         | 响应式状态/增量 ops/Context                                                      |
| `@earendil-works/pi-ai`             | 1.4.0         | 模型/消息/工具类型与 provider 抽象                                               |
| `@earendil-works/pi-coding-agent`   | 1.4.0         | `ModelRuntime`、`SettingsManager`、技能/上下文文件、Pi 工具、`ProjectTrustStore` |
| `@earendil-works/pi-durable`        | 1.4.0         | Harness/Session/Storage/文档/任务/提交                                           |
| `@earendil-works/pi-codemode`       | 1.4.0         | QuickJS/WASM 沙箱                                                                |
| `@earendil-works/pi-claude-code`    | github pin    | Claude Code provider（实验）                                                     |
| `react` / `react-dom`               | 19.3.0        | UI                                                                               |
| `vite-plus`                         | 1.4.0         | Vite + lint + test 的统一 CLI/API                                                |
| `@vitejs/plugin-react`              | 6.1.1         | React Fast Refresh                                                               |
| `@tailwindcss/vite` / `tailwindcss` | 4.3.3         | 样式                                                                             |
| `radix-ui`                          | 1.6.7         | 对话框/下拉/弹出层/提示                                                          |
| `cmdk`                              | 1.1.1         | 命令面板                                                                         |
| `lucide-react`                      | 1.49.0        | 图标                                                                             |
| `streamdown` + `@streamdown/code`   | 2.7.0 / 2.0.0 | 流式 Markdown + 代码高亮                                                         |
| `@pierre/diffs`                     | 1.5.2         | diff 渲染（review/coding-tools）                                                 |
| `use-stick-to-bottom`               | 1.1.6         | transcript 跟随滚动                                                              |
| `ansi_up`                           | 6.0.6         | 终端 ANSI 转 HTML                                                                |
| `unbash`                            | 5.1.0         | shell 命令解析/展示                                                              |
| `undici`                            | 8.10.2        | 仅 `server/http.ts` 的 dispatcher                                                |
| `log-update`                        | 8.0.0         | 终端仪表盘                                                                       |
| `uqr`                               | 0.1.3         | 终端二维码（tailscale/instance）                                                 |
| `cn`                                | 0.4.0         | class 合并（Tailwind 冲突解决）                                                  |
| `ogl`                               | ^0.1.11       | splash 的 WebGL 字标（唯一非精确版本）                                           |
| `@fontsource-variable/inter`        | 5.3.0         | 字体                                                                             |

### 开发依赖

`@types/node 26.0.0`、`@types/react 19.3.0`、`@types/react-dom 19.3.0`、`typescript 7.0.2`、`vitest 5.0.5`。

### 补丁与覆盖（`pnpm-workspace.yaml`）

- `patchedDependencies`：`chord@1.4.0`、`pi-durable@1.4.0`、`pi-claude-code@0.1.0`（上游缺陷/缺失钩子的临时修复，
  每条都有注释与"上游修复后删除"的说明）。
- `overrides.vite = 8.3.5`（安全修复）。
- `minimumReleaseAgeExclude` 列出所有 `@earendil-works/*` 与 vite-plus，允许安装刚发布的精确版本。
- `allowBuilds`：esbuild 允许构建脚本；genai/protobufjs/workerd 禁止。

## 3. TypeScript 工程划分

### 3.1 服务端 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ESNext", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./web/src/*"] }
  },
  "include": [
    "bin",
    "lint",
    "server",
    "shared",
    "lib",
    "scripts",
    "extensions/**/*.ts",
    ".ultimate/extensions/**/*.ts",
    "test",
    "vite.config.ts"
  ],
  "exclude": ["test/web"],
  "references": [{ "path": "./tsconfig.web.json" }]
}
```

- **服务端只检查 `.ts`**（扩展的 `server.ts`/`api.ts`/`refs.ts`/`lib`），不含 `.tsx`；
- `erasableSyntaxOnly`：不能使用 enum/namespace/参数属性，因为 Node 仅做类型擦除；
- `.ts` 扩展名导入是强制的。

### 3.2 浏览器 `tsconfig.web.json`

```json
{
  "compilerOptions": {
    "composite": true, "emitDeclarationOnly": true, "outDir": "node_modules/.cache/tsc-web",
    "target":"ESNext","module":"ESNext","moduleResolution":"Bundler",
    "lib":["ESNext","DOM","DOM.Iterable"],"types":["vite-plus/client"],
    "jsx":"react-jsx","strict":true,"allowImportingTsExtensions":true,
    "erasableSyntaxOnly":true,"verbatimModuleSyntax":true,"skipLibCheck":true,
    "paths":{"@/*":["./web/src/*"]}
  },
  "include": ["web/src","extensions/**/*.tsx",".ultimate/extensions/**/*.tsx",
              "shared/protocol.ts","shared/events.ts","shared/extension-api.ts",
              "extensions/*/refs.ts", …若干浏览器安全的 .ts 辅助文件…, "test/web"]
}
```

- 关键点：**`refs.ts` 与少量纯逻辑 `.ts` 被纳入 web 类型检查**，保证浏览器代码不会意外引用服务端；
- 显式列出每个扩展的 `refs.ts` 与共享 helper（如 `lib/entries.ts`、`lib/context-usage.ts`）。

### 3.3 热替换检查 `tsconfig.swap.json`

```json
{ "extends": "./tsconfig.json", "include": ["server/**/*.ts", "shared/**/*.ts"] }
```

supervisor 在 `swap()` 前执行 `tsc --noEmit -p tsconfig.swap.json`——只检查核心（不含扩展，保证快），
通过才启动新 core。

## 4. Vite 配置（`vite.config.ts`）

```ts
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': <repo>/web/src } },
  lint: { … },      // 见 §5
  fmt: { semi:false, singleQuote:true },
  test: { … },      // 见 §6
})
```

- 开发/运行时由 `server/main.ts` 用 `createViteServer({ configFile, root, middlewareMode:true, … })` 加载同一配置，
  并追加 `extensionModules()` 与 watcher 插件；
- React Fast Refresh 让 `web.tsx` 热替换不刷新页面；`web/src/extensions.ts` 处理 `vite:afterUpdate`/`vite:error`。

## 5. Lint（oxlint via vp）

插件：`typescript`、`unicorn`、`import`、`promise`、`vitest` + 自定义 `./lint/ultimate.ts`。
类别：correctness/suspicious = error；`denyWarnings: true`、`typeAware: true`、`typeCheck: true`。

关键规则：

| 规则                                  | 作用                                               |
| ------------------------------------- | -------------------------------------------------- |
| `import/no-cycle`                     | 禁止模块环                                         |
| `typescript/no-floating-promises`     | 必须处理 Promise                                   |
| `ultimate/api-file-shape`             | `api.ts`/`refs.ts`/`ui.tsx` 的文档与形状           |
| `ultimate/api-naming`                 | token 命名规范                                     |
| `ultimate/api-only-imports`           | 跨扩展只允许 `api.ts`（服务端）/`ui.tsx`（浏览器） |
| `ultimate/core-tier-deps`             | core 只能依赖 core                                 |
| `ultimate/no-raw-services`            | 禁止 `host.provide/use`                            |
| `ultimate/replay-safe-reason`         | `replay:'safe'` 前必须有原因注释                   |
| `ultimate/no-silent-catch`            | 空 catch / 返回 undefined 的 catch 必须说明原因    |
| `ultimate/no-raw-stream`              | 浏览器禁止直接读原始流                             |
| `ultimate/no-retired-ui`              | 禁止已退役的 UI 标签/页面                          |
| `ultimate/no-test-timeout`            | 快测禁止自定义超时                                 |
| `ultimate/no-real-wait-in-fast-tests` | 快测禁止真实等待                                   |
| `ultimate/no-local-test-polling`      | 测试用 `until` 而非轮询                            |

导入边界（`no-restricted-imports`）：

- `server/**`、`bin/**` 不得 import `extensions/**`（"Core knows no feature"）；
- `shared/**` 只能独立；
- `lib/**` 不得 import extensions/web/bin；server 只允许 type import；
- `extensions/**` 不得 runtime import server/bin（用 host 能力）；
- 浏览器代码（`web/src/**`、`extensions/**/*.tsx`）不得 import `node:*`/`server/**`/`extensions/**`。

## 6. 测试

```ts
test: {
  root: '.',
  env: { MIMALLOC_ALLOW_THP:'0', MIMALLOC_PURGE_DELAY:'0' },
  globalSetup: ['test/sweep-temp.ts'],
  setupFiles: ['test/setup.ts'],
  include: ['test/**/*.test.ts'],
  exclude: ['test/e2e/**'],
  testTimeout: 30000, hookTimeout: 5000, teardownTimeout: 5000,
  maxWorkers: 8,
}
```

- `pnpm test`：快速、进程内、脚本化模型响应（faux provider），不 spawn 真实进程；
- `pnpm test:e2e`：独立 `test/e2e/vitest.config.ts`，会启动真实 supervisor/实例（本项目分析按用户要求排除 test/ 目录，
  复刻时应保留其结构：e2e 覆盖 `disable-each`、重启、实例等）；
- `pnpm check` = `vp check`（format+lint+types）+ `node scripts/deps.ts`（扩展依赖图，失败于环/core→optional）。

## 7. 仓库脚本

| 脚本            | 命令                                            | 作用                            |
| --------------- | ----------------------------------------------- | ------------------------------- |
| `dev`           | `node server/main.ts`                           | 无监督者开发                    |
| `start`         | `node bin/ultimate.ts`                          | 监督者 + core                   |
| `cli`           | `node bin/cli.ts`                               | 逃生终端 agent                  |
| `check`         | `vp check && node scripts/deps.ts`              | 全量检查                        |
| `deps`          | `node scripts/deps.ts`                          | 扩展依赖图                      |
| `test`          | `vp test`                                       | 快测                            |
| `test:e2e`      | `vitest run --config test/e2e/vitest.config.ts` | 端到端                          |
| `setup:machine` | `node scripts/setup-machine.ts`                 | 机器初始化（依赖、Chromium 等） |
| `reset`         | `node scripts/reset.ts`                         | 备份并清空项目状态              |
| `restore`       | `node scripts/restore.ts`                       | 安装云备份                      |
| `fmt` / `lint`  | `vp fmt` / `vp lint`                            | 格式化/lint                     |

## 8. CI 与发布

`.github/` 只有 PR 模板，没有 CI workflow（本项目以本地 `pnpm check` 为准）。PR 政策（`CONTRIBUTING.md`）：
核心只合明确修复；功能 PR 保持 open 作为参考实现（label `feature`）。这意味着复刻时**不要期待上游稳定 API**，
应以本仓库源码为准并固定版本。

## 9. 目录/命名约定

- 扩展目录名 = 扩展名 = `extension.name`；
- 服务端文件 `.ts`，浏览器 `.tsx`；扩展的 `refs.ts` 浏览器安全；
- 相对导入带扩展名（`.ts`/`.tsx`）；
- 提交信息 Conventional Commits；通过 Ultimate 的 shell 提交会带 `Ultimate-Conversation: <id>` trailer；
- 禁止向后兼容 shim；直接改调用方；
- 每个用户可见结果要有专用渲染器，不能直接丢 Markdown。

## 10. 复刻基线（建议）

```bash
# 1. 初始化
pnpm init
pnpm add -E @earendil-works/chord@1.4.0 @earendil-works/pi-ai@1.4.0 \
  @earendil-works/pi-coding-agent@1.4.0 @earendil-works/pi-durable@1.4.0 \
  @earendil-works/pi-codemode@1.4.0 vite-plus@1.4.0 react@19.3.0 react-dom@19.3.0 …
pnpm add -D typescript@7.0.2 vitest@5.0.5 @types/node@26 @types/react@19.3

# 2. 先跑通最小闭环
node server/main.ts  # 一个 /api/events + 空扩展 + 静态页
```

## 11. 证据索引

- `package.json:8-63`
- `pnpm-workspace.yaml:1-38`
- `tsconfig.json`、`tsconfig.web.json`、`tsconfig.swap.json`
- `vite.config.ts:5-204`
- `bin/ultimate.ts:349-370`（swap 类型检查）
- `server/main.ts:103-129`（Vite middleware 配置）
- `scripts/`、`lint/ultimate.ts`
