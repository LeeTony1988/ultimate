// Which tests a change can affect: given the changed paths, the unit and e2e test files whose module graph reaches one
// of them. Two edges count, both read with `parseSync`: a relative import (or the `@/` alias into `web/src`), and a
// repository file a module names literally, because a test that copies or reads a file by path depends on it as much as
// on an import. Fail safe: a change to the core, the harness, the toolchain, or anything the selector cannot read runs
// every test. Usage: pnpm test:changed [range] [--print] [--unit|--e2e].
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseSync } from 'vite-plus'
import { changedPaths, git, uncommittedPaths } from '../lib/git.ts'

/** One changed path and the test files it reaches; empty lists mean no test can speak for it. */
export type Impact = { path: string; unit: string[]; e2e: string[] }

export type Selection = {
  /** Why the selection is what it is, in one sentence. */
  reason: string
  /** The change sits where every test can see it, or cannot be judged: run both whole suites. */
  everything: boolean
  unit: string[]
  e2e: string[]
  /** One entry per changed path that is not a document; documents reach no test at all. */
  impact: Impact[]
}

export type Graph = {
  /** Every `.ts`/`.tsx` source, as paths relative with `/`. */
  files: string[]
  /** The modules each source imports, by relative specifier or `@/`, whether or not the module still exists. */
  edges: Map<string, string[]>
  /** The repository files each source names literally, which it reads without importing. */
  reads: Map<string, string[]>
  /** Sources the parser cannot read; their edges are unknown, so nothing can be judged from them. */
  failures: string[]
  /** The e2e tests that open a real browser: the only tests a browser-only change can fail. */
  browser: string[]
}

const asPosix = (path: string) => path.split(sep).join('/')
const sourceFile = /\.tsx?$/
/** Folders no source of the project lives in. */
const ignored = new Set(['node_modules', '.git'])

/** Every `.ts`/`.tsx` file under `root`, as paths relative with `/`. */
function sources(root: string, folder = ''): string[] {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = folder ? `${folder}/${entry.name}` : entry.name
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : sources(root, path)
    return sourceFile.test(entry.name) ? [path] : []
  })
}

/**
 * The paths one specifier can name, in resolution order: a relative one from the importing file, an `@/` one from
 * `web/src`. A bare package specifier names nothing here. The literal comes first, so `./x.ts` resolves to itself.
 */
function candidates(importer: string, specifier: string) {
  const clean = specifier.split('?')[0]
  let base: string
  if (clean.startsWith('.')) base = join(dirname(importer), clean)
  else if (clean.startsWith('@/')) base = join('web/src', clean.slice(2))
  else return []
  const paths = [base]
  if (!sourceFile.test(clean)) paths.push(`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'))
  return paths.map(asPosix)
}

/** The specifiers one source names: imports, re-exports, and dynamic imports written as a literal. */
function specifiers(module: ReturnType<typeof parseSync>['module'], text: string): string[] {
  const found = module.staticImports.map(({ moduleRequest }) => moduleRequest.value)
  for (const { entries } of module.staticExports)
    for (const entry of entries) if (entry.moduleRequest) found.push(entry.moduleRequest.value)
  for (const { moduleRequest } of module.dynamicImports) {
    const literal = /^(['"`])(.*)\1$/.exec(text.slice(moduleRequest.start, moduleRequest.end))?.[2]
    if (literal) found.push(literal)
  }
  return found
}

/**
 * The functions that take a repository path and read or write it. A literal argument to one of them is a dependency: the
 * file it names is an input of whatever module holds the call. A literal anywhere else is data (an excerpt, a tool
 * argument, a fixture's contents) and says nothing about what the module reads.
 */
const readers =
  /\b(readFile|readFileSync|writeFile|writeFileSync|appendFile|createReadStream|readdir|readdirSync|existsSync|statSync|stat|realpath|cp|cpSync|mkdir|mkdirSync|copyFile|rm|linkDirectory|import)\s*\(\s*$/

/** The repository files `text` reads by a literal path, which it never imports. */
function literalReads(text: string, root: string, self: string) {
  const found = new Set<string>()
  for (const match of text.matchAll(/(['"`])([^'"`\n$]+)\1/g)) {
    const literal = match[2].replace(/^\.\//, '')
    // A path the source builds at runtime, an absolute one and a package are not repository files.
    if (
      !literal ||
      literal.startsWith('.') ||
      literal.includes('*') ||
      /^[A-Za-z]:|^\//.test(literal)
    )
      continue
    // Only a literal an argument to a reading call counts: the same text as data says nothing about what is read.
    if (!readers.test(text.slice(Math.max(0, match.index - 64), match.index))) continue
    const path = join(root, literal)
    const target = asPosix(relative(root, path))
    if (target === self || target.startsWith('..')) continue
    const top = target.split('/')[0]
    if (ignored.has(top) || top === 'test') continue
    if (statSync(path, { throwIfNoEntry: false })?.isFile()) found.add(target)
  }
  return [...found].toSorted()
}

/**
 * The module graph of the repository at `root`. A source's edges follow what it names, so a deleted or renamed module
 * still leads back to the files that import it; a source the parser rejects is recorded in `failures` instead.
 */
export function moduleGraph(root: string): Graph {
  const files = sources(root)
  const edges = new Map<string, string[]>()
  const reads = new Map<string, string[]>()
  const failures: string[] = []
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8')
    const { module, errors } = parseSync(join(root, file), text)
    if (errors.length) {
      failures.push(`${file}: ${errors[0].message}`)
      continue
    }
    const targets = new Set<string>()
    for (const specifier of specifiers(module, text))
      for (const candidate of candidates(file, specifier))
        if (candidate !== file) targets.add(candidate)
    edges.set(file, [...targets].toSorted())
    const read = literalReads(text, root, file)
    if (read.length) reads.set(file, read)
  }
  // Playwright is imported only by an e2e test that opens a page; that is what makes it the browser gate.
  const browser = files.filter(
    (file) => e2eTest(file) && drivesBrowser.test(readFileSync(join(root, file), 'utf8')),
  )
  return { files, edges, reads, failures, browser }
}

/** Every module `from` reaches, itself and what it reads by path included. */
function reaches(graph: Graph, from: string) {
  const reached = new Set<string>()
  const pending = [from]
  const visit = (path: string) => {
    if (reached.has(path)) return
    reached.add(path)
    pending.push(path)
  }
  visit(from)
  while (pending.length) {
    const file = pending.pop()!
    for (const target of graph.edges.get(file) ?? []) visit(target)
    for (const path of graph.reads.get(file) ?? []) reached.add(path)
  }
  return reached
}

/** Core, the toolchain that runs the tests, and what a test loads before any case: every test can see a change here. */
const everythingFolder = /^(server|shared|bin|scripts|lint|patches)\//
const everythingFile =
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|vite\.config\.ts|tsconfig[^/]*\.json)$/
/** Documents: no test reads them (`pnpm check` still runs). */
const documentPath = (path: string) =>
  path.endsWith('.md') || /^(docs|agent_design|analysis_design|skills)\//.test(path)
const unitTest = (path: string) => path.startsWith('test/') && path.endsWith('.test.ts')
const e2eTest = (path: string) => path.startsWith('test/e2e/')
/**
 * Browser code: a `.tsx`, or anything under `web/src`. No Node test imports it, so only an e2e test that opens a real
 * browser can observe a change to it.
 */
const browserPath = (path: string) =>
  path.endsWith('.tsx') ||
  path.startsWith('web/') ||
  /^extensions\/[^/]+\/(ui|web)\.tsx$/.test(path)
/** What an e2e test imports when it drives a real page: Playwright or the browser it launches. */
const drivesBrowser = /playwright-core|ULTIMATE_CHROMIUM/

const listed = (paths: string[]) =>
  paths.length <= 3
    ? paths.join(', ')
    : `${paths.slice(0, 3).join(', ')} and ${paths.length - 3} more`
/**
 * The tests to run for `changed`, the paths of a change relative to `root`: the test files themselves, and every test
 * whose module graph reaches a changed path. A change the graph cannot judge runs everything; it never runs nothing for
 * a change it cannot see.
 */
export function selection(changed: string[], graph: Graph): Selection {
  const paths = [...new Set(changed.map((path) => asPosix(path).replace(/^\.\//, '')))]
    .filter(Boolean)
    .toSorted()
  const all = (reason: string): Selection => ({
    reason,
    everything: true,
    unit: [],
    e2e: [],
    impact: [],
  })
  if (!paths.length) return all('no changed path: nothing narrows the suite')
  const forced = paths.filter((path) => everythingFolder.test(path) || everythingFile.test(path))
  if (forced.length) return all(`${listed(forced)} can reach every test`)
  // The harness, its fixtures and the e2e config: every test in that suite loads them.
  const harness = paths.filter((path) => path.startsWith('test/') && !unitTest(path))
  if (harness.length) return all(`${listed(harness)} is test infrastructure`)
  if (graph.failures.length) return all(`the module graph cannot be read: ${graph.failures[0]}`)

  const unitFiles = graph.files.filter((file) => unitTest(file) && !e2eTest(file))
  const e2eFiles = graph.files.filter((file) => unitTest(file) && e2eTest(file))
  const tests = [...unitFiles, ...e2eFiles]
  const reached = new Map(tests.map((test) => [test, reaches(graph, test)] as const))
  const reaching = (path: string) => (test: string) => reached.get(test)!.has(path)
  const unit = new Set<string>()
  const e2e = new Set<string>()
  const impact: Impact[] = []
  for (const path of paths) {
    const reachingPath = reaching(path)
    // A test file is its own test: the graph answers for the sources a test reaches, not for other tests. A document
    // only a test's own source reads literally (a fixture's README, an agent's instructions) is reached like any file.
    const own = tests.includes(path) ? [path] : []
    // Browser code reaches no Node test: the e2e tests that drive a browser are what would see it break. A browser test
    // that also reaches the path by import is selected once, by the Set below.
    const browser = browserPath(path) && !own.length ? graph.browser : []
    const entry: Impact = {
      path,
      unit: (own.length ? own : unitFiles.filter(reachingPath)).filter((test) => !e2eTest(test)),
      e2e: [
        ...(own.length ? own : e2eFiles.filter(reachingPath)).filter((test) => e2eTest(test)),
        ...browser,
      ],
    }
    for (const test of entry.unit) unit.add(test)
    for (const test of entry.e2e) e2e.add(test)
    impact.push(entry)
  }
  // A document no test reaches selects nothing; it is not a gap in the tests, so it is not reported as one.
  const relevant = impact.filter(
    (entry) => entry.unit.length || entry.e2e.length || !documentPath(entry.path),
  )
  if (!relevant.length)
    return {
      reason: 'only documents: no test reads them',
      everything: false,
      unit: [],
      e2e: [],
      impact: [],
    }
  const silent = relevant
    .filter(({ unit: u, e2e: e }) => !u.length && !e.length)
    .map(({ path }) => path)
  return {
    reason: [
      `${relevant.length - silent.length} of ${relevant.length} changed paths are reached by a test`,
      silent.length ? `${listed(silent)}: no test reaches it` : '',
    ]
      .filter(Boolean)
      .join('; '),
    everything: false,
    unit: [...unit].toSorted(),
    e2e: [...e2e].toSorted(),
    impact: relevant,
  }
}

/** The selection as the lines to print: one per changed path, the suite totals, then the files it will run. */
export function report(result: Selection, totals: { unit: number; e2e: number }) {
  const suite = (name: string, tests: string[], total: number) =>
    result.everything
      ? `${name}: all ${total} test files`
      : `${name}: ${tests.length ? `${tests.length} of ${total} test files` : 'none'}`
  const why = (entry: Impact) => {
    const found = [
      entry.unit.length ? `${entry.unit.length} unit` : '',
      entry.e2e.length ? `${entry.e2e.length} e2e` : '',
    ].filter(Boolean)
    return `  ${entry.path} → ${found.length ? found.join(', ') : 'no test'}`
  }
  const listedTests = (tests: string[]) =>
    result.everything ? [] : tests.map((test) => `  ${test}`)
  return [
    result.reason,
    ...result.impact.map(why),
    '',
    suite('Unit', result.unit, totals.unit),
    ...listedTests(result.unit),
    '',
    suite('e2e', result.e2e, totals.e2e),
    ...listedTests(result.e2e),
  ]
}

/** The change `range` (default `origin/dev/lxy`) names: its merge-base with `HEAD`, plus the working tree. */
async function changeSince(root: string, range: string) {
  const commit = await git(root, 'rev-parse', '--verify', '--quiet', `${range}^{commit}`)
  const base = await git(root, 'merge-base', commit, 'HEAD')
  return {
    base,
    changed: [...(await changedPaths(root, base, 'HEAD')), ...(await uncommittedPaths(root))],
  }
}

/** The program and arguments that run one suite over exactly `tests`; no filters at all runs the whole suite. */
function command(root: string, suite: 'unit' | 'e2e', tests: string[]) {
  return suite === 'unit'
    ? { program: join(root, 'node_modules/vite-plus/bin/vp'), args: ['test', ...tests] }
    : {
        program: join(root, 'node_modules/vitest/vitest.mjs'),
        args: ['run', '--config', 'test/e2e/vitest.config.ts', ...tests],
      }
}

const totals = (graph: Graph) => ({
  unit: graph.files.filter((file) => unitTest(file) && !e2eTest(file)).length,
  e2e: graph.files.filter((file) => unitTest(file) && e2eTest(file)).length,
})

const usage = [
  'Usage: pnpm test:changed [range] [--print] [--unit] [--e2e]',
  '',
  'Runs the tests a change can affect: the unit and e2e files whose module graph reaches a changed path,',
  'through a relative import or through a repository file the test reads by path.',
  'range defaults to origin/dev/lxy; its merge-base with HEAD and the working tree are the change it selects for.',
  'A change to server/, shared/, bin/, the harness, scripts/, lint/ or the toolchain runs every test.',
  '--print selects and prints without running; --unit and --e2e run only that suite.',
].join('\n')

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(usage)
    process.exit(0)
  }
  const root = resolve(import.meta.dirname, '..')
  const range = args.find((arg) => !arg.startsWith('--')) ?? 'origin/dev/lxy'
  const graph = moduleGraph(root)
  let result: Selection
  try {
    const { base, changed } = await changeSince(root, range)
    console.log(
      `Change against ${range} (merge-base ${base.slice(0, 8)}) and the working tree: ${changed.length} paths`,
    )
    result = selection(changed, graph)
  } catch (error) {
    // Fail safe: a range or repository this cannot read runs everything rather than guessing.
    console.log(
      `Cannot read the change against ${range}: ${error instanceof Error ? error.message : String(error)}`,
    )
    result = { reason: 'every test runs', everything: true, unit: [], e2e: [], impact: [] }
  }
  for (const line of report(result, totals(graph))) console.log(line)
  if (args.includes('--print')) process.exit(0)
  const suites = args.includes('--unit')
    ? ['unit']
    : args.includes('--e2e')
      ? ['e2e']
      : ['unit', 'e2e']
  let status = 0
  for (const suite of suites) {
    const tests = suite === 'unit' ? result.unit : result.e2e
    if (!result.everything && !tests.length) continue
    console.log(
      `\n${suite}: ${result.everything ? 'the whole suite' : `${tests.length} test files`}`,
    )
    const run = command(root, suite as 'unit' | 'e2e', result.everything ? [] : tests)
    const outcome = spawnSync(process.execPath, [run.program, ...run.args], {
      cwd: root,
      stdio: 'inherit',
    })
    status ||= outcome.status ?? 1
  }
  process.exit(status)
}
