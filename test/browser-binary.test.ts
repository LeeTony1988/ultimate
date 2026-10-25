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
    'Chrome under a padded ProgramFiles root',
    { ProgramFiles: ' C:\\Program Files ' },
    win32.join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ],
  [
    'Chrome under ProgramW6432',
    { ProgramW6432: 'C:\\Program Files' },
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

it.each([
  ['chrome-win64', 'chrome-win64'],
  ['chrome-win', 'chrome-win'],
])(
  'finds Windows Playwright cache layout %s in LOCALAPPDATA, newest first',
  async (_layout, folder) => {
    const localAppData = 'C:\\Users\\test\\AppData\\Local'
    const cache = win32.join(localAppData, 'ms-playwright')
    const candidates = ['chromium-1', 'chromium-2'].map((version) =>
      win32.join(cache, version, folder, 'chrome.exe'),
    )
    const result = await browserBinary({
      platform: 'win32',
      env: { LOCALAPPDATA: localAppData },
      home,
      accessFile: accessOnly(...candidates),
      readDirectory: async () => ['chromium-1', 'chromium-2'],
    })

    expect(result).toBe(candidates[1])
  },
)

it('uses numeric Windows revision order when digit widths differ', async () => {
  const cache = win32.join('C:\\Users\\test\\AppData\\Local', 'ms-playwright')
  const older = win32.join(cache, 'chromium-999', 'chrome-win64', 'chrome.exe')
  const newer = win32.join(cache, 'chromium-1000', 'chrome-win64', 'chrome.exe')
  const result = await browserBinary({
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
    home,
    accessFile: accessOnly(older, newer),
    readDirectory: async () => ['chromium-999', 'chromium-1000'],
  })

  expect(result).toBe(newer)
})

it('checks installed Windows browsers before the Playwright cache', async () => {
  const programFiles = 'C:\\Program Files'
  const localAppData = 'C:\\Users\\test\\AppData\\Local'
  const chrome = win32.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')
  const cached = win32.join(
    localAppData,
    'ms-playwright',
    'chromium-1',
    'chrome-win64',
    'chrome.exe',
  )
  const result = await browserBinary({
    platform: 'win32',
    env: { ProgramFiles: programFiles, LOCALAPPDATA: localAppData },
    home,
    accessFile: accessOnly(chrome, cached),
    readDirectory: async () => ['chromium-1'],
  })

  expect(result).toBe(chrome)
})

it('does not probe relative Windows paths for blank environment roots', async () => {
  const probed: string[] = []
  const userCache = win32.join(home, 'AppData', 'Local', 'ms-playwright')
  await expect(
    browserBinary({
      platform: 'win32',
      env: {
        ProgramFiles: '   ',
        ProgramW6432: ' ',
        'ProgramFiles(x86)': '   ',
        LOCALAPPDATA: '  ',
      },
      home,
      accessFile: async (path) => {
        probed.push(path)
        throw new Error(`ENOENT: ${path}`)
      },
      readDirectory: async (path) => {
        expect(path).toBe(userCache)
        return []
      },
    }),
  ).rejects.toThrow('No Chromium found')

  expect(probed.every((path) => win32.isAbsolute(path))).toBe(true)
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
    accessFile: accessOnly(
      '/home/test/.cache/ms-playwright/chromium-1/chrome-linux64/chrome',
      '/home/test/.cache/ms-playwright/chromium-2/chrome-linux64/chrome',
    ),
    readDirectory: async () => ['chromium-1', 'chromium-2'],
  })

  expect(result).toBe('/home/test/.cache/ms-playwright/chromium-2/chrome-linux64/chrome')
})
