import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node environment — los módulos de main usan node:crypto, node:fs, etc.
    environment: 'node',
    // Patrón estándar: tests al lado del código en __tests__/
    include: ['electron/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    globals: false,
  },
})
