import { prisma } from '@/lib/db/prisma';
import { hashSignToken } from '@/lib/contracts/signing';

// Resolve o contrato pelo token do link público. O banco só tem o hash, então
// procuramos pelo hash do token recebido. Expirado, cancelado ou apagado = link
// inválido (mesma resposta, para não revelar qual dos casos é).
export async function contractByToken(token: string) {
  if (!token || token.length < 30 || token.length > 100) return null;
  const c = await prisma.patientContract.findUnique({ where: { signTokenHash: hashSignToken(token) } });
  if (!c || c.deletedAt || c.status === 'CANCELED' || c.status === 'DRAFT') return null;
  if (!c.signTokenExpiresAt || c.signTokenExpiresAt < new Date()) return null;
  return c;
}
