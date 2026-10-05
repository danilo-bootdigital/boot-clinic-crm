// Assinatura eletrônica de contrato — presencial e por link + código no WhatsApp.
//
// Cobre o que dá valor de prova à assinatura: o link e o código só existem como
// hash no banco, o código vai para o WhatsApp do CADASTRO, o CPF tem que bater,
// o texto trava depois do envio, não existe "assinado" sem assinatura de verdade,
// não se assina duas vezes e uma clínica não mexe no contrato de outra.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { pngDataUrl, makePng } from './png-fixture';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/api/clinical-access', () => ({
  resolveClinicalUser: vi.fn(),
  resolveClinicalPatientAccess: vi.fn(),
}));
vi.mock('@/lib/api/audit', () => ({ writeAudit: vi.fn() }));
vi.mock('@/lib/messaging/adapters/whatsapp/evolution', () => ({
  sendWhatsappForCompany: vi.fn(async () => ({ configured: true, ok: true })),
}));
const uploaded: { path: string; bytes: Uint8Array; contentType: string }[] = [];
vi.mock('@/lib/storage/clinical-storage', () => ({
  uploadClinicalFile: vi.fn(async (i: any) => {
    const path = `${i.companyId}/${i.patientId}/${i.kind}/${i.fileName}`;
    uploaded.push({ path, bytes: i.bytes, contentType: i.contentType });
    return { path };
  }),
  removeClinicalFile: vi.fn(async () => {}),
  clinicalSignedUrl: vi.fn(async (p: string) => `https://storage.test/${p}`),
}));

import { prisma } from '@/lib/db/prisma';
import type { PrismaMock } from '@/test/prisma-mock';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { sendWhatsappForCompany } from '@/lib/messaging/adapters/whatsapp/evolution';
import { POST as SIGN_LINK } from '@/app/api/clinico/contracts/[id]/sign-link/route';
import { POST as SIGN_IN_PERSON } from '@/app/api/clinico/contracts/[id]/sign/route';
import { PUT as UPDATE } from '@/app/api/clinico/contracts/[id]/route';
import { GET as PUBLIC_GET } from '@/app/api/public/contracts/[token]/route';
import { POST as PUBLIC_OTP } from '@/app/api/public/contracts/[token]/otp/route';
import { POST as PUBLIC_SIGN } from '@/app/api/public/contracts/[token]/sign/route';
import { hashOtp, hashSignToken } from '@/lib/contracts/signing';
import { buildSignedContractPdf } from '@/lib/contracts/pdf';

const db = prisma as unknown as PrismaMock;
const sendMock = vi.mocked(sendWhatsappForCompany);

const req = (body?: any, ua = 'Mozilla/5.0 (iPhone)') =>
  new NextRequest('http://localhost/x', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': ua, 'x-forwarded-for': '200.1.2.3, 10.0.0.1' },
  });
const asStaff = (companyId: string) =>
  vi.mocked(resolveClinicalUser).mockResolvedValue({ dbUser: { id: `u-${companyId}`, name: 'Recepção', companyId } } as any);

let contract: any;
let patient: any;

/** Gera o link e devolve o token em claro, tirado da mensagem do WhatsApp. */
async function sendLink(id = contract.id) {
  sendMock.mockClear();
  const res = await SIGN_LINK(req(), { params: { id } });
  const body = await res.json();
  const token = body.link?.split('/assinar/')[1];
  return { res, body, token };
}

/** Pede o código e devolve o valor enviado (lido da mensagem). */
async function requestCode(token: string) {
  sendMock.mockClear();
  const res = await PUBLIC_OTP(req(), { params: { token } });
  const text = sendMock.mock.calls[0]?.[2] as string | undefined;
  return { res, code: text?.match(/\*(\d{6})\*/)?.[1] };
}

beforeEach(async () => {
  db.__reset();
  uploaded.length = 0;
  sendMock.mockReset();
  sendMock.mockResolvedValue({ configured: true, ok: true } as any);
  asStaff('A');
  await db.company.create({ data: { id: 'A', name: 'Kanan Clínic', cnpj: '12345678000199' } });
  patient = await db.patient.create({
    data: { companyId: 'A', name: 'Maria Souza', cpf: '12345678909', phone: '11988887777', whatsapp: '5511977776666' },
  });
  contract = await db.patientContract.create({
    data: {
      companyId: 'A', patientId: patient.id, title: 'Contrato de tratamento',
      content: 'Eu, Maria Souza, CPF 123.456.789-09, contrato o tratamento. Ação, preço e condições.',
      status: 'DRAFT', createdById: 'u-A', otpAttempts: 0, otpSendCount: 0, deletedAt: null,
    },
  });
});

describe('link de assinatura', () => {
  it('guarda só o hash do token e manda o link no WhatsApp do cadastro', async () => {
    const { res, body, token } = await sendLink();
    expect(res.status).toBe(200);
    expect(body.sent).toBe(true);
    const saved = await db.patientContract.findFirst({ where: { id: contract.id } });
    expect(saved!.status).toBe('SENT');
    expect(saved!.signTokenHash).toBe(hashSignToken(token));
    expect(JSON.stringify(saved)).not.toContain(token);
    // WhatsApp do cadastro tem prioridade sobre o telefone.
    expect(sendMock.mock.calls[0][1]).toBe('5511977776666');
    expect(sendMock.mock.calls[0][2]).toContain(`/assinar/${token}`);
  });

  it('gerar de novo invalida o link anterior', async () => {
    const first = (await sendLink()).token;
    const second = (await sendLink()).token;
    expect((await PUBLIC_GET(req(), { params: { token: first } })).status).toBe(404);
    expect((await PUBLIC_GET(req(), { params: { token: second } })).status).toBe(200);
  });

  it('outra clínica não gera link do contrato', async () => {
    asStaff('B');
    const { res } = await sendLink();
    expect(res.status).toBe(404);
  });

  it('a página pública não expõe hashes', async () => {
    const { token } = await sendLink();
    const body = await (await PUBLIC_GET(req(), { params: { token } })).json();
    expect(body.content).toContain('Maria Souza');
    expect(body.phoneMasked).toBe('(11) 9••••-6666');
    expect(JSON.stringify(body)).not.toMatch(/Hash|otp/i);
  });
});

describe('código no WhatsApp', () => {
  it('envia para o número do cadastro e respeita a espera entre envios', async () => {
    const { token } = await sendLink();
    const first = await requestCode(token);
    expect(first.res.status).toBe(200);
    expect(first.code).toMatch(/^\d{6}$/);
    const saved = await db.patientContract.findFirst({ where: { id: contract.id } });
    expect(saved!.otpHash).toBe(hashOtp(contract.id, first.code!));
    const again = await requestCode(token);
    expect(again.res.status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('assinatura remota', () => {
  async function ready() {
    const { token } = await sendLink();
    const { code } = await requestCode(token);
    return { token, code: code! };
  }

  it('código errado conta tentativa e não assina', async () => {
    const { token, code } = await ready();
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await PUBLIC_SIGN(req({ code: wrong, cpf: '123.456.789-09', signature: pngDataUrl(), accepted: true }), { params: { token } });
    expect(res.status).toBe(400);
    const saved = await db.patientContract.findFirst({ where: { id: contract.id } });
    expect(saved!.otpAttempts).toBe(1);
    expect(saved!.status).toBe('SENT');
  });

  it('CPF diferente do cadastro é recusado', async () => {
    const { token, code } = await ready();
    const res = await PUBLIC_SIGN(req({ code, cpf: '987.654.321-00', signature: pngDataUrl(), accepted: true }), { params: { token } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/CPF/);
    expect(uploaded).toHaveLength(0);
  });

  it('assina, grava evidências e PDF, e não aceita assinar de novo', async () => {
    const { token, code } = await ready();
    const res = await PUBLIC_SIGN(req({ code, cpf: '12345678909', signature: pngDataUrl(), accepted: true }), { params: { token } });
    expect(res.status).toBe(200);

    const saved = await db.patientContract.findFirst({ where: { id: contract.id } });
    expect(saved!.status).toBe('SIGNED');
    expect(saved!.signMethod).toBe('REMOTE');
    expect(saved!.signerIp).toBe('200.1.2.3');
    expect(saved!.signerCpf).toBe('123.456.789-09');
    expect(saved!.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved!.otpHash).toBeNull();
    const pdf = uploaded.find((u) => u.contentType === 'application/pdf')!;
    expect(saved!.signedPdfPath).toBe(pdf.path);
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    // Quem gerou o contrato é avisado.
    expect(await db.notificationEvent.count({ where: { userId: 'u-A' } })).toBe(1);

    const again = await PUBLIC_SIGN(req({ code, cpf: '12345678909', signature: pngDataUrl(), accepted: true }), { params: { token } });
    expect(again.status).toBe(409);
    // O link segue abrindo, só para baixar a cópia.
    expect((await (await PUBLIC_GET(req(), { params: { token } })).json()).status).toBe('SIGNED');
  });

  it('link de contrato cancelado não abre', async () => {
    const { token } = await sendLink();
    await UPDATE(new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify({ status: 'CANCELED' }) }), { params: { id: contract.id } });
    expect((await PUBLIC_GET(req(), { params: { token } })).status).toBe(404);
  });
});

describe('assinatura presencial e travas', () => {
  it('assina na clínica registrando quem conduziu, sem código', async () => {
    const res = await SIGN_IN_PERSON(req({ cpf: '12345678909', signature: pngDataUrl(), accepted: true }), { params: { id: contract.id } });
    expect(res.status).toBe(200);
    const saved = await db.patientContract.findFirst({ where: { id: contract.id } });
    expect(saved!.status).toBe('SIGNED');
    expect(saved!.signMethod).toBe('IN_PERSON');
    expect(saved!.signedByUserId).toBe('u-A');
  });

  it('não existe "assinado" sem assinatura', async () => {
    const res = await UPDATE(new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify({ status: 'SIGNED' }) }), { params: { id: contract.id } });
    expect(res.status).toBe(400);
  });

  it('texto não muda depois do envio', async () => {
    await sendLink();
    const res = await UPDATE(new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify({ content: 'outro texto' }) }), { params: { id: contract.id } });
    expect(res.status).toBe(409);
  });

  it('assinatura que não é PNG é recusada', async () => {
    const res = await SIGN_IN_PERSON(req({ cpf: '12345678909', signature: 'data:image/png;base64,AAAA', accepted: true }), { params: { id: contract.id } });
    expect(res.status).toBe(400);
  });
});

describe('PDF', () => {
  it('aceita acentos e símbolos fora do WinAnsi sem quebrar', async () => {
    const bytes = await buildSignedContractPdf({
      clinicName: 'Kanan Clínic', title: 'Contrato — Ação “especial”', content: 'Coração, não, ç, º, § 2º 😀\n\n'.repeat(80),
      contractId: 'c1', signatureImage: new Uint8Array(makePng()), signerName: 'João', signerCpf: '123.456.789-09',
      signedAt: new Date(), method: 'REMOTE', ip: '1.1.1.1', userAgent: 'x', contentHash: 'a'.repeat(64), otpSentTo: '(11) 9••••-6666',
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
