import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma, UserRole, CompanyStatus } from '@prisma/client';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { provisionBilling } from '@/lib/asaas/billing';
import { getPlan } from '@/lib/asaas/plans';

// Painel SUPER-ADMIN (dono do SaaS). Cruza o limite de empresa — só SUPER_ADMIN.

const CreateSchema = z.object({
  // Dados da clínica
  name: z.string().min(1, 'Nome da clínica é obrigatório'),
  cnpj: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('E-mail da clínica inválido').optional().or(z.literal('')).nullable(),
  // Plano define a cobrança: 'trial' (grátis) | 'basic' | 'pro'.
  plan: z.enum(['trial', 'basic', 'pro']).default('trial'),
  // Dados do usuário OWNER inicial
  ownerName: z.string().min(1, 'Nome do responsável é obrigatório'),
  ownerEmail: z.string().email('E-mail do responsável inválido'),
  ownerPassword: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
});

// GET /api/admin/companies - lista todas as clínicas com contadores.
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            patients: { where: { deletedAt: null } },
          },
        },
      },
    });

    const data = companies.map((c) => ({
      id: c.id,
      name: c.name,
      cnpj: c.cnpj,
      phone: c.phone,
      email: c.email,
      status: c.status,
      plan: c.plan,
      trialEndsAt: c.trialEndsAt,
      createdAt: c.createdAt,
      usersCount: c._count.users,
      patientsCount: c._count.patients,
    }));

    // Resumo para os KPIs do topo do painel.
    const summary = {
      total: data.length,
      active: data.filter((c) => c.status === 'ACTIVE').length,
      trial: data.filter((c) => c.status === 'TRIAL').length,
      suspended: data.filter((c) => c.status === 'SUSPENDED' || c.status === 'CANCELED').length,
    };

    return NextResponse.json({ companies: data, summary });
  } catch (err) {
    console.error('Erro ao listar clínicas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/admin/companies - cria uma clínica nova + seu usuário OWNER inicial.
// Fluxo: cria a conta no Supabase Auth → cria Company + User (OWNER) numa
// transação. Se algo no banco falhar, desfaz a conta no Auth (evita órfão).
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.' },
        { status: 503 }
      );
    }

    const d = CreateSchema.parse(await request.json());

    // Planos pagos exigem CNPJ (vira o cpfCnpj do cliente no Asaas).
    const plan = getPlan(d.plan);
    if (plan?.paid && !d.cnpj) {
      return NextResponse.json({ error: 'CNPJ é obrigatório para planos pagos (Basic/Pro).' }, { status: 400 });
    }

    // 1) Conta de acesso do OWNER no Supabase Auth (e-mail já confirmado).
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: d.ownerEmail,
      password: d.ownerPassword,
      email_confirm: true,
    });
    if (authErr || !created?.user) {
      console.error('createUser auth error:', authErr);
      const msg = /already|registered|exists/i.test(authErr?.message || '')
        ? 'E-mail do responsável já cadastrado'
        : 'Falha ao criar a conta de acesso do responsável';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // 2) Company + User (OWNER) na mesma transação.
    try {
      const company = await prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: d.name,
            cnpj: d.cnpj || null,
            phone: d.phone || null,
            email: d.email || null,
            plan: d.plan,
            // Começa em TRIAL; provisionBilling ajusta plano/status/datas.
            status: CompanyStatus.TRIAL,
          },
        });
        await tx.user.create({
          data: {
            id: created.user.id, // id = UID do Supabase Auth (padrão do projeto)
            email: d.ownerEmail,
            name: d.ownerName,
            role: UserRole.OWNER,
            companyId: company.id,
          },
        });
        return company;
      });

      // 3) Cobrança (Asaas). A clínica JÁ foi criada (transação commitada), então
      // uma falha aqui NÃO pode cair no catch de rollback do Auth (deixaria
      // Company+User órfãos). Qualquer erro vira aviso e a cobrança é refeita depois.
      let billing: { invoiceUrl: string | null; warning?: string };
      try {
        billing = await provisionBilling(company.id, d.plan);
      } catch (billingErr: any) {
        console.error('Erro ao provisionar cobrança (clínica já criada):', billingErr);
        billing = { invoiceUrl: null, warning: `Clínica criada, mas a cobrança falhou: ${billingErr?.message || 'erro'}. Gere a cobrança depois em Cobrança.` };
      }

      return NextResponse.json(
        {
          id: company.id,
          name: company.name,
          plan: d.plan,
          invoiceUrl: billing.invoiceUrl,
          warning: billing.warning,
        },
        { status: 201 }
      );
    } catch (dbErr) {
      // Rollback da conta no Auth para não deixar usuário órfão.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError && dbErr.code === 'P2002') {
        const target = (dbErr.meta?.target as string[] | undefined)?.join(',') || '';
        const msg = /cnpj/i.test(target) ? 'CNPJ já cadastrado' : 'E-mail já cadastrado';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      throw dbErr;
    }
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      return NextResponse.json({ error: 'Registro duplicado' }, { status: 400 });
    console.error('Erro ao criar clínica:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
