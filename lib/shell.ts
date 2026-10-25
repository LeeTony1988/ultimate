/**
 * The shell this host runs commands in: Bash everywhere, PowerShell on Windows (`pwsh`, else Windows PowerShell).
 * This is the one place that asks the platform, so no other module does. A caller that must know which shell it is
 * asking uses `name`, registers the tool with `create`, and spawns a command string with `argv` or a shebang script with
 * `script`. `lib/windows-process-group.ts` separately requires Windows PowerShell 5.1 for its native Job Object owner.
 * The browser dispatches on a tool call's own name and never imports this file: `process` does not exist there.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { BashPrepare } from '@earendil-works/pi-durable/tools'
import { createBashTool, createPowerShellTool } from '@earendil-works/pi-durable/tools'
import { getPowerShellConfig, getShellConfig } from '@earendil-works/pi-coding-agent'

export type ShellName = 'bash' | 'powershell'

export interface Shell {
  /** Pi's tool name: what a prompt, a portable tool list, a renderer and the cancel action say. */
  readonly name: ShellName
  /** Pi's tool for this shell; `prepare` adjusts each command's script, working directory and environment. */
  create(options?: {
    prepare?: BashPrepare
  }): ReturnType<typeof createBashTool> | ReturnType<typeof createPowerShellTool>
  /**
   * How to run one command string: the program and the arguments that carry it last (`bash -c …`,
   * `pwsh -NoProfile … -Command …`), as `lib/process-group.ts`, project setup and tests spawn it. `variables` names the
   * variables the command references as `$NAME`; each is filled in this shell's syntax, so one command string works in
   * either.
   */
  argv(command: string, variables?: readonly string[]): { program: string; args: string[] }
  /** Resolve a shebang script to the executable and arguments that run it on this host. */
  script(path: string): { program: string; args: string[] }
}

/** `command` with each of `names` written in `shell`'s syntax: `$NAME` reads in either shell's own spelling. */
export function fill(command: string, names: readonly string[], shell: ShellName) {
  return names.reduce(
    (text, name) =>
      // The name's end is respected, so `$SOURCE_BACKUP` keeps its own variable.
      text.replaceAll(
        new RegExp(`\\$${name}(?![A-Za-z0-9_])`, 'g'),
        shell === 'powershell' ? `$env:${name}` : `$\{${name}}`,
      ),
    command,
  )
}

/** As Pi's powershell tool: UTF-8 output whatever the console's code page, so a setup failure reads in the user's. */
const utf8 = 'try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 } catch {}'

const bash: Shell = {
  name: 'bash',
  create: (options) => createBashTool(options),
  script: (path) => ({ program: path, args: [] }),
  argv: (command, variables = []) => {
    const { shell, args } = getShellConfig()
    // Pi asks for stdin only for the legacy WSL `bash.exe`, which this platform never selects: `win32` runs PowerShell.
    return {
      program: shell,
      args: [...args, fill(command, variables, 'bash')],
    }
  },
}

const powershell: Shell = {
  name: 'powershell',
  create: (options) => createPowerShellTool(options),
  script: (path) => {
    const line = readFileSync(path, 'utf8').split(/\r?\n/, 1)[0]
    if (!line.startsWith('#!')) throw new Error(`Windows script ${path} needs a shebang`)
    const words = line.slice(2).trim().split(/\s+/)
    const commandName = (value: string) =>
      value.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ?? ''
    if (commandName(words[0]) === 'env') {
      words.shift()
      if (words[0] === '-S') words.shift()
    }
    const interpreter = words.shift()
    if (!interpreter) throw new Error(`Windows script ${path} has an empty shebang`)
    const name = commandName(interpreter)
    if (name === 'sh' || name === 'bash') {
      const config = getShellConfig()
      if (config.commandTransport === 'stdin')
        throw new Error(`Windows script ${path} needs a Bash that accepts a script path`)
      return { program: config.shell, args: [...words, path] }
    }
    if (name === 'pwsh' || name === 'powershell') {
      return {
        program: getPowerShellConfig().shell,
        args: [
          ...words,
          '-Command',
          `& ([ScriptBlock]::Create([IO.File]::ReadAllText('${path.replaceAll("'", "''")}')))`,
        ],
      }
    }
    let program = interpreter.startsWith('/') ? name : interpreter
    if (
      process.platform === 'win32' &&
      !interpreter.startsWith('/') &&
      !interpreter.includes('/') &&
      !interpreter.includes('\\')
    ) {
      try {
        program = execFileSync('where.exe', [interpreter], {
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .trim()
          .split(/\r?\n/, 1)[0]
      } catch (cause) {
        throw new Error(`Windows interpreter ${interpreter} for ${path} was not found on PATH`, {
          cause,
        })
      }
    }
    return { program, args: [...words, path] }
  },
  argv: (command, variables = []) => {
    // Throws a clear error when neither PowerShell starts; nothing else runs commands on Windows.
    const { shell, args } = getPowerShellConfig()
    return {
      program: shell,
      args: [...args, `${utf8}\n${fill(command, variables, 'powershell')}`],
    }
  },
}

/** The shell `platform` runs commands in. */
export const shellFor = (platform: NodeJS.Platform = process.platform): Shell =>
  platform === 'win32' ? powershell : bash

/** This host's shell. */
export const shell = shellFor()
