import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { withAbortSignal } from '@earendil-works/chord/context'
import { afterEach, expect, it, vi } from 'vitest'
import { context } from '../server/harness.ts'
import { runGroup } from '../lib/process-group.ts'
import {
  checkTemp,
  landerSettings,
  limitsFor,
  removeCheckTemp,
  runLanderCheck as run,
  sweepChecks,
} from '../extensions/workspaces/lander.ts'

vi.mock('../lib/process-group.ts', () => ({
  runGroup: vi.fn<typeof runGroup>(),
  // The sweep kills the process groups a crashed host left; these tests only care about its directory cleanup.
  sweepPidFiles: vi.fn<(directory: string, owned: (name: string) => boolean) => Promise<void>>(
    async () => undefined,
  ),
}))
// Wrap `rm` so a test can make removing a check's temp directory fail; every other call reaches the real one.
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, rm: vi.fn<typeof fs.rm>(fs.rm) }
})
const runLanderCheck = (
  path: string,
  command: string,
  ctx: typeof context,
  limits?: Parameters<typeof run>[5],
) => run(path, command, ctx, tmpdir(), tmpdir(), limits)

afterEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
})

/** A check that prints `line` every `outputEvery` ms until it is stopped, then exits from SIGKILL. */
function hanging(outputEvery?: number, line = 'progress\n') {
  vi.useFakeTimers()
  vi.mocked(runGroup).mockImplementation(async (_program, _args, options) => {
    const timer = outputEvery ? setInterval(() => options.onOutput(line), outputEvery) : undefined
    // Like runGroup, a signal that aborted before the start stops the run at once.
    if (!options.signal!.aborted)
      await new Promise<void>((resolve) =>
        options.signal!.addEventListener('abort', () => resolve(), { once: true }),
      )
    clearInterval(timer)
    return 137
  })
}

it('stops a silent check at the stall limit', async () => {
  hanging()
  const ran = runLanderCheck('.', 'sleep', context, { stall: 0.1, total: 0.3 })
  await vi.advanceTimersByTimeAsync(100)
  expect((await ran).failure).toContain('Stalled: no output for')
  expect(vi.getTimerCount()).toBe(0)
})

it('resets the stall timer on output but stops continuous output at the total limit', async () => {
  hanging(50)
  const ran = runLanderCheck('.', 'print', context, { stall: 0.1, total: 0.3 })
  await vi.advanceTimersByTimeAsync(300)
  expect((await ran).failure).toMatch(/^Timed out after 0.3 s\nprogress/)
  expect(vi.getTimerCount()).toBe(0)
})

it('defaults to a 2-minute stall and a 10-minute total cap', async () => {
  hanging()
  const silent = runLanderCheck('.', 'sleep', context)
  await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
  expect((await silent).failure).toBe('Stalled: no output for 2 min, stopped')
  hanging(60 * 1000)
  const printing = runLanderCheck('.', 'print', context)
  await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
  expect((await printing).failure).toMatch(/^Timed out after 10 min\nprogress/)
  expect(vi.getTimerCount()).toBe(0)
})

it('stops a printing check at its own timeout, not the default cap', async () => {
  hanging(10 * 1000)
  const limits = limitsFor({ command: 'pnpm test', timeout: 120 }, { stall: 120, total: 600 })
  expect(limits).toEqual({ stall: 120, total: 120 })
  const ran = runLanderCheck('.', 'pnpm test', context, limits)
  await vi.advanceTimersByTimeAsync(119 * 1000)
  expect(vi.getTimerCount()).toBeGreaterThan(0)
  await vi.advanceTimersByTimeAsync(1000)
  expect((await ran).failure).toMatch(/^Timed out after 2 min\n/)
  // A short timeout also caps the stall limit, and a check without one keeps the defaults.
  expect(limitsFor({ command: 'x', timeout: 30 }, { stall: 120, total: 600 })).toEqual({
    stall: 30,
    total: 30,
  })
  expect(limitsFor({ command: 'x' }, { stall: 120, total: 600 })).toEqual({
    stall: 120,
    total: 600,
  })
})

it('lets a check raise its no-output limit with `stall`, and keeps a silent one running past the default', async () => {
  // The shape this host needed: a suite that goes quiet for minutes is not stalled, so `stall` may lengthen the wait.
  expect(
    limitsFor({ command: 'pnpm test', timeout: 600, stall: 300 }, { stall: 120, total: 600 }),
  ).toEqual({ stall: 300, total: 600 })
  hanging()
  const ran = runLanderCheck(
    '.',
    'pnpm test',
    context,
    limitsFor({ command: 'pnpm test', stall: 0.3 }, { stall: 0.1, total: 0.5 }),
  )
  // Past the default 0.1 s silence limit, still running; stopped only at its own 0.3 s.
  await vi.advanceTimersByTimeAsync(200)
  expect(vi.getTimerCount()).toBeGreaterThan(0)
  await vi.advanceTimersByTimeAsync(100)
  expect((await ran).failure).toContain('Stalled: no output for 0.3 s')
  expect(vi.getTimerCount()).toBe(0)
})

it('never lets `stall` outlast the total: a larger stall is clamped, not honoured', async () => {
  // A settings value must not hold a check open past the time it is allowed.
  expect(
    limitsFor({ command: 'pnpm test', timeout: 30, stall: 300 }, { stall: 120, total: 600 }),
  ).toEqual({ stall: 30, total: 30 })
  expect(limitsFor({ command: 'pnpm test', stall: 900 }, { stall: 120, total: 600 })).toEqual({
    stall: 600,
    total: 600,
  })
  // And a check that sets neither keeps today's default exactly.
  expect(limitsFor({ command: 'x' }, { stall: 120, total: 600 })).toEqual({
    stall: 120,
    total: 600,
  })
  // A short `timeout` still caps the default stall for a check that sets no `stall`.
  expect(limitsFor({ command: 'x', timeout: 30 }, { stall: 120, total: 600 })).toEqual({
    stall: 30,
    total: 30,
  })
  // End to end: the clamped total stops a silent check at 0.2 s, not at its 10 s stall.
  hanging()
  const ran = runLanderCheck(
    '.',
    'pnpm test',
    context,
    limitsFor({ command: 'pnpm test', timeout: 0.2, stall: 10 }, { stall: 120, total: 600 }),
  )
  await vi.advanceTimersByTimeAsync(200)
  // The stall limit was clamped down to the total, so the no-output limit fires first, at 0.2 s.
  expect((await ran).failure).toMatch(/^Stalled: no output for 0.2 s/)
  expect(vi.getTimerCount()).toBe(0)
})

it('names the tests that failed before the watchdog fired, even when they left the tail', async () => {
  hanging(
    10,
    ' \u001b[31mFAIL\u001b[39m  test/cloud-lease.test.ts > hangs on a lease\n' +
      'noise\n'.repeat(600),
  )
  const ran = runLanderCheck('.', 'pnpm test', context, { stall: 1, total: 0.05 })
  await vi.advanceTimersByTimeAsync(50)
  const failure = (await ran).failure!
  expect(failure).toMatch(
    /^Timed out after 0.05 s\nFailed tests so far:\nFAIL {2}test\/cloud-lease.test.ts > hangs on a lease\nnoise/,
  )
  expect(failure.match(/FAIL/g)).toHaveLength(1)
})

const settings = (checks: unknown) =>
  landerSettings({
    projectSettings: async () => ({ lander: { checks } }) as never,
    notice: () => {},
  })

it('reads plain commands and commands with their own limits from settings', async () => {
  expect(
    (
      await settings([
        'pnpm check',
        [{ command: 'pnpm test', timeout: 600, stall: 300 }, 'pnpm test:e2e'],
        { command: 'pnpm build', timeout: 60 },
      ])
    ).checks,
  ).toEqual([
    { command: 'pnpm check' },
    [{ command: 'pnpm test', timeout: 600, stall: 300 }, { command: 'pnpm test:e2e' }],
    { command: 'pnpm build', timeout: 60 },
  ])
  for (const invalid of [
    [{ command: 'pnpm test', timeout: 0 }],
    [{ command: 'pnpm test', timeout: '2m' }],
    [{ command: 'pnpm test', stall: 0 }],
    [{ command: 'pnpm test', stall: -1 }],
    [{ command: 'pnpm test', stall: '5m' }],
    [{ timeout: 60 }],
    [[]],
    'pnpm test',
  ])
    await expect(settings(invalid)).rejects.toThrow('lander.checks must be')
})

it('removes a check temp directory, and stays quiet when it cannot', async () => {
  // Windows EBUSY: a child still holding a file. Throwing here would replace the result the run just decided.
  const dir = await mkdtemp(join(tmpdir(), 'lander-clean-'))
  await writeFile(join(dir, 'left'), '')
  // A path inside a regular file is not a directory `rm` can remove; the call must resolve, not reject.
  const file = join(dir, 'plain')
  await writeFile(file, '')
  await expect(removeCheckTemp(join(file, 'tmp'))).resolves.toBeUndefined()
  // And a directory it can remove is gone afterwards.
  await expect(removeCheckTemp(dir)).resolves.toBeUndefined()
  await expect(access(dir)).rejects.toThrow('ENOENT')
})

it('sweeps the stale check directories past one it cannot remove', async () => {
  // A live check of this process keeps its own; the others are swept, and one held by a child (EBUSY on Windows) must
  // not abort the sweep of the rest. A leftover *file* where a directory is expected is the removable-failure stand-in.
  const home = await mkdtemp(join(tmpdir(), 'lander-sweep-'))
  const temp = checkTemp(home)
  await mkdir(temp, { recursive: true })
  await mkdir(join(temp, `${process.pid}-live`))
  await mkdir(join(temp, 'stale-a'))
  await mkdir(join(temp, 'stale-b'))
  await expect(sweepChecks(home)).resolves.toBeUndefined()
  expect((await readdir(temp)).toSorted()).toEqual([`${process.pid}-live`])
})

it('preserves task cancellation instead of reporting a watchdog failure', async () => {
  hanging()
  const controller = new AbortController()
  const ran = runLanderCheck('.', 'sleep', withAbortSignal(controller.signal, context))
  controller.abort(new Error('task cancelled'))
  await expect(ran).rejects.toThrow('task cancelled')
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps successful summaries and clears both timers', async () => {
  vi.useFakeTimers()
  vi.mocked(runGroup).mockImplementation(async (_program, _args, options) => {
    options.onOutput('first\nlast\n')
    return 0
  })
  expect(await runLanderCheck('.', 'print', context)).toEqual({ summary: 'last' })
  expect(vi.getTimerCount()).toBe(0)
})

it('gives each check its own TMPDIR in the given directory and removes it afterwards', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'lander-tmp-'))
  let seen: string | undefined
  vi.mocked(runGroup).mockImplementation(async (_program, _args, options) => {
    seen = options.env?.TMPDIR
    await writeFile(join(seen!, 'left'), '')
    return 1
  })
  await run('.', 'pnpm test', context, tmpdir(), temp)
  expect(seen && dirname(seen)).toBe(temp)
  expect(await readdir(temp)).toEqual([])
})

it('keeps a watchdog result when the check temp cannot be removed, and reports the path', async () => {
  // Windows EBUSY made the cleanup throw and replaced "Timed out after 10 min" with a bare "it failed".
  const temp = await mkdtemp(join(tmpdir(), 'lander-tmp-'))
  hanging()
  const reported: { path: string; error: unknown }[] = []
  vi.mocked(rm).mockRejectedValueOnce(
    Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' }),
  )
  const ran = run(
    '.',
    'pnpm test',
    context,
    tmpdir(),
    temp,
    { stall: 0.1, total: 0.3 },
    (failure) => reported.push(failure),
  )
  await vi.advanceTimersByTimeAsync(100)
  expect((await ran).failure).toBe('Stalled: no output for 0.1 s, stopped')
  expect(reported).toHaveLength(1)
  expect(reported[0].path).toContain('lander-tmp-')
  expect(String(reported[0].error)).toContain('EBUSY')
})
