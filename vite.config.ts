import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      ignored: [
        '**/src/server/**',
        '**/data/**',
        '**/.screens/**',
        '**/deliverables/**',
        '**/.edge-*/**',
        '**/*.tmpdir/**',
        '**/.*.tmpdir/**',
        '**/*.tmp',
      ],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
})
