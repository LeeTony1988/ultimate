/** `engines.node` ranges as package.json writes them: `>=26`, `^26.11.1`, `26.x`, `>=24 <27`, `26 || 28`. */

type Version = readonly number[]

/** Compare dot-separated versions, a missing part counting as 0. */
function compare(a: Version, b: Version) {
  for (let index = 0; index < Math.max(a.length, b.length); index++)
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0)
  return 0
}

/** A comparator's parts; `undefined` marks a wildcard (`x`, `*`, or a part left off). */
function parse(comparator: string) {
  const match =
    /^(\^|~|>=|<=|>|<|=)?\s*v?(\d+|[x*])(?:\.(\d+|[x*]))?(?:\.(\d+|[x*]))?(?:-[^\s]+)?$/.exec(
      comparator,
    )
  if (!match) return undefined
  const number = (part: string | undefined) =>
    part === undefined || part === 'x' || part === '*' ? undefined : Number(part)
  return {
    operator: match[1] ?? '',
    major: number(match[2]),
    minor: number(match[3]),
    patch: number(match[4]),
  }
}

/** Whether `version` satisfies one comparator; undefined when the comparator is not understood. */
function satisfied(version: Version, comparator: string): boolean | undefined {
  const parsed = parse(comparator)
  if (!parsed) return undefined
  const { operator, major, minor, patch } = parsed
  // `*` and `x` alone: every version.
  if (major === undefined) return true
  const low = [major, minor ?? 0, patch ?? 0]
  // The first version past an unpinned part: `26` and `26.x` end before 27, `26.1.x` before 26.2.
  const above: Version = minor === undefined ? [major + 1, 0, 0] : [major, minor + 1, 0]
  const atLeast = compare(version, low) >= 0
  const below = compare(version, above) < 0
  switch (operator) {
    case '':
    case '=':
      // A fully pinned version is exact; an unpinned one is its whole prefix range.
      if (minor === undefined) return atLeast && below
      return patch === undefined ? atLeast && below : compare(version, low) === 0
    case '>=':
      return atLeast
    case '>':
      // Past the unpinned part too: `>26` starts at 27.
      return compare(version, above) >= 0
    case '<':
      return compare(version, low) < 0
    case '<=':
      // Up to the end of the unpinned part: `<=26` still admits 26.99.
      return compare(version, above) < 0
    case '~':
      return atLeast && below
    case '^':
      // Up to the next major; `^0.2.3` stays inside 0.2, as npm reads it.
      return (
        atLeast &&
        compare(
          version,
          major === 0 ? (minor === undefined ? [1, 0, 0] : [0, minor + 1, 0]) : [major + 1, 0, 0],
        ) < 0
      )
    default:
      return undefined
  }
}

/**
 * Whether `version` (like `24.21.0`) satisfies a package.json range. A range this cannot read, or an unreadable
 * version, admits everything: the check warns only about a mismatch it is sure of.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const current = version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number(part))
  if (!current.length || current.some((part) => !Number.isFinite(part))) return true
  const alternatives = range
    .split('||')
    .map((alternative) =>
      alternative
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((comparator) => comparator.replace(/^(\^|~|>=|<=|>|<|=)\s+/, '$1')),
    )
    .filter((comparators) => comparators.length > 0)
  if (!alternatives.length) return true
  for (const comparators of alternatives) {
    let matched = true
    for (const comparator of comparators) {
      const result = satisfied(current, comparator)
      if (result === undefined) return true
      if (!result) {
        matched = false
        break
      }
    }
    if (matched) return true
  }
  return false
}
