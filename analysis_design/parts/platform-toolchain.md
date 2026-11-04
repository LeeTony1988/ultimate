# 工具链与构建分析笔记

## 1. 概览

Ultimate 不打包：服务端 `.ts` 由 Node 26 直接执行，浏览器由 core 内嵌的 Vite 编译；`vite-plus`（vp）统一
lint/format/test；TypeScript 分三套工程（服务端 / 浏览器 / swap 检查）。这使"改代码→热重载/换代"的路径最短。

## 2. 版本与依赖

- Node `>=26`（原生 TS、`node:sqlite`、`import.meta.main`）；
- pnpm `11.8.0`；
- TypeScript `7.0.2`、Vitest `5.0.5`、Vite `8.3.5`（`vite-plus@1.4.0` 封装）；
- React `19.3.0`、Tailwind `4.3.3`、Radix `1.6.7`、cmdk `1.1.1`、streamdown `2.7.0`、`@pierre/diffs` `1.5.2`。

所有 `@earendil-works/*` 精确固定 `1.4.0`（`pi-claude-code` 为 github pin）；三个 patchedDependencies；
`overrides.vite = 8.3.5`。

## 3. tsconfig

| 文件                 | 用途                                          | 关键设置                                                                                   |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `tsconfig.json`      | 服务端/脚本/扩展 `.ts`                        | NodeNext、`erasableSyntaxOnly`、`allowImportingTsExtensions`、`noEmit`、paths `@/*`        |
| `tsconfig.web.json`  | 浏览器 `.tsx` + `refs.ts` + 浏览器安全 helper | Bundler、`jsx:react-jsx`、`composite`、`emitDeclarationOnly`、`types:["vite-plus/client"]` |
| `tsconfig.swap.json` | 换代前只检查 `server/**` + `shared/**`        | 继承主配置，`include` 收窄                                                                 |

`tsconfig.web.json` 显式列出每个扩展的 `refs.ts` 与若干纯逻辑 `.ts`（如 `lib/entries.ts`），保证浏览器代码
不会意外依赖 Node/服务端。

## 4. Vite 配置

```ts
defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': <repo>/web/src } },
  lint: { plugins: [...], jsPlugins: ['./lint/ultimate.ts'], categories: {...}, rules: {...}, overrides: [...] },
  fmt: { semi:false, singleQuote:true },
  test: { root:'.', include:['test/**/*.test.ts'], exclude:['test/e2e/**'], maxWorkers:8, testTimeout:30000 }
})
```

运行时 `server/main.ts` 以 `middlewareMode` 加载同一配置，附加：

- `extensionModules()`：虚拟模块 `virtual:ultimate/web-facets`、CSS `@source`、依赖 dedupe、HMR；
- `ultimate:watchers`：Vite 配置重启后迁移 watcher 监听。

## 5. 脚本

| 脚本                     | 作用                                            |
| ------------------------ | ----------------------------------------------- |
| `pnpm start`             | `node bin/ultimate.ts`（监督者）                |
| `pnpm dev`               | `node server/main.ts`（无监督者，不能 restart） |
| `pnpm cli`               | `node bin/cli.ts`（逃生终端）                   |
| `pnpm check`             | `vp check`（fmt+lint+types）+ `scripts/deps.ts` |
| `pnpm test` / `test:e2e` | 快测 / 真实进程 e2e                             |
| `pnpm setup:machine`     | 机器初始化                                      |
| `pnpm reset` / `restore` | 状态备份/恢复                                   |

## 6. Lint 规则（自定义）

`api-file-shape`、`api-naming`、`api-only-imports`、`core-tier-deps`、`no-raw-services`、`no-raw-stream`、
`no-retired-ui`、`replay-safe-reason`、`no-silent-catch`、`no-test-timeout`、`no-real-wait-in-fast-tests`、
`no-local-test-polling`。

导入边界：

- `server/`、`bin/` 不得 import `extensions/`；
- `shared/` 独立；
- `lib/` 不得 import extensions/web/bin，server 只允许 type；
- 扩展不得 runtime import server/bin；
- 浏览器不得 import `node:*`/`server/**`/`extensions/**`。

## 7. 测试策略

- 快测：进程内、脚本化模型响应（faux provider），禁止真实等待/自定义超时/本地轮询；
- e2e：真实 supervisor/实例，覆盖 `disable-each`、重启、实例、UI；
- 复刻时至少保留：核心提交/恢复、SSE 快照+ops、扩展加载/卸载、UI 状态收敛、进程组清理。

## 8. 复刻检查

- [ ] `node --version` ≥ 26，`pnpm install` 无 peer 冲突；
- [ ] `pnpm check` 通过（types/lint/format/deps）；
- [ ] `pnpm dev` 能起页面；`pnpm start` 能换代；
- [ ] 修改 `web.tsx` 热更新不刷新；修改 `server/*.ts` 后 restart 生效；
- [ ] `tsconfig.web.json` 不包含任何服务端实现文件。

## 9. 证据

`package.json`、`pnpm-workspace.yaml`、`tsconfig*.json`、`vite.config.ts:5-204`、`server/main.ts:103-129`、
`bin/ultimate.ts:349-370`、`scripts/*`、`lint/ultimate.ts`。
