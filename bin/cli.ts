#!/usr/bin/env node
/**
 * Emergency terminal agent: Pi's own interactive TUI with Ultimate's instructions, skills and the Claude Code provider.
 * It opens no server, no Vite and no durable storage, so it works when those are broken. `pnpm cli` runs it in this
 * checkout, `ultimate --cli` in the current directory; any further arguments go to Pi (a first message, `--model`, `-p`).
 */
import { readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProjectContextFiles, main, SettingsManager } from '@earendil-works/pi-coding-agent'
import { projectHome } from '../server/project.ts'
import { projectSkills } from '../server/skills.ts'

export interface CliHost {
  ultimateRoot: string
  projectRoot: string
  userHome: string
  home: string
}

function recoveryPrompt(host: CliHost) {
  const scripts = JSON.parse(readFileSync(join(host.ultimateRoot, 'package.json'), 'utf8'))
    .scripts as Record<string, string>
  const context = loadProjectContextFiles({
    cwd: host.projectRoot,
    agentDir: join(host.userHome, '.ultimate'),
  })
    .map(
      (file) =>
        `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>`,
    )
    .join('\n\n')
  return `You are Ultimate's emergency terminal agent, started with \`ultimate --cli\` because the web UI, the server or the conversation database may be broken. Diagnose and repair with your tools; you are not inside the durable harness, so there are no conversations, subagents, messages or workspace tools here.

- Ultimate (the running code): ${host.ultimateRoot}
- Project: ${host.projectRoot}
- Project home: ${host.home}: \`state.sqlite\` (conversations, entries, documents, tasks), \`trace.sqlite\` (call traces), \`supervisor.log\`, \`ultimate.lock\` and \`storage.lock\`.
- Read the databases only with \`sqlite3 -readonly\`, and never while guessing: a running server owns them. Changing or moving them needs the user's explicit yes.
- Checks: \`pnpm check\`, \`pnpm test\`. Start the server with \`pnpm start\` (see docs/running.md).${scripts.reset ? "\n- `pnpm reset` backs up the project state and starts Ultimate fresh; offer it only when the state is beyond repair, and only with the user's yes." : ''}
- Provider logins live per machine in Pi's agent directory (\`PI_CODING_AGENT_DIR\`, \`~/.pi/agent\` by default), \`auth.json\`: never read, print or copy it, nor \`~/.ultimate/secrets.json\`.
- Be concise; report what you found, what you changed and how you verified it.

${context}`
}

/**
 * Pi's arguments: Ultimate's prompt, context and skills instead of Pi's personal ones (an explicit system prompt also
 * stops Pi discovering SYSTEM.md and APPEND_SYSTEM.md), the harness's default model, then the user's own arguments,
 * which win.
 */
export function cliArgs(host: CliHost, args: string[]) {
  const settings = SettingsManager.create(host.projectRoot)
  const provider = settings.getDefaultProvider()
  const model = settings.getDefaultModel()
  const claudeCode = fileURLToPath(
    import.meta.resolve('@earendil-works/pi-claude-code/src/index.ts'),
  )
  return [
    '--no-context-files',
    '--no-skills',
    ...projectSkills(host).skills.flatMap((skill) => ['--skill', skill.filePath]),
    '--no-extensions',
    '--extension',
    claudeCode,
    '--session-dir',
    join(host.home, 'cli-sessions'),
    '--system-prompt',
    recoveryPrompt(host),
    ...(provider && model ? ['--model', `${provider}/${model}`] : []),
    ...args,
  ]
}

export async function cli(args: string[], projectRoot = process.cwd()) {
  const root = realpathSync(projectRoot)
  const host = {
    ultimateRoot: resolve(fileURLToPath(new URL('..', import.meta.url))),
    projectRoot: root,
    userHome: homedir(),
    home: process.env.ULTIMATE_HOME ?? projectHome(root),
  }
  await main(cliArgs(host, args))
}

if (import.meta.main) await cli(process.argv.slice(2))
