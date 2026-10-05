import type { PatientContract } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { uploadClinicalFile, removeClinicalFile } from '@/lib/storage/clinical-storage';
import { buildSignedContractPdf } from '@/lib/contracts/pdf';
import { contractContentHash, onlyDigits } from '@/lib/contracts/signing';
import { formatCnpj, formatCpf } from '@/lib/contracts/variables';

// Conclusão da assinatura — comum à presencial e à remota.
//
// Ordem: valida o CPF, sobe a imagem do traço e o PDF, e só então vira o status
// com uma atualização CONDICIONAL (só se ainda não estiver assinado). Dois
// cliques simultâneos não geram duas assinaturas: o segundo perde a corrida,
// recebe conflito e os arquivos dele são apagados.

export class SignError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function finalizeContractSignature(opts: {
  contract: PatientContract;
  signatureImage: Uint8Array;
  typedCpf: string;
  method: 'IN_PERSON' | 'REMOTE';
  ip: string;
  userAgent: string;
  conductedBy?: { id: string; name: string } | null;
}) {
  const { contract } = opts;
  if (contract.status === 'SIGNED') throw new SignError('Este contrato já foi assinado.', 409);
  if (contract.status === 'CANCELED') throw new SignError('Este contrato foi cancelado.', 409);

  const [patient, company] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: contract.patientId, companyId: contract.companyId },
      select: { id: true, name: true, cpf: true },
    }),
    prisma.company.findUnique({ where: { id: contract.companyId }, select: { name: true, cnpj: true } }),
  ]);
  if (!patient || !company) throw new SignError('Paciente ou clínica não encontrados.', 404);

  // Só o paciente assina: o CPF digitado tem que ser o do cadastro. É a
  // confirmação de identidade que acompanha o traço.
  if (onlyDigits(opts.typedCpf) !== onlyDigits(patient.cpf)) {
    throw new SignError('O CPF informado não confere com o cadastro do paciente.');
  }

  const signedAt = new Date();
  const contentHash = contractContentHash(contract.title, contract.content);
  const cpf = formatCpf(patient.cpf);

  const pdf = await buildSignedContractPdf({
    clinicName: company.name,
    clinicCnpj: company.cnpj ? formatCnpj(company.cnpj) : null,
    title: contract.title,
    content: contract.content,
    contractId: contract.id,
    signatureImage: opts.signatureImage,
    signerName: patient.name,
    signerCpf: cpf,
    signedAt,
    method: opts.method,
    ip: opts.ip,
    userAgent: opts.userAgent,
    contentHash,
    otpSentTo: contract.otpSentTo,
    otpVerifiedAt: opts.method === 'REMOTE' ? signedAt : null,
    linkSentAt: contract.sentAt,
    viewedAt: contract.viewedAt,
    conductedBy: opts.conductedBy?.name ?? null,
  });

  const base = { companyId: contract.companyId, patientId: patient.id, kind: 'contracts' as const };
  const sig = await uploadClinicalFile({ ...base, fileName: `${contract.id}-assinatura.png`, contentType: 'image/png', bytes: opts.signatureImage });
  let pdfPath: string;
  try {
    pdfPath = (await uploadClinicalFile({ ...base, fileName: `${contract.id}-assinado.pdf`, contentType: 'application/pdf', bytes: pdf })).path;
  } catch (e) {
    await removeClinicalFile(sig.path);
    throw e;
  }

  const { count } = await prisma.patientContract.updateMany({
    where: { id: contract.id, status: { in: ['DRAFT', 'SENT'] }, deletedAt: null },
    data: {
      status: 'SIGNED',
      signedAt,
      signMethod: opts.method,
      contentHash,
      signerName: patient.name,
      signerCpf: cpf,
      signerIp: opts.ip,
      signerUserAgent: opts.userAgent.slice(0, 500),
      signedByUserId: opts.conductedBy?.id ?? null,
      signatureImagePath: sig.path,
      signedPdfPath: pdfPath,
      // O código morre com a assinatura. O link remoto continua só para o
      // paciente baixar a cópia (o status SIGNED já impede assinar de novo);
      // na presencial não há motivo para manter link algum.
      otpHash: null,
      otpExpiresAt: null,
      ...(opts.method === 'IN_PERSON' && { signTokenHash: null }),
    },
  });
  if (count === 0) {
    await Promise.all([removeClinicalFile(sig.path), removeClinicalFile(pdfPath)]);
    throw new SignError('Este contrato já foi assinado.', 409);
  }

  // Registro no histórico do paciente e no log de auditoria (best-effort).
  const how = opts.method === 'IN_PERSON' ? `presencialmente (conduzido por ${opts.conductedBy?.name ?? 'equipe'})` : 'pelo link enviado no WhatsApp';
  await Promise.allSettled([
    prisma.timelineEvent.create({
      data: {
        title: 'Contrato assinado',
        content: `"${contract.title}" assinado ${how}.`,
        type: 'DOCUMENT',
        patientId: patient.id,
        userId: opts.conductedBy?.id ?? null,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: opts.conductedBy?.id ?? null,
        userName: opts.conductedBy?.name ?? `Paciente ${patient.name} (link de assinatura)`,
        action: 'UPDATE_STATUS',
        entityType: 'CONTRACT',
        entityId: contract.id,
        oldValues: { status: contract.status },
        newValues: { status: 'SIGNED', method: opts.method, contentHash },
        ipAddress: opts.ip,
        userAgent: opts.userAgent.slice(0, 500),
        companyId: contract.companyId,
      },
    }),
    // Quem gerou o contrato fica sabendo sem precisar ficar conferindo.
    opts.method === 'REMOTE'
      ? prisma.notificationEvent.create({
          data: {
            title: 'Contrato assinado',
            message: `${patient.name} assinou "${contract.title}".`,
            type: 'SUCCESS',
            userId: contract.createdById,
            companyId: contract.companyId,
            patientId: patient.id,
          },
        })
      : Promise.resolve(),
  ]);

  return { signedAt, pdfPath, contentHash };
}
