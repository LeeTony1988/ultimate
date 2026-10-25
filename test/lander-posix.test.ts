import { expect, it, vi } from 'vitest'
import { context } from '../server/harness.ts'

vi.mock('../lib/process-group.ts', () => ({
  processGroups: false,
  runGroup: vi.fn<() => Promise<number>>(),
  sweepPidFiles: vi.fn<() => Promise<void>>(),
}))

const { runLanderCheck } = await import('../extensions/workspaces/lander.ts')
const { runGroup } = await import('../lib/process-group.ts')

it('reports a host without process groups instead of spawning a check it cannot stop', async () => {
  const result = await runLanderCheck('/nowhere', 'pnpm check', context, 'pids', 'temp')
  expect(result.failure).toMatch(/POSIX process groups/)
  expect(runGroup).not.toHaveBeenCalled()
})
