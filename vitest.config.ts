import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Testes unitários/integração do backend (Node). Sem DOM nesta etapa — os testes
// exercitam rotas de API, ingestão e storage com mocks controlados (sem rede,
// sem banco real, sem Evolution real). O alias @/ espelha o tsconfig.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
