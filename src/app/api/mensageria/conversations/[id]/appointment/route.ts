import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Channel, Gender } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import { ownsPatient, ownsProfessional, ownsSpecialty, ownsRoom } from '@/lib/api/ownership';
import { findAppointmentConflict, provisionTeleconsultation } from '@/lib/api/appointments';
import { runAutomations } from '@/lib/automations/engine';
import { isModuleEnabled } from '@/lib/api/modules';
import { isMedico } from '@/lib/api/is-doctor';
import { CHANNEL_LABEL } from '@/lib/messaging/conversion';
import {
  normalizeCpf,
  onlyDigits,
  patientOriginFor,
  phoneMatchTail,
  suggestSlot,
} from '@/lib/messaging/scheduling';

// Conversão conversa → agendamento na Agenda (mesma família do /deal, §5).
//
// GET  — contexto do painel "Novo agendamento": contato, paciente já vinculado
//        (ou candidatos casados pelo telefone), profissionais, especialidades,
//        salas e os próximos agendamentos do paciente.
// POST — cria o agendamento. Se o lead ainda não é paciente, cria o paciente
//        mínimo e vincula ao contato no mesmo passo.
//
// Por que o paciente é obrigatório aqui (e no /deal não era): `Deal.patientId` é
// opcional, `Appointment.patientId` não. Agenda sem paciente não existe no
// modelo — então a tela pede o mínimo (CPF, nascimento, sexo) uma única vez.

export const dynamic = 'force-dynamic';

const NewPatientSchema = z.object({
  name: z.string().min(2, 'Nome do paciente é obrigatório'),
  cpf: z.string().min(1, 'CPF é obrigatório'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida'),
  gender: z.nativeEnum(Gender),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
});

const CreateSchema = z.object({
  /** Paciente existente (vinculado ao contato ou escolhido na busca). */
  patientId: z.string().min(1).optional(),
  /** Cadastro mínimo quando o lead ainda não é paciente. */
  newPatient: NewPatientSchema.optional(),
  professionalId: z.string().min(1, 'Profissional é obrigatório'),
  specialtyId: z.string().min(1, 'Especialidade é obrigatória'),
  roomId: z.string().optional().or(z.literal('')),
  type: z.string().min(1).default('Consulta'),
  modality: z.enum(['PRESENCIAL', 'TELEMEDICINA']).default('PRESENCIAL'),
  startAt: z.string().min(1, 'Data/hora é obrigatória'),
  durationMinutes: z.coerce.number().min(5).max(480).default(30),
  notes: z.string().max(2000).optional(),
});

async function loadConversation(id: string, companyId: string) {
  return prisma.conversation.findFirst({
    where: { id, companyId, deletedAt: null },
    include: {
      contact: { select: { id: true, name: true, phone: true, email: true, patientId: true } },
      account: { select: { id: true, label: true } },
    },
  });
}

/** Candidatos a paciente pelo telefone do contato (ver phoneMatchTail). */
async function matchPatientsByPhone(companyId: string, phone?: string | null) {
  const tail = phoneMatchTail(phone);
  if (!tail) return [];
  return prisma.patient.findMany({
    where: {
      companyId,
      deletedAt: null,
      OR: [{ phone: { endsWith: tail } }, { whatsapp: { endsWith: tail } }],
    },
    select: { id: true, name: true, cpf: true, phone: true, whatsapp: true },
    orderBy: { name: 'asc' },
    take: 5,
  });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('agenda');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'agenda', 'view');
    if (denied) return denied;

    const conv = await loadConversation(params.id, dbUser!.companyId);
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const companyId = dbUser!.companyId;
    const [linkedPatient, professionals, specialties, rooms, telemedicina] = await Promise.all([
      conv.contact.patientId
        ? prisma.patient.findFirst({
            where: { id: conv.contact.patientId, companyId, deletedAt: null },
            select: { id: true, name: true, cpf: true, phone: true, whatsapp: true },
          })
        : null,
      prisma.professional.findMany({
        where: { companyId, deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          userId: true,
          user: { select: { role: true } },
          specialties: { select: { specialtyId: true } },
        },
      }),
      prisma.specialty.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.room.findMany({
        where: { companyId, deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      isModuleEnabled({ id: companyId, plan: dbUser!.company?.plan }, 'telemedicina'),
    ]);

    // Só procura candidatos quando o contato ainda não tem paciente vinculado —
    // com vínculo, sugerir outro nome só criaria chance de agendar na pessoa errada.
    const candidates = linkedPatient ? [] : await matchPatientsByPhone(companyId, conv.contact.phone);

    const patientId = linkedPatient?.id ?? null;
    const upcoming = patientId
      ? await prisma.appointment.findMany({
          where: {
            companyId,
            patientId,
            deletedAt: null,
            startAt: { gte: new Date() },
            status: { notIn: ['CANCELED', 'NO_SHOW'] },
          },
          orderBy: { startAt: 'asc' },
          take: 3,
          select: { id: true, startAt: true, type: true, status: true, professionalId: true },
        })
      : [];
    const upcomingProfs = upcoming.length
      ? await prisma.professional.findMany({
          where: { id: { in: Array.from(new Set(upcoming.map((a) => a.professionalId))) } },
          select: { id: true, name: true },
        })
      : [];
    const profName = new Map(upcomingProfs.map((p) => [p.id, p.name]));

    const slot = suggestSlot();
    // Mesma regra da Agenda: só entra quem é médico de fato (ver is-doctor.ts).
    const medicos = professionals.filter(isMedico);

    return NextResponse.json({
      contact: conv.contact,
      channel: conv.channel,
      channelLabel: CHANNEL_LABEL[conv.channel],
      patient: linkedPatient,
      patientCandidates: candidates,
      professionals: medicos.map((p) => ({
        id: p.id,
        name: p.name,
        specialtyIds: p.specialties.map((s) => s.specialtyId),
      })),
      specialties,
      rooms,
      telemedicineEnabled: telemedicina,
      upcoming: upcoming.map((a) => ({
        id: a.id,
        startAt: a.startAt,
        type: a.type,
        status: a.status,
        professionalName: profName.get(a.professionalId) ?? null,
      })),
      suggested: {
        ...slot,
        durationMinutes: 30,
        type: 'Consulta',
        professionalId: medicos[0]?.id ?? '',
        specialtyId: specialties[0]?.id ?? '',
        patientName: conv.contact.name,
        origin: patientOriginFor(conv.channel),
      },
    });
  } catch (err) {
    console.error('Erro ao montar contexto de agendamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('agenda');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'agenda', 'edit');
    if (denied) return denied;

    const conv = await loadConversation(params.id, dbUser!.companyId);
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const d = CreateSchema.parse(await request.json());
    const companyId = dbUser!.companyId;

    // --- 1. Resolver o paciente -------------------------------------------
    // Ordem: o que a tela mandou > o já vinculado ao contato > criar do zero.
    let patientId: string | null = null;
    let patientCreated = false;

    if (d.patientId) {
      if (!(await ownsPatient(companyId, d.patientId))) {
        return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 });
      }
      patientId = d.patientId;
    } else if (conv.contact.patientId) {
      patientId = conv.contact.patientId;
    } else if (d.newPatient) {
      const np = d.newPatient;
      const cpf = normalizeCpf(np.cpf);
      // CPF é único por empresa. Se já existe, reaproveita o cadastro em vez de
      // estourar erro de constraint — é o mesmo paciente chegando por outro canal.
      const existing = await prisma.patient.findFirst({
        where: { companyId, deletedAt: null, cpf: { in: [cpf, onlyDigits(np.cpf)] } },
        select: { id: true },
      });
      if (existing) {
        patientId = existing.id;
      } else {
        const phone = onlyDigits(conv.contact.phone);
        const patient = await prisma.patient.create({
          data: {
            name: np.name.trim(),
            cpf,
            birthDate: new Date(`${np.birthDate}T00:00:00`),
            gender: np.gender,
            // Coluna é não-nula; sem telefone grava string vazia (padrão do módulo).
            phone,
            whatsapp: conv.channel === Channel.WHATSAPP ? phone || null : null,
            email: np.email || conv.contact.email || null,
            origin: patientOriginFor(conv.channel),
            companyId,
            createdById: dbUser!.id,
          },
          select: { id: true, name: true, cpf: true, status: true },
        });
        patientId = patient.id;
        patientCreated = true;

        await prisma.timelineEvent.create({
          data: {
            patientId: patient.id,
            type: 'STATUS_CHANGE',
            title: 'Paciente criado',
            content: `Cadastrado por ${dbUser!.name} a partir de uma conversa no ${CHANNEL_LABEL[conv.channel]}`,
            userId: dbUser!.id,
          },
        });
        await writeAudit({
          dbUser: dbUser!,
          action: ActionType.CREATE,
          entityType: EntityType.PATIENT,
          entityId: patient.id,
          newValues: { name: patient.name, cpf: patient.cpf, origem: 'mensageria', conversationId: conv.id },
          request,
        });
        await runAutomations('PATIENT_CREATED', {
          companyId,
          patientId: patient.id,
          summary: `Novo paciente: ${patient.name}`,
        });
      }
    } else {
      return NextResponse.json(
        { error: 'Escolha um paciente ou preencha o cadastro mínimo (nome, CPF, nascimento e sexo).' },
        { status: 400 }
      );
    }

    // O contato passa a apontar para o paciente — a próxima conversa já abre
    // vinculada e a Agenda deixa de ser um beco sem saída para o lead.
    if (!conv.contact.patientId && patientId) {
      await prisma.contact.update({ where: { id: conv.contact.id }, data: { patientId } });
    }

    // --- 2. Validar o resto e criar o agendamento -------------------------
    const roomId = d.roomId || null;
    if (!(await ownsProfessional(companyId, d.professionalId)) ||
        !(await ownsSpecialty(companyId, d.specialtyId)) ||
        !(await ownsRoom(companyId, roomId))) {
      return NextResponse.json({ error: 'Profissional, especialidade ou sala inválidos' }, { status: 400 });
    }

    const startAt = new Date(d.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: 'Data/hora inválida' }, { status: 400 });
    }
    const endAt = new Date(startAt.getTime() + d.durationMinutes * 60000);

    const conflict = await findAppointmentConflict({
      companyId,
      professionalId: d.professionalId,
      startAt,
      endAt,
    });
    if (conflict) {
      return NextResponse.json(
        {
          error: 'Conflito de horário para este profissional',
          conflict: { id: conflict.id, startAt: conflict.startAt, endAt: conflict.endAt },
          // Paciente pode já ter sido criado/vinculado: a tela avisa para não
          // parecer que nada aconteceu, e o usuário só corrige o horário.
          patientId,
          patientCreated,
        },
        { status: 409 }
      );
    }

    const appt = await prisma.appointment.create({
      data: {
        patientId: patientId!,
        professionalId: d.professionalId,
        specialtyId: d.specialtyId,
        type: d.type,
        status: 'PENDING',
        modality: d.modality,
        roomId,
        startAt,
        endAt,
        durationMinutes: d.durationMinutes,
        // Procedência gravada no ingest, como no /deal: o relatório da Agenda
        // mostra que a consulta nasceu do canal, sem ninguém marcar select.
        source: conv.channel,
        notes: d.notes?.trim() || null,
        createdById: dbUser!.id,
        companyId,
      },
    });

    await runAutomations('APPOINTMENT_CREATED', {
      companyId,
      patientId: appt.patientId,
      summary: 'Nova consulta agendada',
    });

    const teleSession = d.modality === 'TELEMEDICINA'
      ? await provisionTeleconsultation(
          { id: appt.id, patientId: appt.patientId, professionalId: appt.professionalId, companyId: appt.companyId, startAt },
          dbUser!,
        )
      : null;

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.CREATE,
      entityType: EntityType.APPOINTMENT,
      entityId: appt.id,
      newValues: {
        origem: 'mensageria',
        conversationId: conv.id,
        contactId: conv.contact.id,
        canal: conv.channel,
        patientId: appt.patientId,
        pacienteCriadoAgora: patientCreated,
        startAt: appt.startAt,
        modality: appt.modality,
      },
      request,
    });

    const [patient, professional] = await Promise.all([
      prisma.patient.findUnique({ where: { id: appt.patientId }, select: { name: true } }),
      prisma.professional.findUnique({ where: { id: appt.professionalId }, select: { name: true } }),
    ]);

    return NextResponse.json(
      {
        appointment: {
          id: appt.id,
          startAt: appt.startAt,
          endAt: appt.endAt,
          type: appt.type,
          modality: appt.modality,
          patientId: appt.patientId,
          patientName: patient?.name ?? null,
          professionalName: professional?.name ?? null,
          teleconsultationId: teleSession?.id ?? null,
        },
        patientCreated,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao criar agendamento a partir da conversa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
