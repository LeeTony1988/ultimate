/** The btw site list and the small rules that keep it usable; pure and browser-safe for tests. */
import type { BtwSite } from './refs.ts'

/** The two durable UI-state keys btw writes: the site list and the active tab. */
export const SitesState = 'ext.btw.sites'
export const ActiveState = 'ext.btw.active'

/** The assistants btw starts with; every one is editable and removable. */
export const DEFAULT_SITES: readonly BtwSite[] = [
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { id: 'doubao', name: '豆包', url: 'https://www.doubao.com/chat/' },
  { id: 'tongyi', name: '通义千问', url: 'https://www.tongyi.com/' },
]

/** The site name to show when the user leaves the name empty. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * A URL a browser may open: http(s) only, with `https://` assumed when no scheme was typed. Anything else (a
 * `javascript:` link, a local path, an empty field) is not a site.
 */
export function normalizeUrl(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    if (!url.hostname) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

/**
 * The stored site list, repaired: an absent value is the defaults, while an explicit empty list stays empty. Entries
 * that are not `{ id, name, url }` with an http(s) URL are dropped, and ids are unique.
 */
export function sitesOf(value: unknown): BtwSite[] {
  const defaults = () => DEFAULT_SITES.map((site) => ({ ...site }))
  if (value === undefined) return defaults()
  if (!Array.isArray(value)) return defaults()
  const seen = new Set<string>()
  const sites: BtwSite[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || !record.id || seen.has(record.id)) continue
    if (typeof record.url !== 'string') continue
    const url = normalizeUrl(record.url)
    if (!url) continue
    const name =
      typeof record.name === 'string' && record.name.trim() ? record.name.trim() : hostOf(url)
    seen.add(record.id)
    sites.push({ id: record.id, name, url })
  }
  return sites
}

/** The list after adding a site, or `undefined` when the URL is not one a browser can open. */
export function addSite(
  sites: readonly BtwSite[],
  draft: { name: string; url: string },
  id: string,
): BtwSite[] | undefined {
  const url = normalizeUrl(draft.url)
  if (!url) return undefined
  return [...sites, { id, name: draft.name.trim() || hostOf(url), url }]
}

/** The site a tab shows: the active one while it exists, else the first left. */
export const siteOf = (sites: readonly BtwSite[], active: string) =>
  sites.find((site) => site.id === active) ?? sites[0]
