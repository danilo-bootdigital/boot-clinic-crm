import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@prisma/client';

const CreatePatientInputSchema = z.object({
  name: z.string(),
  cpf: z.string(),
  birthDate: z.string(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']),
  phone: z.string(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  origin: z.enum(['GOOGLE', 'FACEBOOK', 'INSTAGRAM', 'REFERRAL', 'WALK_IN', 'PHONE', 'WHATSAPP', 'OTHER']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

// GET /api/patients - Listar pacientes
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const origin = searchParams.get('origin') || '';

    // Buscar usuário com companyId
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { company: true },
    });

    if (!dbUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    // Construir filtro baseado no papel do usuário
    // deletedAt: null garante que pacientes inativados (soft delete) não apareçam.
    let where: any = {
      companyId: dbUser.companyId,
      deletedAt: null,
    };

    // Super Admin pode filtrar por companyId
    if (dbUser.role === UserRole.SUPER_ADMIN) {
      const companyIdParam = searchParams.get('companyId');
      if (companyIdParam) {
        where.companyId = companyIdParam;
      }
    }

    // Filtros de busca
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cpf: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (origin) {
      where.origin = origin;
    }

    // Contagem total
    const total = await prisma.patient.count({ where });

    // Buscar pacientes
    const patients = await prisma.patient.findMany({
      where,
      include: {
        tags: true,
        createdBy: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({
      patients,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erro ao listar pacientes:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/patients - Criar paciente
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Buscar usuário com companyId
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    // Verificar se o usuário tem permissão para criar
    const allowedRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.RECEPTION, UserRole.ATTENDANCE];
    if (!allowedRoles.includes(dbUser.role)) {
      return NextResponse.json({ error: 'Sem permissão para criar pacientes' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = CreatePatientInputSchema.parse(body);

    // Validar CPF único por empresa
    const existingPatient = await prisma.patient.findFirst({
      where: {
        cpf: validatedData.cpf,
        companyId: dbUser.companyId,
      },
    });

    if (existingPatient) {
      return NextResponse.json({ error: 'CPF já cadastrado nesta empresa' }, { status: 400 });
    }

    // Criar paciente
    const patient = await prisma.patient.create({
      data: {
        name: validatedData.name,
        cpf: validatedData.cpf,
        birthDate: new Date(validatedData.birthDate),
        gender: validatedData.gender,
        phone: validatedData.phone,
        whatsapp: validatedData.whatsapp || null,
        email: validatedData.email || null,
        origin: validatedData.origin,
        status: validatedData.status,
        companyId: dbUser.companyId,
        createdById: dbUser.id,
      },
      include: {
        tags: true,
        createdBy: {
          select: { name: true },
        },
      },
    });

    // Registrar evento na timeline
    await prisma.timelineEvent.create({
      data: {
        patientId: patient.id,
        type: 'STATUS_CHANGE',
        title: 'Paciente criado',
        content: `Paciente ${patient.name} foi cadastrado por ${dbUser.name}`,
        userId: dbUser.id,
      },
    });

    return NextResponse.json(patient, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar paciente:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Dados inválidos', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
