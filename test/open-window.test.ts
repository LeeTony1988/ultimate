import { describe, expect, it } from 'vitest'
import { browserOpenCommand } from '../bin/open-window.ts'

const url = 'http://127.0.0.1:4747'

describe('browser opener command', () => {
  it('uses PowerShell to open the default browser on Windows', () => {
    expect(browserOpenCommand('win32', url)).toEqual({
      command: 'pwsh',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Start-Process -FilePath $args[0]',
        '--',
        url,
      ],
    })
  })

  it.each([
    ['darwin', 'open'],
    ['linux', 'xdg-open'],
  ] as const)('keeps the %s opener', (platform, command) => {
    expect(browserOpenCommand(platform, url)).toEqual({ command, args: [url] })
  })
})
