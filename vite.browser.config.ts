import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'src/renderer/public'),
  plugins: [react()],
  resolve: {
    alias: {
      // 避免与 electron 依赖冲突
    }
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: resolve(__dirname, 'dist/browser'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.browser.html')
      }
    }
  }
})
