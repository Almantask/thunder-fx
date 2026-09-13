import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import type { PluginOption } from 'vite'

import pkg from './package.json' with { type: 'json' }

const root = path.dirname(fileURLToPath(import.meta.url))

function buildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'dev'
  }
}

async function analyzePlugin(): Promise<PluginOption | undefined> {
  if (process.env.ANALYZE !== '1') return undefined
  const { visualizer } = await import('rollup-plugin-visualizer')
  return visualizer({
    filename: path.join(root, 'dist/stats.html'),
    gzipSize: true,
    open: false,
    template: 'treemap',
  })
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), await analyzePlugin()].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    // WebView2 is current Chromium; there is no legacy-browser target here.
    target: 'chrome120',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'react'
          }
          if (id.includes('node_modules/@radix-ui')) return 'radix'
          if (id.includes('node_modules/lucide-react')) return 'lucide'
          return undefined
        },
      },
    },
  },
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    // Kept in step with the three manifests by `npm run version:check`.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // Pure logic specs run in `node`; standing up jsdom for each of those
    // dominated the suite's wall time. Files that need a DOM opt in with a
    // `@vitest-environment jsdom` docblock at the top.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
