import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  childEnvironment,
  parseSearchText,
  search,
  settingsFrom,
} from '../.ultimate/extensions/web-access/client.ts'
import type {
  CallOptions,
  CallProvider,
  WebAccessHost,
} from '../.ultimate/extensions/web-access/client.ts'
import { writeSecret } from '../extensions/secrets/store.ts'
import { removeTemp, temp } from './helpers.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const close of cleanup.splice(0)) await close()
})

/** What the MCP server appends about its stored results; the bridge drops it. */
const guidance =
  '---\nFull search results are stored as responseId "r1". Use get_search_content({ responseId: "r1", queryIndex: 0, offset: 0, limit: 30000 }) to retrieve the first bounded page.'
const jinaMissingKey = `**Provider:** jina

Error: Jina Search API key not found. Either:
  1. Create the config file with { "jinaApiKey": "your-key" }
  2. Set JINA_API_KEY environment variable
${guidance}`
const jinaResults = `**Provider:** jina

Durable execution persists sessions across failures.

---

**Sources:**
1. Jina AI
   https://jina.ai/
${guidance}`
const exaResults = `**Provider:** exa

Exa brings durable execution to agents: it persists sessions and recovers from failures.

---

**Sources:**
1. Durable Extension | Microsoft Learn
   https://learn.microsoft.com/en-us/agent-framework/hosting/durable-extension

2. Exa: web search API
   https://exa.ai/
${guidance}`
/** A provider that returned sources without a summary: the server then writes no `**Sources:**` marker. */
const jinaSourcesOnly = `**Provider:** jina

1. Jina AI
   https://jina.ai/

2. Durable Extension | Microsoft Learn
   https://learn.microsoft.com/en-us/agent-framework/hosting/durable-extension
${guidance}`

/** One call the fake MCP server answered, with the options the bridge gave it. */
interface Recorded {
  argv: string[]
  tool: string
  args: Record<string, unknown>
  options: CallOptions
}

/** A host whose project settings and secret store live in fresh temp directories. */
async function fixture(settings: Record<string, unknown> = {}) {
  const home = await temp()
  const userHome = await temp()
  cleanup.push(
    () => removeTemp(home),
    () => removeTemp(userHome),
  )
  const host: WebAccessHost = { home, userHome, projectSettings: async () => settings }
  const calls: Recorded[] = []
  /** Records each call and answers it with `text(provider)`. */
  const answer =
    (text: (provider: string) => { isError?: boolean; text: string }): CallProvider =>
    async (argv, tool, args, options) => {
      calls.push({ argv, tool, args, options })
      const result = text(typeof args.provider === 'string' ? args.provider : '')
      return { isError: result.isError === true, text: result.text }
    }
  return { host, home, userHome, calls, answer }
}

it('falls back from Jina to keyless Exa and says why', async () => {
  const { host, calls, answer } = await fixture()
  const outcome = await search(
    host,
    { query: 'durable agent extension', maxResults: 3 },
    answer((provider) =>
      provider === 'jina' ? { isError: true, text: jinaMissingKey } : { text: exaResults },
    ),
  )
  expect(calls.map((call) => call.args.provider)).toEqual(['jina', 'exa'])
  expect(calls.every((call) => call.tool === 'web_search')).toBe(true)
  expect(calls[0].args).toEqual({
    query: 'durable agent extension',
    provider: 'jina',
    numResults: 3,
  })
  expect(outcome).toMatchObject({
    status: 'success',
    provider: 'exa',
    fallback: {
      from: 'jina',
      reason: 'Jina needs a key: add JINA_API_KEY in the Secrets panel (⌘K → Secrets).',
    },
    results: [
      {
        title: 'Durable Extension | Microsoft Learn',
        url: 'https://learn.microsoft.com/en-us/agent-framework/hosting/durable-extension',
      },
      { title: 'Exa: web search API', url: 'https://exa.ai/' },
    ],
  })
  // The model reads the provider, the fallback reason and the links, never the stored-results guidance.
  expect(outcome.text).toContain('with exa (jina did not answer')
  expect(outcome.text).toContain('https://exa.ai/')
  expect(outcome.text).not.toContain('get_search_content')
})

it('falls back when the default provider answers without results', async () => {
  const { host, answer } = await fixture()
  const outcome = await search(
    host,
    { query: 'durable agent extension' },
    answer((provider) =>
      provider === 'jina'
        ? { text: '**Provider:** jina\n\nNo results found.' }
        : { text: exaResults },
    ),
  )
  expect(outcome).toMatchObject({
    status: 'success',
    provider: 'exa',
    fallback: { from: 'jina', reason: 'No results returned.' },
  })
})

it('accepts a reply that carries sources without a summary', async () => {
  const { host, answer } = await fixture()
  const outcome = await search(
    host,
    { query: 'durable agent extension' },
    answer(() => ({ text: jinaSourcesOnly })),
  )
  expect(outcome).toMatchObject({
    status: 'success',
    provider: 'jina',
    fallback: null,
    answer: '',
    results: [
      { title: 'Jina AI', url: 'https://jina.ai/' },
      {
        title: 'Durable Extension | Microsoft Learn',
        url: 'https://learn.microsoft.com/en-us/agent-framework/hosting/durable-extension',
      },
    ],
  })
})

it('falls back when a provider throws, not only when it answers an error', async () => {
  const { host } = await fixture()
  const outcome = await search(
    host,
    { query: 'durable agent extension' },
    async (_argv, _tool, args) => {
      if (args.provider === 'jina')
        throw new Error('The web search server did not answer within 20000 ms.')
      return { isError: false, text: exaResults }
    },
  )
  expect(outcome).toMatchObject({
    status: 'success',
    provider: 'exa',
    fallback: {
      from: 'jina',
      reason: 'The web search server did not answer within 20000 ms.',
    },
  })
})

it('uses Jina when Ultimate secrets hold a key, and never a Pi variable', async () => {
  const { host, userHome, calls, answer } = await fixture()
  await writeSecret(userHome, 'JINA_API_KEY', 'jina-from-ultimate')
  vi.stubEnv('JINA_API_KEY', 'inherited-from-pi')
  const outcome = await search(
    host,
    { query: 'durable agent extension' },
    answer(() => ({ text: jinaResults })),
  )
  expect(calls).toHaveLength(1)
  expect(calls[0].options.env.JINA_API_KEY).toBe('jina-from-ultimate')
  expect(outcome).toMatchObject({ status: 'success', provider: 'jina', fallback: null })
})

it('gives the MCP server an empty Ultimate config directory and no inherited keys', async () => {
  const { host, home, calls, answer } = await fixture()
  for (const [name, value] of Object.entries({
    PI_CODING_AGENT_DIR: 'D:/pi-config',
    PI_CONFIG_DIR: 'D:/pi-config',
    XDG_CONFIG_HOME: 'D:/xdg',
    JINA_API_KEY: 'inherited',
    EXA_API_KEY: 'inherited',
  }))
    vi.stubEnv(name, value)
  await search(
    host,
    { query: 'durable agent extension' },
    answer(() => ({ text: exaResults })),
  )
  const env = calls[0].options.env
  expect(env.PI_CODING_AGENT_DIR).toBe(join(home, 'web-access/pi-config'))
  expect(await readdir(env.PI_CODING_AGENT_DIR!)).toEqual([])
  expect(env.PI_CONFIG_DIR).toBeUndefined()
  expect(env.XDG_CONFIG_HOME).toBeUndefined()
  expect(env.JINA_API_KEY).toBeUndefined()
  expect(env.EXA_API_KEY).toBeUndefined()
  // Everything else the child needs to start, such as PATH, is still there.
  expect(env.PATH ?? env.Path).toBe(process.env.PATH ?? process.env.Path)
})

it('reports both provider errors when neither answers', async () => {
  const { host, answer } = await fixture()
  const outcome = await search(
    host,
    { query: 'durable agent extension' },
    answer((provider) => ({
      isError: true,
      text: `**Provider:** ${provider}\n\nError: ${provider} is unavailable today\n${guidance}`,
    })),
  )
  expect(outcome).toMatchObject({
    status: 'error',
    attempts: [
      { provider: 'jina', error: 'jina is unavailable today' },
      { provider: 'exa', error: 'exa is unavailable today' },
    ],
  })
  expect(outcome.text).toContain('- jina: jina is unavailable today')
  expect(outcome.text).toContain('- exa: exa is unavailable today')
})

it('stops at the first provider when the call was cancelled', async () => {
  const { host } = await fixture()
  const abort = new AbortController()
  abort.abort()
  const outcome = await search(
    host,
    { query: 'durable agent extension', signal: abort.signal },
    async () => {
      throw new Error('Search cancelled.')
    },
  )
  expect(outcome).toMatchObject({ status: 'error', text: 'Search cancelled.' })
})

it('reads the defaults, then the project settings', () => {
  expect(settingsFrom({})).toEqual({
    argv: ['npx', '-y', 'pi-web-access@0.44.0'],
    defaultProvider: 'jina',
    fallbackProvider: 'exa',
    timeoutMs: 20000,
  })
  expect(
    settingsFrom({
      webAccess: {
        mcpCommand: ['node', 'C:/tools/web-access/dist/mcp-cli.js'],
        defaultProvider: 'Jina',
        fallbackProvider: 'exa',
        timeoutMs: 5000,
      },
    }),
  ).toEqual({
    argv: ['node', 'C:/tools/web-access/dist/mcp-cli.js'],
    defaultProvider: 'jina',
    fallbackProvider: 'exa',
    timeoutMs: 5000,
  })
  expect(settingsFrom({ webAccess: { mcpCommand: 'pi-web-access-mcp' } }).argv).toEqual([
    'pi-web-access-mcp',
  ])
  // An empty command and a timeout outside the useful range fall back to the defaults.
  expect(settingsFrom({ webAccess: { mcpCommand: [], timeoutMs: 5 } })).toMatchObject({
    argv: ['npx', '-y', 'pi-web-access@0.44.0'],
    timeoutMs: 20000,
  })
})

it('maps the provider text to its summary, sources and error', () => {
  expect(parseSearchText(exaResults)).toEqual({
    provider: 'exa',
    answer:
      'Exa brings durable execution to agents: it persists sessions and recovers from failures.',
    results: [
      {
        title: 'Durable Extension | Microsoft Learn',
        url: 'https://learn.microsoft.com/en-us/agent-framework/hosting/durable-extension',
      },
      { title: 'Exa: web search API', url: 'https://exa.ai/' },
    ],
    error: '',
  })
  expect(parseSearchText(jinaSourcesOnly)).toMatchObject({
    provider: 'jina',
    answer: '',
    results: [
      { title: 'Jina AI', url: 'https://jina.ai/' },
      {
        title: 'Durable Extension | Microsoft Learn',
        url: 'https://learn.microsoft.com/en-us/agent-framework/hosting/durable-extension',
      },
    ],
  })
  expect(parseSearchText(jinaMissingKey)).toMatchObject({
    provider: 'jina',
    results: [],
    error:
      'Jina Search API key not found. Either:\n  1. Create the config file with { "jinaApiKey": "your-key" }\n  2. Set JINA_API_KEY environment variable',
  })
  expect(parseSearchText('**Provider:** exa\n\nNo results found.')).toMatchObject({
    provider: 'exa',
    answer: 'No results found.',
    results: [],
  })
})

it('sets the config directory and carries only the keys it was given', () => {
  const env = childEnvironment(
    'C:/state/pi-config',
    { JINA_API_KEY: 'k' },
    {
      PATH: 'p',
      PI_CODING_AGENT_DIR: 'D:/pi-config',
      PI_CONFIG_DIR: 'D:/pi-config',
      XDG_CONFIG_HOME: 'D:/xdg',
      JINA_API_KEY: 'inherited',
      EXA_API_KEY: 'inherited',
    },
  )
  expect(env).toEqual({ PATH: 'p', PI_CODING_AGENT_DIR: 'C:/state/pi-config', JINA_API_KEY: 'k' })
})
