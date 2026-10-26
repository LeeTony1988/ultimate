import { existsSync } from 'node:fs'
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { setImmediate as yieldIO } from 'node:timers/promises'
import { join, resolve, sep } from 'node:path'
import { applyImmutable } from '@earendil-works/chord/delta'
import type { Op } from '@earendil-works/chord/delta'
import type { ConversationId, ConversationView, Harness } from '@earendil-works/pi-durable'
import { afterAll, vi } from 'vitest'
import { ProjectTrustStore } from '@earendil-works/pi-coding-agent'
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux'
import type { FauxResponseFactory } from '@earendil-works/pi-ai/providers/faux'
import { Tally } from '../extensions/lineage/server.ts'
import { context } from '../server/harness.ts'
import { createServer, prepareServer } from '../server/main.ts'
import type { ServerOptions } from '../server/main.ts'
import type { ServerEvents, SystemInfo } from '../shared/protocol.ts'
import type { Api } from '../shared/extension-api.ts'
import type { EventData, EventToken } from '../shared/events.ts'
import { EventFeed, eventLog } from '../server/events.ts'
import type { Reactor } from '../server/events.ts'

vi.mock('@earendil-works/pi-ai/providers/faux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@earendil-works/pi-ai/providers/faux')>()
  return {
    ...original,
    fauxProvider: (options: Parameters<typeof original.fauxProvider>[0]) =>
      original.fauxProvider({ ...options, tokensPerSecond: 0 }),
  }
})

/**
 * `implement`, `need` and `want` over a plain map, for extension hosts built by hand. `need` resolves the provider on
 * each member access like the real handle, so a fixture may implement an API after its consumer took the handle.
 */
/**
 * `need` for a hand-built host whose core services stay out of the test: every method resolves undefined, as a worktree
 * lookup for a conversation without one does.
 */
export const idleNeed = <S>(_api: Api<string, S>) =>
  new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : async () => undefined) }) as S

export function apis(provided = new Map<string, unknown>()) {
  return {
    provided,
    implement: <S>(api: Api<string, S>, value: S) => void provided.set(api.name, value),
    want: <S>(api: Api<string, S>) => provided.get(api.name) as S | undefined,
    need: <S>(api: Api<string, S>) =>
      new Proxy(
        {},
        {
          get: (_, key) => (provided.get(api.name) as Record<string | symbol, unknown>)?.[key],
        },
      ) as S,
  }
}

/**
 * A real event log for a hand-built host over `harness`: `emit`, and `react` as extension `name` registers reactors,
 * which run from `start()` (each harness open) until `stop()`. `settled()` holds once every event is handled.
 */
export function eventHost(harness: () => Harness, name: string) {
  const log = eventLog(harness, (_call, work) => work())
  const reactors: ReturnType<typeof log.reactor>[] = []
  return {
    emit: log.emit,
    /** The event feed by its kind, as the real host's `doc` finds it; other kinds are the fixture's own. */
    doc: (kind: string) => (kind === EventFeed.definition.kind ? EventFeed : undefined),
    react: <T extends EventToken>(
      reactor: string,
      events: readonly T[],
      handler: Reactor<EventData<T>>,
    ) => void reactors.push(log.reactor(`${name}/${reactor}`, events, handler)),
    eventLog: log.eventLog,
    start: () => Promise.all(reactors.map((reactor) => reactor.start())),
    stop: () => Promise.all(reactors.map((reactor) => reactor.stop())),
    settled: async () =>
      (await log.eventLog.reactors()).every((reactor) => reactor.lag === 0 && !reactor.failure),
  }
}

/** A path as a valid ESM specifier on every platform; generated fixture sources import through it. */
export const moduleURL = (path: string) => pathToFileURL(resolve(path)).href
export function cleanEnv(extra: NodeJS.ProcessEnv = {}) {
  const isolatedTemp = process.env.TMPDIR
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ULTIMATE_')),
    ),
    // On Windows Node uses TMP/TEMP for os.tmpdir(); preserve the worker's isolated TMPDIR in children too.
    ...(isolatedTemp ? { TMPDIR: isolatedTemp, TMP: isolatedTemp, TEMP: isolatedTemp } : {}),
    ...extra,
  }
}
// Tests run without the supervisor's ULTIMATE_* variables: removed once, not stubbed per test, so concurrent tests never
// see them come back. Stubs a test leaves behind end with its file; stubbing restores to unset.
for (const key of Object.keys(process.env)) if (key.startsWith('ULTIMATE_')) delete process.env[key]
afterAll(() => vi.unstubAllEnvs())

// Every temp() directory is removed once the test file finishes, so runs do not fill the tmpfs.
const temps = new Set<string>()
afterAll(removeTemps, 60_000)
export async function removeTemps() {
  // Delete disjoint roots only: source copies are registered inside their fixture homes.
  const paths = [...temps]
  const roots = paths.filter((path) => !paths.some((parent) => path.startsWith(parent + sep)))
  await Promise.all(roots.map(removeTemp))
}
export async function removeTemp(path: string) {
  for (const registered of temps)
    if (registered === path || registered.startsWith(path + sep)) temps.delete(registered)
  // Best effort: a closing Vite optimizer can still be writing deps_temp, and cleanup must not fail a test.
  await rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {})
}
export async function temp(prefix = 'ultimate-test-', parent = tmpdir()) {
  const path = await mkdtemp(join(parent, prefix))
  temps.add(path)
  return path
}
/** Link a directory into a fixture; Windows junctions need no symlink privilege. */
export async function linkDirectory(target: string, path: string) {
  if (!(await stat(target)).isDirectory()) throw new Error(`Not a directory: ${target}`)
  await symlink(target, path, process.platform === 'win32' ? 'junction' : 'dir')
}
export async function linkDependencies(root: string) {
  const target = join(root, 'node_modules')
  await mkdir(target)
  for (const name of await readdir(resolve('node_modules'))) {
    if (name.startsWith('.vite')) continue
    const source = resolve('node_modules', name)
    // Junctions represent directories only; pnpm's metadata files are not fixture dependencies.
    if (process.platform === 'win32' && !(await stat(source)).isDirectory()) continue
    if (process.platform === 'win32') await linkDirectory(source, join(target, name))
    else await symlink(source, join(target, name))
  }
}
/**
 * Copy `shared/`, `lib/` and every extension's `api.ts` and `refs.ts` into `root`, so partially copied extensions find
 * their contracts and helpers.
 */
export async function copyApis(root: string) {
  await cp(resolve('shared'), join(root, 'shared'), { recursive: true })
  await cp(resolve('lib'), join(root, 'lib'), { recursive: true })
  for (const name of await readdir(resolve('extensions')))
    for (const file of ['api.ts', 'refs.ts']) {
      const contract = resolve('extensions', name, file)
      if (!existsSync(contract)) continue
      await mkdir(join(root, 'extensions', name), { recursive: true })
      await cp(contract, join(root, 'extensions', name, file))
    }
}
export async function sourceCopy(parent: string) {
  await mkdir(parent, { recursive: true })
  const root = await temp('source-', parent)
  await cp(resolve('.'), root, {
    recursive: true,
    filter: (path) =>
      !['.git', 'node_modules'].includes(path.slice(resolve('.').length + 1).split('/')[0]),
  })
  await linkDependencies(root)
  const config = join(root, 'vite.config.ts')
  // Optimize on page requests, not fixture boot; React's plugin otherwise eagerly includes deps.
  await writeFile(
    config,
    (await readFile(config, 'utf8'))
      .replace(
        'export default defineConfig({',
        "export default defineConfig({ cacheDir: '.vite-cache', optimizeDeps: { entries: [] },",
      )
      .replace(
        'plugins: [react(), tailwindcss()],',
        "plugins: [react(), tailwindcss(), { name: 'test:lazy-deps', configResolved(config) { config.optimizeDeps.include = [] } }],",
      ),
  )
  new ProjectTrustStore(join(parent, '.ultimate')).set(root, true)
  return root
}
type FixtureOptions = ServerOptions & {
  home: string
  userHome: string
  localSetup?: boolean
  /** Keep the first-run welcome; by default it is marked done so it does not cover the UI under test. */
  firstRun?: boolean
}
async function isolated(options: FixtureOptions) {
  const { home, userHome } = options
  const ultimateRoot =
    options.ultimateRoot === resolve('.') ? await sourceCopy(home) : options.ultimateRoot
  const projectRoot =
    !options.projectRoot || options.projectRoot === resolve('.')
      ? ultimateRoot
      : options.projectRoot
  if (options.localSetup !== false)
    new ProjectTrustStore(join(userHome, '.ultimate')).set(projectRoot, true)
  if (!options.firstRun) {
    await mkdir(join(userHome, '.ultimate'), { recursive: true })
    await writeFile(join(userHome, '.ultimate/onboarding.json'), '{"firstRunDone":true}\n')
  }
  const { firstRun: _firstRun, ...server } = options
  return {
    ...server,
    ultimateRoot,
    projectRoot,
    userHome,
    home,
    faux: options.faux ?? fauxProvider(),
    port: options.port ?? 0,
  }
}
export async function fauxServer(options: FixtureOptions) {
  const server = await createServer(await isolated(options))
  const close = server.close.bind(server)
  server.close = async () => {
    await server.vite.watcher.close()
    await close()
  }
  return server
}
export async function prepareFauxServer(options: FixtureOptions) {
  return prepareServer(await isolated(options))
}
/** A scripted answer that never arrives: its run stays busy until it is aborted. */
export const held: FauxResponseFactory = (_context, options) =>
  new Promise((_answer, fail) =>
    options?.signal?.addEventListener('abort', () => fail(new Error('aborted'))),
  )
/**
 * Make the empty root `id` (default the project's first conversation) a tally from an empty head, as if it had read
 * nothing yet, so tests can branch from it. Does nothing when it already has entries.
 */
export async function seedTally(harness: Harness, id = 1) {
  await harness.commit(async (tx) => {
    const root = id as ConversationId
    if ((await tx.scanEntries({ conversationId: root }, 1)).items.length) return
    const entry = await tx.appendEntry(root, { kind: 'pi.reset', head: 'self' })
    ;(await tx.doc(Tally, root)).since = entry.id
  }, context)
}
export async function until(
  test: () => boolean | Promise<boolean>,
  timeout = 30000,
  tick?: () => Promise<unknown>,
) {
  const deadline = performance.now() + timeout
  while (!(await test())) {
    if (performance.now() > deadline) throw new Error('Timed out')
    await tick?.()
    await yieldIO()
  }
}
export async function post(server: string | { url: string }, path: string, data: unknown = {}) {
  const url = typeof server === 'string' ? server : server.url
  const response = await fetch(url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: url },
    body: JSON.stringify(data),
  })
  return { status: response.status, data: await response.json() }
}
export async function attach(server: string | { url: string }, query = '') {
  const url = typeof server === 'string' ? server : server.url
  const controller = new AbortController()
  const events: { name: keyof ServerEvents; data: unknown }[] = []
  let system: SystemInfo | undefined
  let view: ConversationView | undefined
  let connections = 0
  const task = (async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(url + '/api/events' + query, { signal: controller.signal })
        if (response.status !== 200) throw new Error(`SSE status ${response.status}`)
        connections++
        const reader = response.body!.getReader()
        let wire = ''
        while (!controller.signal.aborted) {
          const result = await reader.read()
          if (result.done) break
          wire += new TextDecoder().decode(result.value)
          let index: number
          while ((index = wire.indexOf('\n\n')) !== -1) {
            const block = wire.slice(0, index)
            wire = wire.slice(index + 2)
            const name = /^event: (.+)$/m.exec(block)?.[1] as keyof ServerEvents | undefined
            const data = /^data: (.+)$/m.exec(block)?.[1]
            if (!name || !data) continue
            const parsed: unknown = JSON.parse(data)
            events.push({ name, data: parsed })
            if (name === 'system') system = parsed as SystemInfo
            if (name === 'view') view = parsed as ConversationView
            if (name === 'ops' && view) view = applyImmutable(view, parsed as Op[])
          }
        }
      } catch (error) {
        if (controller.signal.aborted) break
        if (!String(error).includes('fetch failed') && !String(error).includes('terminated'))
          throw error
      }
      await yieldIO()
    }
  })()
  await until(() => !!view)
  return {
    events,
    system: () => system!,
    view: () => view!,
    connections: () => connections,
    async close() {
      controller.abort()
      await task
    },
  }
}
