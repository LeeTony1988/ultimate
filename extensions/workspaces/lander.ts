import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { mkdir, readdir, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { copyJson } from '@earendil-works/chord'
import type { Context } from '@earendil-works/chord'
import { withAbortSignal } from '@earendil-works/chord/context'
import {
  AssistantEntry,
  configure,
  defineEntry,
  defineTask,
  ROOT_CONVERSATION_ID,
} from '@earendil-works/pi-durable'
import type {
  AgentChange,
  ConversationDocToken,
  ConversationId,
  Tx,
} from '@earendil-works/pi-durable'
import { git } from '../../lib/git.ts'
import { shell } from '../../lib/shell.ts'
import { runGroup, sweepPidFiles } from '../../lib/process-group.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { definitionAgent, discoverAgents } from '../../lib/agents.ts'
import { CheckRan, Handoff, SubmissionLanded } from './api.ts'
import { samePath, worktreePath } from './paths.ts'
import { setup } from './setup.ts'
import type {
  Landed,
  LanderAsk,
  LanderEntry,
  LanderOutcome,
  QueueEntry,
  WorkspaceIndex,
} from './types.ts'

/** One line of the lander conversation's log; it carries no model message, so no model ever sees it. */
export const LanderLog = defineEntry<LanderEntry>('ultimate.lander')
/** The entry kind of the lander task's question to its model; the model reads the prompt. */
export const LanderAskEntry = 'ultimate.lander-ask'
/** Outcomes kept in the index for submit cards; older ones live on in the lander conversation. */
const kept = 50
/** The lander's own detached checkout of `source`, also its conversation's cwd. */
export async function landerPath(home: string, source: string) {
  await mkdir(join(home, 'lander'), { recursive: true })
  return join(
    await realpath(join(home, 'lander')),
    createHash('sha256').update(source).digest('hex').slice(0, 12),
  )
}
const checkouts = new Map<string, Promise<string>>()
/**
 * The lander's checkout of `source`, created detached at `tip` when it is not a registered worktree yet; an existing one
 * stays as it is. Serialize creation per path so another caller cannot remove a checkout being created.
 */
export async function landerCheckout(home: string, source: string, tip = 'HEAD') {
  const path = await landerPath(home, source)
  const queued = (checkouts.get(path) ?? Promise.resolve())
    .catch(
      // The previous caller receives its failure; a later call must still be able to recover.
      () => undefined,
    )
    .then(async () => {
      const registered = (await git(source, 'worktree', 'list', '--porcelain'))
        .split('\n\n')
        .some((entry) => {
          const entryPath = worktreePath(entry)
          return entryPath !== undefined && samePath(entryPath, path)
        })
      if (!registered) {
        // The directory is the lander's own; a crash may have left it half created.
        await rm(path, { recursive: true, force: true })
        await git(source, 'worktree', 'prune')
        await git(source, 'worktree', 'add', '--detach', path, tip)
      }
      return path
    })
  checkouts.set(path, queued)
  try {
    return await queued
  } finally {
    if (checkouts.get(path) === queued) checkouts.delete(path)
  }
}
/**
 * Append a log line about `entry`, a draft of its queue entry, to the lander conversation `id`; a step also joins the
 * entry's `steps`, which the submitter's cards show.
 */
export const log = (
  tx: Tx,
  id: ConversationId,
  entry: Pick<
    QueueEntry,
    'id' | 'conversationId' | 'tip' | 'target' | 'at' | 'divergence' | 'subject' | 'steps'
  >,
  data: Omit<LanderEntry, 'submission' | 'conversationId' | 'tip' | 'target' | 'at'>,
) => {
  const at = Date.now()
  if (data.step)
    entry.steps.push({ step: data.step, at, ...(data.check ? { check: data.check } : {}) })
  return tx.appendEntry(LanderLog, id, {
    data: {
      submission: entry.id,
      conversationId: entry.conversationId,
      tip: entry.tip,
      target: entry.target,
      at,
      sourceEntry: entry.at,
      divergence: entry.divergence,
      ...(entry.subject && (data.step === 'queued' || data.step === 'started' || data.outcome)
        ? { subject: entry.subject }
        : {}),
      ...data,
    },
  })
}
type Host = Pick<
  ExtensionHost,
  | 'home'
  | 'ultimateRoot'
  | 'projectRoot'
  | 'userHome'
  | 'modelRuntime'
  | 'harness'
  | 'projectSettings'
  | 'want'
  | 'resource'
  | 'extensions'
  | 'metadata'
  | 'notice'
  | 'emit'
>
/**
 * The lander conversation's agent from the effective `lander` definition (model, thinking, tools, instructions) over
 * the main conversation's; without a definition only the main conversation's model, and no model work on failures.
 */
export async function landerAgent(
  host: Pick<Host, 'ultimateRoot' | 'projectRoot' | 'userHome' | 'modelRuntime' | 'harness'>,
  context: Context,
): Promise<{ onFailure?: 'fix' | 'diagnose'; change: AgentChange }> {
  const definition = (
    await discoverAgents(host.ultimateRoot, host.projectRoot, host.userHome, host.modelRuntime)
  ).definitions.find((candidate) => candidate.name === 'lander')
  const main = await (await host.harness().conversation(ROOT_CONVERSATION_ID, context))!.agent(
    context,
  )
  if (!definition)
    return { change: { model: main.model ?? null, thinkingLevel: main.thinkingLevel } }
  const delegates = definition.tools?.includes('subagent')
  return {
    onFailure: definition.onFailure ?? 'diagnose',
    change: definitionAgent(definition, main, host.modelRuntime, {
      excludeTools: ['workspace', ...(delegates ? [] : ['subagent'])],
      excludeExtensions: delegates ? [] : ['subagents'],
    }),
  }
}
/** One check command, with its own total limit in seconds when set. */
type Check = { command: string; timeout?: number }
/** Checks run in order; an array is a group whose commands run concurrently. */
type Settings = {
  checks: (Check | Check[])[]
  push?: string
  deploy?: { agent: string; paths: string[] }
}
/** Bounded retries when the target moves while a submission is integrated. */
const attempts = 3
/** Seconds without output and total seconds allowed for one check, unless the check sets its own `timeout`. */
type CheckLimits = { stall: number; total: number }
const checkLimits: CheckLimits = { stall: 2 * 60, total: 10 * 60 }
/** A check's limits: its `timeout` replaces the total, and the stall limit never exceeds it. */
export const limitsFor = (check: Check, limits: CheckLimits): CheckLimits =>
  check.timeout === undefined
    ? limits
    : { stall: Math.min(limits.stall, check.timeout), total: check.timeout }
/** Lines naming failed tests (vitest's `FAIL`, `×` and `✗` marks), kept from a check's whole output. */
const failedLine = /^\s*(FAIL|×|✗)\s/
const seconds = (value: number) => (value < 60 ? `${value} s` : `${+(value / 60).toFixed(1)} min`)

/** Where running checks record their process groups, so a host that crashed mid-check stops them on its next open. */
export const checkPids = (home: string) => join(home, 'lander-checks')
/**
 * Stop the checks a previous process left running. Pi resumes a lander task before extensions open, so files of
 * this process name live checks, never leftovers.
 */
export const sweepChecks = async (home: string) => {
  await sweepPidFiles(checkPids(home), (name) => name.startsWith(`${process.pid}-`))
  // Temporary directories of checks whose process stopped; a live check of this process made none yet.
  const names = await readdir(checkTemp(home)).catch((error: NodeJS.ErrnoException) => {
    // No check ever ran in this home.
    if (error.code === 'ENOENT') return []
    throw error
  })
  for (const name of names)
    if (!name.startsWith(`${process.pid}-`))
      await rm(join(checkTemp(home), name), { recursive: true, force: true })
}
/**
 * Where checks keep temporary files: on disk under the project home, not in `/tmp`, which is often a small tmpfs
 * that test suites fill (EDQUOT) when interrupted runs leave their directories behind.
 */
export const checkTemp = (home: string) => join(home, 'lander-tmp')

/**
 * Run `command` in the host shell in its own recorded process container. The watchdog and task cancellation stop the
 * runner and its descendants; a host crash is cleaned up on its next open.
 */
export async function runLanderCheck(
  path: string,
  command: string,
  context: Context,
  pids: string,
  temp: string,
  limits: CheckLimits = checkLimits,
) {
  // Synchronous, so the watchdog's timers start in the same tick as the call.
  mkdirSync(temp, { recursive: true })
  const tmp = mkdtempSync(join(temp, `${process.pid}-`))
  let output = ''
  let partial = ''
  const failed = new Set<string>()
  let stopped: string | undefined
  const watchdog = new AbortController()
  const signal = AbortSignal.any([
    watchdog.signal,
    ...(context.abortSignal ? [context.abortSignal] : []),
  ])
  const stop = (reason: string) => {
    if (signal.aborted) return
    stopped = reason
    watchdog.abort()
  }
  const stalled = () => stop(`Stalled: no output for ${seconds(limits.stall)}, stopped`)
  let stallTimer = setTimeout(stalled, limits.stall * 1000)
  const totalTimer = setTimeout(
    () => stop(`Timed out after ${seconds(limits.total)}`),
    limits.total * 1000,
  )
  /** A watchdog report: the limit that fired, the failed tests seen so far, then the output tail. */
  const watchdogFailure = (reason: string) => {
    const tests = [...failed].slice(-20)
    return [reason, ...(tests.length ? ['Failed tests so far:', ...tests] : []), output]
      .join('\n')
      .trim()
  }
  const onOutput = (text: string) => {
    output = (output + text).slice(-3000)
    const split = (partial + text).split('\n')
    partial = split.pop()!.slice(-1000)
    for (const line of split) {
      const plain = stripVTControlCharacters(line).trim()
      if (failedLine.test(plain)) failed.add(plain.slice(0, 300))
    }
    clearTimeout(stallTimer)
    stallTimer = setTimeout(stalled, limits.stall * 1000)
  }
  try {
    let exitCode: number
    try {
      const { program, args } = shell.argv(command)
      exitCode = await runGroup(program, args, {
        cwd: path,
        env: { ...process.env, TMPDIR: tmp },
        pidFile: join(pids, `${process.pid}-${randomUUID()}.pid`),
        signal,
        grace: 2000,
        onOutput,
      })
    } catch (error) {
      context.abortSignal?.throwIfAborted()
      return { failure: `${output}\n${String(error)}`.trim() }
    }
    context.abortSignal?.throwIfAborted()
    if (stopped) return { failure: watchdogFailure(stopped), timedOut: true }
    if (exitCode !== 0) return { failure: `${output}\nexit ${exitCode}`.trim() }
    const last = lines(stripVTControlCharacters(output)).findLast((line) => line.trim())
    return { summary: last?.trim().slice(0, 200) }
  } finally {
    clearTimeout(stallTimer)
    clearTimeout(totalTimer)
    await rm(tmp, { recursive: true, force: true })
  }
}

/** A check from settings: a command, or `{ command, timeout }` with a positive timeout in seconds. */
const parseCheck = (value: unknown): Check | undefined => {
  if (typeof value === 'string') return { command: value }
  if (!value || typeof value !== 'object') return undefined
  const { command, timeout } = value as { command?: unknown; timeout?: unknown }
  if (typeof command !== 'string') return undefined
  if (timeout === undefined) return { command }
  return typeof timeout === 'number' && timeout > 0 ? { command, timeout } : undefined
}
export const landerSettings = async (
  host: Pick<Host, 'projectSettings' | 'notice'>,
): Promise<Settings> => {
  const lander = (await host.projectSettings()).lander as
    | { checks?: unknown; push?: unknown; deploy?: unknown }
    | undefined
  const entries = lander?.checks ?? []
  const checks = Array.isArray(entries)
    ? entries.map((entry) =>
        Array.isArray(entry)
          ? entry.length > 0
            ? entry.map(parseCheck)
            : [undefined]
          : parseCheck(entry),
      )
    : undefined
  if (!checks?.every((group) => (Array.isArray(group) ? group.every(Boolean) : group)))
    throw new Error(
      'lander.checks must be an array of checks or check groups; a check is a command or { "command", "timeout" } with timeout in seconds',
    )
  if (lander?.push !== undefined && typeof lander.push !== 'string')
    throw new Error('lander.push must be a remote name')
  let deploy: Settings['deploy']
  if (lander?.deploy !== undefined) {
    const value = lander.deploy
    if (
      value &&
      typeof value === 'object' &&
      'agent' in value &&
      'paths' in value &&
      typeof value.agent === 'string' &&
      value.agent.trim() &&
      Array.isArray(value.paths) &&
      value.paths.length > 0 &&
      value.paths.every((path) => typeof path === 'string' && path.length > 0)
    )
      deploy = { agent: value.agent, paths: value.paths }
    else
      host.notice(
        'lander.deploy must name an agent and a non-empty array of path prefixes; deploy hook disabled',
      )
  }
  return {
    checks: checks as Settings['checks'],
    ...(lander?.push ? { push: lander.push } : {}),
    ...(deploy ? { deploy } : {}),
  }
}
const contains = (cwd: string, ancestor: string, descendant: string) =>
  git(cwd, 'merge-base', '--is-ancestor', ancestor, descendant).then(
    () => true,
    () => false,
  )
const lines = (text: string) => text.split('\n').filter(Boolean)
const failure = (error: unknown) => {
  const output = error as Error & { stdout?: string; stderr?: string }
  return `${output.stdout ?? ''}${output.stderr ?? ''}${output.stdout || output.stderr ? '' : output.message}`
    .trim()
    .slice(-3000)
}
/** Run a network git command in `cwd`; longer than git()'s local timeout. */
const remote = (cwd: string, signal: AbortSignal, ...args: string[]) =>
  git({ cwd, signal, timeout: 300000 }, ...args)

/** A failure the lander's model works on: the checkout stays as it failed, at `head` on top of target `base`. */
type Failure = {
  mode: 'fix' | 'diagnose'
  reason: string
  output?: string
  hint?: string
  base: string
  head: string
  /** What the failed merge brought in, the submitted tip or the remote's target; a fix builds on it. */
  merging: string
  prompt: string
  /** The model's final answer, once its run settled. */
  answer?: string
  /** Why the model's run ended without an answer (`model_error`, `aborted`, …); its changes never land. */
  unfinished?: string
}
type Prepared = {
  base: string
  integrated: string
  flaky: string[]
}
const landedOutcome = (landed: Landed): LanderOutcome => ({
  outcome: 'landed',
  sha: landed.sha,
  base: landed.base,
  commits: landed.commits,
  paths: landed.paths,
  flaky: landed.flaky,
})
/** Carried across attempts: a rejected push retries once, and a submission gets at most one fix by the model. */
type Carry = { pushRetried?: boolean; fixed?: { commits: string[]; head: string } }
type State =
  | { phase: 'next' }
  | ({ phase: 'land'; id: string; attempt: number; failure?: Failure } & Carry)
  | ({ phase: 'agent'; id: string; attempt: number; failure: Failure } & Carry)
  | {
      phase: 'report'
      id: string
      conversationId: number
      text: string
      outcome?: WorkspaceIndex['results'][string]
    }
const textOf = (message: unknown) =>
  ((message as { content?: { type: string; text?: string }[] } | undefined)?.content ?? [])
    .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
    .join('')
    .trim()

export function createLander(
  host: Host,
  Workspaces: ConversationDocToken<WorkspaceIndex>,
  /** Serializes source checkout writes with synchronous landing. */
  serial: <T>(source: string, operation: () => Promise<T>) => Promise<T>,
  limits: CheckLimits = checkLimits,
) {
  async function checkout(source: string, tip: string) {
    const path = await landerCheckout(host.home, source, tip)
    // Every attempt starts from a clean checkout at the target tip; ignored files such as installs stay.
    await git(path, 'reset', '--hard', '-q')
    await git(path, 'checkout', '-q', '--detach', '--force', tip)
    await git(path, 'clean', '-fdq')
    return path
  }

  const Lander = defineTask<{ source: string }, State, null>({
    name: 'workspaces.lander',
    version: 1,
    initial: () => ({ phase: 'next' }),
    phases: {
      next: (task, runtime, context) =>
        runtime.commit(async (tx) => {
          const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
          const entry = index.queue.find((item) => item.source === task.input.source)
          if (!entry) {
            delete index.landers[task.input.source]
            return { status: 'terminal', outcome: { status: 'completed', result: null } }
          }
          entry.state = 'landing'
          await log(tx, runtime.conversationId, entry, { step: 'started' })
          return { status: 'running', checkpoint: { phase: 'land', id: entry.id, attempt: 1 } }
        }, context),
      land: async (task, runtime, context) => {
        const { id, attempt, pushRetried, fixed } = task.state.checkpoint
        const carry: Carry = {
          ...(pushRetried ? { pushRetried } : {}),
          ...(fixed ? { fixed } : {}),
        }
        const { signal } = runtime
        const index = (await runtime.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))!
        const entry = index.queue.find((item) => item.id === id)!
        /** What this submission's fast-forward landed, if it happened yet. */
        const recorded = async () =>
          (await runtime.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))!.queue.find(
            (item) => item.id === id,
          )?.landed
        /**
         * Log a step; a check's `output` tail goes to the lander log only, not the submission's steps. A run check's
         * step also emits `workspaces.check`, with `ran` its duration and whether a watchdog stopped it.
         */
        const step = (
          text: string,
          result?: LanderEntry['check'],
          output?: string,
          ran?: { ms: number; timedOut?: boolean },
        ) =>
          runtime.commit(async (tx) => {
            const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
              (item) => item.id === id,
            )!
            saved.step = text
            await log(tx, runtime.conversationId, saved, {
              step: text,
              ...(result ? { check: result } : {}),
              ...(output ? { output } : {}),
            })
            if (result && ran)
              await host.emit(tx, CheckRan, {
                submission: id,
                command: result.command,
                result: ran.timedOut ? 'timeout' : result.result,
                ms: Math.round(ran.ms),
              })
          }, context)
        /** Record the outcome, log it and report it to the submitter, in one commit. */
        const finish = (text: string, outcome: LanderOutcome) =>
          runtime.commit(async (tx) => {
            const draft = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
            const steps = draft.queue.find((item) => item.id === id)!.steps
            draft.queue = draft.queue.filter((item) => item.id !== id)
            if (outcome.sha) draft.items[String(entry.conversationId)].landed = outcome.sha
            draft.results[id] = {
              ...outcome,
              at: entry.at,
              divergence: entry.divergence,
              target: entry.target,
              tip: entry.tip,
              lander: runtime.conversationId,
              steps,
              conversationId: entry.conversationId,
              ...(entry.subject ? { subject: entry.subject } : {}),
            }
            for (const old of Object.keys(draft.results).slice(0, -kept)) delete draft.results[old]
            await log(tx, runtime.conversationId, entry, outcome)
            if (outcome.outcome === 'landed') {
              const subject = entry.subject ?? {}
              const commits = (outcome.commits ?? []).map((commit) => {
                const space = commit.indexOf(' ')
                return { sha: commit.slice(0, space), subject: commit.slice(space + 1) }
              })
              await host.emit(tx, SubmissionLanded, {
                submission: id,
                conversationId: entry.conversationId,
                at: entry.at,
                sha: outcome.sha!,
                base: outcome.base!,
                target: entry.target,
                lander: runtime.conversationId,
                divergence: entry.divergence,
                title:
                  subject.title ??
                  (await tx.doc(host.metadata, entry.conversationId as ConversationId)).title ??
                  '',
                ...(subject.summary ? { summary: subject.summary } : {}),
                ...(subject.feature ? { feature: subject.feature } : {}),
                commits: commits.slice(0, 10),
                commitCount: commits.length,
                paths: (outcome.paths ?? []).slice(0, 8),
                ...(outcome.pushed ? { pushed: outcome.pushed } : {}),
              })
            }
            return {
              status: 'running',
              checkpoint: {
                phase: 'report',
                id,
                conversationId: entry.conversationId,
                outcome: draft.results[id],
                text: `[lander] Submission ${id} (#${entry.conversationId}, ${entry.tip.slice(0, 7)}) ${text}\nLog: lander conversation #${runtime.conversationId}.`,
              },
            }
          }, context)
        const summary = (landed: Landed, sha: string, how = '') =>
          [
            landed.commits.length
              ? `landed${how} as ${sha.slice(0, 7)} on ${entry.target}.`
              : `had nothing new to land on ${entry.target}.`,
            ...(landed.commits.length ? [`Commits:\n${landed.commits.join('\n')}`] : []),
            ...(fixed ? [`Fixed by lander:\n${fixed.commits.join('\n')}`] : []),
            ...landed.flaky.map((command) => `Flaky: ${command}`),
          ].join('\n')
        /**
         * Report `reason`, with `output` (conflicting paths, a check's output tail) and what to do next.
         * Once the submission landed locally, a later failure only means its push failed.
         */
        const fail = async (reason: string, output?: string, hint?: string, diagnosis?: string) => {
          const landed = await recorded()
          const detail = [
            output ? `${reason}:\n${output}` : reason,
            ...(hint ? [hint] : []),
            ...(diagnosis ? [`Diagnosis by lander:\n${diagnosis}`] : []),
          ].join('\n')
          const facts = {
            reason: landed ? `Push failed: ${reason}` : reason,
            ...(output ? { output } : {}),
            ...(hint ? { hint } : {}),
            ...(diagnosis ? { diagnosis } : {}),
          }
          return landed
            ? finish(`${summary(landed, landed.sha, ' locally')}\nPush failed: ${detail}`, {
                ...landedOutcome(landed),
                ...facts,
              })
            : finish(`was not landed: ${detail}`, { outcome: 'failed', ...facts })
        }
        const retry = (retried = pushRetried) =>
          runtime.commit(
            () => ({
              status: 'running',
              checkpoint: {
                phase: 'land',
                id,
                attempt: attempt + 1,
                ...carry,
                ...(retried ? { pushRetried: retried } : {}),
              },
            }),
            context,
          )
        const integration = await landerPath(host.home, entry.source)
        /** Reset the lander's checkout after a failure the model looked at. */
        const reset = async () => {
          await git(integration, 'merge', '--abort').catch(
            // Check failures may have no merge in progress; reset and clean below still enforce cleanup.
            () => undefined,
          )
          await git(integration, 'reset', '--hard', '-q')
          await git(integration, 'clean', '-fdq')
        }
        /**
         * A conflict or a check that failed twice: the lander's model diagnoses or fixes it while the checkout stays as it
         * failed, once per submission; otherwise, or without a lander definition, report it.
         */
        const handOver = async (
          reason: string,
          output: string,
          hint: string,
          failing: { base: string; conflict?: string; merging: string },
        ) => {
          const { onFailure, change } = fixed
            ? { onFailure: undefined, change: undefined }
            : await landerAgent(host, context)
          if (!onFailure || !change) {
            // Every attempt starts from a reset, cleaned checkout, so a failed abort cannot leak into the next one.
            await git(integration, 'merge', '--abort').catch(() => undefined)
            return fail(
              reason,
              output,
              fixed
                ? `The lander's fix (${fixed.commits.length} commit${fixed.commits.length === 1 ? '' : 's'}) did not land it either. ${hint}`
                : hint,
            )
          }
          const head = await git(integration, 'rev-parse', 'HEAD')
          const state = failing.conflict
            ? `Merging ${failing.conflict} into ${target} at ${head} stopped with conflicts; the merge is in progress.`
            : `HEAD ${head} is the merge of ${entry.tip} (#${entry.conversationId}) into ${target}, set up as the checks run it.`
          const prompt = [
            `[lander] Submission ${id} failed: ${reason}`,
            output,
            '',
            `Your checkout ${integration} is left as it failed. ${state}`,
            onFailure === 'fix'
              ? 'Mode: fix. Resolve or fix it here with the smallest change and commit it (Conventional Commits). Leave the checkout clean. Never push or touch other checkouts. Every check then runs again before it lands. If it cannot be fixed safely, change nothing and explain why.'
              : `Mode: diagnose. Explain the cause and the smallest fix for the submitter. Change nothing.`,
          ].join('\n')
          return runtime.commit(async (tx) => {
            const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
              (item) => item.id === id,
            )!
            saved.agent = onFailure
            saved.step = onFailure === 'fix' ? 'fixing' : 'diagnosing'
            await log(tx, runtime.conversationId, saved, { step: saved.step })
            // The definition as it is now: an edit applies to the next failure.
            await configure(tx, runtime.conversationId, change)
            return {
              status: 'running',
              checkpoint: {
                phase: 'agent',
                id,
                attempt,
                ...carry,
                failure: {
                  mode: onFailure,
                  reason,
                  ...(output ? { output } : {}),
                  ...(hint ? { hint } : {}),
                  base: failing.base,
                  head,
                  merging: failing.merging,
                  prompt,
                },
              },
            }
          }, context)
        }
        /** The model's run on a failure settled: report its diagnosis, or check its fix and run every check again. */
        const answered = async (handed: Failure) => {
          if (handed.unfinished) {
            await reset()
            return fail(
              `the lander's model did not finish (${handed.unfinished})`,
              [handed.reason, handed.output].filter(Boolean).join('\n'),
              handed.hint,
            )
          }
          if (handed.mode === 'diagnose') {
            await reset()
            return fail(handed.reason, handed.output, handed.hint, handed.answer)
          }
          const head = await git(integration, 'rev-parse', 'HEAD')
          const inspected = (await git(integration, 'status', '--porcelain'))
            ? 'left uncommitted changes'
            : (await git(integration, 'rev-parse', '-q', '--verify', 'MERGE_HEAD').then(
                  () => true,
                  () => false,
                ))
              ? 'left the merge unfinished'
              : head === handed.head
                ? 'added no commits'
                : !(await contains(integration, handed.head, head)) ||
                    !(await contains(integration, handed.merging, head))
                  ? 'did not build on the failed merge'
                  : ''
          // Decided once, before the cleanup changes what a replay would inspect: a reset keeps a fix's commits.
          const problem = await runtime.memo(`fix-verdict:${id}:${attempt}`, inspected, context)
          if (problem) {
            await reset()
            return fail(
              handed.reason,
              handed.output,
              `The lander's fix ${problem}. ${handed.hint ?? ''}`.trim(),
              handed.answer,
            )
          }
          const commits = lines(
            // A resolved conflict is one merge commit; its second parent's commits are the submission's own.
            await git(integration, 'log', '--oneline', '--first-parent', `${handed.head}..${head}`),
          )
          // The next attempt starts from the fixed commit, merges whatever it still lacks and runs every check.
          return runtime.commit(
            () => ({
              status: 'running',
              checkpoint: {
                phase: 'land',
                id,
                attempt: attempt + 1,
                ...(pushRetried ? { pushRetried } : {}),
                fixed: { commits, head },
              },
            }),
            context,
          )
        }
        const { source, target } = entry
        const checkContext = withAbortSignal(signal, context)
        /** Push `sha` when configured; on a rejection retry the integration once, then report it. */
        const push = async (settings: Settings, sha: string) => {
          if (!settings.push) return { text: 'Not pushed.' }
          await step(`pushing to ${settings.push}`)
          try {
            // Push the checked commit, not whatever the branch points to by now.
            await remote(source, signal, 'push', '-q', settings.push, `${sha}:refs/heads/${target}`)
            return {
              remote: `${settings.push}/${target}`,
              text: `Pushed to ${settings.push}/${target}.`,
            }
          } catch (error) {
            if (signal.aborted) throw error
            if (!pushRetried) return { retry: retry(true) }
            return { retry: fail(`${settings.push} rejected the push`, failure(error)) }
          }
        }
        /** Push what landed and report it: commits, flaky checks, push, restart hint. */
        const landedReport = async (settings: Settings, landed: Landed, sha: string) => {
          const pushed = await push(settings, sha)
          if (pushed.retry) return pushed.retry
          const needsRestart =
            (await realpath(source)) === (await realpath(host.ultimateRoot)) &&
            landed.paths.some((path) => /^(server|shared)\//.test(path))
          return finish(
            [summary(landed, sha), pushed.text, ...(needsRestart ? ['Needs restart.'] : [])].join(
              '\n',
            ),
            {
              ...landedOutcome(landed),
              ...(pushed.remote ? { pushed: pushed.remote } : {}),
              ...(needsRestart ? { needsRestart } : {}),
              ...(fixed ? { fixed: fixed.commits } : {}),
            },
          )
        }
        try {
          const settings = await landerSettings(host)
          if (task.state.checkpoint.failure) return await answered(task.state.checkpoint.failure)
          // An earlier lander task fast-forwarded this submission and then ended (a reload or fault before its push):
          // nothing to merge or check again, push exactly what landed and report that landing.
          if (
            entry.landed &&
            attempt === 1 &&
            !pushRetried &&
            (await contains(source, entry.landed.sha, `refs/heads/${target}`))
          )
            return await landedReport(settings, entry.landed, entry.landed.sha)
          // A crash after the checks keeps the integrated commit: go straight to fast-forwarding it.
          let prepared = await runtime.memo<Prepared>(`prepared:${id}:${attempt}`, context)
          if (!prepared) {
            // A crash after the merges resumes on the same merged commit instead of merging again.
            let merged = await runtime.memo<{ base: string; sha: string }>(
              `merged:${id}:${attempt}`,
              context,
            )
            const path = await checkout(
              source,
              merged?.sha ?? (await git(source, 'rev-parse', `refs/heads/${target}`)),
            )
            if (!merged) {
              await step('preparing')
              const base = await git(path, 'rev-parse', 'HEAD')
              /** Merge `commit` into the checkout; true when it conflicted and went to the lander's model. */
              const merge = async (
                commit: string,
                message: string,
                conflict: string,
                reason: string,
                hint: string,
              ) => {
                try {
                  await git(path, 'merge', '--no-edit', '-m', message, commit)
                  return false
                } catch {
                  await handOver(
                    reason,
                    await git(path, 'diff', '--name-only', '--diff-filter=U'),
                    hint,
                    { base, conflict, merging: commit },
                  )
                  return true
                }
              }
              // After a fix the attempt starts from it: onto an unmoved target this fast-forwards to the fixed commit.
              if (fixed) {
                if (
                  await merge(
                    fixed.head,
                    `Merge the lander's fix of ${id} into ${target}`,
                    `the lander's fix ${fixed.head}`,
                    `the lander's fix conflicts with ${target} in`,
                    `Merge ${target} into your workspace, resolve, verify and submit again.`,
                  )
                )
                  return
              }
              if (settings.push) {
                if (
                  await remote(path, signal, 'ls-remote', settings.push, `refs/heads/${target}`)
                ) {
                  await remote(path, signal, 'fetch', '-q', settings.push, target)
                  const fetched = await git(path, 'rev-parse', 'FETCH_HEAD')
                  if (!(await contains(path, fetched, 'HEAD'))) {
                    await step(`merging ${settings.push}/${target}`)
                    if (
                      await merge(
                        fetched,
                        `Merge ${settings.push}/${target}`,
                        `${settings.push}/${target} (${fetched})`,
                        `${settings.push}/${target} conflicts with local ${target} in`,
                        `Reconcile ${settings.push}/${target} with local ${target}, then submit again.`,
                      )
                    )
                      return
                  }
                }
              }
              await step('merging')
              if (
                await merge(
                  entry.tip,
                  `Merge ${entry.tip.slice(0, 7)} from #${entry.conversationId} into ${target}`,
                  `${entry.tip} (#${entry.conversationId})`,
                  `it conflicts with ${target} in`,
                  `Merge ${target} into your workspace, resolve, verify and submit again.`,
                )
              )
                return
              merged = await runtime.memo(
                `merged:${id}:${attempt}`,
                { base, sha: await git(path, 'rev-parse', 'HEAD') },
                context,
              )
            }
            const { base } = merged
            // Setup prepares the merged revision, for example installs its lockfile.
            await step('setting up')
            await setup(source, path, await host.projectSettings(), signal)
            const flaky: string[] = []
            for (const [position, group] of settings.checks.entries()) {
              const members = Array.isArray(group) ? group : [group]
              const commands = members.map((check) => check.command)
              const run = (command: string, member: number) =>
                runLanderCheck(
                  path,
                  command,
                  checkContext,
                  checkPids(host.home),
                  checkTemp(host.home),
                  limitsFor(members[member], limits),
                )
              /** One command: its first run, then one rerun when that failed; its output tail if it failed twice. */
              const settle = async (command: string, member: number) => {
                // Outcomes are durable (memos are first-writer-wins, so the rerun has its own key): a resume
                // neither reruns a passed check nor grants another rerun, and keeps the flaky note.
                const key = `check:${id}:${attempt}:${Array.isArray(group) ? `${position}.${member}` : position}`
                let first = await runtime.memo<'passed' | 'failed'>(key, context)
                if (!first) {
                  await step(`checking: ${command}`)
                  const began = performance.now()
                  const ran = await run(command, member)
                  const result = ran.failure === undefined ? 'passed' : 'failed'
                  // Logged before the memo: a crash in between reruns the check and logs it again, as it ran.
                  // A failure keeps its output tail, so a check that passes on its rerun can still be diagnosed.
                  await step(
                    `checked: ${command}`,
                    { command, result, ...(ran.summary ? { summary: ran.summary } : {}) },
                    ran.failure,
                    { ms: performance.now() - began, timedOut: ran.timedOut },
                  )
                  first = await runtime.memo(key, result, context)
                }
                if (first === 'passed') return {}
                // The rerun's outcome is durable either way: a resume while the group's other commands still run
                // neither grants a third run nor loses the failure.
                let rerun = await runtime.memo<{ failure?: string }>(`${key}:rerun`, context)
                if (!rerun) {
                  await step(`rerunning: ${command}`)
                  const began = performance.now()
                  const ran = await run(command, member)
                  const timing = { ms: performance.now() - began, timedOut: ran.timedOut }
                  if (ran.failure === undefined)
                    await step(
                      `checked: ${command}`,
                      {
                        command,
                        result: 'flaky',
                        ...(ran.summary ? { summary: ran.summary } : {}),
                      },
                      undefined,
                      timing,
                    )
                  else
                    await runtime.commit(async (tx) => {
                      await host.emit(tx, CheckRan, {
                        submission: id,
                        command,
                        result: ran.timedOut ? 'timeout' : 'failed',
                        ms: Math.round(timing.ms),
                      })
                    }, context)
                  rerun = await runtime.memo<{ failure?: string }>(
                    `${key}:rerun`,
                    ran.failure === undefined ? {} : { failure: ran.failure },
                    context,
                  )
                }
                return rerun.failure === undefined ? { flaky: true } : { failure: rerun.failure }
              }
              // Every command settles before a failure hands over, so none still runs in the checkout.
              const settled = await Promise.allSettled(commands.map(settle))
              const results = settled.map((outcome) => {
                if (outcome.status === 'rejected') throw outcome.reason
                return outcome.value
              })
              const failed = results.findIndex((result) => result.failure !== undefined)
              if (failed !== -1)
                return handOver(
                  `check failed twice: ${commands[failed]}`,
                  results[failed].failure!,
                  'Fix it, verify and submit again.',
                  { base, merging: entry.tip },
                )
              flaky.push(...commands.filter((_command, member) => results[member].flaky))
            }
            // Only the commit every check ran on lands: nothing may have moved or touched the checkout meanwhile.
            if (
              (await git(path, 'rev-parse', 'HEAD')) !== merged.sha ||
              (await git(path, 'status', '--porcelain'))
            )
              return await fail(
                'the integration checkout changed during checks',
                `${await git(path, 'log', '--oneline', '-3')}\n${await git(path, 'status', '--short')}`.trim(),
                'Submit again.',
              )
            prepared = await runtime.memo<Prepared>(
              `prepared:${id}:${attempt}`,
              { base, integrated: merged.sha, flaky },
              context,
            )
          }
          const { base, integrated, flaky } = prepared
          await step('fast-forwarding')
          let refused: string | undefined
          const moved = await serial(source, async () => {
            const current = await git(source, 'rev-parse', `refs/heads/${target}`)
            // A replay after the fast-forward finds exactly the integrated commit; anything else moved.
            if (current === integrated) return false
            if (current !== base) return true
            try {
              // Fast-forward the checkout that has the target checked out, so its files follow the branch.
              const worktree = (await git(source, 'worktree', 'list', '--porcelain'))
                .split('\n\n')
                .map((record) => record.split('\n'))
                .find((record) => record.includes(`branch refs/heads/${target}`))?.[0]
                .slice('worktree '.length)
              if (worktree) await git(worktree, 'merge', '-q', '--ff-only', integrated)
              else await git(source, 'update-ref', `refs/heads/${target}`, integrated, base)
            } catch (error) {
              refused = failure(error)
            }
            return false
          })
          if (refused)
            return fail(
              `the checkout of ${target} refused the fast-forward to ${integrated.slice(0, 7)}`,
              refused,
            )
          if (moved) {
            if (attempt < attempts) return retry()
            return fail(`${target} kept moving during ${attempts} attempts.`)
          }
          // The first fast-forward decides what the submission landed, durably on its queue entry with the target's
          // new tip, so any later lander task reports that landing; a push retry integrates again from there.
          const candidate: Landed = {
            sha: integrated,
            base,
            commits: lines(await git(source, 'log', '--oneline', `${base}..${integrated}`)),
            paths: lines(await git(source, 'diff', '--name-only', base, integrated)),
            flaky,
          }
          let landed = candidate
          await runtime.commit(async (tx) => {
            const draft = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
            const saved = draft.queue.find((item) => item.id === id)!
            saved.landed ??= candidate
            // A copy: the draft is gone once the commit settles.
            landed = copyJson(saved.landed) as Landed
            draft.items[String(entry.conversationId)].landed = integrated
          }, context)
          return await landedReport(settings, landed, integrated)
        } catch (error) {
          if (signal.aborted) throw error
          return fail('it failed', failure(error))
        }
      },
      agent: async (task, runtime, context) => {
        const { id, failure: handed } = task.state.checkpoint
        const index = (await runtime.snapshot(Workspaces, ROOT_CONVERSATION_ID, context))!
        const entry = index.queue.find((item) => item.id === id)!
        const ask: LanderAsk = {
          submission: id,
          conversationId: entry.conversationId,
          tip: entry.tip,
          target: entry.target,
          at: Date.now(),
          mode: handed.mode,
          reason: handed.reason,
        }
        const conversation = (await runtime.conversation(runtime.conversationId, context))!
        // One request per submission and attempt: a resume waits for the same run.
        const settled = await (
          await conversation.submit(
            {
              type: 'input',
              content: handed.prompt,
              entry: { kind: LanderAskEntry, data: ask },
              whenBusy: 'followUp',
              requestId: `lander-agent:${id}:${task.state.checkpoint.attempt}`,
            },
            context,
          )
        ).wait(context)
        const outcome: Pick<Failure, 'answer' | 'unfinished'> =
          settled.status === 'done' && settled.type === 'input'
            ? {
                answer: textOf(
                  (await runtime.entry(AssistantEntry, settled.answer, context))?.model?.[0],
                ),
              }
            : { unfinished: settled.status === 'unanswered' ? settled.reason : settled.status }
        await runtime.commit(async (tx) => {
          const saved = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).queue.find(
            (item) => item.id === id,
          )!
          delete saved.agent
          return {
            status: 'running',
            checkpoint: {
              ...task.state.checkpoint,
              phase: 'land',
              failure: { ...handed, ...outcome },
            },
          }
        }, context)
      },
      report: async (task, runtime, context) => {
        const { id, conversationId, text } = task.state.checkpoint
        let { outcome } = task.state.checkpoint
        let deployText = ''
        if (outcome?.outcome === 'landed') {
          const index = await host.harness().snapshot(Workspaces, ROOT_CONVERSATION_ID, context)
          const result = index?.results[id]
          const saved = result?.steps.find(
            (row) => row.step.startsWith('deploy → ') || row.step.startsWith('deploy warning: '),
          )
          if (saved) deployText = saved.step
          else {
            const { deploy } = await landerSettings(host)
            const paths = (result?.paths ?? []).filter((path) =>
              deploy?.paths.some((prefix) => path.startsWith(prefix)),
            )
            if (deploy && result && paths.length) {
              const messages = host.want(Handoff)
              const definitions = await discoverAgents(
                host.ultimateRoot,
                host.projectRoot,
                host.userHome,
                host.modelRuntime,
              )
              if (
                !messages ||
                !definitions.definitions.some(
                  (definition) => definition.name === deploy.agent && definition.resident,
                )
              ) {
                deployText = `deploy warning: @${deploy.agent} is not a standing agent${messages ? '' : ' (messages unavailable)'}`
                host.notice(deployText)
              } else {
                try {
                  await messages.send(
                    runtime.conversationId,
                    {
                      to: `@${deploy.agent}`,
                      reply: false,
                      text: [
                        `Please deploy landed commit ${result.sha}.`,
                        `Commits:\n${(result.commits ?? []).join('\n')}`,
                        `Matching paths:\n${paths.join('\n')}`,
                        `Pushed: ${result.pushed ?? 'no'}.`,
                        `Submitter: #${conversationId}. Report the deployment outcome to #${conversationId} with a one-way message.`,
                      ].join('\n'),
                    },
                    `lander-deploy:${id}`,
                    context,
                  )
                  deployText = `deploy → @${deploy.agent}`
                } catch (error) {
                  // The submission has landed; a failed handoff (no subagents service, a broken standing
                  // conversation) is a warning on the report, never a stop. Cancellation still stops the phase.
                  context.abortSignal?.throwIfAborted()
                  deployText = `deploy warning: handoff to @${deploy.agent} failed: ${error instanceof Error ? error.message : String(error)}`
                  host.notice(deployText)
                }
              }
              await runtime.commit(async (tx) => {
                const current = (await tx.doc(Workspaces, ROOT_CONVERSATION_ID)).results[id]
                await log(
                  tx,
                  runtime.conversationId,
                  { ...current, id, conversationId },
                  {
                    step: deployText,
                  },
                )
                return { status: 'running', checkpoint: task.state.checkpoint }
              }, context)
            }
          }
        }
        if (deployText)
          outcome = (await host.harness().snapshot(Workspaces, ROOT_CONVERSATION_ID, context))
            ?.results[id]
        await (
          await runtime.conversation(conversationId as ConversationId, context)
        )?.submit(
          {
            type: 'input',
            content: [text, deployText].filter(Boolean).join('\n'),
            ...(outcome
              ? { entry: { kind: 'workspaces.lander-report', data: { id, outcome } } }
              : {}),
            whenBusy: 'followUp',
            requestId: `lander:${id}`,
          },
          context,
        )
        await runtime.commit(() => ({ status: 'running', checkpoint: { phase: 'next' } }), context)
      },
    },
    abort: (task, runtime, context) =>
      runtime.commit(async (tx) => {
        const index = await tx.doc(Workspaces, ROOT_CONVERSATION_ID)
        if (index.landers[task.input.source] === task.id) delete index.landers[task.input.source]
        for (const item of index.queue)
          if (item.source === task.input.source) {
            item.state = 'queued'
            delete item.step
            delete item.agent
          }
        return { status: 'terminal', outcome: { status: 'aborted' } }
      }, context),
  })
  return Lander
}
