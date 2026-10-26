import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { failurePrompt } from '../extensions/workspaces/lander.ts'

const failed = {
  id: 'submission-1',
  reason: 'check failed twice: pnpm check',
  output: 'Found formatting issues in 706 files',
  integration: '/tmp/lander',
  state: 'HEAD abc is the merge of def into main, set up as the checks run it.',
}

it('fences environment and gate failures in the fix prompt', () => {
  const prompt = failurePrompt({ ...failed, mode: 'fix' })
  expect(prompt).toContain('Mode: fix')
  expect(prompt).toContain('missing shell or POSIX tool')
  expect(prompt).toContain('CRLF or formatting baseline unrelated to the submission')
  expect(prompt).toContain('provider limit')
  expect(prompt).toContain('report the exact check, command and failure')
  expect(prompt).toContain('change nothing outside the submission')
})

it('keeps the diagnose prompt free of the fix fence', () => {
  const prompt = failurePrompt({ ...failed, mode: 'diagnose' })
  expect(prompt).toContain('Mode: diagnose')
  expect(prompt).not.toContain('change nothing outside the submission')
})

it('states the same fence in the built-in lander instructions', async () => {
  const instructions = await readFile('agents/lander.md', 'utf8')
  expect(instructions).toContain('missing shell or POSIX tool')
  expect(instructions).toContain('CRLF or formatting baseline unrelated to the submission')
  expect(instructions).toContain('provider limit')
  expect(instructions).toContain('change nothing outside the submission')
})
