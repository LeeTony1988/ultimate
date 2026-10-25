Commits made through the shell tool (`bash`, or `powershell` on Windows) carry an `Ultimate-Conversation: <id>` trailer via process-local Git config hooks; commits outside the tool and repository hook files are untouched.

Each commit made through the shell tool is also recorded as the durable event `coding-tools.committed` (`refs.ts`): the conversation, the full sha, its parents, the repository, the linked worktree and branch, the subject, and for an amend or rebase the commit it replaced (`rewrittenFrom`). So the link survives a discarded worktree, a deleted branch or garbage collection. Per shell call, `post-commit`, `post-applypatch` (`git am`, apply-backend rebases), `post-merge` and `post-rewrite` hooks (same `GIT_CONFIG_*` mechanism) append one line each to a temp log unique to that invocation; every hook ends in `|| true`, so it never fails a commit. When the call ends, even with an error or a timeout, the tool reads and removes the log and emits one event per commit the hooks saw being made. A merge counts when it made a merge commit (not a fast-forward or squash); a rewrite only adds `rewrittenFrom` to a commit made in the same call, so a rebase resumed in a later call records each commit once. Cherry-picks, reverts and rebased commits count; commits made during a rebase have no `branch`, since HEAD is detached then.

The events commit on their own right after the shell call, with its trace context, not in the tool result's commit: Pi settles the result after the wrapper returns. A crash between the git commit and that commit loses its event; the trailer remains. Commits made outside an agent's shell call (the user in a terminal, extensions' own `git` calls such as the lander's merge commit) are not recorded. Find them with `debug {call: 'events', events: ['coding-tools.committed']}` or the System stream's Events filter.

Pi's coding tools and how the transcript shows them: `read` as a numbered, highlighted excerpt; `write` with its size and content; `edit` as a unified diff with old and new line numbers; the shell tool as a terminal with streamed output, exit status, and duration. `bash-command.tsx` parses Bash commands with [unbash](https://github.com/webpro-nl/unbash) (display only; PowerShell commands stay one raw step): the card stays collapsed once finished (open while running or failed) and its header condenses the command to its programs: pipes as arrows, list operators between steps, repeats folded (`sed ×2 · rg → head`), a heredoc's target file, and a literal leading `cd` as the directory on the right. Expanded, each step gets a highlighted row and every heredoc body is highlighted by its target file or interpreter. Unparsable commands stay raw.

Shell calls without `timeout` have a 600-second tripwire ceiling. `ULTIMATE_BASH_TIMEOUT` overrides that default
in seconds and is read at each call; it must be positive and finite. A tripwire timeout stops the process and reports
how to request a longer explicit timeout. Explicit timeouts retain Pi's ordinary timeout error.

A shell call with `interruptible: true` (waits and polls: CI checks, deploys, a file appearing) ends early when a steer
is queued in its conversation: the tool watches the conversation's `pi.inbox` and cancels the command, which kills its
process, then returns the output so far followed by "[Interrupted by a steering message after Ns; …]" (last, so
tail truncation keeps it) as an ordinary result, so the run goes on and the steer is placed at the next boundary
instead of after the wait. Follow-ups never interrupt. A marked command that changes things (`git push|commit|merge`,
an `install` or `migrate` word) is refused with a hint to split it, so a steer can never cut it mid-way.

Any running shell call can be cancelled from its card (the × next to its timer): the user-only action
`cancel {callId}` (`refs.ts`) records the call in the conversation's durable `coding-tools.cancelled` document, which
every shell call watches like the inbox above, so a cancel reaches a call started before an extension reload. The call
kills its command and returns the output so far followed by "[Cancelled by the user after 5m 09s; …]" as an ordinary
result; the run goes on and the card shows `cancelled`. A restart ends a running call anyway (Pi recovers it as
interrupted). Calls never remove their own marks, since one can land as a call ends; each cancel drops the marks of
calls no longer running, and a cancel of a call that is not running fails.

Pi's `prepare` hook only changes the command, cwd, and environment, not the timeout, so one wrapper injects the
default and formats execution timeout errors.

`server.ts` installs Pi Durable's read, write, edit, and shell tools (named `coding-tools`, like this folder). `lib/shell.ts` is the one place that decides which shell the host runs: `powershell` on Windows, where Pi runs `pwsh` and falls back to Windows PowerShell, and `bash` everywhere else, so a Windows host needs no Git Bash. Callers read `shell.name`, register the tool with `shell.create` and spawn one command string with `shell.argv`; nothing else asks the platform. `web.tsx` registers one renderer per tool name under `tools`; `diff.tsx` turns the edit tool's `details.patch` (or Pi's display `details.diff`) into rows.
