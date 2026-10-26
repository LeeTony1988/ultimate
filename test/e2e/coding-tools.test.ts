import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux'
import { expect, it, vi } from 'vitest'
import { context } from '../../server/harness.ts'
import { shell } from '../../lib/shell.ts'
import { fauxServer, temp, removeTemp } from '../helpers.ts'

it('stops the default shell at the tripwire, kills its process, and preserves explicit timeout errors', async () => {
  const name = shell.name
  vi.stubEnv('ULTIMATE_BASH_TIMEOUT', '0.1')
  const directory = await temp('ultimate-bash-tripwire-')
  const server = await fauxServer({
    ultimateRoot: resolve('.'),
    home: join(directory, 'home'),
    userHome: directory,
  })
  try {
    const pidFile = join(directory, 'pid')
    for (const explicit of [false, true]) {
      server.host.faux!.setResponses([
        fauxAssistantMessage(
          [
            fauxToolCall(name, {
              command:
                name === 'powershell'
                  ? `$PID | Set-Content -LiteralPath '${pidFile}'; Start-Sleep -Seconds 10`
                  : `echo $$ > '${pidFile}'; sleep 10`,
              ...(explicit ? { timeout: 0.2 } : {}),
            }),
          ],
          { stopReason: 'toolUse' },
        ),
        fauxAssistantMessage('Complete'),
      ])
      const started = performance.now()
      await (await server.root.submit({ type: 'input', content: 'Run' }, context)).wait(context)
      expect(performance.now() - started).toBeLessThan(4000)
      const view = await server.root.viewState(context)
      try {
        const result = view.value.entries.filter((entry) => entry.kind === 'pi.tool-result').at(-1)
          ?.model?.[0]
        expect(result?.role === 'toolResult' && result.isError).toBe(true)
        expect(JSON.stringify(result)).toContain(
          explicit
            ? 'Command timed out after 0.2 seconds'
            : `Tripwire: ${name} ran past the 0.1 s default limit`,
        )
        expect(JSON.stringify(result).includes('Tripwire:')).toBe(!explicit)
      } finally {
        view.dispose()
      }
      const pid = Number(await readFile(pidFile, 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow('ESRCH')
    }
  } finally {
    vi.unstubAllEnvs()
    await server.close()
    await removeTemp(directory)
  }
})
