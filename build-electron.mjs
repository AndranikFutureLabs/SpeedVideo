// Build script: compiles Electron main + preload to dist-electron/
import { build } from 'esbuild'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'ffmpeg-static', 'ffprobe-static'],
  sourcemap: false,
  minify: false,
}

await Promise.all([
  build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'electron/main.ts')],
    outfile: resolve(__dirname, 'dist-electron/main.cjs'),
  }),
  build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'electron/preload.ts')],
    outfile: resolve(__dirname, 'dist-electron/preload.cjs'),
  }),
])

console.log('✅ Electron main + preload built to dist-electron/')
