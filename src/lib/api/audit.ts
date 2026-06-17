import { prisma } from '@/lib/db/prisma';
import { ActionType, EntityType } from '@prisma/client';

// Auditoria server-side: grava direto em AuditLog (sem HTTP). Best-effort —
// nunca lança, para não derrubar a operação principal por causa do log.
// Escopado por empresa (companyId) e com autor (userId/userName).
export async function writeAudit(opts: {
  dbUser: { id: string; name: string; companyId: string };
  action: ActionType;
  entityType: EntityType;
  entityId: string;
  oldValues?: any;
  newValues?: any;
  request?: Request;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.dbUser.id,
        userName: opts.dbUser.name,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        oldValues: opts.oldValues ?? undefined,
        newValues: opts.newValues ?? undefined,
        ipAddress: opts.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
        userAgent: opts.request?.headers.get('user-agent') || undefined,
        companyId: opts.dbUser.companyId,
      },
    });
  } catch (e) {
    console.error('[audit] falha ao gravar log:', e);
  }
}

export { ActionType, EntityType };
