import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Em produção logar TODA query (`log: ['query']`) gera I/O e CPU proporcionais
// ao tráfego do tenant mais ativo — um vetor de noisy-neighbor. Logamos apenas
// warn/error em prod; queries completas só em desenvolvimento.
const isProd = process.env.NODE_ENV === 'production';

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: isProd ? ['warn', 'error'] : ['query', 'warn', 'error'],
});

if (!isProd) globalForPrisma.prisma = prisma;