import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Replay build: same App.tsx, SDK swapped for the stand-in, React bundled in. No gateway needed.
export default defineConfig({
  root: 'replay',
  base: './',
  plugins: [react()],
  resolve: { alias: { '@kirocrew/app-sdk': fileURLToPath(new URL('./replay/sdk-shim.ts', import.meta.url)) } },
  build: { outDir: '../dist-replay', emptyOutDir: true },
})
