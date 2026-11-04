# 子 agent 编排专题

本目录存放 Ultimate 子 agent 编排机制的 AI-first 复刻 spec、源码证据地图与人读文档。

| 字段     | 值                                                                  |
| -------- | ------------------------------------------------------------------- |
| 证据基线 | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`） |
| 状态     | final（spec 通过质量门）                                            |

## 文件

| 文件                                                                       | 类型          | 内容                                                                                                                  | 先读谁     |
| -------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| [`20-subagent-orchestration-spec.md`](20-subagent-orchestration-spec.md)   | AI-first spec | 定义发现、创建与所有权、reporter 恰好一次、wait/steer、stop/land/discard、隔离、branch/standing/review team、可观测性 | 机制复刻者 |
| [`research/subagent-source-map.md`](research/subagent-source-map.md)       | 证据地图      | 子 agent 源码证据索引 + 5 处文档/代码冲突                                                                             | 深挖者     |
| [`for_human/README.md`](for_human/README.md)                               | 索引          | 人读文档索引                                                                                                          | 所有人     |
| [`for_human/how-subagents-work.md`](for_human/how-subagents-work.md)       | 人读文档      | 一次委派的完整生命周期与"恰好一次"回答                                                                                | 产品/评审  |
| [`for_human/isolation-and-landing.md`](for_human/isolation-and-landing.md) | 人读文档      | worktree 隔离、land/discard、branch 与 review team 的区别                                                             | 产品/评审  |

## 阅读顺序

- **要复刻**：`20` §0 → §2（不变量）→ §3（机制）→ §4–§7（契约/算法）→ §8–§11（模块、顺序、测试、验收）。
- **要查证据/冲突**：`research/subagent-source-map.md` §10（复刻难点）、附录 A（文档与代码冲突）。
- **只关心"为什么"**：`for_human/how-subagents-work.md` → `for_human/isolation-and-landing.md`。
- **跨主题依赖**：隔离与 land 的完整契约在 `../worktree/50-worktree-management-spec.md`；可视化模型见 `../desktop-apps/40-subagent-visualization-desktop-spec.md`。

## 质量摘要

spec 含 `REQ-A-001`–`REQ-A-035`；三处高风险点（foreground 当生命周期、reporter 当回调、worktree 当沙箱）在 §0 与 `for_human` 文档中反复标注。覆盖率见 [`../92-coverage-matrix.md`](../92-coverage-matrix.md)。
