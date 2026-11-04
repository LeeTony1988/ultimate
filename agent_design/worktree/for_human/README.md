# Worktree · 人读文档

这里解释 Ultimate 的 worktree 机制和它在界面上的样子。完整契约在 `../50-worktree-management-spec.md` 与 `../60-worktree-visualization-spec.md`。

| 文档                                                   | 读完后你会知道                                      |
| ------------------------------------------------------ | --------------------------------------------------- |
| [`how-worktrees-work.md`](how-worktrees-work.md)       | 为什么每个会话要一个独立 checkout；创建、准备与门禁 |
| [`from-submit-to-landed.md`](from-submit-to-landed.md) | 一次提交如何排队、检查、落地、推送、回报            |
| [`ui-tour.md`](ui-tour.md)                             | 五层信息架构：从侧栏到 transcript 的界面导览        |

## 三分钟版本

一个项目里同时跑五个 agent，如果它们都在同一个目录里改文件，冲突是必然的。Ultimate 给每个需要写代码的会话一个独立的 Git worktree：

- 路径和分支由公式决定，可预测、可重建；
- 创建只写一条 `preparing` 记录，真正的 `git worktree add` 和 setup 在后台任务里做；
- 每次工具调用前都验证：记录 ready、目录在盘上、Git 已登记；
- 干完活有两条路：同步 `land` 只做 fast-forward；异步 `submit` 进队列，由 `@lander` 合并、检查、落地、推送。

界面上的所有信息都围绕一个核心问题：**这个分支现在在哪，还有多少工作没落地？**

## 与其他主题的关系

- 隔离机制在子 agent 编排中的位置：`../../subagent-orchestration/20-subagent-orchestration-spec.md` §3.6
- 想看机制细节：`../50-worktree-management-spec.md`
- 想看界面契约：`../60-worktree-visualization-spec.md`
- 想知道为什么这样设计、和别的产品差在哪：`../research/worktree-management-research.md` §7–§8、`../50-worktree-management-spec.md` §14
