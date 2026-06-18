import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';

// Resolve usuário + permissão + posse do paciente (mesma empresa, não arquivado)
// para as sub-rotas de paciente (timeline/tags/anexos). Devolve { error } pronto
// ou { dbUser, patient }. 'level' = nível exigido no módulo 'patients'.
export async function resolvePatientAccess(patientId: string, level: 'view' | 'edit') {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };

  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };

  const moduleOff = await requireModuleEnabled(dbUser, 'patients');
  if (moduleOff) return { error: moduleOff };

  const denied = requirePermission(dbUser, 'patients', level);
  if (denied) return { error: denied };

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, companyId: dbUser.companyId, deletedAt: null },
  });
  if (!patient) return { error: NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 }) };

  return { dbUser, patient };
}
