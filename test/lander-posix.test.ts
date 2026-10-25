import { expect, it, vi } from 'vitest'
import { context } from '../server/harness.ts'
import { shell } from '../lib/shell.ts'
import { removeTemp, temp } from './helpers.ts'

vi.mock('../lib/process-group.ts', () => ({
  runGroup: vi.fn<() => Promise<number>>().mockResolvedValue(0),
  sweepPidFiles: vi.fn<() => Promise<void>>(),
}))

const { runLanderCheck } = await import('../extensions/workspaces/lander.ts')
const { runGroup } = await import('../lib/process-group.ts')

it('runs lander checks through the selected host shell', async () => {
  const path = await temp('ultimate-lander-shell-')
  const tempPath = await temp('ultimate-lander-shell-tmp-')
  try {
    const command = 'pnpm check'
    const shellCommand = shell.argv(command)
    expect(shell.name).toBe(process.platform === 'win32' ? 'powershell' : 'bash')
    const result = await runLanderCheck(path, command, context, path, tempPath)
    expect(result.failure).toBeUndefined()
    expect(runGroup).toHaveBeenCalledWith(
      shellCommand.program,
      shellCommand.args,
      expect.objectContaining({ cwd: path }),
    )
  } finally {
    await removeTemp(path)
    await removeTemp(tempPath)
  }
})
