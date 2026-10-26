---
name: wsl-gate
description: Land this repository from Windows through a WSL full gate and a Git bundle. Use when a branch is ready to land, when asked to land lxy_dev, or when the Windows lander fails for environment reasons rather than the change itself.
---

# Land through the WSL gate

This host's lander cannot run the project gate: `pnpm test` broad-fails and exceeds its 180 s check limit. WSL runs
the gate; Windows owns the checkout and pushes. A red gate is never bypassed.

## Hard rules

- Never push from WSL: it has no GitHub credentials. Push only from the Windows checkout.
- Never touch a dirty checkout, in WSL or on Windows. `git status --porcelain` must be empty; otherwise stop and report.
- Never weaken or skip a check: no deleted tests, no filters, no raised timeouts, no `|| true`. Only the suites' own
  capability skips, each named in the report.

## 1. Clean ext4 clone in WSL

Use Ubuntu-24.04. Work in the Linux home, never in `/mnt/d`: that mount is slow and is the Windows checkout. The
tools are user-local, not system-wide. Run the blocks inside WSL; if the host shell expands `$` before WSL sees it,
put a block in a `.sh` file and run it with `bash`.

```bash
set -euo pipefail
export PATH=/home/lee/ultimate-10789-tools/git-2.55/usr/bin:/home/lee/ultimate-10789-tools/git-2.55/usr/lib/git-core:/home/lee/ultimate-10789-tools/node/bin:/home/lee/ultimate-10789-tools/wrappers:/usr/local/bin:/usr/bin:/bin
export GIT_EXEC_PATH=/home/lee/ultimate-10789-tools/git-2.55/usr/lib/git-core
export LD_LIBRARY_PATH=/home/lee/ultimate-10789-tools/debs/root/usr/lib/x86_64-linux-gnu

cd /home/lee
test ! -e landing-1 || { echo "landing-1 exists; choose a new number"; exit 1; }
git clone /mnt/d/learnspace/git/ultimate landing-1
cd landing-1
git config user.name Lee && git config user.email lee@localhost
git checkout lxy_dev
git fetch /mnt/d/learnspace/git/ultimate refs/heads/ultimate/d9ec68-27247:refs/heads/landing-branch
git status --porcelain | grep -E '.' >/dev/null && { echo 'checkout is dirty'; exit 1; }
git ls-files --eol | grep -E 'i/crlf|w/crlf' >/dev/null && { echo 'checkout is not LF'; exit 1; }
pnpm install --frozen-lockfile
```

`.../node/bin` is Node 26, `.../wrappers/pnpm` is pnpm, `.../debs/root` supplies `libatomic`, and
`.../git-2.55` provides `hook.<name>.command`, which the distro's Git 2.43 lacks. Use a new number instead of `1`
per run, replace `d9ec68-27247` with the branch to land, and choose any local name for `landing-branch`. Never
reuse a clone whose state you did not create.

## 2. Gate the base

Run `pnpm check`, then `pnpm test`, then `pnpm test:e2e`. Zero failures are required before any merge. Record the
files and tests passed and name every skip: a capability skip is one the suite itself reports for this host (on WSL,
the Windows-only `test/e2e/process-group-windows.test.ts` cases and the `pwsh` shebang case in `test/shell.test.ts`).
Anything else stops the run.

## 3. Merge, then gate again

For each branch, verify its tip, merge it with the lander's message format, and rerun the whole gate:

```bash
set -euo pipefail
git rev-parse landing-branch           # compare with the branch report
git merge --no-ff landing-branch -m "Merge <sha7> from #<conversation> into lxy_dev"
pnpm check && pnpm test && pnpm test:e2e
```

Resolve a conflict only where both intents are unambiguous; otherwise stop and report. A failed gate after a merge
stops the run.

## 4. Bundle the result

At the final head:

```bash
set -euo pipefail
git status --porcelain | grep -E '.' >/dev/null && { echo 'checkout is dirty'; exit 1; }
git bundle create /mnt/c/Users/29155/ultimate-landing-1.bundle lxy_dev
git bundle verify /mnt/c/Users/29155/ultimate-landing-1.bundle
```

## 5. Fast-forward and push on Windows

In `D:\learnspace\git\ultimate`, on `lxy_dev`, with a clean tree:

```powershell
$dirty = git status --porcelain; if ($LASTEXITCODE -or $dirty) { throw 'checkout is dirty or unreadable' }
git switch lxy_dev; if ($LASTEXITCODE) { throw 'git switch failed' }
git fetch C:\Users\29155\ultimate-landing-1.bundle lxy_dev:refs/heads/landing-verify; if ($LASTEXITCODE) { throw 'git fetch failed' }
git merge --ff-only landing-verify; if ($LASTEXITCODE) { throw 'git merge failed' }
git push origin lxy_dev; if ($LASTEXITCODE) { throw 'git push failed' }
git branch -D landing-verify; if ($LASTEXITCODE) { throw 'temp ref cleanup failed' }
```

The fetch writes only a temporary `landing-verify` ref; `--ff-only` refuses anything but a fast-forward, so a moved
or diverged target stops here. Delete the ref after the push. Report the final head, per-command pass and skip counts,
the bundle path, and the pushed range.
