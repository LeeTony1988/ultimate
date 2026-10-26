# Dreaming

Like people, agents need time to process what they learned. A dream is a working session: Ultimate reads back over
the project's conversations, memory, failures and tools, writes a journal of what it learned, and proposes changes.
The user decides each proposal with @ultimate; approved ones become ordinary branches, and the dream follows them
until they land. Nothing changes code, memory or storage by itself.

Session N lives in the `dream.sessions` document (`refs.ts`) on conversation 1: read it with codemode
`ultimate.doc('dream.sessions', 1)`. Actions, called with codemode
`ultimate.action('dream', name, args)`: `handoff {text}`, `pass {session, pass, status, note?}`, `journal {session, learned, text,
proposals, chapter?}`, `decide {session, proposal, status, branch?, sha?}` and `stats` (tool numbers from the trace, no model). The trace keeps only about the last 7 days, so
`stats` and `ultimate.trace` see only that window, and `stats` counts only tool calls; older failures and model
errors are found in conversation entries.

## For @ultimate

A dream starts with your **handoff**. The user pressed Dream (a `dream.handoff` input asks for it), or the built-in
"Dream before compaction" automation fired because your context passed its threshold (70% by default; a `dream.handoff`
entry beside the fire carries the same ask, and the fire's turn is the one to write it in; never `act` on the fire).
Write it in that same turn, while your context
still holds everything: what you worked on, what is still open (branches, questions, to-dos) and how far each got,
the decisions and why, the user's corrections, the lessons, and what you would do next. Plain Markdown, at most
12,000 characters; record it with one call, `ultimate.action('dream', 'handoff', {text})`, then end your turn with one
line to the user. A second call replaces the first while the dream still waits. The dream starts by itself once the
handoff is recorded and no other conversation works; after 30 minutes without one it starts without it and says so.
The dream reads the handoff first, and a new chapter wakes up from it.

A `dream.started` input means the session began (after your handoff, or under a granted automation's `act`). Start one
branch with `branch`, prompt:

> Dream session N. Follow "For the dream branch" in the clone's extensions/dream/DREAM.md.

Name the memory slugs the user cares about most in it, always including the memory about the user (`about-<name>`).
The branch answers you with the journal's proposals as a `Decisions:` block; its card is already in your conversation.
Relay the decisions to the user as one message with structured `questions`; at night they wait for the morning. Only
when the `dream.started` input says the user granted "dream" on the automation that started it are you hands-off:
decide each proposal yourself, as the user would (keep what is evidenced and small; skip what is risky or vague), and
record it with `decide {…, reason}`, one line on why; then tell the user what you decided in one message with
reply: false. Never decide hands-off otherwise. For each decision:

- **Approved code, prompt or doc change:** start a branch for it (it is ordinary work: assess or build, review, land),
  then `decide {status: 'approved', branch}`. The dream marks it landed when that branch lands; when it landed outside
  the lander, record it yourself with `decide {status: 'landed', sha}`.
- **Approved memory change:** apply it with one `remember` batch, then `decide {status: 'applied'}`.
- **Rejected:** `decide {status: 'rejected'}`.

A codified memory (`retire` on the proposal) stays until its branch lands; then delete or update it with `remember`.
The session ends by itself once every proposal is settled; the user can also end it from the journal card.

When the built-in automation's dream settles, a `dream.settled` entry says whether it was worth a fresh chapter (landed and
applied changes against the `dream.asleepAfter` setting, default 5). Below it, carry on in this chapter. At or above
it, either the automation's `asleep` grant falls asleep by itself (every gate still runs; nothing to do), or the input
asks you to ask the user: send one message with a `choice` question (Fall asleep now / Later) and point at the card's
Fall asleep button, which only they press. When the same turn owes the user an answer, put that question into the
answer instead: a turn that owes an answer cannot also message the user. Never call `asleep` or `automation act {do: 'asleep'}` for it yourself.

## For the dream branch

You coordinate the dream. You change nothing: no code, no memory, no settings. You read, analyse and propose. The
dream's own bookkeeping (`pass`, `journal`) is part of the job, not a change.

0. Read @ultimate's handoff first: `ultimate.doc('dream.sessions', 1)`, session N's `handoff.text` (or `missing`,
   why there is none). It is @ultimate's own judgement while its context was full: what mattered, which threads are
   really open, which corrections counted. Put it in every pass brief as the primary input; the transcripts are the
   evidence behind it, and a pass checks the handoff against them rather than taking it on trust.
1. Run the five passes in parallel, each as a `dream-pass` subagent (background), with the session number, its pass
   name and the brief below. Before starting each, call `pass {session, pass, status: 'running'}`; when it reports,
   `pass {…, status: 'done', note}` with a one-line note (or `failed` with the reason).
2. Check each report against its evidence; drop what does not hold up.
3. Merge them into the journal and file it with `journal`: `learned` is exactly three short lines in Ultimate's own
   voice ("I learned…", "I keep…", "I'd like…"); `text` is Markdown with one section per pass; `proposals` lists each
   proposed change once: `id` (a slug), `pass`, `title` (one line saying what changes), `size` (S/M/L), `risk`, and
   `retire` (the memory slug it makes redundant) for codify proposals. Propose `chapter`, a 2–3 word lowercase,
   dash-separated name for the next chapter, drawn from what this dream learned (at most 40 characters).
4. Answer @ultimate with the proposals as one `Decisions:` block, one numbered item per proposal (`(a) do it; (b)
   skip.`), each naming its id, then `My picks:`.

### The passes

Every pass starts from @ultimate's handoff in its brief (when the session has one), then reads with codemode
(`ultimate.entries`, `ultimate.search`, `ultimate.conversations`, `ultimate.trace`), `memory`, `git log` and the code. Every claim cites `#conversation/entry`, a trace error, a commit or `path:line`.
Conversation summaries and abstracts (in the root's tally, `ultimate.entries(<root>)`) are the cheap way in; open a
conversation only where they point at something.

- **memory** — distil the project memory: memories that are outdated, contradicted, duplicated or too vague; lessons
  that later conversations taught but nobody remembered. Output add/update/delete ops, each with reason and evidence
  (the memory review in extensions/lineage/README.md). Never drop or weaken the memory about the user.
- **failures** — what failed often: `watchdog.failure` cards, tool and action errors in the trace, retries, reactor
  failures, lander rejections, runs the user had to stop. Group by cause; for the top ones propose a fix.
- **tools** — `stats` gives calls, failures, mean duration and enabled tools never called. Explain the numbers: why a
  tool fails, which are slow, which unused ones should be taught or removed, what agents did by hand that a tool
  should do.
- **corrections** — what the user had to say more than once, corrections of the agents' work, and the wishes: what
  Ultimate itself would like to have or be able to do, from friction seen in old conversations.
- **codify** — memories that should stop depending on being remembered and become how the harness works. For each
  candidate propose one of: code (a behaviour or default), a lint rule or check (only enforcement the user asked for;
  `no-guards` keeps most rules in prompts), agent definitions or docs (an instruction rather than a project fact), a
  skill (a multi-step procedure agents repeat across conversations but need only sometimes: clone `skills/`, the
  project's `.ultimate/skills/` or the user's `~/.ultimate/skills/`), or stays a memory (context about the project or
  the user). Say the memory delete or update that follows once it is
  codified. Also check the skills that exist: one that is stale, duplicated or never read gets an update or removal
  proposal.
