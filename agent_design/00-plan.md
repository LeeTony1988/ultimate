# Ultimate 自进化与子 Agent 编排：分析与复刻计划

| 字段     | 值                                                             |
| -------- | -------------------------------------------------------------- |
| 文档 ID  | AD-00                                                          |
| 状态     | active                                                         |
| 版本     | 1.0                                                            |
| 证据基线 | `3f7b7bec`（2026-10-27，`dev/lxy`）                            |
| 读者     | 需要复刻 Ultimate 机制或实现可视化桌面应用的 AI agent / 工程师 |
| 语言     | 中文叙述 + 英文契约标识符（schema、API、事件名保持源码原名）   |

## 1. 目标

产出四类**可执行**文档，而不是读后感：

1. **机制分析**：Ultimate 如何实现自进化（self-evolution），以及如何实现子 agent 编排（subagent orchestration）。
2. **复刻 spec**：一个没有本仓库上下文的 agent，只读 spec 就能重建同等机制，并通过验收测试。
3. **桌面应用方案**：任务编排可视化、子 agent 编排可视化两个桌面应用的实现方案，同样达到"可复刻"标准。
4. **计划与 checklist**：本文件 + `checklist.yaml`，作为全过程的质量门与进度账本。

"可复刻"的判定标准（硬性）：

- 每个行为都有**输入、输出、状态迁移、失败路径**四要素。
- 每个结论都有 `文件:行`、命令输出或外部 URL 证据；推断必须显式标注 `推断`。
- 每个模块都有**文件清单、公开契约、实施顺序、验收命令**。
- 验收项是二元的（pass/fail），不写"体验良好"这类不可判定描述。
- 读者不需要访问本会话，也不需要读 Ultimate 源码才能开始实现。

## 2. 范围

### 2.1 包含

| 编号 | 范围                                                                                  | 对应文档                                                   |
| ---- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| S    | Ultimate 自进化：记忆、梦、技能、agent 定义、扩展/表面、核心代码、上游更新、验证闭环  | `self-evolution/10-self-evolution-spec.md`                 |
| A    | Ultimate 子 agent 编排：定义、生命周期、投递、任务图、隔离、分支/常驻 agent、失败恢复 | `subagent-orchestration/20-subagent-orchestration-spec.md` |
| T    | 任务编排可视化桌面应用：需求、数据接入、图/时间线、架构、复刻 spec                    | `desktop-apps/30-task-orchestration-desktop-spec.md`       |
| V    | 子 agent 编排可视化桌面应用：泳道/生成树/消息、实时与回放、控制面、复刻 spec          | `desktop-apps/40-subagent-visualization-desktop-spec.md`   |

### 2.2 不包含

- 不修改 Ultimate 产品代码；本任务只产出 `agent_design/` 下的文档。
- 不实现桌面应用本体，只交付可复刻 spec 与验证方案。
- 不评估模型能力/价格；只把模型路由当作可配置参数。
- 不复刻 Pi Durable 的完整存储引擎；只定义复刻所需的最小持久化契约与可替换边界。

## 3. 方法

### 3.1 源码优先（source-first）

1. 先读**契约文件**：`extensions/*/api.ts`、`refs.ts`、`README.md`、`docs/*.md`、`agents/*.md`。
2. 再读**实现文件**：`server.ts`、`web.tsx`、`lib/*.ts`，确认契约没有说谎。
3. 最后读**历史分析**：`analysis_design/` 只作为线索，不作为证据；每条结论重新落到当前 commit 的源码。
4. 证据格式：`path:line`（单行）或 `path:start-end`（区间）；命令证据给出命令与关键输出。
5. 推断标注：`推断:` 前缀，并给出推断依据与可验证方式。

### 3.2 机制分析四视角

对每个机制，固定回答：

| 视角 | 问题                                                   |
| ---- | ------------------------------------------------------ |
| 触发 | 谁在什么条件下启动它？同步还是异步？                   |
| 状态 | 有哪些持久状态？谁是唯一真相？状态如何迁移？           |
| 投递 | 结果如何回到调用者？如何保证恰好一次/至少一次？        |
| 失败 | 崩溃、超时、模型错误、用户停止、并发冲突分别发生什么？ |

### 3.3 桌面应用调研

- 先定义能力模型（任务图、时间线、泳道、消息边、成本、回放、控制），再选技术。
- 候选产品只作为**交互与信息架构**证据：Temporal Web UI、Airflow、Dagster、Prefect、LangGraph Studio、AutoGen Studio、CrewAI、Langfuse、Arize Phoenix、AgentOps。
- 候选标准只作为**数据契约**证据：OpenTelemetry GenAI semantic conventions、AG-UI、A2A、MCP。
- 技术选型必须给出决策矩阵：维度、权重、候选得分、敏感性分析。
- 所有外部事实标注访问日期与 URL；不引用无法打开的链接。

### 3.4 三角验证

同一关键结论至少两种证据：

1. 源码（实现）；
2. 该扩展的 README / docs（设计意图）；
3. 测试或运行行为（`test/`、命令输出、截图）。

三者冲突时，以**源码 + 测试**为准，并在文档中记录冲突。

## 4. 文档规范（AI-first）

### 4.1 固定骨架

每份 spec 必须包含以下章节，缺一不可：

```
0. Metadata（ID、版本、状态、证据基线、前置依赖）
1. 目标与非目标
2. 术语、不变量、边界
3. 架构与数据流（含时序图）
4. 数据契约（TypeScript + JSON Schema 要点）
5. 状态机（状态、事件、迁移表、非法迁移）
6. 接口契约（工具/action/API/事件，含错误码）
7. 算法与伪代码（关键路径，逐行可实现）
8. 文件清单（路径、职责、依赖方向）
9. 实施顺序（M0…Mn，每步可运行）
10. 测试计划（单元/集成/e2e，命令与期望）
11. 验收 checklist（二元）
12. 失败矩阵与恢复
13. 证据索引
14. 未决问题与假设
```

### 4.2 需求编号

- `REQ-S-001`：自进化需求；`REQ-A-001`：子 agent 编排需求；`REQ-T-001` / `REQ-V-001`：桌面应用需求。
- 每条需求必须被至少一个验收项覆盖；验收项格式：`AC-S-001 ← REQ-S-001`。
- 禁止无编号的"应该"；要么是需求，要么是建议（`NOTE`）。

### 4.3 契约写法

- 类型用 TypeScript；跨进程契约同时给 JSON 示例。
- 状态机用表格：`当前状态 | 事件 | 守卫 | 下一状态 | 副作用`。
- 伪代码用编号步骤，每步只做一件事；禁止"处理一下"这类模糊动词。
- 错误必须命名：`E_*`，并给出触发条件、可重试性、用户可见文案。

### 4.4 证据纪律

- 不允许"Ultimate 会……"而没有 `path:line`。
- 外部产品事实必须给 URL + 访问日期。
- 性能数字必须说明测量环境；没有测量就写"未测量"。
- 任何"更好/更快/更简单"必须给出比较基线。

## 5. 工作分解与 Checklist

状态取值：`todo` / `doing` / `done` / `blocked`。机器可读版本见 `checklist.yaml`。

### P — 计划与基线

| ID   | 检查项                                                   | 产出 / 证据                                | 状态 |
| ---- | -------------------------------------------------------- | ------------------------------------------ | ---- |
| P-01 | 确认仓库基线 commit、分支、工具链版本                    | `git rev-parse HEAD`、`node -v`、`pnpm -v` | done |
| P-02 | 定义文档骨架、需求编号、证据格式                         | 本文件 §4                                  | done |
| P-03 | 建立交付物索引与阅读顺序                                 | `map.md`                                   | done |
| P-04 | 建立机器可读 checklist                                   | `checklist.yaml`                           | done |
| P-05 | 建立术语表（自进化、编排、任务、子 agent、分支、隔离区） | `10`/`20` §2；`90-glossary.md`（可选）     | done |

### S — 自进化机制（`self-evolution/10-self-evolution-spec.md`）

| ID   | 检查项                                                                                     | 产出 / 证据                                 | 状态 |
| ---- | ------------------------------------------------------------------------------------------ | ------------------------------------------- | ---- |
| S-01 | 画出自我修改的六层能力面：记忆 / 技能 / agent 定义 / 扩展与表面 / 核心代码 / 上游更新      | 分层表 + 触发条件 + 持久化位置              | done |
| S-02 | 分析系统提示与上下文装配：section、`prompt.build`、指令热更新、缓存稳定策略                | 时序图 + `extensions/prompt/server.ts` 证据 | done |
| S-03 | 分析项目记忆：`remember`/`memory`/`forget`、`lineage.memory` 文档、brief、landing 自动蒸馏 | 数据契约 + 算法 + 失败路径                  | done |
| S-04 | 分析 Dream：触发、handoff、六 passes、journal、proposal、decide、asleep                    | 状态机 + `extensions/dream/*` 证据          | done |
| S-05 | 分析技能与 agent 定义的自写：发现顺序、overlay、保存/删除、生效时机                        | 文件格式 + 校验规则                         | done |
| S-06 | 分析扩展/表面自写：目录布局、server/web facet、热重载、表面注册                            | 文件清单 + reload 矩阵                      | done |
| S-07 | 分析核心自改：`restart`、supervisor swap、类型检查、回滚、generation                       | 时序图 + 失败矩阵                           | done |
| S-08 | 分析上游更新：`update` 扩展、fast-forward、依赖安装、restart 提示                          | 状态机 + 拒绝条件                           | done |
| S-09 | 分析验证闭环：preview instance、review、lander、watchdog、trace/debug                      | 流程图 + 证据                               | done |
| S-10 | 提炼不变量与安全边界（谁可写、何时生效、如何回滚）                                         | `INV-S-*` 列表                              | done |
| S-11 | 写出复刻 spec：数据模型、接口、算法、文件清单、实施顺序                                    | `10` §4–§9                                  | done |
| S-12 | 写出验收测试与 failure injection 清单                                                      | `10` §10–§12                                | done |
| S-13 | 证据审计：每条 REQ 至少一条 `path:line`                                                    | 证据索引表                                  | done |

### A — 子 agent 编排机制（`subagent-orchestration/20-subagent-orchestration-spec.md`）

| ID   | 检查项                                                                         | 产出 / 证据           | 状态 |
| ---- | ------------------------------------------------------------------------------ | --------------------- | ---- |
| A-01 | 分析定义发现与合并：三目录、同名覆盖、overlay、模型/思考/tools 解析            | 解析算法 + 错误表     | done |
| A-02 | 分析子 agent 生命周期状态机：start/message/wait/stop/list/land/discard         | 完整迁移表 + 非法迁移 | done |
| A-03 | 分析 reporter 恰好一次投递：requestId、answer receipt、跨重启恢复、去重        | 时序图 + 不变量       | done |
| A-04 | 分析任务图与所有权：anchor、reporter task、owner、parent、background           | 图模型 + 查询         | done |
| A-05 | 分析隔离区：worktree 创建、setup、cwd/instructions、land/discard、嵌套         | 状态机 + 文件布局     | done |
| A-06 | 分析分支/常驻 agent/automation run/review team 的复用关系                      | 关系图 + 差异表       | done |
| A-07 | 分析 prompt 契约：coordinator、worker brief、报告格式、`Returned model`        | 模板 + 反例           | done |
| A-08 | 分析并发与竞态：steer vs follow-up、wait yield、stop 与 reporter 竞态          | 竞态表 + 解决策略     | done |
| A-09 | 分析失败矩阵：model_error/no_model/aborted/empty answer/restart/workspace fail | 失败表 + 用户可见文案 | done |
| A-10 | 提炼可观测性契约：需要哪些事件、字段、关联 ID 才能复现 UI                      | 事件 schema           | done |
| A-11 | 写出复刻 spec：模块、接口、算法、文件清单、实施顺序                            | `20` §4–§9            | done |
| A-12 | 写出验收测试（含崩溃恢复、重复投递、并发 stop）                                | `20` §10–§12          | done |
| A-13 | 证据审计                                                                       | 证据索引表            | done |

### T — 任务编排可视化桌面应用（`desktop-apps/30-task-orchestration-desktop-spec.md`）

| ID   | 检查项                                                                | 产出 / 证据               | 状态 |
| ---- | --------------------------------------------------------------------- | ------------------------- | ---- |
| T-01 | 定义用户与场景：开发者、Tech Lead、值班、复盘                         | Persona + Jobs-to-be-done | done |
| T-02 | 调研 5+ 产品（Temporal/Airflow/Dagster/Prefect/…）并抽取信息架构      | 对比表 + URL + 访问日期   | done |
| T-03 | 调研数据标准（OTel GenAI、AG-UI、A2A）与适配成本                      | 标准映射表                | done |
| T-04 | 技术选型决策矩阵：Tauri/Electron、React、图布局、时间线、SQLite、打包 | 加权矩阵 + 敏感性分析     | done |
| T-05 | 定义领域模型：Task/Attempt/Edge/Run/Event/Artifact                    | TypeScript + JSON Schema  | done |
| T-06 | 定义摄入协议：Ultimate adapter、OTel adapter、JSONL replay            | 适配器接口 + 背压策略     | done |
| T-07 | 设计主界面：概览、DAG、时间线、详情、搜索、告警                       | 线框 + 组件树 + 状态      | done |
| T-08 | 定义布局与交互算法：分层布局、关键路径、折叠、缩放、选择联动          | 伪代码 + 复杂度           | done |
| T-09 | 定义性能预算与大数据策略（10k 任务/100k 事件）                        | 指标 + 虚拟化/聚合方案    | done |
| T-10 | 定义桌面架构：进程、IPC、本地存储、安全、自动更新                     | 架构图 + 权限表           | done |
| T-11 | 写出复刻 spec：文件清单、M0–Mn、测试、验收                            | `30` §4–§12               | done |
| T-12 | 用 Ultimate 真实数据做一次端到端样例设计                              | 样例 JSON + 期望截图描述  | done |

### V — 子 agent 编排可视化桌面应用（`desktop-apps/40-subagent-visualization-desktop-spec.md`）

| ID   | 检查项                                                                   | 产出 / 证据                 | 状态 |
| ---- | ------------------------------------------------------------------------ | --------------------------- | ---- |
| V-01 | 定义用户与场景：编排调试、成本分析、故障复盘、演示                       | Persona + JTBD              | done |
| V-02 | 调研 LangGraph Studio/AutoGen Studio/CrewAI/Langfuse/Phoenix/AgentOps    | 对比表 + URL                | done |
| V-03 | 定义领域模型：Agent/Conversation/Spawn/Message/ToolCall/Answer/Workspace | TypeScript + JSON Schema    | done |
| V-04 | 定义实时摄入：Ultimate SSE/tasks/trace、OTel、回放文件                   | 适配器 + 顺序保证           | done |
| V-05 | 设计泳道/生成树/消息边/调用树四视图及联动                                | 线框 + 组件树               | done |
| V-06 | 设计时间轴语义：活动块、空闲、等待、失败、重试、压缩                     | 状态映射表                  | done |
| V-07 | 设计控制面：只读默认、steer/stop 的权限与审计                            | 权限矩阵 + 二次确认         | done |
| V-08 | 定义成本/性能指标：token、时延、工具失败率、关键路径                     | 指标定义 + 计算公式         | done |
| V-09 | 定义回放与对比：事件溯源、时间旅行、两次运行 diff                        | 算法 + UI                   | done |
| V-10 | 写出复刻 spec：架构、文件清单、M0–Mn、测试、验收                         | `40` §4–§12                 | done |
| V-11 | 用 Ultimate 的 branch→worker→reviewer 场景做端到端样例                   | 样例事件序列 + 期望截图描述 | done |

### Q — 交叉校验与交付

| ID   | 检查项                                                     | 产出 / 证据                      | 状态 |
| ---- | ---------------------------------------------------------- | -------------------------------- | ---- |
| Q-01 | 术语一致：同一概念在不同文档用同一名字                     | 术语对照表                       | done |
| Q-02 | 契约一致：`20` 的事件字段能直接喂给 `30`/`40` 的适配器     | 字段映射表                       | done |
| Q-03 | 每条 REQ 都有 AC 覆盖，每条 AC 可执行                      | 覆盖矩阵                         | done |
| Q-04 | 链接检查：内部链接、外部 URL 可打开                        | 脚本输出                         | done |
| Q-05 | "无源码上下文"试读：让一个 subagent 只读 spec 复述实施步骤 | 试读记录 + 修订                  | done |
| Q-06 | 最终索引与阅读路径                                         | `map.md`                         | done |
| Q-07 | 计划完成度回填 `checklist.yaml`                            | 全部 `done` 或有理由的 `blocked` | done |

## 6. 里程碑

| 里程碑 | 内容                          | 完成判据                             |
| ------ | ----------------------------- | ------------------------------------ |
| M0     | 计划、checklist、证据基线     | `00-plan.md` + `checklist.yaml` 可读 |
| M1     | 自进化机制分析与 spec 初稿    | S-01…S-13 至少 80% done              |
| M2     | 子 agent 编排分析与 spec 初稿 | A-01…A-13 至少 80% done              |
| M3     | 两个桌面应用调研与选型        | T-01…T-05、V-01…V-04 done            |
| M4     | 两个桌面应用复刻 spec         | T-06…T-12、V-05…V-11 done            |
| M5     | 交叉校验与交付                | Q-01…Q-07 done                       |

## 7. 质量门

任何文档进入 `done` 前必须通过：

1. **证据门**：随机抽查 5 条结论，均能按 `path:line` 找到原文。
2. **可执行门**：按"实施顺序"从零开始，前两步能在 30 分钟内跑通（或有明确环境前置）。
3. **失败门**：每条正常路径至少配一条失败路径与恢复策略。
4. **一致性门**：同一字段在分析文档、桌面 spec、样例 JSON 中类型一致。
5. **AI 试读门**：一个未参与写作的 agent 能复述目标、模块边界、前三个里程碑，不提出"缺少关键信息"。

## 8. 风险与应对

| 风险                              | 影响       | 应对                                                     |
| --------------------------------- | ---------- | -------------------------------------------------------- |
| 源码规模大，分析变成流水账        | 文档不可用 | 只围绕 REQ 写；每段回答"复刻者要做什么"                  |
| 过度依赖旧分析 `analysis_design/` | 结论过期   | 所有结论重新落到当前 commit；旧文档只做线索              |
| 桌面应用方案泛泛而谈              | 无法复刻   | 强制文件清单、schema、算法、验收命令                     |
| 外部产品版本快速变化              | 选型过期   | 记录访问日期；把版本号放进决策矩阵；给出升级触发条件     |
| 两套桌面应用重复造轮子            | 成本翻倍   | 抽出共享内核 `orchestra-core`，两个 app 只做视图与适配器 |
| 文档相互矛盾                      | 复刻失败   | Q-01/Q-02 交叉校验；字段映射表作为唯一契约               |

## 9. 变更控制

- 证据基线变更（新 commit）时，先跑 `checklist.yaml` 的 `evidence` 项，标注受影响章节。
- 任何 REQ 的新增/删除必须同步更新：需求表 → 验收项 → 覆盖矩阵。
- 文档版本号：初稿 `0.x`，通过质量门 `1.0`；破坏性契约变更升主版本。
