import { execFileSync } from 'node:child_process'

/** A killed orphan may stay a zombie until init reaps it. */
export function running(pid: number) {
  try {
    const state = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
    }).trim()
    return state !== '' && !state.startsWith('Z')
  } catch (error) {
    // ps exits 1 when the pid is gone.
    if ((error as { status?: number }).status === 1) return false
    throw error
  }
}
