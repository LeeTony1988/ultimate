# Worktree 专题

本目录集中存放 Ultimate worktree 的使用、管理机制、界面可视化、外部调研与人读文档。`agent_design/` 顶层只保留总索引与跨主题文档，worktree 相关文档全部在此。

| 字段             | 值                                                                  |
| ---------------- | ------------------------------------------------------------------- |
| 证据基线         | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`） |
| 外部资料访问日期 | 2026-10-28                                                          |
| 状态             | final（计划、管理 spec、可视化 spec、两份调研、源码地图）           |
| 语言             | 中文叙述 + 英文契约标识符                                           |

## 文件

| 文件                                                                                   | 类型          | 内容                                                                                                                      | 先读谁     |
| -------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [`01-worktree-plan.md`](01-worktree-plan.md)                                           | 计划          | 分析/调研计划、方法、质量门与 55 项 checklist                                                                             | 所有人     |
| [`checklist-worktree.yaml`](checklist-worktree.yaml)                                   | 账本          | 机器可读进度账本                                                                                                          | 执行者     |
| [`50-worktree-management-spec.md`](50-worktree-management-spec.md)                     | AI-first spec | 使用/管理机制 + 复刻 spec（创建、门禁、land/submit、lander、回收）                                                        | 机制复刻者 |
| [`60-worktree-visualization-spec.md`](60-worktree-visualization-spec.md)               | AI-first spec | 界面可视化实现 + 复刻 spec（五层信息架构、状态词、组件契约）                                                              | 界面实现者 |
| [`research/worktree-management-research.md`](research/worktree-management-research.md) | 调研          | Claude Code、Codex、Z Code、Cursor、Conductor、Sculptor、Claude Squad、Crystal、Vibe Kanban、worktrunk、uzi 及 skill/插件 | 选型者     |
| [`research/worktree-ui-research.md`](research/worktree-ui-research.md)                 | 调研          | 主流 agent / Git 工具的 worktree 可视化（16 项 ADOPT/ADAPT/REJECT）                                                       | 选型者     |
| [`research/worktree-source-map.md`](research/worktree-source-map.md)                   | 证据地图      | Ultimate worktree/lander 源码证据（G1–G18 文档/代码冲突）                                                                 | 深挖者     |
| [`for_human/README.md`](for_human/README.md)                                           | 索引          | 人读文档索引                                                                                                              | 所有人     |
| [`for_human/how-worktrees-work.md`](for_human/how-worktrees-work.md)                   | 人读文档      | 为什么需要 worktree、创建、准备与门禁                                                                                     | 产品/评审  |
| [`for_human/from-submit-to-landed.md`](for_human/from-submit-to-landed.md)             | 人读文档      | submit → 队列 → 检查 → 落地 → 推送 → 回报                                                                                 | 产品/评审  |
| [`for_human/ui-tour.md`](for_human/ui-tour.md)                                         | 人读文档      | 五层信息架构与界面导览                                                                                                    | 产品/设计  |

## 推荐阅读路径

- **复刻管理机制**：`50` §0–§3 → §4–§7 → §8–§11 → `research/worktree-management-research.md` §7–§8（模式与差距）、§11（采纳清单）。
- **复刻可视化**：`60` §0–§3 → §4–§8 → §9–§11 → `research/worktree-ui-research.md` §6–§7。
- **评审**：`01` §5 → `50` §2.2、§11 → `60` §2.1、§11 → `research/*` 的结论页。
- **查源码冲突**：`research/worktree-source-map.md` §12（G1–G18）。
- **只看故事**：`for_human/how-worktrees-work.md` → `for_human/from-submit-to-landed.md` → `for_human/ui-tour.md`。

## 质量摘要

- Checklist：55/55 done（P 5、M 15、R 8、V 13、U 7、Q 7）。
- 需求覆盖：`REQ-WM` 35/35、`REQ-WV` 35/35，未覆盖 0。
- 证据引用：`50`/`60` 的 `path:line` 全部可解析，0 缺失/越界。
- 冷读：两轮独立 agent 复读，首轮 2/5，修复运行时契约、`at` 语义、Steps 索引、tone/文案冲突等后，第二轮 50=4/5、60=3/5；逐项残留见 [`../93-quality-report.md`](../93-quality-report.md) §9.4。
- 已知限制：未跑真实 e2e；外部产品事实以 2026-10-28 为准；`results.at` 是 entry id 而非时间戳（`50` `NOTE-WM-01`、`60` §8.3/§8.4 已修正）。

返回 [`agent_design/map.md`](../map.md)。
