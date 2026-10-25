import { expect, it } from 'vitest'
import { fill, shell, shellFor } from '../lib/shell.ts'

it('names the shell each platform runs commands in', () => {
  expect(shellFor('win32').name).toBe('powershell')
  expect(shellFor('linux').name).toBe('bash')
  expect(shellFor('darwin').name).toBe('bash')
})

it('writes a variable reference in each shell its own way, and leaves a longer name alone', () => {
  const command = 'cp $ULTIMATE_SOURCE/.env .'
  expect(fill(command, ['ULTIMATE_SOURCE'], 'bash')).toBe('cp ${ULTIMATE_SOURCE}/.env .')
  expect(fill(command, ['ULTIMATE_SOURCE'], 'powershell')).toBe('cp $env:ULTIMATE_SOURCE/.env .')
  expect(fill('cp $ULTIMATE_SOURCE_BACKUP .', ['ULTIMATE_SOURCE'], 'powershell')).toBe(
    'cp $ULTIMATE_SOURCE_BACKUP .',
  )
})

it('spawns one command string through the host shell, as its last argument', () => {
  const { program, args } = shell.argv('echo hi')
  expect(program.length).toBeGreaterThan(0)
  expect(args.at(-1)).toContain('echo hi')
})
