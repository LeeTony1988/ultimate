import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it, vi } from 'vitest'
import type { ConversationId } from '@earendil-works/pi-durable'
import { type BashExecution } from '@earendil-works/pi-durable/tools'
import { prepareBash } from '../../extensions/coding-tools/server.ts'
import { shell } from '../../lib/shell.ts'
import { removeTemp, temp } from '../helpers.ts'

const run = promisify(execFile)

it.each([0, 1])(
  'links tool commits without affecting outside commits (existing config count %i)',
  async (count) => {
    const cwd = await temp('ultimate-commit-trailer-')
    vi.stubEnv('GIT_CONFIG_COUNT', String(count))
    if (count) {
      vi.stubEnv('GIT_CONFIG_KEY_0', 'ultimate.test')
      vi.stubEnv('GIT_CONFIG_VALUE_0', 'preserved')
    }
    const git = (...args: string[]) => run('git', args, { cwd })
    try {
      await git('init', '-b', 'main')
      await git('config', 'user.name', 'Trailer Test')
      await git('config', 'user.email', 'trailer@example.test')
      const hooks = join(cwd, '.git', 'hooks')
      const before = await readdir(hooks)
      const execution: BashExecution = { command: '', cwd, env: {}, inheritEnv: true }
      prepareBash(execution, { conversationId: 34820 as ConversationId })
      // The hooks reach git through `GIT_CONFIG_*` variables of the environment the shell tool spawns, so the commands
      // go through the shell the product uses on this host: bash on POSIX, PowerShell on Windows, where `bash` is WSL
      // and only forwards the variables `WSLENV` lists. Both hosts then run the same command string.
      const bash = (command: string) => {
        const { program, args } = shell.argv(command)
        return run(program, args, { cwd, env: { ...process.env, ...execution.env } })
      }
      expect((await bash('git config --list')).stdout.includes('ultimate.test=preserved')).toBe(
        count === 1,
      )
      await bash('git commit --allow-empty -m x -m "Other-Trailer: kept"')
      expect((await git('log', '-1', '--format=%B')).stdout).toContain(
        'Ultimate-Conversation: 34820',
      )
      expect((await git('log', '-1', '--format=%B')).stdout).toContain('Other-Trailer: kept')

      prepareBash(execution, { conversationId: 42 as ConversationId })
      await bash('git commit --amend --allow-empty --no-edit')
      const amended = (await git('log', '-1', '--format=%B')).stdout
      expect(amended).toContain('Ultimate-Conversation: 42')
      expect(amended).not.toContain('Ultimate-Conversation: 34820')
      expect(amended).toContain('Other-Trailer: kept')

      await git('checkout', '-b', 'branch')
      await git('commit', '--allow-empty', '-m', 'outside')
      expect((await git('log', '-1', '--format=%B')).stdout).not.toContain('Ultimate-Conversation:')
      await git('checkout', 'main')
      await bash('git merge --no-ff branch -m merge')
      expect((await git('log', '-1', '--format=%B')).stdout).toContain('Ultimate-Conversation: 42')
      expect(await readdir(hooks)).toEqual(before)
      expect((await git('config', '--local', '--list')).stdout).not.toContain('hook.ultimate.')
    } finally {
      vi.unstubAllEnvs()
      await removeTemp(cwd)
    }
  },
)
