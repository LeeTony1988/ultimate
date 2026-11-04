# 自进化专题

本目录存放 Ultimate 自进化机制的 AI-first 复刻 spec 与人读文档。

| 字段     | 值                                                                  |
| -------- | ------------------------------------------------------------------- |
| 证据基线 | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27，`dev/lxy`） |
| 状态     | final（spec 通过质量门）                                            |

## 文件

| 文件                                                                                 | 类型          | 内容                                                                                   | 先读谁     |
| ------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------- | ---------- |
| [`10-self-evolution-spec.md`](10-self-evolution-spec.md)                             | AI-first spec | 六层修改面（记忆/指令/配置/扩展/核心/上游）+ 复刻契约、状态机、算法、M0–M8、测试与验收 | 机制复刻者 |
| [`for_human/README.md`](for_human/README.md)                                         | 索引          | 人读文档索引                                                                           | 所有人     |
| [`for_human/how-self-evolution-works.md`](for_human/how-self-evolution-works.md)     | 人读文档      | 自进化回路、六层修改面、权限与回滚                                                     | 产品/评审  |
| [`for_human/memory-dream-and-proposals.md`](for_human/memory-dream-and-proposals.md) | 人读文档      | 记忆与 brief、dream 六 passes、journal 与 proposal                                     | 产品/评审  |

## 阅读顺序

- **要复刻**：`10` §0 → §2（不变量）→ §3（机制）→ §4–§7（契约/算法）→ §8–§11（模块、顺序、测试、验收）。
- **只关心"为什么"**：`for_human/how-self-evolution-works.md` → `for_human/memory-dream-and-proposals.md`。
- **跨主题依赖**：自进化产出的变更最终经 `../worktree/50-worktree-management-spec.md` 的 lander 落地；上游方案见 `../subagent-orchestration/20-subagent-orchestration-spec.md` §3.7。

## 质量摘要

spec 含 `REQ-S-001`–`REQ-S-030`，验收与失败矩阵齐备；冷读与覆盖率结果见 [`../93-quality-report.md`](../93-quality-report.md)。
