import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Modules the Crew dashboard supplies at runtime through its import map.
// They must stay external so the page shares the host's React and SDK
// instances; bundling a second React would break hooks.
export const HOST_MODULES: (string | RegExp)[] = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'lucide-react',
  /^@kirocrew\/app-sdk(\/.*)?$/,
]

// Live build: one ES module at dist/index.mjs whose default export the
// dashboard renders.
export default defineConfig({
  plugins: [react()],
  define: {
    // Library mode leaves process.env.* untouched; the browser has no `process`.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: 'src/App.tsx',
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      external: HOST_MODULES,
    },
  },
})
