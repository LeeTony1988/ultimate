# Ultimate 源码分析与复刻设计

> 分析对象：`D:\learnspace\git\ultimate`（git `3f7b7bec`，2026-10-27）。
> 范围：仓库全部源码与文档，按用户要求排除 `node_modules/`、`dist/`、`build/`、`test/`。
> 目的：给出**足以从零复刻**的架构规格、扩展规格与实施路线。

## 怎么读

| 你的目标                         | 先读                         | 再读                                                 |
| -------------------------------- | ---------------------------- | ---------------------------------------------------- |
| 快速判断"这是什么、值不值得复刻" | 本页 §关键结论               | `01-product-model.md`、`14-replication-blueprint.md` |
| 动手搭骨架                       | `03-tech-stack-and-build.md` | `04-supervisor.md`、`05-server-core.md`              |
| 理解持久化与恢复                 | `06-durable-runtime.md`      | `13-data-model.md`                                   |
| 做扩展/UI                        | `08-extension-system.md`     | `07-protocol-and-sdk.md`、`09-web-shell.md`          |
| 复刻具体功能                     | `10-extension-catalog.md`    | `parts/ext-*.md` 对应组                              |
| 做智能体/委派                    | `11-agents-and-prompts.md`   | `agents/*.md`、`extensions/subagents/README.md`      |
| 做共享工具/进程管理              | `12-lib-and-infra.md`        | `lib/process-group.ts`                               |

## 文档地图

| 文件                          | 内容                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `00-analysis-plan.md`         | 分析方案、方法、阶段与 checklist（进度真相源）                           |
| `01-product-model.md`         | 产品定义、术语表、用户旅程、状态机、设计哲学                             |
| `02-architecture.md`          | 进程拓扑、分层、启动/请求/运行/换代时序、失败矩阵                        |
| `03-tech-stack-and-build.md`  | Node 26 / TS 7 / Vite+ / 三套 tsconfig / lint / 测试                     |
| `04-supervisor.md`            | `bin/`：CLI、锁、端口代理、core fork、swap 协议、仪表盘、逃生 CLI        |
| `05-server-core.md`           | HTTP/SSE 全部端点、事件日志、系统信息、trace、安全                       |
| `06-durable-runtime.md`       | Pi Durable 的 Storage/Session/Harness/文档/任务/提交/恢复                |
| `07-protocol-and-sdk.md`      | `shared/*` 协议、SDK store/registry/hooks/actions/ui-state/resume        |
| `08-extension-system.md`      | 发现/装载/热重载、facet 生命周期、契约/事件/文档/动作、lint 边界         |
| `09-web-shell.md`             | App、surface、transcript、composer、palette、样式、响应式                |
| `10-extension-catalog.md`     | 53 个内置扩展总表 + 逐组详细规格（附录 A）                               |
| `11-agents-and-prompts.md`    | 9 个 agent 定义、@ultimate 行为、coordinator 流程、subagent 协议、提示词 |
| `12-lib-and-infra.md`         | `lib/` 全模块、进程组、原子文件、agents 解析、远程/云、脚本、lint、补丁  |
| `13-data-model.md`            | home/项目布局、SQLite schema、文档清单、分卷、锁、reset/restore          |
| `14-replication-blueprint.md` | M0–M7 里程碑、任务分解、验收、风险、反模式、第一周计划                   |
| `15-file-manifest.md`         | 全仓库源文件清单（按目录、行数、首条注释摘要），复刻对照用               |
| `16-design-decisions.md`      | 16 条 ADR：为什么这样设计、代价、复刻建议与检查表                        |
| `17-acceptance-spec.md`       | 可执行验收场景（进程/HTTP/扩展/树/上下文/数据/性能/安全）                |
| `18-subsystem-notes.md`       | 平台层原始分析附录（Web SDK、Web 外壳、lib、Pi Durable、工具链）         |
| `parts/`                      | 原始分析笔记（按扩展组/子系统），10/18 章附录的来源                      |

## 关键结论（十句话）

1. **双进程不是洁癖，是"自改代码不丢对话"的物理基础**：Supervisor 只做端口代理/进程生命周期，Core 可在任意时刻被替换或杀死。
2. **SQLite 是唯一真相**：对话、工具调用、子智能体、文档、任务、输入队列全部先提交再展示；重启从最近 checkpoint 继续。
3. **扩展系统是产品骨架，不是插件**：53 个内置扩展、15 个 core tier；目录即部署单元，`server.ts` 与 `web.tsx` 独立热更新、独立失败。
4. **跨扩展只有四条通道**：`api.ts` 服务契约、`refs.ts` 文档/动作/事件、`ui.tsx` 浏览器组件、持久事件与文档；核心从不 import 功能。
5. **SSE 是唯一实时通道**：服务端发快照 + chord ops，浏览器 store 是纯复制器；UI 状态用 `ui.rev` 解决多标签页乱序。
6. **会话是一棵树**：root 不跑 turn，只存记忆/事件/UI 状态；branch 是一等 conversation（coordinator），subagent 是有界执行。
7. **失败隔离三层**：进程（crash/recover/rollback）、扩展（保留上一版本）、组件（error boundary）；任何一层坏了都不拖垮其余。
8. **可观测是内置能力**：调用 trace + 持久事件日志 + system 流；`debug`/`codemode` 让 agent 能解释自己为什么没做成。
9. **提示词跨构建稳定**：变更通过输入条目（`prompt.build`）注入，不重写系统提示，从而保住 prompt cache。
10. **源码直跑**：Node 26 执行 `.ts`，Vite 只编译浏览器侧；类型检查、lint、测试由 vite-plus 统一驱动。

## 复刻的最短路径

```
M0 骨架（1 周）→ M1 持久内核（2 周）→ M2 扩展系统（2 周）
→ M3 Web 外壳（2 周）→ M4 智能体产品（2–3 周）
```

达到 M4 即拥有"可日常使用的 Ultimate"；M5–M7 是产品厚度、集成与加固。详见 `14-replication-blueprint.md`。

## 分析边界与可信度

- 以源码为准；外部依赖（Pi Durable/Pi Coding Agent/pi-ai）的 API 以 `node_modules/.../dist/*.d.ts` 为准，并标注版本 `1.4.0`。
- 无法从代码直接确认的行为标注"推断"；扩展的产品语义主要来自各自 `README.md`，实现细节来自源码。
- 未覆盖：`test/`（按用户要求排除）、`node_modules/` 内部实现、上游 Pi 的未导出源码（仅在补丁注释中提及）。
- 分析期间源码未做任何修改；所有产出仅在 `analysis_design/`。

## 交付状态

- [x] 18 章设计文档（00–18）
- [x] 逐扩展分析笔记（`parts/`，覆盖 53 个扩展与全部子系统）
- [x] 复刻路线图与验收清单
- [x] 00 章 checklist 全部勾选（见该文件）
