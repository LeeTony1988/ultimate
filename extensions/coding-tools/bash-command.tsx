import { parse } from 'unbash'
import type { AndOr, Command, PipelineNode, Statement, Word } from 'unbash'

export interface Heredoc {
  body: string
  /** The closing delimiter line as written. */
  closing: string
  /** A file name whose extension picks the highlighting: the redirect target or the interpreter. */
  file?: string
}

export interface BashStep {
  /** How this step joins the previous one; the first step has none. */
  operator?: '&&' | '||' | ';'
  /** The step's source, without heredoc bodies. */
  text: string
  /** The programs of its pipeline, in order: `['rg', 'head']`. */
  programs: string[]
  heredocs: Heredoc[]
}

export interface BashCommand {
  /** A literal directory from a leading `cd <dir> &&`. */
  directory?: string
  steps: BashStep[]
  /** The programs that run, joined by the command's own operators: `git add && git commit; rg | head`. */
  summary: string
}

const interpreters: Record<string, string> = {
  python: 'heredoc.py',
  python3: 'heredoc.py',
  node: 'heredoc.js',
  bun: 'heredoc.ts',
  deno: 'heredoc.ts',
  tsx: 'heredoc.ts',
  sqlite3: 'heredoc.sql',
  psql: 'heredoc.sql',
  bash: 'heredoc.sh',
  sh: 'heredoc.sh',
  ruby: 'heredoc.rb',
}
const wrappers = new Set(['timeout', 'sudo', 'env', 'nice', 'nohup', 'command', 'exec', 'stdbuf'])
const subcommands = new Set(['git', 'pnpm', 'npm', 'yarn', 'bun', 'gh', 'docker', 'cargo', 'go'])
const runners = new Set(['exec', 'dlx', 'run', 'x'])
const compounds: Record<string, string> = { Subshell: '( )', BraceGroup: '{ }' }

/** The program a command runs, looking through wrappers such as `timeout 60` and `env A=1`, with its arguments. */
function program(command: Command): string[] {
  const words = [command.name, ...command.args].map((word) =>
    word?.type === 'Word' ? word.value : (word?.text ?? ''),
  )
  let index = 0
  while (wrappers.has(words[index] ?? '')) {
    index++
    while (/^(-|\d|\w+=)/.test(words[index] ?? '')) index++
  }
  return words.slice(index)
}

function label(command: Command) {
  const [name = '', ...args] = program(command)
  if (!subcommands.has(name)) return name
  const rest = args.filter((arg, index) => !arg.startsWith('-') && args[index - 1] !== '-C')
  const sub = rest[0]
  if (!sub) return name
  return runners.has(sub) && rest[1] ? `${name} ${sub} ${rest[1]}` : `${name} ${sub}`
}

function stages(node: PipelineNode): PipelineNode[] {
  return node.type === 'Pipeline' ? [...node.commands] : [node]
}

function stageLabel(node: PipelineNode): string {
  if (node.type === 'Command') return label(node)
  if (node.type === 'Redirected') return stageLabel(node.command)
  if (node.type === 'Time' || node.type === 'Negation')
    return node.command ? stageLabel(node.command) : ''
  if (node.type === 'Pipeline') return node.commands.map(stageLabel).filter(Boolean).join(' | ')
  if (node.type === 'Function') return `${node.name.value}()`
  return compounds[node.type] ?? node.type.toLowerCase()
}

function heredocs(source: string, node: PipelineNode): Heredoc[] {
  return stages(node).flatMap((stage) => {
    const command = stage.type === 'Command' ? stage : undefined
    const redirects = command?.redirects ?? (stage.type === 'Redirected' ? stage.redirects : [])
    let target: string | undefined
    for (const redirect of redirects)
      if (redirect.type === 'Redirect' && redirect.operator.startsWith('>'))
        target ??= redirect.target?.value
    const file = target ?? (command && interpreters[program(command)[0] ?? ''])
    return redirects.flatMap((redirect) =>
      redirect.type === 'HereDoc' && redirect.closing
        ? [
            {
              body: redirect.body.text,
              closing: source.slice(redirect.closing.pos, redirect.closing.end),
              ...(file ? { file } : {}),
            },
          ]
        : [],
    )
  })
}

/** A plain path that `cd` would enter as written: no expansion, glob, home, or option. */
function literalDirectory(word: Word | undefined) {
  if (!word || /[$`*?[\]]/.test(word.text) || /^[-~]/.test(word.value)) return undefined
  return word.value
}

/** Display only: a command shown as one raw step, for shells that are not Bash (PowerShell). */
export function rawBashCommand(command: string): BashCommand {
  return {
    steps: [{ text: command, programs: [], heredocs: [] }],
    summary: command.split('\n')[0],
  }
}

/** Display only: the command's steps and programs from a real Bash parse; unparsable input stays one raw step. */
export function formatBashCommand(command: string): BashCommand {
  const raw = rawBashCommand(command)
  const script = parse(command)
  if (script.errors?.length || script.source !== undefined) return raw
  const steps: BashStep[] = []
  const summary: string[] = []
  const push = (
    statement: Statement,
    node: PipelineNode,
    operator: BashStep['operator'],
    last: boolean,
  ) => {
    const end = last ? statement.end : node.end
    steps.push({
      ...(operator ? { operator } : {}),
      text: command.slice(node.pos, end),
      programs: stages(node).map(stageLabel).filter(Boolean),
      heredocs: heredocs(command, node),
    })
    const name = stageLabel(node)
    if (name)
      summary.push(`${summary.length ? (operator === ';' ? '; ' : ` ${operator} `) : ''}${name}`)
    if (last && statement.background) summary.push(' &')
  }
  for (const statement of script.commands) {
    const list: AndOr | undefined =
      statement.command.type === 'AndOr' ? statement.command : undefined
    const nodes = list ? list.commands : [statement.command as PipelineNode]
    nodes.forEach((node, index) =>
      push(
        statement,
        node,
        index ? list!.operators[index - 1] : steps.length ? ';' : undefined,
        index === nodes.length - 1,
      ),
    )
  }
  if (!steps.length) return raw
  const first = script.commands[0].command
  const cd = first.type === 'AndOr' ? first.commands[0] : undefined
  const directory =
    cd?.type === 'Command' &&
    cd.name?.value === 'cd' &&
    cd.args.length === 1 &&
    !cd.redirects.length
      ? literalDirectory(cd.args[0] as Word)
      : undefined
  if (directory) {
    steps.shift()
    delete steps[0].operator
    summary.shift()
    summary[0] = summary[0].replace(/^ && /, '')
  }
  return { ...(directory ? { directory } : {}), steps, summary: summary.join('') }
}
