// Measure conversation switches in a real Chromium against a running Ultimate (a preview on a paused copy).
// Usage: node switch.ts <url> <start id> <id,id,...> [--rounds 2] [--profile out.cpuprofile]
// Round 0 switches are cold (never shown in this tab), later rounds warm. Per switch it prints one JSON line: time to
// the stream's `view` event, `settled` (the last DOM change before 300 ms of quiet), main-thread long tasks, server
// event bytes, streams opened and JS heap; then medians per round. --profile writes a CDP CPU profile of every switch.
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { browserBinary } from '../../../extensions/browser/server.ts'

const args = process.argv.slice(2)
const [base, start, list] = args
const flag = (name: string) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
if (!base || !start || !list) throw new Error('Usage: node switch.ts <url> <start id> <id,id,...>')
const rounds = Number(flag('--rounds') ?? 2)
const profile = flag('--profile')

const browser = await chromium.launch({
  executablePath: await browserBinary(),
  args: ['--enable-precise-memory-info'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => {
  const w = window as unknown as Record<string, unknown>
  // `window.ultimate` (web/src/sdk/test-hook.ts) for the readiness wait.
  sessionStorage.setItem('ultimate.driven', '1')
  const log: { t: number; ev: string; url: string; kb?: number; conversation?: number }[] = []
  w.switchEvents = log
  const Native = window.EventSource
  window.EventSource = class extends Native {
    constructor(url: string | URL, init?: EventSourceInit) {
      super(url, init)
      const href = String(url)
      log.push({ t: performance.now(), ev: 'open', url: href })
      for (const name of ['stream', 'view', 'conversations', 'system', 'tasks', 'ui', 'doc'])
        this.addEventListener(name, (event) => {
          const data = (event as MessageEvent<string>).data
          // A subscription's view is `<sub>\n{"conversation":{"id":N},…}`: read its id without parsing the rest.
          const id = /^\d+\n\{"conversation":\{"id":(\d+)/.exec(data.slice(0, 80))?.[1]
          log.push({
            t: performance.now(),
            ev: name,
            url: href,
            kb: data.length / 1024,
            ...(id && { conversation: Number(id) }),
          })
        })
    }
  }
  const long: { t: number; d: number }[] = []
  w.switchLongTasks = long
  new PerformanceObserver((observed) => {
    for (const entry of observed.getEntries()) long.push({ t: entry.startTime, d: entry.duration })
  }).observe({ type: 'longtask', buffered: true })
  new MutationObserver(() => {
    w.switchLastMutation = performance.now()
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
})
await page.goto(`${base}/?conversation=${start}`)
await page.waitForFunction(() => 'ultimate' in window)
await page.evaluate(() =>
  (window as unknown as { ultimate: { state(): Promise<unknown> } }).ultimate.state(),
)
await page.waitForTimeout(4000)

const cdp = await page.context().newCDPSession(page)
if (profile) {
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  await cdp.send('Profiler.start')
}

type Result = Record<string, number>
const results: Result[] = []
for (let round = 0; round < rounds; round++)
  for (const target of list.split(',').map(Number)) {
    const result = await page.evaluate(async (id) => {
      const w = window as unknown as {
        switchEvents: { t: number; ev: string; url: string; kb?: number; conversation?: number }[]
        switchLongTasks: { t: number; d: number }[]
        switchLastMutation?: number
      }
      w.switchEvents.length = 0
      const started = performance.now()
      history.pushState(null, '', `/?conversation=${id}`)
      dispatchEvent(new PopStateEvent('popstate'))
      const pause = () => new Promise((resolve) => setTimeout(resolve, 10))
      const deadline = started + 20_000
      const ownView = () =>
        w.switchEvents.find((item) => item.ev === 'view' && item.conversation === id)
      while (!ownView() && performance.now() < deadline) await pause()
      while (performance.now() < deadline && performance.now() - (w.switchLastMutation ?? 0) < 300)
        await pause()
      const long = w.switchLongTasks.filter((item) => item.t >= started)
      const memory = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
      return {
        id,
        viewMs: Math.round((ownView()?.t ?? deadline) - started),
        settledMs: Math.round((w.switchLastMutation ?? started) - started),
        longMs: Math.round(long.reduce((sum, item) => sum + item.d, 0)),
        maxLongMs: Math.round(Math.max(0, ...long.map((item) => item.d))),
        eventKb: Math.round(w.switchEvents.reduce((sum, item) => sum + (item.kb ?? 0), 0)),
        // A tab keeps one stream; a switch that opens one (a reconnect) shows up here.
        streams: w.switchEvents.filter((item) => item.ev === 'stream').length,
        heapMb: Math.round(memory.usedJSHeapSize / 1048576),
      }
    }, target)
    results.push({ round, ...result })
    console.log(JSON.stringify({ round, ...result }))
  }
if (profile) {
  const { profile: data } = await cdp.send('Profiler.stop')
  writeFileSync(profile, JSON.stringify(data))
}
await browser.close()

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
for (let round = 0; round < rounds; round++) {
  const rows = results.filter((row) => row.round === round)
  const keys = ['viewMs', 'settledMs', 'longMs', 'maxLongMs', 'eventKb', 'streams', 'heapMb']
  console.log(
    `${round === 0 ? 'cold' : `warm ${round}`} medians:`,
    Object.fromEntries(keys.map((key) => [key, median(rows.map((row) => row[key]))])),
  )
}
