import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { readdir, rm, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
// Cleanup must use the same owner validation and PID semantics as the storage lock.
// oxlint-disable-next-line no-restricted-imports
import { alive, readOwner } from '../../server/lock.ts'
import { git } from '../../lib/git.ts'

/**
 * Hold both lock transactions for the cleanup work, and release them only for the unlink itself: Windows refuses to
 * remove an open file and both databases live inside the home. The PID sidecars carry the protection across that last
 * step, so they are read again once the locks are gone: a preview that started there keeps its home.
 */
export async function cleanPreview(home: string) {
  const locks: DatabaseSync[] = []
  const release = () => {
    for (const database of locks.splice(0)) database.close()
  }
  /** A live process owns this home through either PID sidecar; a stale or absent one leaves it to cleanup. */
  async function liveOwner() {
    for (const name of ['ultimate.lock', 'storage.lock']) {
      const owner = await readOwner(join(home, name))
      if (owner && alive(owner.pid)) return true
    }
    return false
  }
  try {
    for (const name of ['ultimate.lock', 'storage.lock']) {
      const owner = await readOwner(join(home, name))
      if (owner && alive(owner.pid)) return false
      const database = new DatabaseSync(join(home, name + '.db'))
      locks.push(database)
      try {
        database.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE')
      } catch (error) {
        if ((error as { errcode?: number }).errcode === 5) return false
        throw error
      }
    }
    // The original project checkout may have been released. Discover repositories from the previews themselves.
    const repositories = new Set<string>()
    for (const name of ['lander', 'worktrees']) {
      const directory = join(home, name)
      const checkouts = await readdir(directory, { withFileTypes: true }).catch(
        (error: NodeJS.ErrnoException) => {
          // A preview without isolates or a lander has no checkout directory.
          if (error.code === 'ENOENT') return []
          throw error
        },
      )
      for (const checkout of checkouts) {
        if (!checkout.isDirectory()) continue
        const common = await git(
          join(directory, checkout.name),
          'rev-parse',
          '--path-format=absolute',
          '--git-common-dir',
        ).catch((error: unknown) => {
          // Its repository is gone (a preview of a deleted temporary project): nothing is registered to release.
          // Git 2.56 words a worktree gitfile whose repository is gone as "gitfile does not point to a valid
          // repository"; older versions say "not a git repository". Both mean the same here.
          if (
            /not a git repository|gitfile does not point to a valid repository/.test(
              (error as { stderr?: string }).stderr ?? '',
            )
          )
            return undefined
          throw error
        })
        if (common) repositories.add(common)
      }
    }
    const branchPrefix = `ultimate/${createHash('sha256').update(home).digest('hex').slice(0, 6)}-`
    for (const common of repositories) {
      const records = (
        await git(common, '--git-dir', common, 'worktree', 'list', '--porcelain', '-z')
      ).split('\0\0')
      for (const record of records) {
        const fields = record.split('\0')
        const path = fields.find((field) => field.startsWith('worktree '))?.slice(9)
        if (!path) continue
        const inside = relative(resolve(home), path)
        if (!inside || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside))
          continue
        const branch = fields.find((field) => field.startsWith('branch refs/heads/'))?.slice(18)
        await git(common, '--git-dir', common, 'worktree', 'remove', '--force', path)
        if (branch?.startsWith(branchPrefix))
          await git(common, '--git-dir', common, 'branch', '-D', '--', branch)
      }
      await git(common, '--git-dir', common, 'worktree', 'prune')
    }
    // Everything the locks guarded is gone. Release them before the unlink, then let the sidecars decide once more.
    release()
    if (await liveOwner()) return false
    await rm(home, { recursive: true, force: true })
    return true
  } finally {
    release()
  }
}

/**
 * Only real preview directories in the supplied directory; never follow a symlink into another home.
 * Every host sweeps the shared temporary directory on open, so one sweep at a time owns it: a home's own lock file is
 * deleted with the home, and a racing sweep would recreate it, lock the new file and clean alongside.
 * This database stays open while homes are removed, which is safe because it lives in `directory` itself: `sweep`
 * removes only the `ultimate-instance-*` entries below it, never the directory holding this lock.
 */
export async function sweepPreviews(directory: string, notice: (message: string) => void) {
  const lock = new DatabaseSync(join(directory, 'ultimate-preview-sweep.lock.db'))
  try {
    lock.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE')
  } catch (error) {
    lock.close()
    if ((error as { errcode?: number }).errcode === 5) return
    throw error
  }
  try {
    await sweep(directory, notice)
  } finally {
    lock.close()
  }
}

async function sweep(directory: string, notice: (message: string) => void) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('ultimate-instance-')) continue
    const home = join(directory, entry.name)
    try {
      const preserved = await stat(join(home, 'instance-preserve')).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
          return undefined
        },
      )
      if (preserved) continue
      await cleanPreview(home)
    } catch (error) {
      notice(`Preview cleanup failed for ${home}: ${String(error)}`)
    }
  }
}
