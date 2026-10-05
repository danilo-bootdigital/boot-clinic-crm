import type { PatientContract } from '@prisma/client';

// O que a tela da equipe pode ver de um contrato. Hashes de token/código e
// caminhos no storage nunca saem do servidor — o PDF é baixado por rota própria,
// que gera URL temporária.
export function serializeContract(c: PatientContract) {
  const {
    signTokenHash, otpHash, otpExpiresAt, otpAttempts, otpSendCount, otpLastSentAt,
    signatureImagePath, signedPdfPath, ...rest
  } = c;
  return {
    ...rest,
    hasSignedPdf: !!signedPdfPath,
    // Link ativo = ainda dá para o paciente assinar por ele.
    signLinkActive:
      !!signTokenHash && c.status === 'SENT' && !!c.signTokenExpiresAt && c.signTokenExpiresAt > new Date(),
  };
}
