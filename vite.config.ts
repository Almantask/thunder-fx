import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID || `${Date.now()}`),
  },
  test: {
    // Pure logic specs run in `node`; standing up jsdom for each of those
    // dominated the suite's wall time. Files that need a DOM opt in with a
    // `@vitest-environment jsdom` docblock at the top.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
