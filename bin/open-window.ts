export interface BrowserOpenCommand {
  command: string
  args: string[]
}

export function browserOpenCommand(platform: NodeJS.Platform, url: string): BrowserOpenCommand {
  if (platform === 'win32')
    return {
      command: 'pwsh',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Start-Process -FilePath $args[0]',
        '--',
        url,
      ],
    }
  return {
    command: platform === 'darwin' ? 'open' : 'xdg-open',
    args: [url],
  }
}
