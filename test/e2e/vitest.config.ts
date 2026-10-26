import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: { MIMALLOC_ALLOW_THP: '0', MIMALLOC_PURGE_DELAY: '0' },
    globalSetup: ['test/sweep-temp.ts'],
    setupFiles: ['test/setup.ts'],
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 60_000,
    maxWorkers: 4,
  },
})
