import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx'], env: { VITE_DIGEST_URL: '/mock-digest.json' } },
})
