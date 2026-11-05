import { expect, it, vi } from 'vitest'
import { storeImages, storedImages } from '../../web/src/app/draft-images.ts'

const stored = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
})

it('keeps a draft’s pasted images across a reload, as its text', () => {
  const image = { data: 'iVBORw0KGgo=', mimeType: 'image/png' }
  storeImages('ultimate.draft.7', [image])
  expect(storedImages('ultimate.draft.7')).toEqual([image])
  // Sending or removing them clears what a reload brings back.
  storeImages('ultimate.draft.7', [])
  expect(storedImages('ultimate.draft.7')).toEqual([])
})
