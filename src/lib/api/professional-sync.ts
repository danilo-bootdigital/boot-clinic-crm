import { prisma } from '@/lib/db/prisma';
import type { UserRole } from '@prisma/client';

interface SyncUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
}

/**
 * Mantém o cadastro de Profissional (agenda) em sincronia com a conta de acesso.
 *
 * - Usuário com papel DOCTOR  → garante um Professional vinculado, ativo e com
 *   nome/e-mail atualizados (cria na primeira vez, reaproveita o vínculo depois).
 * - Usuário deixou de ser DOCTOR → desativa (soft-delete) o Professional vinculado,
 *   removendo-o dos seletores da agenda sem apagar histórico de agendamentos.
 *
 * É um efeito secundário: nunca lança — uma falha aqui não deve impedir a
 * criação/edição do usuário (apenas registra no log).
 */
export async function syncProfessionalForUser(
  user: SyncUser,
  /**
   * Especialidades do médico, quando quem chamou já as coletou (criação de
   * usuário DOCTOR). Sem elas o profissional nasce não-agendável — a agenda
   * tira a especialidade do cadastro do médico.
   */
  specialtyIds?: string[]
): Promise<void> {
  try {
    if (user.role === 'DOCTOR') {
      const existing = await prisma.professional.findUnique({ where: { userId: user.id } });
      let professionalId: string;
      if (existing) {
        const updated = await prisma.professional.update({
          where: { userId: user.id },
          data: { name: user.name, email: user.email, isActive: true, deletedAt: null },
        });
        professionalId = updated.id;
      } else {
        const created = await prisma.professional.create({
          data: { name: user.name, email: user.email, companyId: user.companyId, userId: user.id },
        });
        professionalId = created.id;
      }

      if (specialtyIds?.length) {
        // Vincula só o que é da própria clínica — id vem da tela.
        const validas = await prisma.specialty.findMany({
          where: { id: { in: specialtyIds }, companyId: user.companyId, deletedAt: null },
          select: { id: true },
        });
        if (validas.length) {
          await prisma.professionalSpecialty.createMany({
            data: validas.map((sp) => ({ professionalId, specialtyId: sp.id, companyId: user.companyId })),
            skipDuplicates: true,
          });
        }
      }
    } else {
      // Papel mudou para não-médico: tira o profissional vinculado da agenda.
      await prisma.professional.updateMany({
        where: { userId: user.id, deletedAt: null },
        data: { deletedAt: new Date(), isActive: false },
      });
    }
  } catch (err) {
    console.error('Falha ao sincronizar profissional para o usuário', user.id, err);
  }
}
