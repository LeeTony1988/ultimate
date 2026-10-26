## Working in a git worktree

Run `git worktree add ../ultimate-preview -b preview`, then `cd ../ultimate-preview`, `pnpm install`, and `pnpm start --no-open` to run that worktree's code. Each project path gets its own default state home (a hash of the path), storage and supervisor locks, first free port from 4747, and Vite cache inside its home; explicit home or port overrides must remain distinct. The global `ultimate` command runs the clone it was linked from, so use `pnpm start` inside the worktree instead.

Start a subagent with `isolate: "worktree"` (the worker default) to give its tools a separate checkout; verify its commits, then `land` them or `discard` the checkout while keeping its branch. For Ultimate itself, `instance start` with `subagent: <child id>` previews that child's code on a free port with a separate temporary home; stop the preview afterwards.

### Main-agent final integration

Coordinator branches started by @ultimate are isolated in their own worktrees by default.
`workspace status` shows its tip and the original checkout's tip.
Read worker reports and diffs; rerun checks only for missing or thin evidence, reported failures, changes crossing
workers, `server/` or `shared/` changes, or surprises in the diff, then land and call `workspace submit`.
The lander is the final gate: it runs every configured check (here `pnpm check`, then `pnpm test` and `pnpm test:e2e` in parallel) on the merged result
and reports back, landed or not, with findings.
It fixes small failures when the project configures it to; on success it fast-forwards the branch and pushes to
`lander.push` (here `origin`), so keep working while it runs.
Its progress shows live on the submit tool card, with expandable steps, and its report as an outcome card, both in
the submitting conversation; the source's @lander conversation, pinned in the sidebar's agents group, keeps
the full log and shows as working in the Agents tab while it lands. It runs the `lander` agent
definition: here `.ultimate/agents/lander.md` with `onFailure: fix`, so a conflict or a twice-failing check is
resolved and committed by its model, every check runs again, and only then does it land and push. Talk to it in its
conversation about the queue and recent landings.

On this Windows host the lander cannot run the project's gate (`pnpm test` broad-fails and exceeds its check
timeout). Land with the `wsl-gate` skill (`skills/wsl-gate/SKILL.md`): a clean ext4 clone in WSL, the full gate at
the base and after every merge, a Git bundle, then a fast-forward and push from Windows. Never push from WSL.

`workspace land` is the synchronous alternative: it only fast-forwards, refuses moved or diverged targets, and never
rebases or pushes. Unrelated dirty files in the original checkout block neither.
For `server/` or `shared/` changes, an authorized `restart` works once the running clone is clean at the landed commit.

### Standing permission to push this repository

The user authorizes the top-level agent to commit verified changes, land them, and push the destination branch
(normally `main`) to this repository's GitHub remote, `origin` (`HazAT/ultimate`), without asking again. This permission
applies to this repository whether public or private, not to other repositories. `workspace submit` covers this: the
lander pushes after its checks because `lander.push` is set. After a synchronous `workspace land`, which never pushes,
push the landed branch explicitly (for example, `git -C /home/haza/Projects/ultimate push origin main`). Subagents commit and report; only the top-level agent pushes after verification and integration.

Use normal, non-force pushes only. Remote advancement or a non-fast-forward rejection is normal: fetch, inspect the
incoming log and diff, and merge non-destructively in an isolated workspace, preserving both histories. Rerun checks,
then land and push normally without asking again. Stop and report ambiguous conflicts,
failing checks, security concerns, or a situation requiring a force push or history rewrite—not ordinary remote
advancement. Do not push secrets or unrelated unverified work.
This standing permission does not authorize releases, publishing, deployments, or GitHub issue/PR changes.
