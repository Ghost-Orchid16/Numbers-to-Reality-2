import { defineConfig } from 'vitest/config'

// Simulation tests are pure TypeScript: no DOM, no WebGL.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
  },
})
