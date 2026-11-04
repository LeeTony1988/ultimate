import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { exec } from './exec.ts'

/** Where and how long a git command runs; defaults: 30 seconds, 1 MiB of output. `timeout: 0` waits indefinitely. */
export type GitOptions = { cwd: string; timeout?: number; maxBuffer?: number; signal?: AbortSignal }

/** Run git in `cwd` and return its trimmed stdout; a failure rejects with execFile's error, stderr in its message. */
export async function git(cwd: string | GitOptions, ...args: string[]) {
  const options = typeof cwd === 'string' ? { cwd } : cwd
  const { stdout } = await exec('git', args, { timeout: 30000, maxBuffer: 1024 * 1024, ...options })
  return stdout.trim()
}

/** Run git and split its NUL-separated output (`-z`), which keeps paths verbatim instead of quoting them. */
async function nulSeparated(cwd: string, args: string[]) {
  const { stdout } = await exec('git', args, {
    cwd,
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
  })
  return stdout.split('\0').filter(Boolean)
}

/**
 * The paths `cwd` holds uncommitted work in: staged, unstaged and untracked files, and both sides of a rename, as
 * `git status --porcelain` prints them from the repository root.
 */
export async function uncommittedPaths(cwd: string) {
  const fields = await nulSeparated(cwd, ['status', '--porcelain', '-z', '--untracked-files=all'])
  const found: string[] = []
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]
    // `XY path`; a rename or copy is followed by its source path, bare.
    found.push(field.slice(3))
    if (field[0] === 'R' || field[0] === 'C') found.push(fields[++index])
  }
  return found
}

/** The paths `from..to` changes; `--no-renames` lists both sides of a rename, as a fast-forward writes both. */
export const changedPaths = (cwd: string, from: string, to: string) =>
  nulSeparated(cwd, ['diff', '--name-only', '--no-renames', '-z', from, to])

/** Uncommitted work a fast-forward must not touch: `FastForwardError.overlap` names the paths it refused to change. */
export class FastForwardError extends Error {
  readonly overlap: string[]
  constructor(message: string, overlap: string[]) {
    super(message)
    this.name = 'FastForwardError'
    this.overlap = overlap
  }
}

/** SHA-256 of every one of `paths` that is a file now; a path gone or not a file is absent. */
async function hashes(cwd: string, paths: readonly string[]) {
  const found: Record<string, string> = {}
  for (const path of paths) {
    const file = join(cwd, path)
    if (
      !(await stat(file).then(
        (stats) => stats.isFile(),
        () => false,
      ))
    )
      continue
    found[path] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex')
  }
  return found
}

/**
 * Fast-forward `cwd` from `from` to `to` and return the uncommitted paths whose content changed anyway.
 *
 * Git refuses a fast-forward that would overwrite a modified path, but not one whose staged content already equals
 * what arrives: the checkout ends up clean and the commit carries work nobody made in it, which is how an unrelated
 * working-tree edit once landed inside someone else's commit under a message saying it had not. So no path the landing
 * changes may hold uncommitted work at all (`FastForwardError`). Every dirty file is then compared by content around
 * the fast-forward as well, for work `status` does not report; a fast-forward that already ran cannot be undone, so
 * that comparison is returned rather than thrown.
 */
export async function fastForward(cwd: string, from: string, to: string) {
  // Paths from `git diff` and `git status` are relative to the repository root, so both must run from it.
  const root = await git(cwd, 'rev-parse', '--show-toplevel')
  const landing = new Set(await changedPaths(root, from, to))
  const dirty = await uncommittedPaths(root)
  const overlap = dirty.filter((path) => landing.has(path))
  if (overlap.length)
    throw new FastForwardError(
      `uncommitted work in paths the fast-forward would change:\n${overlap.join('\n')}`,
      overlap,
    )
  const before = await hashes(root, dirty)
  await git(root, 'merge', '-q', '--ff-only', to)
  const after = await hashes(root, Object.keys(before))
  return { absorbed: Object.keys(before).filter((path) => before[path] !== after[path]) }
}

export const noRepository = 'Isolation needs a Git repository'
export const noCommit = 'Isolation needs a first commit'

/** Whether the repository holding `cwd` (or `cwd` itself, outside Git) has nothing in it but `.git`. */
export async function empty(cwd: string) {
  const top = await git(cwd, 'rev-parse', '--show-toplevel').catch(
    // Outside Git the folder itself is what a new repository would hold.
    () => cwd,
  )
  return (await readdir(top)).every((name) => name === '.git')
}

/** The checkout and branch an isolate of `cwd` would branch from, or why there is none. */
export async function isolatable(
  cwd: string,
): Promise<{ source: string; target: string } | { reason: string }> {
  const top = await git(cwd, 'rev-parse', '--show-toplevel').catch(
    // Outside Git there is nothing to branch from; the reason says so.
    () => undefined,
  )
  if (!top) return { reason: noRepository }
  const source = await realpath(top)
  const target = await git(source, 'symbolic-ref', '--quiet', '--short', 'HEAD').catch(() => '')
  if (!target) return { reason: 'Isolation needs a checked-out branch' }
  if (!(await git(source, 'rev-parse', '--verify', '--quiet', 'HEAD').catch(() => '')))
    return { reason: noCommit }
  // A preview lands on its own branch, never on the branch of the checkout it previews.
  const preview = process.env.ULTIMATE_PREVIEW_BRANCH
  const project = process.env.ULTIMATE_PROJECT
  if (
    preview &&
    project &&
    source === (await realpath(await git(project, 'rev-parse', '--show-toplevel')))
  )
    return { source, target: preview }
  return { source, target }
}
