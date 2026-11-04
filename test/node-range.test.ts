import { expect, it } from 'vitest'
import { satisfiesRange } from '../lib/node-range.ts'

it('reads the engines ranges package.json uses', () => {
  // The project's own range, and the host this repository found the hard way.
  expect(satisfiesRange('26.11.1', '>=26')).toBe(true)
  expect(satisfiesRange('24.21.0', '>=26')).toBe(false)
  // Cared versions and `v` prefixes.
  expect(satisfiesRange('v26.11.1', '^26.11.1')).toBe(true)
  expect(satisfiesRange('26.10.0', '^26.11.1')).toBe(false)
  expect(satisfiesRange('27.0.0', '^26.11.1')).toBe(false)
  // Unpinned parts are their whole prefix.
  expect(satisfiesRange('26.99.4', '26.x')).toBe(true)
  expect(satisfiesRange('27.0.0', '26.x')).toBe(false)
  expect(satisfiesRange('25.9.0', '>=24 <27')).toBe(true)
  expect(satisfiesRange('27.0.0', '>=24 <27')).toBe(false)
  // Alternatives.
  expect(satisfiesRange('24.9.0', '^26 || ^24')).toBe(true)
  expect(satisfiesRange('25.0.0', '^26 || ^24')).toBe(false)
  // `~` allows the patches of a pinned minor only.
  expect(satisfiesRange('26.1.9', '~26.1.0')).toBe(true)
  expect(satisfiesRange('26.2.0', '~26.1.0')).toBe(false)
  // Unreadable input never warns: a range this cannot parse admits everything.
  expect(satisfiesRange('24.0.0', 'bogus')).toBe(true)
  expect(satisfiesRange('24.0.0', '')).toBe(true)
  expect(satisfiesRange('not-a-version', '>=26')).toBe(true)
})
