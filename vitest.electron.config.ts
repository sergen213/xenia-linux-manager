import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// The electron/** main-process modules import from 'electron' at module top
// level, which has no implementation outside the Electron runtime. Alias the
// bare `electron` specifier (exact match only — not 'electron-updater' etc.)
// to an import-safe stub so node-env unit tests can load them.
const electronStub = fileURLToPath(
  new URL('./electron/main/__tests__/__fixtures__/electron-stub.ts', import.meta.url)
)

export default defineConfig({
  resolve: {
    alias: [{ find: /^electron$/, replacement: electronStub }]
  },
  test: {
    environment: 'node',
    include: ['electron/**/__tests__/**/*.test.ts'],
    exclude: ['**/__fixtures__/**'],
    testTimeout: 15000
  }
})
