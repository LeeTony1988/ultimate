# 子 agent 编排 · 人读文档

这里解释 Ultimate 如何把工作交给子 agent，以及为什么这套机制看起来比"调用一个模型"复杂得多。契约细节在 `../20-subagent-orchestration-spec.md`。

| 文档                                                   | 读完后你会知道                                        |
| ------------------------------------------------------ | ----------------------------------------------------- |
| [`how-subagents-work.md`](how-subagents-work.md)       | 一次委派的完整生命周期；答案为什么不会丢、不会重      |
| [`isolation-and-landing.md`](isolation-and-landing.md) | 子 agent 的代码放在哪、怎么合并回来、为什么不等于沙箱 |

## 三分钟版本

在 Ultimate 里，子 agent 不是一次函数调用，而是**一个有 id、有上下文、有工作目录、有生命周期的会话**。

父会话说"去做这件事"，系统会：

1. 读一份 agent 定义（角色、模型、工具、是否隔离）；
2. 创建一个子会话，并给它一个独立的 background anchor；
3. 创建一个 reporter，负责把子 agent 的答案恰好一次送回父会话；
4. 如果定义要求隔离，就在一个独立 Git worktree 里工作；
5. 子 agent 结束后，父会话继续；父会话被停止，子 agent 也不会被顺手杀掉。

三个最容易被做错的地方：把"前台等待"当成所有权，把 reporter 当成普通回调，把 worktree 当成沙箱。这三件事 Ultimate 都明确否定了。

## 与其他主题的关系

- 隔离与落地的完整契约在 `../../worktree/50-worktree-management-spec.md`；
- 把这些运行画出来，是 `../../desktop-apps/40-subagent-visualization-desktop-spec.md` 的主题；
- 想直接实现，读 `../20-subagent-orchestration-spec.md` §0、§2、§3、§8–§11。
