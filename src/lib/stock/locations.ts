import type { TxClient } from '@/lib/db/financeTenant';
import { StockError } from '@/lib/stock/movements';

// Sala vinculada precisa ser da clínica; só um local é o destino padrão.
export async function applyLocationRules(tx: TxClient, companyId: string, data: { type?: string; roomId?: string | null; isDefault?: boolean }, selfId?: string) {
  if (data.roomId) {
    const room = await tx.room.findFirst({ where: { id: data.roomId, companyId, deletedAt: null }, select: { id: true } });
    if (!room) throw new StockError(404, 'Sala não encontrada');
  }
  if (data.type && data.type !== 'SALA') data.roomId = null;
  if (data.isDefault) {
    await tx.stockLocation.updateMany({ where: { companyId, isDefault: true, ...(selfId ? { id: { not: selfId } } : {}) }, data: { isDefault: false } });
  }
}
