# agent_design · 总索引

本目录是一套 **AI-first** 的分析与复刻 spec：目标不是描述 Ultimate，而是让一个没有本仓库上下文的 agent，只读这些文档就能复刻 Ultimate 的自进化机制、子 agent 编排机制、worktree 机制，并实现两个编排可视化桌面应用。

| 字段             | 值                                                                  |
| ---------------- | ------------------------------------------------------------------- |
| 证据基线         | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`） |
| 外部资料访问日期 | 2026-10-28                                                          |
| 状态             | v1.0（通过质量门）                                                  |
| 语言             | 中文叙述 + 英文契约标识符                                           |

## 目录约定

- 顶层只放本索引（与指向它的 `README.md`）、跨主题文档（计划、术语、契约映射、覆盖矩阵、质量报告、checklist）与主题子目录。
- 每个主题一个子目录；子目录根部放 **AI-first spec**（给 agent 执行：需求编号、契约、状态机、算法、验收），`research/` 放证据与调研，`for_human/` 放**人读文档**（叙述、图示、取舍理由，不含 REQ/AC 编号与 `path:line` 证据）。
- 新增主题：建子目录 → 根放 spec → 建 `for_human/` → 回到本文件登记。
- 文中 `10` / `20` / `30` / `40` / `50` / `60` 是 spec 编号简写，分别指文件名以该编号开头的 spec。

## 目录结构

```
agent_design/
├── map.md                  ← 本文件：总索引
├── README.md               ← 指向本文件的兼容入口
├── 00-plan.md              ← 分析与复刻总计划（方法论、工作分解、质量门）
├── checklist.yaml          ← 全项目机器可读进度账本
├── 90-glossary.md          ← 术语表（唯一命名）
├── 91-contract-map.md      ← 机制 → 桌面应用模型的字段映射
├── 92-coverage-matrix.md   ← 需求 → 验收覆盖矩阵
├── 93-quality-report.md    ← 质量报告、冷读测试、已知限制
├── self-evolution/
│   ├── 10-self-evolution-spec.md
│   └── for_human/
├── subagent-orchestration/
│   ├── 20-subagent-orchestration-spec.md
│   ├── research/subagent-source-map.md
│   └── for_human/
├── desktop-apps/
│   ├── 30-task-orchestration-desktop-spec.md
│   ├── 40-subagent-visualization-desktop-spec.md
│   ├── research/desktop-research.md
│   └── for_human/
└── worktree/
    ├── 01-worktree-plan.md
    ├── 50-worktree-management-spec.md
    ├── 60-worktree-visualization-spec.md
    ├── checklist-worktree.yaml
    ├── research/
    └── for_human/
```

## 主题目录

### 1. `self-evolution/` — agent 如何安全地修改自己

把"模型改自己"拆成六层修改面（记忆 → 指令 → 配置 → 扩展 → 核心 → 上游），每层配唯一写入口、生效机制与回滚方式；核心是记忆/brief、dream 反思与 proposal 回路。

| 文件                                                                                                | 内容                                                                         | 先读谁     |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- |
| [`10-self-evolution-spec.md`](self-evolution/10-self-evolution-spec.md)                             | 自进化六层机制 + AI-first 复刻 spec（需求、契约、状态机、算法、M0–M8、验收） | 机制复刻者 |
| [`for_human/README.md`](self-evolution/for_human/README.md)                                         | 人读文档索引                                                                 | 所有人     |
| [`for_human/how-self-evolution-works.md`](self-evolution/for_human/how-self-evolution-works.md)     | 自进化回路、六层修改面与治理模型                                             | 产品/评审  |
| [`for_human/memory-dream-and-proposals.md`](self-evolution/for_human/memory-dream-and-proposals.md) | 记忆、brief、dream 六 passes、proposal 决策                                  | 产品/评审  |

### 2. `subagent-orchestration/` — 子 agent 的委派协议

子 agent 不是"函数调用另一个模型"，而是持久化会话委派：独立 conversation + background anchor + reporter 恰好一次投递 + worktree 隔离。

| 文件                                                                                              | 内容                                               | 先读谁     |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------- |
| [`20-subagent-orchestration-spec.md`](subagent-orchestration/20-subagent-orchestration-spec.md)   | 子 agent 编排机制 + AI-first 复刻 spec             | 机制复刻者 |
| [`research/subagent-source-map.md`](subagent-orchestration/research/subagent-source-map.md)       | 子 agent 源码证据地图（含 5 处文档/代码冲突）      | 深挖者     |
| [`for_human/README.md`](subagent-orchestration/for_human/README.md)                               | 人读文档索引                                       | 所有人     |
| [`for_human/how-subagents-work.md`](subagent-orchestration/for_human/how-subagents-work.md)       | 生命周期、所有权、恰好一次回答                     | 产品/评审  |
| [`for_human/isolation-and-landing.md`](subagent-orchestration/for_human/isolation-and-landing.md) | worktree 隔离、land/discard、branch 与 review team | 产品/评审  |

### 3. `desktop-apps/` — 两个编排可视化桌面应用

TaskScope（任务编排）与 AgentLoom（子 agent 编排）共享 `@orchestra/core` + `@orchestra/ui` + adapters，只做视图差异；本地优先、默认只读、事件溯源。

| 文件                                                                                                  | 内容                                                        | 先读谁         |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------- |
| [`30-task-orchestration-desktop-spec.md`](desktop-apps/30-task-orchestration-desktop-spec.md)         | TaskScope 实现 spec（DAG / 时间线 / Inspector / 回放）      | 桌面应用实现者 |
| [`40-subagent-visualization-desktop-spec.md`](desktop-apps/40-subagent-visualization-desktop-spec.md) | AgentLoom 实现 spec（Lanes / Spawn Tree / Messages / 回放） | 桌面应用实现者 |
| [`research/desktop-research.md`](desktop-apps/research/desktop-research.md)                           | 桌面技术、产品与标准调研备忘录                              | 选型者         |
| [`for_human/README.md`](desktop-apps/for_human/README.md)                                             | 人读文档索引                                                | 所有人         |
| [`for_human/why-two-apps.md`](desktop-apps/for_human/why-two-apps.md)                                 | 两个 app、一个问题：把 agent 运行变成可看的对象             | 产品/评审      |
| [`for_human/taskscope.md`](desktop-apps/for_human/taskscope.md)                                       | TaskScope 的四个问题与四个视图                              | 产品/设计      |
| [`for_human/agentloom.md`](desktop-apps/for_human/agentloom.md)                                       | AgentLoom 的"时间 × 层级"与四张视图                         | 产品/设计      |

### 4. `worktree/` — worktree 的创建、落地与可视化

一个 conversation 一个可预测、可重建的 Git checkout；同步 land 只 fast-forward，异步 submit 进每源 FIFO 队列由 `@lander` 串行合并、检查、落地、推送。

| 文件                                                                                            | 内容                                            | 先读谁     |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------- |
| [`README.md`](worktree/README.md)                                                               | worktree 专题索引、阅读路径与质量摘要           | 所有人     |
| [`01-worktree-plan.md`](worktree/01-worktree-plan.md)                                           | 分析/调研计划、方法与 55 项 checklist           | 所有人     |
| [`50-worktree-management-spec.md`](worktree/50-worktree-management-spec.md)                     | 使用/管理机制 + AI-first 复刻 spec              | 机制复刻者 |
| [`60-worktree-visualization-spec.md`](worktree/60-worktree-visualization-spec.md)               | 界面可视化实现 + AI-first 复刻 spec             | 界面实现者 |
| [`checklist-worktree.yaml`](worktree/checklist-worktree.yaml)                                   | worktree 专题进度账本                           | 执行者     |
| [`research/worktree-management-research.md`](worktree/research/worktree-management-research.md) | 其它 agent 的 worktree 管理调研                 | 选型者     |
| [`research/worktree-ui-research.md`](worktree/research/worktree-ui-research.md)                 | worktree 可视化调研（16 项 ADOPT/ADAPT/REJECT） | 选型者     |
| [`research/worktree-source-map.md`](worktree/research/worktree-source-map.md)                   | Ultimate worktree/lander 源码证据地图（G1–G18） | 深挖者     |
| [`for_human/README.md`](worktree/for_human/README.md)                                           | 人读文档索引                                    | 所有人     |
| [`for_human/how-worktrees-work.md`](worktree/for_human/how-worktrees-work.md)                   | 为什么需要 worktree、创建与门禁                 | 产品/评审  |
| [`for_human/from-submit-to-landed.md`](worktree/for_human/from-submit-to-landed.md)             | submit → 队列 → 检查 → 落地 → 推送 → 回报       | 产品/评审  |
| [`for_human/ui-tour.md`](worktree/for_human/ui-tour.md)                                         | 五层信息架构与界面导览                          | 产品/设计  |

## 跨主题文档

| 文件                                             | 内容                                  | 先读谁 |
| ------------------------------------------------ | ------------------------------------- | ------ |
| [`00-plan.md`](00-plan.md)                       | 分析/调研计划、方法、文档规范、质量门 | 所有人 |
| [`checklist.yaml`](checklist.yaml)               | 机器可读进度账本                      | 执行者 |
| [`90-glossary.md`](90-glossary.md)               | 术语表（唯一命名）                    | 所有人 |
| [`91-contract-map.md`](91-contract-map.md)       | 机制事件 → 桌面应用模型的字段映射     | 集成者 |
| [`92-coverage-matrix.md`](92-coverage-matrix.md) | 需求 → 验收覆盖矩阵                   | 评审者 |
| [`93-quality-report.md`](93-quality-report.md)   | 质量报告、冷读测试、已知限制          | 评审者 |

## 推荐阅读路径

### 路径 A：复刻 Ultimate 的自进化（1–2 周）

1. `self-evolution/10` §0–§3（机制与不变量）
2. `self-evolution/10` §4–§7（数据/状态机/接口/算法）
3. `self-evolution/10` §8–§11（文件清单、实施顺序、测试、验收）
4. `90-glossary.md` 查术语
5. `subagent-orchestration/research/subagent-source-map.md` 只看 §10（复刻难点）

### 路径 B：复刻子 agent 编排（1–2 周）

1. `subagent-orchestration/20` §0–§3（生命周期/所有权/reporter/隔离）
2. `subagent-orchestration/20` §4–§7（契约/状态机/接口/算法）
3. `subagent-orchestration/20` §8–§11（模块/顺序/测试/验收）
4. `subagent-orchestration/research/subagent-source-map.md` 全文（尤其 §3–§6、§10）
5. `91-contract-map.md` 看可视化需要哪些字段

### 路径 C：做桌面可视化（2–4 周）

1. `desktop-apps/30` §1–§3（场景/调研/架构）
2. `desktop-apps/30` §4–§8（模型/状态机/UI/算法/性能）
3. `desktop-apps/30` §9–§11（文件/顺序/测试/验收）
4. `desktop-apps/40` 同结构（子 agent 版）
5. `91-contract-map.md` 做适配器

### 路径 D：评审/负责人（1 小时）

1. 本文件
2. `self-evolution/10` §0、§2.2、§11
3. `subagent-orchestration/20` §0、§2.2、§11
4. `desktop-apps/30` §0、§2.4、§11
5. `desktop-apps/40` §0、§2.1、§11
6. `worktree/50` §2.2、§11；`worktree/60` §2.1、§11
7. `92-coverage-matrix.md`

## 关键结论（先看这 20 条）

1. **自进化是分层的**：记忆 → 指令 → 配置 → 扩展 → 核心 → 上游；每层有独立的写入口、生效方式和回滚方式（`10` §3.1）。
2. **系统提示不随构建变化**：build/指令/文档变化作为输入条目注入，保护 prompt cache（`10` §3.2）。
3. **记忆是索引，不是摘要**：branch 从 brief 开始，正文按需读，完整历史仍可查（`10` §3.3）。
4. **Dream 不自动改代码**：只产出 journal + proposals，用户决定，批准后走普通 branch（`10` §3.4）。
5. **代码自改靠 branch + review + lander + restart**：不是模型直接写生产（`10` §3.7、§3.9）。
6. **子 agent 是独立 conversation**：id 即会话 id，有完整生命周期（`20` §0、§3.2）。
7. **前台只是等待风格**：child 归独立 background anchor，父停止不杀 child（`20` §3.2、§3.4）。
8. **答案恰好一次**：reporter + requestId + answer receipt + 恢复扫描，跨重启不丢不重（`20` §3.3）。
9. **隔离是 worktree，不是沙箱**：land 只 fast-forward，不 rebase/force（`20` §3.6）。
10. **任务编排 UI 的核心是"列表 + 图 + 时间线 + 详情"**：只做 DAG 回答不了"为什么慢/为什么失败"（`30` §2.1）。
11. **子 agent UI 的核心是"时间 × 层级"**：泳道比纯 DAG 更接近"谁在何时做了什么"（`40` §2.1）。
12. **两个桌面 app 共享内核**：`orchestra-core` + `orchestra-ui` + adapters；只做视图差异（`30` §3.1、`40` §3.1）。
13. **一个 conversation 一个 worktree，路径/分支由公式确定**：`<home>/worktrees/<id>` + `ultimate/<home-hash6>-<id>`，创建只写 `preparing` 记录，准备在后台持久任务里完成（`50` §7.1–§7.2）。
14. **门禁以 Git 为真相**：记录 ready 不算数，必须磁盘存在 + `git worktree list` 登记；失败 setup 在下一次工具调用原地重试（`50` §7.4）。
15. **同步 land 只 ff**：不 rebase、不 force、不 push；异步 submit 才进入每源 FIFO 队列，由 `@lander` 串行合并、检查、ff、push、回报（`50` §7.5–§7.7）。
16. **检查与落地绑定同一 SHA**：检查跑在集成 checkout 上，跑完复核 `HEAD` 与工作区；flaky 只重跑一次，超时由 watchdog 杀整个进程组（`50` §7.7）。
17. **失败只给模型一次机会**：`diagnose` 只解释，`fix` 必须留下干净、基于失败 merge 的 commit，随后所有检查重跑；第二次失败不再给模型（`50` §7.8）。
18. **回收不丢工作**：clean + landed + 无子代 + 空闲才删除；removed checkout 下次请求按原路径重建，未落地分支保留 tip（`50` §7.10）。
19. **Worktree UI 是五层信息架构**：项目身份 → in-flight 行（状态 + N commits/+N edits）→ Info 面板（队列/checkout/统计/磁盘）→ transcript（submit 卡 + lander 日志 + 落地卡）→ review（`60` §3）。
20. **状态词与刷新必须收敛**：三域状态统一字典；数据刷新事件驱动，只有 elapsed/年龄用本地计时器；submit 卡的 Steps 用 superseded/inProgress 两算法去重与标记进行中（`60` §5、§8）。

## 如何验证这套文档

1. **证据抽查**：随机选 5 条结论，按文档中的 `path:line` 打开源码，应能定位到原文。
2. **契约一致性**：`92-coverage-matrix.md` 的矩阵应覆盖全部 REQ；脚本片段见该文件末尾。
3. **冷读测试**：让一个未参与写作的 agent 只读 `self-evolution/10` 或 `subagent-orchestration/20` 的 §8–§9，要求它复述目标与非目标、模块边界、前三个里程碑及验收命令。若它提出"缺少关键信息"，回到对应章节补。
4. **实现试跑**：按 `10`/`20` 的 M0 执行，能否在 30 分钟内跑出第一个可演示行为（记忆写入 / 子 agent 启动）。

## 质量门

| 门        | 判据                                                   |
| --------- | ------------------------------------------------------ |
| 证据门    | 每条 REQ 至少一条 `path:line` 或 URL                   |
| 可执行门  | 实施顺序的前两步可在 30 分钟内跑通（或有明确环境前置） |
| 失败门    | 每条正常路径至少一条失败路径与恢复策略                 |
| 一致性门  | 同一字段在分析文档、桌面 spec、样例 JSON 中类型一致    |
| AI 试读门 | 独立 agent 能复述目标、模块边界、前三个里程碑          |

## 范围外

- 不修改 Ultimate 产品代码；
- 不实现桌面应用本体；
- 不评估模型能力/价格；
- 不复刻 Pi Durable 的完整存储引擎。

## 维护

- 证据基线变更时，先更新 `checklist.yaml` 的 `baseline_commit`，再重跑证据审计；
- 新增/删除 REQ 必须同步 `92-coverage-matrix.md`；
- 契约破坏性变更升主版本，并在 `91-contract-map.md` 记录迁移；
- 新增文档必须落在对应主题目录，人读文档放该目录的 `for_human/`，并在本文件与主题 `README.md` 登记。
