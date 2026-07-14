import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Testes de INTEGRAÇÃO contra um PostgreSQL local REAL (container descartável).
// Rode com: npm run test:integration (exige LOCAL_DATABASE_URL + migrations aplicadas).
// Separado do `npm test` unitário para não exigir banco no fluxo padrão.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globals: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
