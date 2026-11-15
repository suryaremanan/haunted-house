import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Replay build: a static page that renders the same App.tsx with the SDK
// swapped for a stand-in that plays a recorded event file. React and
// lucide-react are bundled, so it runs without Crew or a gateway.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const SDK_SHIM = here('./src/adapters/sdk-shim/index.ts')
const RECORDING = here('../../fixtures/replay/demo.jsonl')

/** Copies the recording into the build as fixture.jsonl, where the stand-in fetches it. */
function replayRecording(): Plugin {
  return {
    name: 'haunted-house:replay-recording',
    apply: 'build',
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'fixture.jsonl', source: await readFile(RECORDING) })
    },
  }
}

export default defineConfig({
  root: here('./replay'),
  base: './',
  // The recording is the only static file; it comes from fixtures/, not a public folder.
  publicDir: false,
  plugins: [react(), replayRecording()],
  resolve: {
    // Exact match only: a subpath such as the SDK's /ui components has no stand-in and should fail to resolve.
    alias: [{ find: /^@kirocrew\/app-sdk$/, replacement: SDK_SHIM }],
  },
  build: {
    outDir: here('./dist-replay'),
    emptyOutDir: true,
    sourcemap: false,
    // The page makes no request but the recording fetch, so skip the preload polyfill.
    modulePreload: { polyfill: false },
  },
})
