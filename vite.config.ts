import { defineConfig } from 'vite'

export default defineConfig({
  base: '/digest/',
  build: {
    rollupOptions: {
      input: { react: 'index.html', angular: 'angular/index.html' },
      output: {
        manualChunks(id) {
          if (id.includes('/@angular/compiler/')) return 'angular-compiler'
          if (id.includes('/@angular/core/')) return 'angular-core'
        },
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.id?.includes('/react-router/') && warning.message.includes('"use client"')) return
        warn(warning)
      },
    },
  },
})
