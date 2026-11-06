---
name: wsl-gate
description: Land this repository from Windows through a WSL full gate and a Git bundle. Use when a branch is ready to land, when asked to land dev/lxy, or when the Windows lander fails for environment reasons rather than the change itself.
---

# Land through the WSL gate

This host's lander cannot run the project gate: `pnpm test` broad-fails and exceeds its check limit. WSL runs
the gate; Windows owns the checkout and pushes. A red gate is never bypassed.

## Hard rules

- Never push from WSL: it has no GitHub credentials. Push only from the Windows checkout.
- Never rebase, never force, never rewrite history. The only ref move is `--ff-only`.
- The Windows checkout carries the user's own uncommitted work. Never stash it, revert it or switch it away. A landing
  may proceed beside it only when the landing's changed paths and the dirty paths share nothing, and the dirty state is
  identical afterwards; otherwise stop and report.
- Never weaken or skip a check: no deleted tests, no filters, no raised timeouts, no `|| true`. Only the suites' own
  capability skips, each named in the report.

## 1. Clean ext4 clone in WSL

Use Ubuntu-24.04. Work in the Linux home, never in `/mnt/d`: that mount is slow and is the Windows checkout. The
tools are user-local, not system-wide. Run the script inside WSL; it owns its clone and never pushes.

```bash
# From the repository root, inside WSL. No machine paths are baked into the script.
export WSL_GATE_SOURCE=/mnt/d/learnspace/git/ultimate   # the Windows checkout, as WSL sees it

# Fresh clone: create it at origin/dev/lxy and stop before merging.
bash skills/wsl-gate/gate.sh prepare <branch> <conversation> --no-merge
```

The script prepends `.../node/bin` (Node 26), `.../wrappers/pnpm` and the newest `.../git-*/usr/bin` from
`ULTIMATE_TOOLS`, and puts `.../debs/root` on `LD_LIBRARY_PATH` for `libatomic`; Git 2.55 provides
`hook.<name>.command`, which the distro's Git 2.43 lacks. `ULTIMATE_TOOLS` defaults to a detected
`$HOME/ultimate-*-tools`; set it when the prefix is elsewhere. `WSL_GATE_CLONE` names the one clone the script
reuses (default `$HOME/wsl-gate/landing`); never point it at a checkout whose state you did not create.

## 2. Gate the base

Run `bash skills/wsl-gate/gate.sh gate`. It runs `pnpm check`, `pnpm test` and `pnpm test:e2e` in that order in the
clone, prints `/proc/loadavg` before and after each phase and the exit code of each, and stops at the first red with
the failing phase named. (`gate check` and the like are partial development runs, never a landing gate.) Zero
failures are required before any merge. Record the files and tests passed and name every skip: a capability skip is
one the suite itself reports for this host (on WSL, the Windows-only `test/e2e/process-group-windows.test.ts` cases and
the `pwsh` shebang case in `test/shell.test.ts`).

A red suite is not automatically the change's. This host is shared and load-sensitive: at load above ~3, suites that
spawn a server time out at 30 s in files the change never touches, and which files fail changes from run to run. Before
blaming the branch, prove it:

- Run the same suite at the base, in the same clone: `git switch --detach <base>`, then the suite, then `git switch dev/lxy`.
  Red at both ends is environmental.
- Re-run the failing file alone with `bash skills/wsl-gate/gate.sh alone <file>` at both ends. Green alone and red only
  in the full suite is load.
- The script prints the load with every phase; keep that output with the run.

Then run the suite again unchanged, at most twice. Never block on the load average: the suite itself pins every core
for its whole run, so a threshold high enough to wait for is one the run it just finished keeps alive, and the gate
spends longer waiting than testing. Print the load before each attempt, run it, print it again, and keep the output.

Only a failure that survives both attempts, reproduces at the base, and sits on paths the landing changes stops the
run. Everything else is reported as _could not gate at load N_, with the base's output and the failing test names —
never fixed, filtered or given a raised timeout to get past it. For a change with no runtime surface (Markdown, a
skill, a doc), `pnpm check` plus the unit suite is the honest gate; say in the report that e2e was not run to green
and why, and give the last full e2e result you have.

## 3. Merge, then gate again

For each branch, verify its tip, merge it with the lander's message format, and rerun the whole gate:

```bash
# From the repository root, inside WSL. <expected-tip> is optional; without it
# prepare prints the fetched tip so it can be compared with the branch report.
bash skills/wsl-gate/gate.sh prepare <branch> <conversation> <expected-tip>
bash skills/wsl-gate/gate.sh gate
```

`prepare` fetches the branch into `landing-branch` and merges it with `--no-ff` and the message
`Merge <sha7> from #<conversation> into dev/lxy`. Resolve a conflict only where both intents are unambiguous;
otherwise stop and report. A failed gate after a merge stops the run.

## 4. Bundle the result

At the final head:

```bash
bash skills/wsl-gate/gate.sh bundle /mnt/c/Users/29155/ultimate-landing-1.bundle
```

The script refuses a dirty clone, creates the bundle from `dev/lxy`, verifies it, lists its heads and prints its
SHA-256.

## 5. Fast-forward and push on Windows

In `D:\learnspace\git\ultimate`. Snapshot the user's uncommitted work first, then refuse the landing if it touches
any of it. Each block reads the snapshot from the file, so it holds in a fresh shell too, and the file is the
reference for step 6.

```powershell
cd D:\learnspace\git\ultimate
$before = @(git status --porcelain)
if ($LASTEXITCODE) { throw 'git status failed' }
$before | Out-File $env:TEMP\before-status.txt -Encoding utf8
$hashes = @{}
foreach ($line in $before) {
  $path = ($line -replace '^..\s+', '').Trim('"')
  if (Test-Path $path -PathType Leaf) { $hashes[$path] = (Get-FileHash $path -Algorithm SHA256).Hash }
}
$hashes | ConvertTo-Json | Out-File $env:TEMP\before-hashes.json -Encoding utf8
if ($before | Where-Object { $_ -match '^R' }) { throw 'a staged rename is dirty; inspect it by hand' }
"$($before.Count) dirty entries, $($hashes.Count) hashed"
```

Then verify the bundle, fetch it into a throwaway ref, and prove that it neither touches a dirty path nor needs
anything but a fast-forward:

```powershell
cd D:\learnspace\git\ultimate
$before = @(Get-Content $env:TEMP\before-status.txt)
if (-not $before.Count) { throw 'no snapshot; run the block above first' }
git bundle verify C:\Users\29155\ultimate-landing-1.bundle; if ($LASTEXITCODE) { throw 'bundle is not complete' }
git bundle list-heads C:\Users\29155\ultimate-landing-1.bundle
git branch -D landing-verify 2>$null | Out-Null   # a ref left by an interrupted run would block the fetch
git fetch C:\Users\29155\ultimate-landing-1.bundle dev/lxy:refs/heads/landing-verify; if ($LASTEXITCODE) { throw 'git fetch failed' }
$changed = @(git diff --name-only HEAD landing-verify)
$dirty = @($before | ForEach-Object { ($_ -replace '^..\s+', '').Trim('"') } | Where-Object { $_ })
if (-not $dirty.Count) { throw 'the snapshot is empty; nothing was read' }
$overlap = @($dirty | Where-Object {
  $path = $_
  if ($path.EndsWith('/')) { $changed | Where-Object { $_.StartsWith($path) } } else { $changed -contains $path }
})
if ($overlap) { $overlap | Select-Object -Unique; throw 'the landing touches dirty paths' }
git merge-base --is-ancestor HEAD landing-verify; if ($LASTEXITCODE) { throw 'not a fast-forward' }
"changed=$($changed.Count) dirty=$($dirty.Count) overlap=0, fast-forward"
```

An untracked directory in `git status --porcelain` ends in `/` and stands for every file under it: compare it by
prefix, not by exact path. Only when that block passes does the landing go ahead:

```powershell
$branch = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -or $branch -ne 'dev/lxy') { throw "not on dev/lxy: $branch" }
git merge --ff-only landing-verify; if ($LASTEXITCODE) { throw 'git merge failed' }
git push origin dev/lxy; if ($LASTEXITCODE) { throw 'git push failed' }
git branch -D landing-verify; if ($LASTEXITCODE) { throw 'temp ref cleanup failed' }
```

## 6. Prove the checkout was not disturbed

```powershell
cd D:\learnspace\git\ultimate
$before = @(Get-Content $env:TEMP\before-status.txt)
if (-not $before.Count) { throw 'no snapshot; nothing to compare against' }
$after = @(git status --porcelain)
if (Compare-Object $before $after) { Compare-Object $before $after | Format-Table -AutoSize; throw 'dirty state changed' }
$beforeHashes = Get-Content $env:TEMP\before-hashes.json -Raw | ConvertFrom-Json
foreach ($name in $beforeHashes.PSObject.Properties.Name) {
  if ((Get-FileHash $name -Algorithm SHA256).Hash -ne $beforeHashes.$name) { throw "changed: $name" }
}
git rev-parse HEAD
git rev-parse origin/dev/lxy
```

`HEAD` and `origin/dev/lxy` must print the same sha; anything else means the push did not carry the landed commit.
Report the final head, per-command pass and skip counts, the bundle path, the pushed range, and that the dirty
snapshot was unchanged.
