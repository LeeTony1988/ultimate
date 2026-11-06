import { expect, it } from 'vitest'
import { createUiState } from '../../web/src/sdk/ui-state.ts'
import {
  ActiveState,
  DEFAULT_SITES,
  SitesState,
  addSite,
  normalizeUrl,
  siteOf,
  sitesOf,
} from '../../extensions/btw/logic.ts'

it('keeps the site list and active tab across a reload', () => {
  const page = createUiState(undefined)
  page.set(SitesState, [
    { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
    { id: 'mine', name: 'Mine', url: 'https://example.com/chat' },
  ])
  page.set(ActiveState, 'mine')

  // A reload starts from the durable UI state snapshot the server kept, not from the defaults.
  const reloaded = createUiState(undefined)
  reloaded.receive({
    [SitesState]: page.get(SitesState),
    [ActiveState]: page.get(ActiveState),
  } as never)
  const sites = sitesOf(reloaded.get(SitesState))
  const active = reloaded.get(ActiveState)
  expect(sites.map((site) => site.id)).toEqual(['deepseek', 'mine'])
  expect(typeof active).toBe('string')
  expect(siteOf(sites, active as string)?.name).toBe('Mine')
})

it('starts with the three defaults but keeps an explicit empty list empty', () => {
  expect(sitesOf(undefined).map((site) => site.id)).toEqual(DEFAULT_SITES.map((site) => site.id))
  expect(sitesOf([])).toEqual([])
  // A stored entry with a non-http URL or no id is dropped instead of becoming an Open target.
  expect(
    sitesOf([
      { id: 'ok', name: 'OK', url: 'https://example.com/' },
      { id: 'bad', name: 'Bad', url: 'javascript:alert(1)' },
      { name: 'No id', url: 'https://example.com/' },
    ]).map((site) => site.id),
  ).toEqual(['ok'])
})

it('adds http(s) sites, assumes https and rejects other schemes', () => {
  expect(addSite([], { name: '', url: 'chat.example.com' }, 'mine')).toEqual([
    { id: 'mine', name: 'chat.example.com', url: 'https://chat.example.com/' },
  ])
  expect(addSite([], { name: 'Bad', url: 'javascript:alert(1)' }, 'bad')).toBeUndefined()
  expect(normalizeUrl('ftp://example.com')).toBeUndefined()
})
