// Builds src/injected/injected.ts as a self-contained IIFE script.
// Output goes to public/assets/injected.js, which Vite then copies to
// dist/assets/injected.js during the main build.
import { build } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

await build({
  configFile: false,
  build: {
    lib: {
      entry: resolve(__dirname, '../src/injected/injected.ts'),
      formats: ['iife'],
      name: '_intercept',
      fileName: () => 'injected.js',
    },
    outDir: resolve(__dirname, '../public/assets'),
    emptyOutDir: false,
    minify: true,
  },
  logLevel: 'warn',
})

console.log('✓ injected.js built')
