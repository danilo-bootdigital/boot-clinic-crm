// Motivos de perda do funil — cadastro por clínica.
//
// Regra do produto: negócio não vira perdido sem motivo. É o que transforma
// "perdemos 12 leads" em "perdemos 8 por preço e 4 por distância" — a única
// versão da informação que muda alguma decisão.
//
// Quem valida a escolha é o servidor (`findLossReason`): id vindo da tela pode
// ser de outra clínica, ou de um motivo já removido.
import { prisma } from '@/lib/db/prisma';

/**
 * Lista inicial de uma clínica nova. Preço e Distância vêm primeiro por pedido
 * da clínica; o resto existe para não obrigar ninguém a cadastrar do zero.
 */
export const DEFAULT_LOSS_REASONS = [
  'Preço',
  'Distância',
  'Sem retorno',
  'Escolheu concorrente',
  'Sem interesse',
  'Outro',
];

/**
 * Motivos ativos da clínica, na ordem de exibição.
 *
 * Cria os padrões quando a clínica NUNCA teve motivo nenhum — clínica criada
 * pelo admin não passa pela semente, e sem isto a atendente encontraria um
 * select vazio bloqueando o perdido. Se a clínica apagou todos de propósito,
 * `deletedAt` marca que existiram e os padrões não voltam.
 */
export async function listLossReasons(companyId: string) {
  const total = await prisma.dealLossReason.count({ where: { companyId } });
  if (total === 0) {
    await prisma.dealLossReason.createMany({
      data: DEFAULT_LOSS_REASONS.map((name, order) => ({ companyId, name, order })),
    });
  }
  return prisma.dealLossReason.findMany({
    where: { companyId, deletedAt: null },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, order: true },
  });
}

/** O motivo, se for desta clínica e não estiver removido. */
export function findLossReason(companyId: string, id: string) {
  return prisma.dealLossReason.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true, name: true },
  });
}

/** Já existe motivo com este nome na clínica (ignorando caixa e acentuação de espaço)? */
export async function lossReasonNameTaken(companyId: string, name: string, exceptId?: string) {
  const found = await prisma.dealLossReason.findFirst({
    where: {
      companyId,
      deletedAt: null,
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  return !!found;
}
