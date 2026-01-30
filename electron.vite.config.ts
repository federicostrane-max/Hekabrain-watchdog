import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          'index-watchdog': resolve(__dirname, 'src/main/index-watchdog.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          'preload-watchdog': resolve(__dirname, 'src/preload/preload-watchdog.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name].cjs',
          manualChunks: undefined
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          watchdog: resolve(__dirname, 'src/renderer/watchdog.html')
        }
      }
    },
    plugins: [react()]
  }
})
