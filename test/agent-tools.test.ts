import { describe, expect, it } from 'vitest'
import {
  runtimeDefinition,
  runtimeToolName,
  runtimeToolNames,
  serializeDefinition,
} from '../lib/agents.ts'

describe('portable shell tools', () => {
  it('maps bash to PowerShell on Windows and PowerShell to bash elsewhere', () => {
    expect(runtimeToolName('bash', 'win32')).toBe('powershell')
    expect(runtimeToolName('powershell', 'linux')).toBe('bash')
    expect(runtimeToolNames(['read', 'bash', 'powershell', 'bash'], 'win32')).toEqual([
      'read',
      'powershell',
    ])
  })

  it('maps definition tool fields for the current host without changing the source shape', () => {
    const definition = {
      name: 'reviewer',
      description: 'Reviews changes',
      path: 'reviewer.md',
      instructions: 'Review it.',
      tools: ['read', 'bash'],
      addTools: ['debug'],
      denyTools: ['powershell'],
    }
    expect(runtimeDefinition(definition)).toMatchObject({
      tools: ['read', 'powershell'],
      addTools: ['debug'],
      denyTools: ['powershell'],
    })
    expect(definition.tools).toEqual(['read', 'bash'])
  })

  it('writes the portable bash name when a form selects PowerShell', () => {
    expect(
      serializeDefinition(
        'reviewer',
        { description: 'Reviews changes', tools: ['read', 'powershell'] },
        'Review it.',
      ),
    ).toContain('tools: [read, bash]')
  })
})
