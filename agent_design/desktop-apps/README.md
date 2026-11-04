# 桌面应用专题

本目录存放两个编排可视化桌面应用的 AI-first 实现 spec、技术调研与人读文档。两个应用共享内核，只做视图差异。

| 字段             | 值                                                                  |
| ---------------- | ------------------------------------------------------------------- |
| 证据基线         | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`） |
| 外部资料访问日期 | 2026-10-28                                                          |
| 状态             | final（两份 spec 通过质量门）                                       |

## 文件

| 文件                                                                                     | 类型          | 内容                                                                          | 先读谁         |
| ---------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- | -------------- |
| [`30-task-orchestration-desktop-spec.md`](30-task-orchestration-desktop-spec.md)         | AI-first spec | TaskScope：任务编排可视化（DAG + 时间线 + Inspector + 回放 + 对比）           | 桌面应用实现者 |
| [`40-subagent-visualization-desktop-spec.md`](40-subagent-visualization-desktop-spec.md) | AI-first spec | AgentLoom：子 agent 编排可视化（Lanes + Spawn Tree + Messages + Cost + 回放） | 桌面应用实现者 |
| [`research/desktop-research.md`](research/desktop-research.md)                           | 调研备忘录    | 桌面技术选型、产品参照、数据标准与硬约束 G1–G12                               | 选型者         |
| [`for_human/README.md`](for_human/README.md)                                             | 索引          | 人读文档索引                                                                  | 所有人         |
| [`for_human/why-two-apps.md`](for_human/why-two-apps.md)                                 | 人读文档      | 为什么是两个 app、共享内核与只读原则                                          | 产品/评审      |
| [`for_human/taskscope.md`](for_human/taskscope.md)                                       | 人读文档      | TaskScope 的四个问题与四个视图                                                | 产品/设计      |
| [`for_human/agentloom.md`](for_human/agentloom.md)                                       | 人读文档      | AgentLoom 的"时间 × 层级"与四张视图                                           | 产品/设计      |

## 阅读顺序

- **要复刻 TaskScope**：`30` §1–§3 → §4–§8 → §9–§11。
- **要复刻 AgentLoom**：`40` §1–§3 → §4–§8 → §9–§11；先读 `30` §3.1（共享内核）。
- **选型**：`research/desktop-research.md` → `30` §2.3–§2.5（两套权重不同的矩阵，先定硬约束再选）。
- **只关心"做什么"**：`for_human/why-two-apps.md` → 对应 app 的 tour。

## 质量摘要

TaskScope 含 `REQ-T-001`–`REQ-T-020`，AgentLoom 含 `REQ-V-001`–`REQ-V-020`；两者只读优先、事件溯源，控制能力属于 v2。覆盖率见 [`../92-coverage-matrix.md`](../92-coverage-matrix.md)。
