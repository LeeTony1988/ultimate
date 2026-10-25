import type { JsonObject } from '@earendil-works/pi-durable'
import { exec } from '../../lib/exec.ts'

type WindowsShell = { file: string; args: string[]; source: string }

/** Windows shells in preference order; the last one is the fallback even when its probe fails. */
const windowsShells = (): WindowsShell[] => [
  {
    file: 'pwsh',
    args: ['-NoProfile', '-NonInteractive', '-Command'],
    source: '$env:ULTIMATE_SOURCE',
  },
  {
    file: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command'],
    source: '$env:ULTIMATE_SOURCE',
  },
  {
    file: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c'],
    source: '%ULTIMATE_SOURCE%',
  },
]

let windowsShell: Promise<WindowsShell> | undefined

/** The first Windows shell that starts, probed once; cmd.exe is used when neither PowerShell starts. */
function preferredWindowsShell() {
  windowsShell ??= (async () => {
    const shells = windowsShells()
    for (const candidate of shells.slice(0, -1))
      try {
        await exec(candidate.file, [...candidate.args, 'exit 0'], {
          timeout: 5000,
          maxBuffer: 64 * 1024,
          windowsHide: true,
        })
        return candidate
      } catch {
        // Not installed or not runnable: try the next shell.
      }
    return shells.at(-1)!
  })()
  return windowsShell
}

/** The platform shell that runs one setup command: `sh -c` on POSIX, PowerShell or `cmd /d /s /c` on Windows. */
async function shell(command: string) {
  if (process.platform !== 'win32') return { file: 'sh', args: ['-c', command] }
  const chosen = await preferredWindowsShell()
  return {
    file: chosen.file,
    args: [...chosen.args, command.replaceAll('$ULTIMATE_SOURCE', chosen.source)],
  }
}

/** Run the project's `isolates.worktree.setup` commands in a new worktree at `path`, branched from `source`. */
export async function setup(
  source: string,
  path: string,
  settings: JsonObject,
  signal: AbortSignal,
) {
  const commands =
    (settings as { isolates?: { worktree?: { setup?: string[] } } }).isolates?.worktree?.setup ?? []
  if (!Array.isArray(commands) || !commands.every((command) => typeof command === 'string'))
    throw new Error('isolates.worktree.setup must be an array of command strings')
  for (const command of commands) {
    signal.throwIfAborted()
    try {
      const { file, args } = await shell(command)
      const pending = exec(file, args, {
        cwd: path,
        env: { ...process.env, ULTIMATE_SOURCE: source },
        signal,
        timeout: 120000,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
      })
      pending.child.stdin?.end()
      await pending
    } catch (error) {
      const output = error as Error & { stdout?: string; stderr?: string }
      throw new Error(
        `Worktree setup failed: ${command}\n${`${output.stdout ?? ''}${output.stderr ?? ''}${output.message}`.slice(-4000)}`,
        { cause: error },
      )
    }
  }
}
