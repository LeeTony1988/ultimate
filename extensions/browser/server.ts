import { access, mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, posix, resolve, win32 } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Type } from '@earendil-works/pi-ai'
import { formatDimensionNote, resizeImage } from '@earendil-works/pi-coding-agent'
import { defineExtension, defineTool, section } from '@earendil-works/pi-durable'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import type { ExtensionHost } from '../../server/extensions.ts'

type BrowserBinaryOptions = {
  platform?: NodeJS.Platform
  env?: Record<string, string | undefined>
  home?: string
  accessFile?: (path: string) => Promise<void>
  readDirectory?: (path: string) => Promise<string[]>
}

export async function browserBinary(options: BrowserBinaryOptions = {}) {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const home = options.home ?? homedir()
  const joinPath = platform === 'win32' ? win32.join : posix.join
  const accessFile = options.accessFile ?? ((path: string) => access(path))
  const readDirectory = options.readDirectory ?? ((path: string) => readdir(path))
  const isWindows = platform === 'win32'
  const localAppData = env.LOCALAPPDATA || undefined
  const cache = isWindows
    ? joinPath(localAppData ?? joinPath(home, 'AppData', 'Local'), 'ms-playwright')
    : joinPath(home, '.cache', 'ms-playwright')
  const cacheEntries = await readDirectory(cache).catch(() => {
    // A missing Playwright cache is normal; continue with installed browser candidates.
    return []
  })
  const cachedBrowsers = cacheEntries
    .filter((name) => name.startsWith('chromium-'))
    .toSorted()
    .toReversed()
    .flatMap((name) =>
      isWindows
        ? [
            joinPath(cache, name, 'chrome-win64', 'chrome.exe'),
            joinPath(cache, name, 'chrome-win', 'chrome.exe'),
          ]
        : [joinPath(cache, name, 'chrome-linux64', 'chrome')],
    )
  const windowsRoots = [
    env.ProgramFiles,
    env.ProgramW6432,
    env['ProgramFiles(x86)'],
    localAppData,
  ].filter((root): root is string => !!root?.trim())
  const windowsBrowsers = [...new Set(windowsRoots)].flatMap((root) => [
    joinPath(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    joinPath(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ])
  const candidates = [
    env.ULTIMATE_CHROMIUM,
    ...(isWindows
      ? [...windowsBrowsers, ...cachedBrowsers]
      : ['/usr/bin/chromium', '/usr/bin/google-chrome-stable', ...cachedBrowsers]),
  ].filter((path): path is string => !!path)
  for (const path of candidates) {
    try {
      await accessFile(path)
      return path
    } catch {
      /* try the next installed browser */
    }
  }
  throw new Error(
    isWindows
      ? 'No Chromium found. Set ULTIMATE_CHROMIUM or install Chrome or Edge under ProgramFiles, ProgramFiles(x86), or LOCALAPPDATA, or install a Playwright browser under LOCALAPPDATA\\ms-playwright.'
      : 'No Chromium found. Set ULTIMATE_CHROMIUM or install /usr/bin/chromium, /usr/bin/google-chrome-stable, or ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome.',
  )
}

/** The PNG's absolute path: `path` against the conversation's cwd, else a new file in the home's screenshots. */
export function screenshotFile(home: string, cwd: string, path?: string) {
  if (path === undefined) return join(home, 'screenshots', `${Date.now()}-${randomUUID()}.png`)
  if (!path.endsWith('.png'))
    throw new Error(
      `path is where the PNG is saved and must end in .png, not ${JSON.stringify(path)}; pass the page to load as url, such as / (it opens @ultimate).`,
    )
  return resolve(cwd, path)
}

/** Each page operation's limit unless a call passes timeoutMs; a call as a whole gets four of them plus its explicit waits. */
const stepTimeoutMs = 30_000
/** How long an `until` step waits on Ultimate's state unless it passes timeoutMs. */
const untilTimeoutMs = 300_000
/** How long closing a context, or the browser after it, may take before it counts as wedged. */
const closeTimeoutMs = 5_000

function timeout(ms: number) {
  return Object.assign(new Error(`timed out after ${ms / 1000}s`), { name: 'TimeoutError' })
}

/** `work`, unless `ms` pass first; a promise Playwright never settles (evaluate has no timeout) cannot hang the call. */
function within<T>(ms: number, work: Promise<T>, error = timeout(ms)) {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(error), Math.max(0, ms))
    }),
  ]).finally(() => clearTimeout(timer))
}

async function capture(page: Page, file: string, selector?: string, fullPage = false) {
  await mkdir(dirname(file), { recursive: true })
  const target = selector ? page.locator(selector) : page
  const png = await target.screenshot({
    path: file,
    type: 'png',
    ...(selector ? {} : { fullPage }),
  })
  const resized = await resizeImage(png, 'image/png', { maxWidth: 1600, maxHeight: 1600 })
  return {
    file,
    image: resized
      ? { type: 'image' as const, mimeType: resized.mimeType, data: resized.data }
      : undefined,
    note: resized
      ? formatDimensionNote(resized)
      : '[Image omitted: could not be resized below the inline image size limit.]',
  }
}

export default function browserExtension(host: ExtensionHost) {
  const state = host.resource('browser', () => {
    const resource: { launched?: Promise<Browser>; browser?: Browser } = {}
    host.onClose(async () => {
      if (resource.launched) await (await resource.launched).close()
    })
    return resource
  })
  const base = {
    url: Type.Optional(
      Type.String({ description: 'Page to load; relative URLs resolve against this UI.' }),
    ),
    path: Type.Optional(
      Type.String({
        description:
          'Where to save the PNG, relative to your cwd. Omit it unless the file must be committed: the default, a new file in the home, keeps screenshots out of your checkout.',
      }),
    ),
    timeoutMs: Type.Optional(
      Type.Integer({ minimum: 1, description: 'Limit per step, load and capture; default 30000.' }),
    ),
  }
  return defineExtension({
    name: 'browser',
    sections: [
      section(
        'visual_verification',
        () =>
          'Before browser work, read the shipped ego-browser skill and run `ego-browser skill`; prefer ego-browser and its versioned guide. Use these Playwright browser and screenshot tools only as a fallback. After UI changes, inspect the image before claiming success. Use browser to drive fresh pages and inspect errors. Omit url to see your own UI, or pass a relative url such as / (it opens @ultimate) or /?conversation=<id>; do not guess its port. Omit path: the PNG then goes to the home, outside your checkout, where a stray file would block landing; pass path: `<file>.png` only for a screenshot you commit. Pass an instance URL to test another server.',
      ),
    ],
    tools: [
      defineTool({
        name: 'screenshot',
        description:
          'Look at a browser page; save a full-resolution PNG and return a compact image with loading errors. Loading and capturing each time out after 30 s.',
        // A fresh isolated page only observes the UI and writes the screenshot again; it performs no interactions.
        replay: 'safe',
        parameters: Type.Object({
          ...base,
          width: Type.Optional(Type.Integer({ minimum: 1 })),
          height: Type.Optional(Type.Integer({ minimum: 1 })),
          fullPage: Type.Optional(Type.Boolean()),
          selector: Type.Optional(Type.String()),
          waitMs: Type.Optional(Type.Integer({ minimum: 0 })),
          theme: Type.Optional(Type.Union([Type.Literal('light'), Type.Literal('dark')])),
        }),
        async execute(args, api, context) {
          const waitMs = args.waitMs ?? 1500
          return run(args, waitMs, api, context, async (page, _outcomes, png, guard) => {
            await guard(page.waitForTimeout(waitMs), waitMs)
            return guard(capture(page, png, args.selector, args.fullPage))
          })
        },
      }),
      defineTool({
        name: 'browser',
        description:
          "Drive a fresh browser page with clicks, fills, keys, waits and JavaScript; report outcomes and optionally an image. Each step times out after 30 s. On an Ultimate page (this UI or a preview), `send` submits a prompt without the composer and `until` waits on Ultimate's state, never a guessed time: 'idle' (that conversation's turn is done), 'quiet' (nothing is busy, branches and subagents included), {entry: kind} or {event: name, where}; until defaults to 5 min (timeoutMs) and on timeout says what was still busy. Click and fill only to test the interaction itself.",
        parameters: Type.Object({
          ...base,
          steps: Type.Array(
            Type.Union([
              Type.Object({ click: Type.String() }),
              Type.Object({
                fill: Type.Array(Type.String(), {
                  minItems: 2,
                  maxItems: 2,
                  description: '[selector, value]',
                }),
              }),
              Type.Object({ press: Type.String() }),
              Type.Object({ wait: Type.Union([Type.Number({ minimum: 0 }), Type.String()]) }),
              Type.Object({ eval: Type.String() }),
              Type.Object({
                send: Type.String(),
                conversation: Type.Optional(Type.Integer({ minimum: 1 })),
              }),
              Type.Object({
                until: Type.Union([
                  Type.Literal('idle'),
                  Type.Literal('quiet'),
                  Type.Object({ entry: Type.String() }),
                  Type.Object({
                    event: Type.String(),
                    where: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
                  }),
                ]),
                conversation: Type.Optional(Type.Integer({ minimum: 1 })),
                timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
              }),
            ]),
          ),
          screenshot: Type.Optional(Type.Boolean()),
        }),
        async execute(args, api, context) {
          const waits = args.steps.reduce(
            (sum, step) =>
              sum +
              ('wait' in step && typeof step.wait === 'number'
                ? step.wait
                : 'until' in step
                  ? (step.timeoutMs ?? untilTimeoutMs)
                  : 0),
            0,
          )
          return run(args, waits, api, context, async (page, outcomes, png, guard) => {
            for (const [index, step] of args.steps.entries()) {
              context.abortSignal?.throwIfAborted()
              api.output(`Step ${index + 1}: ${JSON.stringify(step)}\n`)
              try {
                let value: unknown
                if ('click' in step) await guard(page.locator(step.click).click())
                else if ('fill' in step) await guard(page.locator(step.fill[0]).fill(step.fill[1]))
                else if ('press' in step) await guard(page.keyboard.press(step.press))
                else if ('wait' in step) {
                  if (typeof step.wait === 'number')
                    await guard(page.waitForTimeout(step.wait), step.wait)
                  else await guard(page.locator(step.wait).waitFor())
                } else if ('send' in step || 'until' in step) {
                  // `window.ultimate` (web/src/sdk/test-hook.ts) appears once the page's SDK has loaded.
                  await guard(
                    page
                      .waitForFunction(() => 'ultimate' in window)
                      .catch(() => {
                        throw new Error(
                          'This page has no window.ultimate: not an Ultimate UI, or one older than send/until steps',
                        )
                      }),
                  )
                  if ('send' in step)
                    value = await guard(
                      page.evaluate(
                        ([text, conversation]) =>
                          window.ultimate!.send(text, { conversation: conversation ?? undefined }),
                        [step.send, step.conversation ?? null] as const,
                      ),
                    )
                  else {
                    const ms = step.timeoutMs ?? untilTimeoutMs
                    // The hook times out first and says what was still busy; the guard only backs it up.
                    const outcome = await guard(
                      page.evaluate(
                        ([condition, conversation, timeoutMs]) =>
                          window
                            .ultimate!.until(condition, {
                              conversation: conversation ?? undefined,
                              timeoutMs,
                            })
                            .then(
                              (result) => ({ result }),
                              (error: unknown) => ({ error: String(error) }),
                            ),
                        [step.until, step.conversation ?? null, ms] as const,
                      ),
                      ms,
                    )
                    if ('error' in outcome) throw new Error(outcome.error.replace(/^Error: /, ''))
                    value = outcome.result
                  }
                } else value = await guard(page.evaluate(step.eval))
                outcomes.push(
                  `Step ${index + 1}: OK${value === undefined ? '' : ` ${JSON.stringify(value)}`}`,
                )
              } catch (error) {
                outcomes.push(`Step ${index + 1}: ${String(error)}`)
                throw error
              }
            }
            return args.screenshot === false ? undefined : guard(capture(page, png))
          })
        },
      }),
    ].map((tool) => ({ ...tool, outputSchema: { type: 'object' } })),
  })
  async function run(
    args: {
      url?: string
      path?: string
      width?: number
      height?: number
      theme?: 'light' | 'dark'
      timeoutMs?: number
    },
    waits: number,
    api: { output(text: string): void; env?: { cwd: string } },
    context: { abortSignal?: AbortSignal },
    action: (
      page: Page,
      outcomes: string[],
      png: string,
      guard: <T>(work: Promise<T>, extraMs?: number) => Promise<T>,
    ) => Promise<
      | {
          image?: { type: 'image'; mimeType: string; data: string }
          file: string
          note?: string
        }
      | undefined
    >,
  ) {
    const outcomes: string[] = []
    let isolated: BrowserContext | undefined
    const stepMs = args.timeoutMs ?? stepTimeoutMs
    const totalMs = 4 * stepMs + waits
    const deadline = Date.now() + totalMs
    /** `work` within one step's limit (plus a wait it asks for) and what is left of the call's. */
    const guard = <T>(work: Promise<T>, extraMs = 0) => {
      const left = deadline - Date.now()
      return left < stepMs + extraMs
        ? within(left, work, timeout(totalMs))
        : within(stepMs + extraMs, work)
    }
    const abort = () => void close(isolated)
    try {
      const png = screenshotFile(host.home, api.env?.cwd ?? host.projectRoot, args.path)
      context.abortSignal?.throwIfAborted()
      if (!state.launched) {
        const launched: Promise<Browser> = browserBinary()
          .then(async (executablePath) => {
            const browser = await chromium.launch({
              executablePath,
              headless: true,
              // Chromium's singleton socket needs a short system temp path. Playwright still puts the profile in our TMPDIR.
              env: { ...process.env, TMPDIR: undefined },
            })
            if (state.launched === launched) state.browser = browser
            browser.once('disconnected', () => {
              if (state.launched === launched) state.launched = undefined
            })
            return browser
          })
          .catch((error) => {
            if (state.launched === launched) state.launched = undefined
            throw error
          })
        state.launched = launched
      }
      const browser = await guard(state.launched)
      context.abortSignal?.throwIfAborted()
      isolated = await guard(
        browser.newContext({
          viewport: { width: args.width ?? 1440, height: args.height ?? 900 },
          colorScheme: args.theme,
        }),
      )
      context.abortSignal?.addEventListener('abort', abort, { once: true })
      const page = await guard(isolated.newPage())
      page.setDefaultTimeout(stepMs)
      page.setDefaultNavigationTimeout(stepMs)
      context.abortSignal?.throwIfAborted()
      page.on('console', (message) => {
        if (message.type() === 'error') outcomes.push(`Console error: ${message.text()}`)
      })
      page.on('pageerror', (error) => outcomes.push(`Page error: ${error.message}`))
      const url = new URL(args.url ?? '', host.system().process.url).href
      // Any Ultimate page, this UI or a preview, gets `window.ultimate` for send/until steps.
      await guard(page.addInitScript(() => sessionStorage.setItem('ultimate.driven', '1')))
      if (new URL(url).origin === new URL(host.system().process.url).origin) {
        // Own UI: this page is detached from the shared UI state (web/src/sdk/client.ts), so its `?conversation=`
        // and clicks never move the user's tabs; the theme is this browser's preference.
        await guard(
          page.addInitScript((theme: string | undefined) => {
            sessionStorage.setItem('ultimate.detached', '1')
            if (theme) localStorage.setItem('ultimate.theme', theme)
          }, args.theme),
        )
      }
      api.output(`Loading ${url}\n`)
      await guard(page.goto(url, { waitUntil: 'domcontentloaded' }))
      const result = await action(page, outcomes, png, guard)
      const title = await guard(page.title())
      context.abortSignal?.throwIfAborted()
      return {
        structuredContent: {
          title,
          ...(result
            ? {
                ...(result.image
                  ? { image: `data:${result.image.mimeType};base64,${result.image.data}` }
                  : {}),
                file: result.file,
              }
            : {}),
          outcomes,
        },
        output: [
          ...(result?.note ? [{ type: 'text' as const, text: result.note }] : []),
          ...(result?.image ? [result.image] : []),
          {
            type: 'text' as const,
            text: [`Title: ${title}`, ...(result ? [`PNG: ${result.file}`] : []), ...outcomes].join(
              '\n',
            ),
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        output: [{ type: 'text' as const, text: [...outcomes, String(error)].join('\n') }],
      }
    } finally {
      context.abortSignal?.removeEventListener('abort', abort)
      await close(isolated)
    }
  }

  /** Closes a call's context within a bounded time; a context that won't close takes the shared browser with it, so the next call launches a fresh one. */
  async function close(isolated: BrowserContext | undefined) {
    if (!isolated) return
    try {
      await within(closeTimeoutMs, isolated.close())
    } catch (error) {
      host.notice(`Closing a browser context failed (${String(error)}); relaunching the browser.`)
      const browser = isolated.browser()
      if (!browser) return
      if (state.browser === browser) {
        state.launched = undefined
        state.browser = undefined
      }
      // Closing kills the process too; a browser that won't even do that is left to the host's shutdown.
      await within(closeTimeoutMs, browser.close()).catch((reason: unknown) =>
        host.notice(`Closing the wedged browser failed: ${String(reason)}`),
      )
    }
  }
}
