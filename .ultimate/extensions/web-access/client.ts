// The bridge to the `pi-web-access` package's stdio MCP server: one `web_search` per provider attempt, Jina first and
// Exa without a key. Ultimate owns every input: settings from the project's `.ultimate/settings.json`, keys from
// Ultimate's secret store, and a child environment that cannot read Pi's own config.
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readSecret } from '../../../lib/secrets.ts'

/** What the bridge needs from the extension host: Ultimate's project settings, secret store and state root. */
export interface WebAccessHost {
  home: string
  userHome: string
  projectSettings(): Promise<Record<string, unknown>>
}

/** A public page a search returned. */
export type Source = {
  title: string
  url: string
}

export type Fallback = {
  /** The provider that did not answer, and why the next one did. */
  from: string
  reason: string
}

export type Attempt = { provider: string; error: string }

export type SearchOutcome =
  | {
      status: 'success'
      /** What the model reads. */
      text: string
      query: string
      provider: string
      fallback: Fallback | null
      /** The provider's own summary, empty when it returned sources only. */
      answer: string
      results: Source[]
    }
  | {
      status: 'error'
      text: string
      query: string
      attempts: Attempt[]
    }

export interface SearchSettings {
  /** The MCP server's argv, program first. */
  argv: string[]
  /** Tried first. */
  defaultProvider: string
  /** Tried when the default errors, times out or returns nothing. */
  fallbackProvider: string
  /** Bound for one provider attempt. */
  timeoutMs: number
}

/** Resolved from Ultimate's project settings, or these defaults. */
const DEFAULT_ARGV = ['npx', '-y', 'pi-web-access@0.44.0']
const DEFAULT_TIMEOUT = 20_000
/** pi-web-access reads its config from `$PI_CODING_AGENT_DIR/web-search.json`; this empty directory is its whole config. */
const CONFIG_DIR = 'web-access/pi-config'
/** Variables the bridge owns: inherited values for them never reach the MCP server. */
const OWNED = [
  'PI_CODING_AGENT_DIR',
  'PI_CONFIG_DIR',
  'XDG_CONFIG_HOME',
  'JINA_API_KEY',
  'EXA_API_KEY',
]

/** `webAccess` from the project's settings, each field defaulted and bounded. */
export function settingsFrom(project: Record<string, unknown>): SearchSettings {
  const value = project.webAccess
  const object =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const command = object.mcpCommand
  const argv = Array.isArray(command)
    ? command.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    : typeof command === 'string' && command.trim()
      ? [command.trim()]
      : DEFAULT_ARGV
  return {
    // A configured command with every part empty would start nothing.
    argv: argv.length ? argv : DEFAULT_ARGV,
    defaultProvider: providerName(object.defaultProvider) ?? 'jina',
    fallbackProvider: providerName(object.fallbackProvider) ?? 'exa',
    timeoutMs:
      typeof object.timeoutMs === 'number' && object.timeoutMs >= 1000
        ? Math.min(object.timeoutMs, 120_000)
        : DEFAULT_TIMEOUT,
  }
}

/** A provider name as the MCP server accepts it. */
function providerName(value: unknown) {
  return typeof value === 'string' && /^[a-z0-9-]{1,40}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : undefined
}

/**
 * The MCP server's environment: the parent's, minus what could redirect it to Pi's config or a key this bridge does
 * not own. `configDir` must exist and stay empty.
 */
export function childEnvironment(
  configDir: string,
  keys: Record<string, string | undefined>,
  parent: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...parent }
  for (const name of OWNED) delete env[name]
  env.PI_CODING_AGENT_DIR = configDir
  for (const [name, value] of Object.entries(keys)) if (value) env[name] = value
  return env
}

/** The provider keys, from Ultimate's secret store only. */
async function secretKeys(userHome: string) {
  // An unreadable store must leave search keyless rather than broken: the secrets extension reports on its own store.
  const [jina, exa] = await Promise.all([
    readSecret(userHome, 'JINA_API_KEY').catch(() => undefined),
    readSecret(userHome, 'EXA_API_KEY').catch(() => undefined),
  ])
  return { JINA_API_KEY: jina, EXA_API_KEY: exa }
}

/** Creates the empty config directory under `home` and returns its path. */
async function configDirectory(home: string) {
  const path = join(home, CONFIG_DIR)
  await mkdir(path, { recursive: true })
  return path
}

export interface CallOptions {
  env: NodeJS.ProcessEnv
  timeoutMs: number
  signal?: AbortSignal
}

export interface McpOutcome {
  /** The server answered with an error, such as a missing provider key. */
  isError: boolean
  text: string
}

/** One `tools/call`, as the fast tests replace it. */
export type CallProvider = (
  argv: string[],
  tool: string,
  args: Record<string, unknown>,
  options: CallOptions,
) => Promise<McpOutcome>

/**
 * Searches with the default provider, then with the fallback when the first errors or returns nothing. `call` is the
 * seam tests fake; it defaults to the real MCP server.
 */
export async function search(
  host: WebAccessHost,
  input: { query: string; maxResults?: number; signal?: AbortSignal },
  call: CallProvider = callMcp,
): Promise<SearchOutcome> {
  const settings = settingsFrom(await host.projectSettings())
  const env = childEnvironment(await configDirectory(host.home), await secretKeys(host.userHome))
  const attempts: Attempt[] = []
  for (const provider of new Set([settings.defaultProvider, settings.fallbackProvider])) {
    try {
      const args = {
        query: input.query,
        provider,
        ...(input.maxResults ? { numResults: input.maxResults } : {}),
      }
      const outcome = await call(settings.argv, 'web_search', args, {
        env,
        timeoutMs: settings.timeoutMs,
        signal: input.signal,
      })
      const parsed = parseSearchText(outcome.text)
      const error = outcome.isError ? parsed.error || firstLine(outcome.text) : ''
      if (error) {
        attempts.push({ provider, error: describe(provider, error) })
        continue
      }
      if (!parsed.results.length) {
        attempts.push({ provider, error: 'No results returned.' })
        continue
      }
      const fallback = attempts.length
        ? { from: attempts[0].provider, reason: attempts[0].error }
        : null
      return {
        status: 'success',
        text: resultText(input.query, provider, fallback, parsed.answer, parsed.results),
        query: input.query,
        provider,
        fallback,
        answer: parsed.answer,
        results: parsed.results,
      }
    } catch (error) {
      if (input.signal?.aborted)
        return { status: 'error', text: 'Search cancelled.', query: input.query, attempts }
      attempts.push({ provider, error: describe(provider, errorMessage(error)) })
    }
  }
  const reasons = attempts.map((attempt) => `- ${attempt.provider}: ${attempt.error}`).join('\n')
  return {
    status: 'error',
    text: `Web search failed for "${input.query}".\n${reasons}`,
    query: input.query,
    attempts,
  }
}

/** What the model reads: the provider, why it fell back, the summary and the sources. */
function resultText(
  query: string,
  provider: string,
  fallback: Fallback | null,
  answer: string,
  results: Source[],
) {
  const header = fallback
    ? `Web search "${query}" with ${provider} (${fallback.from} did not answer: ${fallback.reason})`
    : `Web search "${query}" with ${provider}`
  const sources = results.map((source, index) => `${index + 1}. ${source.title}\n   ${source.url}`)
  return [header, answer, `Sources:\n${sources.join('\n\n')}`].filter(Boolean).join('\n\n')
}

/** Jina's own message points at Pi's config file; this bridge takes its key from Ultimate's secrets. */
function describe(provider: string, error: string) {
  return provider === 'jina' && /Jina Search API key not found/i.test(error)
    ? 'Jina needs a key: add JINA_API_KEY in the Secrets panel (⌘K → Secrets).'
    : firstLine(error)
}

function firstLine(text: string) {
  return text.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''
}

/** The first readable line of a child's stderr: Node prints a stack frame before the error itself. */
function diagnostic(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return (lines.find((line) => line.startsWith('Error:')) ?? lines[0] ?? '').slice(0, 200)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export interface ParsedSearch {
  provider?: string
  /** The provider's summary, without its provider line and trailing separator. */
  answer: string
  results: Source[]
  /** The provider's error text, when it answered with one. */
  error: string
}

/** Maps the MCP server's search text to the provider's summary, its `**Sources:**` list, or its error. */
export function parseSearchText(text: string): ParsedSearch {
  // The server appends how to page through stored results with `get_search_content`, a tool this bridge does not offer.
  const body = text
    .replace(/\n?---\nFull search results are stored as responseId[\s\S]*$/, '')
    .trim()
  const provider = /^\*\*Providers?(?: used)?:\*\*\s*([^\n]+)/.exec(body)?.[1]?.trim()
  const rest = provider ? body.slice(body.indexOf('\n') + 1).trim() : body
  const failure = /^Error:\s*([\s\S]*)$/.exec(rest)
  if (failure) return { provider, answer: '', results: [], error: failure[1].trim() }
  const marker = rest.indexOf('**Sources:**')
  const answer = (marker >= 0 ? rest.slice(0, marker) : rest).replace(/\n+-{3,}\s*$/, '').trim()
  return {
    provider,
    answer,
    results: marker >= 0 ? sourcesFrom(rest.slice(marker)) : [],
    error: '',
  }
}

/** The numbered title/URL pairs of a `**Sources:**` block; `No sources returned.` has none. */
function sourcesFrom(section: string): Source[] {
  const lines = section.split(/\r?\n/)
  const sources: Source[] = []
  for (let index = 0; index < lines.length; index++) {
    const title = /^\s*\d+\.\s+(.+?)\s*$/.exec(lines[index])
    if (!title) continue
    let next = index + 1
    while (next < lines.length && !lines[next].trim()) next++
    const url = lines[next]?.trim() ?? ''
    if (!/^https?:\/\//.test(url)) continue
    sources.push({ title: title[1], url })
    index = next
    if (sources.length === 20) break
  }
  return sources
}

/** MCP's stdio framing: one JSON-RPC message per line, responses carrying the request's id. */
interface RpcResult {
  content?: { type?: string; text?: string }[]
  isError?: boolean
}
interface RpcMessage {
  id?: number
  result?: RpcResult
  error?: { message?: string }
}

/** One `tools/call` against a fresh server process: start, initialize, call, stop. */
export async function callMcp(
  argv: string[],
  tool: string,
  args: Record<string, unknown>,
  options: CallOptions,
): Promise<McpOutcome> {
  const session = new Session(spawnMcp(argv, options.env))
  const timeout = AbortSignal.timeout(options.timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  try {
    await session.request(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'ultimate-web-access', version: '0.1.0' },
      },
      signal,
    )
    session.notify('notifications/initialized', {})
    const result = await session.request('tools/call', { name: tool, arguments: args }, signal)
    const text = (result.content ?? [])
      .filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n')
    return { isError: result.isError === true, text }
  } catch (error) {
    if (options.signal?.aborted) throw new Error('Search cancelled.', { cause: error })
    if (timeout.aborted)
      throw new Error(`The web search server did not answer within ${options.timeoutMs} ms.`, {
        cause: error,
      })
    throw error instanceof Error ? error : new Error(String(error), { cause: error })
  } finally {
    session.close()
  }
}

/** Starts the MCP server without a shell; the query travels over stdin, never the command line. */
function spawnMcp(argv: string[], env: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
  const [program, ...args] = argv
  const options = { env, stdio: 'pipe' as const, windowsHide: true }
  // Windows starts a `.cmd` shim such as npx only through cmd.exe; Node refuses to run one directly (EINVAL).
  if (process.platform === 'win32' && !/[\\/]/.test(program))
    return spawn(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', `"${argv.map(quote).join(' ')}"`],
      {
        ...options,
        // cmd.exe reads this line itself; Node must not quote it again.
        windowsVerbatimArguments: true,
      },
    )
  return spawn(program, args, options)
}

function quote(value: string) {
  return /^[\w@./:=+-]+$/.test(value) ? value : `"${value.replaceAll('"', '""')}"`
}

/** The child's pipes as an MCP session; requests reject when the process fails, exits, cancels or times out. */
class Session {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<
    number,
    { resolve(value: RpcResult): void; reject(error: Error): void }
  >()
  private next = 1
  private buffer = ''
  private diagnostics = ''

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.read(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.diagnostics = (this.diagnostics + chunk).slice(-4000)
    })
    child.stdin.on('error', (error) => this.fail(`The web search server stopped: ${error.message}`))
    child.on('error', (error) =>
      this.fail(`The web search server could not start: ${error.message}`),
    )
    child.on('exit', (code, signal) =>
      this.fail(
        `The web search server exited ${signal ?? `with code ${code}`}${this.diagnostics.trim() ? `: ${diagnostic(this.diagnostics)}` : ''}`,
      ),
    )
  }

  request(method: string, params: unknown, signal: AbortSignal): Promise<RpcResult> {
    const id = this.next++
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Search cancelled.'))
      const abort = () => {
        this.pending.delete(id)
        reject(new Error('Search cancelled.'))
      }
      signal.addEventListener('abort', abort, { once: true })
      this.pending.set(id, {
        resolve: (value) => {
          signal.removeEventListener('abort', abort)
          resolve(value)
        },
        reject: (error) => {
          signal.removeEventListener('abort', abort)
          reject(error)
        },
      })
      this.write({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown) {
    this.write({ jsonrpc: '2.0', method, params })
  }

  close() {
    // No request is in flight here; the process is only kept for this one call.
    this.pending.clear()
    if (this.child.exitCode === null) this.child.kill()
  }

  private write(rpc: unknown) {
    try {
      this.child.stdin.write(`${JSON.stringify(rpc)}\n`)
    } catch (error) {
      this.fail(`The web search server stopped accepting input: ${errorMessage(error)}`)
    }
  }

  /** Rejects every waiting request; later events are ignored. */
  private fail(reason: string) {
    const waiting = [...this.pending.values()]
    this.pending.clear()
    for (const request of waiting) request.reject(new Error(reason))
  }

  private read(chunk: string) {
    this.buffer += chunk
    for (let index = this.buffer.indexOf('\n'); index >= 0; index = this.buffer.indexOf('\n')) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line) this.accept(line)
    }
  }

  private accept(line: string) {
    let rpc: RpcMessage
    try {
      rpc = JSON.parse(line) as RpcMessage
    } catch {
      // stdout carries JSON-RPC only; a stray line is noise, and its request fails by timeout or exit.
      return
    }
    if (rpc.id === undefined) return
    const request = this.pending.get(rpc.id)
    if (!request) return
    this.pending.delete(rpc.id)
    if (rpc.error)
      request.reject(new Error(rpc.error.message || 'The web search server returned an error.'))
    else request.resolve(rpc.result ?? {})
  }
}
