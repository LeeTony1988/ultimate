// Summarise a CDP CPU profile from switch.ts: busy time, the app functions it was spent under (inclusive), and how
// much was React's development-only work.
// Usage: node profile-summary.ts <file.cpuprofile> [top=30]
import { readFileSync } from 'node:fs'

interface Node {
  id: number
  callFrame: { functionName: string; url: string; lineNumber: number }
  children?: number[]
}
const [file, top = '30'] = process.argv.slice(2)
if (!file) throw new Error('Usage: node profile-summary.ts <file.cpuprofile> [top]')
const profile = JSON.parse(readFileSync(file, 'utf8')) as {
  nodes: Node[]
  samples: number[]
  timeDeltas: number[]
}
const byId = new Map(profile.nodes.map((node) => [node.id, node]))
const parent = new Map<number, number>()
for (const node of profile.nodes)
  for (const child of node.children ?? []) parent.set(child, node.id)

// App code is served from web/src and extensions; dependencies come from Vite's prebundled deps.
const app = (node: Node) =>
  /\/(src|extensions)\//.test(node.callFrame.url) && !node.callFrame.url.includes('/deps/')
const name = (node: Node) =>
  `${node.callFrame.functionName || '(anonymous)'} ${node.callFrame.url
    .replace(/^.*?\/(src|extensions)\//, '$1/')
    .replace(/\?.*$/, '')}:${node.callFrame.lineNumber + 1}`
const devOnly =
  /^(jsxDEV|jsxDEVImpl|exports\.jsxDEV|logComponentRender|logComponentEffect|validateProperty|validatePropertiesInDevelopment|warnUnknownProperties|addObjectDiffToProperties|updatedAncestorInfoDev)$/

let busy = 0
let dev = 0
const inclusive = new Map<string, number>()
profile.samples.forEach((sample, index) => {
  const ms = profile.timeDeltas[index] / 1000
  if (/^\((idle|program|root)\)$/.test(byId.get(sample)!.callFrame.functionName)) return
  busy += ms
  const seen = new Set<string>()
  let isDev = false
  for (let id: number | undefined = sample; id !== undefined; id = parent.get(id)) {
    const node = byId.get(id)!
    if (devOnly.test(node.callFrame.functionName)) isDev = true
    if (!app(node)) continue
    const key = name(node)
    if (seen.has(key)) continue
    seen.add(key)
    inclusive.set(key, (inclusive.get(key) ?? 0) + ms)
  }
  if (isDev) dev += ms
})
console.log(`busy ${Math.round(busy)} ms, React development-only ${Math.round(dev)} ms`)
for (const [key, ms] of [...inclusive].toSorted((a, b) => b[1] - a[1]).slice(0, Number(top)))
  console.log(`${String(Math.round(ms)).padStart(6)} ms  ${key}`)
