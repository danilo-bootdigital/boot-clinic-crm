import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { signatureSignedUrl } from '@/lib/storage/signature-storage';

// GET /api/clinico/exames/[id] — pedido completo, pronto para impressão.
//
// Devolve tudo que vai no papel: cabeçalho da clínica, dados do paciente,
// exames agrupados, e nome/CRM do profissional. A assinatura vem como URL
// assinada de curta duração — nunca o caminho no storage.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'view');
    if (denied) return denied;

    const pedido = await prisma.examRequest.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

    const [company, professional] = await Promise.all([
      prisma.company.findFirst({
        where: { id: dbUser!.companyId },
        select: { name: true, logo: true, phone: true, address: true },
      }),
      prisma.professional.findFirst({
        where: { id: pedido.professionalId, companyId: dbUser!.companyId },
        select: { signaturePath: true },
      }),
    ]);

    // Assinatura é opcional: pedido sem ela imprime a linha para assinar à mão.
    const signatureUrl = professional?.signaturePath
      ? await signatureSignedUrl(professional.signaturePath, 300)
      : null;

    // Agrupa na ordem em que foi emitido.
    const grupos: { group: string; subgroups: { subgroup: string | null; names: string[] }[] }[] = [];
    for (const item of pedido.items) {
      let g = grupos.find((x) => x.group === item.group);
      if (!g) {
        g = { group: item.group, subgroups: [] };
        grupos.push(g);
      }
      let sg = g.subgroups.find((x) => x.subgroup === item.subgroup);
      if (!sg) {
        sg = { subgroup: item.subgroup, names: [] };
        g.subgroups.push(sg);
      }
      sg.names.push(item.name);
    }

    return NextResponse.json({
      id: pedido.id,
      clinica: {
        nome: company?.name ?? '',
        logo: company?.logo ?? null,
        telefone: company?.phone ?? null,
        endereco: company?.address ?? null,
      },
      paciente: {
        nome: pedido.patientNameSnapshot,
        nascimento: pedido.patientBirthDateSnapshot,
      },
      profissional: {
        nome: pedido.professionalNameSnapshot,
        crm: pedido.professionalCrmSnapshot,
        signatureUrl,
      },
      indicacaoClinica: pedido.clinicalIndication ?? '',
      observacoes: pedido.observations,
      emitidoEm: pedido.issuedAt,
      origem: pedido.origin,
      grupos,
    });
  } catch (err) {
    console.error('Erro ao carregar pedido de exame:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
