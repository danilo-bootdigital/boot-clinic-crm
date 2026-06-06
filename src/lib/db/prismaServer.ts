import { PrismaClient, Prisma } from '@prisma/client';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // Em desenvolvimento, reutilizar a instância para evitar múltiplas conexões
  if (!(global as any).prismaServer) {
    (global as any).prismaServer = new PrismaClient();
  }
  prisma = (global as any).prismaServer;
}

export default prisma;

// Tipos do Prisma com campos personalizados
export type PrismaPatientWithRelations = Prisma.PatientGetPayload<{
  include: {
    contacts: true;
    addresses: true;
    documents: true;
    tags: true;
    notes: true;
    attachments: true;
    timelineEvents: true;
    clinic: true;
    company: true;
    createdBy: true;
  };
}>;

export type PrismaPatientWithoutRelations = Prisma.PatientGetPayload<{}>;