/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const appDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(appDir, '..')
const contentDir = path.join(repoRoot, 'content')

/** Content lives outside the Vite root. Watch it so a new test or lesson shows up without a restart. */
function watchContent(): Plugin {
  return {
    name: 'nemeceren-watch-content',
    configureServer(server) {
      server.watcher.add(contentDir)
    },
  }
}

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site at /nemeceren/ (also used by "vite preview", which cannot talk to
  // the progress API: it only allows http://localhost:5173 and the Pages origin).
  // The dev server (npm run dev) serves the app at /.
  base: command === 'serve' && !isPreview ? '/' : '/nemeceren/',
  plugins: [react(), watchContent()],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [appDir, contentDir] },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
}))
