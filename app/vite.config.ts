/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { progressPlugin } from './server/progress-plugin.ts'

const appDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(appDir, '..')
const contentDir = path.join(repoRoot, 'content')
// PROGRESS_DIR lets smoke tests write somewhere other than the repo's progress/ folder.
const progressDir = process.env.PROGRESS_DIR
  ? path.resolve(process.env.PROGRESS_DIR)
  : path.join(repoRoot, 'progress')

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site at /nemeceren/ (also used by "vite preview").
  // The dev server (npm run dev) serves the app at /.
  base: command === 'serve' && !isPreview ? '/' : '/nemeceren/',
  plugins: [react(), progressPlugin({ progressDir, contentDir })],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [appDir, contentDir] },
  },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
}))
