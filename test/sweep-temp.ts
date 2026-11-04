import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { alive } from '../server/lock.ts'

/** Each test file's temporary directory, named after the worker that owns it so a later run can tell it is stale. */
export const testTempPrefix = 'ultimate-test-temp-'

/**
 * Remove the temporary directories of test workers that are gone: a run that was interrupted (Ctrl-C, a killed
 * lander check, a teardown timeout) never reaches its `afterAll`, and the leftovers filled the machine's `/tmp`.
 *
 * One that cannot be removed is left for a later run. On Windows a dead run can still hold a handle — an orphaned
 * `git receive-pack` or a hook its push left behind — so `rmSync` throws EPERM. Failing this sweep must never fail the
 * run that is starting: it runs as a `globalSetup`, where the throw aborted collection for the whole suite and
 * surfaced as an unrelated error in Vite's source-map remapping.
 */
export default function sweep() {
  for (const name of readdirSync(tmpdir())) {
    const pid = Number(/^ultimate-test-temp-(\d+)-/.exec(name)?.[1])
    if (!pid || alive(pid)) continue
    try {
      rmSync(join(tmpdir(), name), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    } catch {
      // Still held; a later run sweeps it once the dead owner's handles are gone.
    }
  }
}
