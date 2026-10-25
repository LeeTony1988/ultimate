import { win32 } from 'node:path'
import { expect, it } from 'vitest'
import { browserBinary } from '../extensions/browser/server.ts'

const home = 'C:\\Users\\test'

function accessOnly(...available: string[]) {
  const installed = new Set(available)
  return async (path: string) => {
    if (!installed.has(path)) throw new Error(`ENOENT: ${path}`)
  }
}

it('keeps ULTIMATE_CHROMIUM ahead of discovered Windows browsers', async () => {
  const override = 'D:\\tools\\chrome.exe'
  const chrome = win32.join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
  const result = await browserBinary({
    platform: 'win32',
    env: { ULTIMATE_CHROMIUM: override, ProgramFiles: 'C:\\Program Files' },
    home,
    accessFile: accessOnly(override, chrome),
    readDirectory: async () => [],
  })

  expect(result).toBe(override)
})

it.each([
  [
    'Chrome under ProgramFiles',
    { ProgramFiles: 'C:\\Program Files' },
    win32.join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ],
  [
    'Edge under ProgramFiles(x86)',
    { 'ProgramFiles(x86)': 'C:\\Program Files (x86)' },
    win32.join('C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ],
  [
    'per-user Chrome under LOCALAPPDATA',
    { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
    win32.join('C:\\Users\\test\\AppData\\Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ],
])('discovers Windows %s', async (_name, env, expected) => {
  const result = await browserBinary({
    platform: 'win32',
    env,
    home,
    accessFile: accessOnly(expected),
    readDirectory: async () => [],
  })

  expect(result).toBe(expected)
})

it('preserves Unix system browser candidates', async () => {
  const result = await browserBinary({
    platform: 'linux',
    env: {},
    home: '/home/test',
    accessFile: accessOnly('/usr/bin/google-chrome-stable'),
    readDirectory: async () => [],
  })

  expect(result).toBe('/usr/bin/google-chrome-stable')
})

it('uses the newest Unix Playwright cache candidate', async () => {
  const result = await browserBinary({
    platform: 'linux',
    env: {},
    home: '/home/test',
    accessFile: accessOnly('/home/test/.cache/ms-playwright/chromium-2/chrome-linux64/chrome'),
    readDirectory: async () => ['chromium-1', 'chromium-2'],
  })

  expect(result).toBe('/home/test/.cache/ms-playwright/chromium-2/chrome-linux64/chrome')
})
