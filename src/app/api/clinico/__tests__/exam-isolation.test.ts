// Isolamento multiempresa do módulo de exames.
//
// Existe por causa de um vazamento real: o catálogo era semeado em qualquer
// clínica que abrisse o módulo, espalhando a lista curada de um cliente. O
// teste trava o contrato: toda leitura e escrita filtra por companyId.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});

import { prisma } from '@/lib/db/prisma';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;
const CLINICA_A = 'companyA';
const CLINICA_B = 'companyB';

async function semearCatalogo(companyId: string, nomes: string[]) {
  for (let i = 0; i < nomes.length; i++) {
    await db.examCatalogItem.create({
      data: { companyId, name: nomes[i], group: 'Exames Fundamentais', subgroup: null, order: i, isActive: true },
    });
  }
}

describe('catálogo de exames — isolamento por clínica', () => {
  beforeEach(() => db.__reset());

  it('a clínica só enxerga o próprio painel', async () => {
    await semearCatalogo(CLINICA_A, ['Hemograma completo', 'Glicemia de jejum']);
    await semearCatalogo(CLINICA_B, ['Testosterona Total']);

    const doA = await db.examCatalogItem.findMany({ where: { companyId: CLINICA_A, deletedAt: null } });
    const doB = await db.examCatalogItem.findMany({ where: { companyId: CLINICA_B, deletedAt: null } });

    expect(doA.map((i: any) => i.name)).toEqual(['Hemograma completo', 'Glicemia de jejum']);
    expect(doB.map((i: any) => i.name)).toEqual(['Testosterona Total']);
  });

  it('clínica nova nasce SEM painel — nada é semeado por padrão', async () => {
    await semearCatalogo(CLINICA_A, ['Hemograma completo']);
    const daNova = await db.examCatalogItem.findMany({ where: { companyId: 'clinicaNova', deletedAt: null } });
    expect(daNova).toEqual([]);
  });

  it('remover exame de uma clínica não toca no da outra', async () => {
    await semearCatalogo(CLINICA_A, ['Hemograma completo']);
    await semearCatalogo(CLINICA_B, ['Hemograma completo']);

    const [itemA] = await db.examCatalogItem.findMany({ where: { companyId: CLINICA_A } });
    await db.examCatalogItem.update({ where: { id: itemA.id }, data: { deletedAt: new Date() } });

    const restamA = await db.examCatalogItem.findMany({ where: { companyId: CLINICA_A, deletedAt: null } });
    const restamB = await db.examCatalogItem.findMany({ where: { companyId: CLINICA_B, deletedAt: null } });
    expect(restamA).toHaveLength(0);
    expect(restamB).toHaveLength(1);
  });

  it('modelo salvo pertence à clínica que o criou', async () => {
    await db.examTemplate.create({ data: { companyId: CLINICA_A, name: 'Check-up metabólico' } });
    const doB = await db.examTemplate.findMany({ where: { companyId: CLINICA_B, deletedAt: null } });
    expect(doB).toEqual([]);
  });

  it('pedido emitido não vaza para outra clínica', async () => {
    await db.examRequest.create({
      data: {
        companyId: CLINICA_A,
        patientId: 'p1',
        professionalId: 'prof1',
        professionalNameSnapshot: 'Dra. Teste',
        professionalCrmSnapshot: 'CRM 1',
        patientNameSnapshot: 'Paciente',
        clinicalIndication: null,
        origin: 'PATIENT_CHART',
        createdByUserId: 'u1',
      },
    });
    const doB = await db.examRequest.findMany({ where: { companyId: CLINICA_B, deletedAt: null } });
    expect(doB).toEqual([]);
  });
});
