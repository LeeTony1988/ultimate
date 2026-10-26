import { resolve } from 'node:path'

/**
 * Whether two paths name the same place. Git prints worktree paths with forward slashes (`C:/Users/...`) while records
 * hold the platform's form (`C:\Users\...`), and Windows compares paths case-insensitively.
 */
export function samePath(left: string, right: string) {
  const normalize = (path: string) =>
    process.platform === 'win32' ? resolve(path).replaceAll('\\', '/').toLowerCase() : resolve(path)
  return normalize(left) === normalize(right)
}

/** The path of a `git worktree list --porcelain` entry, or undefined when the entry is not a worktree record. */
export function worktreePath(entry: string) {
  return entry
    .split('\n')
    .find((line) => line.startsWith('worktree '))
    ?.slice('worktree '.length)
}
