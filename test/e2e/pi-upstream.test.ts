import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const reference = readFileSync(new URL('docs/pi-upstream.md', root), 'utf8')
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

// Each entry names its file first ("- `path` — …"); backticks later in the prose are not paths.
const borrowed = reference
  .split('## Borrowed from Pi\n')[1]
  .split('\n## ')[0]
  .split('\n')
  .flatMap((line) => line.match(/^- `([^`]+)`/)?.[1] ?? [])
for (const file of new Set(borrowed)) {
  it(`${file}: listed Pi coupling is tracked and marked`, () => {
    expect(files, `${file}: remove stale docs/pi-upstream.md entry`).toContain(file)
    expect(readFileSync(new URL(file, root), 'utf8')).toMatch(/Pi upstream: @earendil-works\//)
  })
}

for (const file of files) {
  const text = readFileSync(new URL(file, root), 'utf8')
  for (const [, pkg, version] of text.matchAll(
    /Pi upstream: (@earendil-works\/[\w-]+)@([\d.\w+-]+)/g,
  )) {
    it(`${file}: recheck ${pkg} on upgrade and list it in docs/pi-upstream.md`, () => {
      const installed = JSON.parse(
        readFileSync(new URL(`node_modules/${pkg}/package.json`, root), 'utf8'),
      )
      expect(version, `${file}: recheck Pi upstream before updating the marker`).toBe(
        installed.version,
      )
      expect(borrowed, `${file}: document the coupling`).toContain(file)
    })
  }
}
