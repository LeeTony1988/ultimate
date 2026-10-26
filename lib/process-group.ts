import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcessByStdio, SpawnOptions } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { constants as osConstants } from 'node:os'
import { dirname, join } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { identifyWindows, spawnWindowsGroup, stopWindowsJob } from './windows-process-group.ts'

/** The program cannot start until its pid is recorded; a parent that dies before go gives EOF instead. */
export const handshake = 'read -r _ || exit 1; exec "$0" "$@"'

export type GroupProcess = ChildProcessByStdio<Writable, Readable, Readable>
/**
 * An owned process container. `ended` resolves after its leader and descendants have exited. `closed` resolves when its
 * output pipes have closed.
 */
export type Group = {
  child: GroupProcess
  ended: Promise<boolean>
  closed: Promise<void>
  /** Send an orderly stop request to a Windows job owner. */
  stop?: () => boolean
  /** Force-close a Windows job owner after an orderly stop request timed out. */
  force?: () => void
  /** Windows runner process creation time, used to avoid removing a newer owner's pid file. */
  start?: string
}

/**
 * Signalling an owned container needs positive evidence that it is ours: on POSIX its leader is unreaped, or a pid file
 * records the leader's start time; on Windows the runner's creation time must match. The POSIX group id stays ours while
 * it has members; on Windows the launcher owns a Job Object that contains the target and its descendants.
 */

/** Who process `pid` is, the same on every read while it lives (its start time), or undefined once it is gone. */
function identify(pid: number): string | undefined {
  if (process.platform === 'win32') return identifyWindows(pid)
  if (process.platform === 'darwin') {
    try {
      return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim()
    } catch {
      // ps exits 1 when the pid is gone.
      return undefined
    }
  }
  let stat: string
  try {
    stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  // Field 22 is the start time in ticks since boot; the name before it may hold spaces. The boot id tells boots apart.
  const ticks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  return `${readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${ticks}`
}

/** Whether any process of group `pid` still exists. */
export function groupAlive(pid?: number) {
  if (!pid) return false
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

/** Like `groupAlive`, but a member this process may not probe (EPERM) counts as alive. */
function probe(pid: number) {
  try {
    return groupAlive(pid)
  } catch (error) {
    // A member of another user survived, so the group is still there.
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return true
    throw error
  }
}

function send(pid: number, name: NodeJS.Signals) {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, name)
  } catch (error) {
    // The group may empty between the check and the signal.
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

/** `promise`'s value, or undefined when it takes longer than `ms`. */
function within<T>(promise: Promise<T>, ms: number) {
  const timer = new AbortController()
  return Promise.race([
    promise,
    sleep(ms, undefined, { signal: timer.signal }).catch(
      // Aborted once `promise` settled first; the race already has its value.
      () => undefined,
    ),
  ]).finally(() => timer.abort())
}

/** Poll group `pid` until it is empty or `ms` passed; whether it is empty. */
async function gone(pid: number, ms: number) {
  const deadline = Date.now() + ms
  while (groupAlive(pid) && Date.now() < deadline) await sleep(20)
  return !groupAlive(pid)
}

/** Stop an owned POSIX container, verified ours just now: TERM, KILL after `grace` ms. */
async function drain(pid: number, grace: number) {
  send(pid, 'SIGTERM')
  if (await gone(pid, grace)) return true
  send(pid, 'SIGKILL')
  return gone(pid, 3000)
}

/**
 * Start `program` inside an owned process container, held behind a handshake until `pidFile` (when given) records the
 * runner. POSIX uses a shell leader and process group; Windows delegates to its Job Object runner. A failed pid write
 * closes the handshake and the target never runs.
 */
export function spawnGroup(
  program: string,
  args: string[],
  options: Omit<SpawnOptions, 'detached' | 'stdio'> & { pidFile?: string; grace?: number },
): Group {
  const { pidFile, grace = 3000, ...rest } = options
  if (process.platform === 'win32')
    return spawnWindowsGroup(program, args, { ...rest, grace }, pidFile)
  const child = spawn('/bin/sh', ['-c', handshake, program, ...args], {
    ...rest,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdin.on('error', () => {
    // A process that exits before reading go closes the pipe; its exit reports what happened.
  })
  const left = new Promise<boolean>((resolve, reject) => {
    child.once('error', () => resolve(false))
    // Checked in the same tick as the leader's reaping, so a group still there is ours. A member this process may not
    // probe (EPERM) must not throw inside the listener.
    child.once('exit', () => {
      try {
        resolve(groupAlive(child.pid))
      } catch (error) {
        reject(error)
      }
    })
  })
  const ended = left
    .then((remains) => !remains || drain(child.pid!, grace))
    .catch(
      // A member this process may not signal survived; stopGroup reports that the group did not exit.
      () => false,
    )
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
  if (child.pid === undefined) return { child, ended, closed }
  try {
    if (pidFile) {
      writeFileSync(`${pidFile}.start`, `${identify(child.pid)}\n`)
      writeFileSync(pidFile, `${child.pid}\n`)
    }
  } catch (error) {
    child.stdin.end()
    throw error
  }
  child.stdin.end('\n')
  return { child, ended, closed }
}

/** A file's trimmed text, or undefined when there is none. */
async function text(path: string) {
  try {
    return (await readFile(path, 'utf8')).trim()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** The pid a pid file names, or undefined when there is none. Its leader's start time sits next to it, in `.start`. */
export async function readPidFile(path: string) {
  const value = await text(path)
  if (value === undefined) return undefined
  const pid = Number(value)
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error(`Invalid pid file ${path}`)
  return pid
}

/**
 * Stop the owned container `pid` and wait until nothing of it is left; rejects when cleanup does not finish.
 * - With `leader`, it is a container started by this process and may be signalled while its launcher is unreaped.
 * - Otherwise `pidFile` must name `pid` and record its process start time; a recycled pid is never signalled. Windows
 *   records must include a start time.
 *
 * The pid file is removed once the group is gone, unless it names another process by then.
 */
export async function stopGroup(
  pid: number,
  options: { pidFile?: string; leader?: Group; grace?: number } = {},
) {
  const { pidFile, leader, grace = 3000 } = options
  const unreaped = () => leader!.child.exitCode === null && leader!.child.signalCode === null
  if (leader) {
    if (unreaped()) {
      if (process.platform === 'win32' && leader.stop) leader.stop()
      else send(pid, 'SIGTERM')
      const stopped = await within(leader.ended, grace)
      if (stopped === undefined && unreaped()) {
        if (process.platform === 'win32' && leader.force) leader.force()
        else send(pid, 'SIGKILL')
      }
    }
    // After KILL, the leader's exit drains the rest of a POSIX group; the Windows runner waits for its Job Object.
    const ended = await within(leader.ended, grace + 3500)
    if (process.platform === 'win32' && ended !== true)
      throw new Error(`Process group ${pid} did not exit`)
    if (ended !== true && (unreaped() || probe(pid)))
      throw new Error(`Process group ${pid} did not exit`)
  } else {
    const recorded = pidFile && (await readPidFile(pidFile)) === pid
    const start = recorded ? await text(`${pidFile}.start`) : undefined
    const ours =
      recorded &&
      (process.platform === 'win32'
        ? start !== undefined && identify(pid) === start
        : start === undefined
          ? identify(pid) !== undefined && groupAlive(pid)
          : identify(pid) === start)
    if (ours) {
      if (process.platform === 'win32') {
        const recordedJob = pidFile && (await text(`${pidFile}.job`))
        if (!recordedJob || !/^Local\\UltimateProcessGroup-[0-9a-f-]+$/i.test(recordedJob))
          throw new Error(`Process group ${pid} is missing a valid Windows job record`)
        if (!stopWindowsJob(recordedJob, grace) && identify(pid) === start) send(pid, 'SIGKILL')
      }
      const stopped =
        process.platform === 'win32' ? await gone(pid, grace + 3000) : await drain(pid, grace)
      if (!stopped) throw new Error(`Process group ${pid} did not exit`)
    }
    if (
      pidFile &&
      (await readPidFile(pidFile)) === pid &&
      (process.platform !== 'win32' || (await text(`${pidFile}.start`)) === start)
    ) {
      await rm(`${pidFile}.start`, { force: true })
      await rm(`${pidFile}.job`, { force: true })
      await rm(pidFile, { force: true })
    }
    return
  }
  if (pidFile && (await readPidFile(pidFile)) === pid) {
    const ownsFile =
      process.platform !== 'win32' ||
      (leader.start !== undefined && (await text(`${pidFile}.start`)) === leader.start)
    if (ownsFile) {
      await rm(`${pidFile}.start`, { force: true })
      await rm(`${pidFile}.job`, { force: true })
      await rm(pidFile, { force: true })
    }
  }
}

/**
 * Wait until `group`'s output pipes close. A process outside the group (`setsid`) can hold them open forever, so after
 * `ms` they are closed from this end.
 */
export async function closeOutput(group: Pick<Group, 'child' | 'closed'>, ms = 1000) {
  if (
    (await within(
      group.closed.then(() => true),
      ms,
    )) === undefined
  ) {
    // The leader may still run after a failed stop; 'close' then waits for its exit, so do not await it.
    group.child.stdout.destroy()
    group.child.stderr.destroy()
  }
}

/**
 * Run `program` as a recorded process group to its end and resolve its exit code (128 + signal number when a signal
 * ended it). A `signal` aborted before the start runs nothing; an abort later stops the group. Nothing of the group
 * outlives the run, and the pid file goes with it.
 */
export async function runGroup(
  program: string,
  args: string[],
  options: {
    cwd: string
    pidFile: string
    env?: NodeJS.ProcessEnv
    signal?: AbortSignal
    grace?: number
    onOutput: (text: string) => void
  },
) {
  const { signal, grace, onOutput, ...spawnOptions } = options
  await mkdir(dirname(options.pidFile), { recursive: true })
  signal?.throwIfAborted()
  const group = spawnGroup(program, args, { ...spawnOptions, grace })
  const { child } = group
  const exited = new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, name) =>
      resolve(code ?? (name ? 128 + (osConstants.signals[name] ?? 0) : 1)),
    )
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', onOutput)
  }
  const stop = () =>
    child.pid === undefined
      ? Promise.resolve()
      : stopGroup(child.pid, { pidFile: options.pidFile, leader: group, grace })
  // A stop that fails while the leader still runs ends the run at once.
  const failure = Promise.withResolvers<never>()
  const halt = () => {
    stop().catch(failure.reject)
  }
  signal?.addEventListener('abort', halt, { once: true })
  try {
    const code = await Promise.race([exited, failure.promise])
    await stop()
    return code
  } finally {
    signal?.removeEventListener('abort', halt)
    await closeOutput(group)
  }
}

/** Stop every group a `*.pid` file in `directory` names, except files `keep` accepts: what a crash left behind. */
export async function sweepPidFiles(
  directory: string,
  keep: (name: string) => boolean = () => false,
) {
  let names: string[]
  try {
    names = await readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const name of names.filter((file) => file.endsWith('.pid') && !keep(file))) {
    const pidFile = join(directory, name)
    const pid = await readPidFile(pidFile)
    if (pid) await stopGroup(pid, { pidFile })
  }
}
