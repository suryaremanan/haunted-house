import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Tests may import the recorded replay fixtures (`?raw`), which live outside app/ui.
  server: { fs: { allow: ['.', '../../fixtures/replay', '../../fixtures/room-ghosts'] } },
  resolve: {
    // The Crew app SDK exists only inside the dashboard. Tests resolve it to a
    // double that throws unless the test replaces it with vi.mock and a factory.
    // Exact match only, as in vite.replay.config.ts.
    alias: [
      {
        find: /^@kirocrew\/app-sdk$/,
        replacement: fileURLToPath(new URL('./src/test/app-sdk.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    // scripts-tests/ holds tests for repo scripts; they use Node APIs, so they
    // stay outside src/, which tsconfig.json typechecks without Node types.
    include: ['src/**/*.test.{ts,tsx}', 'scripts-tests/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    // Property tests run 200 or more cases each; a shared CI runner can take
    // longer than the 5 second default on one of them.
    testTimeout: 20_000,
    watch: false,
  },
})
