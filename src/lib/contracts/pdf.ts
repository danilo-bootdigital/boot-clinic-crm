import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

// PDF do contrato assinado: o texto, a assinatura e uma página final de
// evidências (quem, quando, de onde, como foi confirmado e o hash do texto).
// É esse arquivo que fica na pasta do paciente e que se apresenta numa disputa.

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;
const BODY_SIZE = 10.5;
const LINE = BODY_SIZE * 1.45;
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.42, 0.42, 0.46);

// As fontes-padrão do PDF usam WinAnsi: cobre acentos do português, mas não
// emoji nem alguns símbolos. Trocamos o que não cabe em vez de quebrar a geração.
function winAnsiSafe(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/[•●▪]/g, '*')
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, '');
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // Palavra maior que a linha (ex.: URL): quebra no caractere.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let i = rest.length;
        while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > maxWidth) i--;
        out.push(rest.slice(0, i));
        rest = rest.slice(i);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

export interface SignedPdfInput {
  clinicName: string;
  clinicCnpj?: string | null;
  title: string;
  content: string;
  contractId: string;
  signatureImage: Uint8Array; // PNG
  signerName: string;
  signerCpf: string;
  signedAt: Date;
  method: 'IN_PERSON' | 'REMOTE';
  ip: string;
  userAgent: string;
  contentHash: string;
  otpSentTo?: string | null; // número mascarado (remoto)
  otpVerifiedAt?: Date | null;
  linkSentAt?: Date | null;
  viewedAt?: Date | null;
  conductedBy?: string | null; // atendente (presencial)
}

const fmt = (d: Date) =>
  d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) + ' (horário de Brasília)';

export async function buildSignedContractPdf(input: SignedPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsiSafe(input.title));
  doc.setAuthor(winAnsiSafe(input.clinicName));
  doc.setSubject('Contrato assinado eletronicamente');
  doc.setCreationDate(input.signedAt);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = A4.w - MARGIN * 2;

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;
  let pageNo = 1;

  const footer = (p: PDFPage, n: number) => {
    const text = winAnsiSafe(`${input.clinicName} · Contrato ${input.contractId} · página ${n}`);
    p.drawText(text, { x: MARGIN, y: MARGIN / 2, size: 7.5, font: regular, color: MUTED });
  };
  const newPage = () => {
    footer(page, pageNo);
    page = doc.addPage([A4.w, A4.h]);
    pageNo++;
    y = A4.h - MARGIN;
  };
  const ensure = (h: number) => {
    if (y - h < MARGIN) newPage();
  };
  const write = (text: string, font: PDFFont, size: number, color = INK, gap = size * 1.45) => {
    for (const line of wrap(winAnsiSafe(text), font, size, width)) {
      ensure(gap);
      if (line) page.drawText(line, { x: MARGIN, y: y - size, size, font, color });
      y -= gap;
    }
  };

  // Cabeçalho
  write(input.clinicName + (input.clinicCnpj ? ` · CNPJ ${input.clinicCnpj}` : ''), regular, 8.5, MUTED);
  y -= 6;
  write(input.title, bold, 15, INK, 20);
  y -= 8;

  // Corpo
  write(input.content, regular, BODY_SIZE, INK, LINE);

  // Bloco de assinatura
  const png = await doc.embedPng(input.signatureImage);
  const sigW = 200;
  const sigH = Math.min(90, (png.height / png.width) * sigW);
  ensure(sigH + 70);
  y -= 24;
  page.drawImage(png, { x: MARGIN, y: y - sigH, width: sigW, height: sigH });
  y -= sigH + 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 260, y }, thickness: 0.6, color: MUTED });
  y -= 4;
  write(`${input.signerName} · CPF ${input.signerCpf}`, bold, 9.5, INK, 13);
  write(`Assinado eletronicamente em ${fmt(input.signedAt)}`, regular, 8.5, MUTED, 12);
  footer(page, pageNo);

  // Página de evidências
  page = doc.addPage([A4.w, A4.h]);
  pageNo++;
  y = A4.h - MARGIN;
  write('Registro de assinatura eletrônica', bold, 14, INK, 20);
  write(
    'Assinatura eletrônica simples nos termos da Lei nº 14.063/2020 e do art. 10, § 2º, da MP nº 2.200-2/2001. ' +
      'O código abaixo identifica o texto assinado: qualquer alteração no contrato produz um código diferente.',
    regular, 9, MUTED, 13,
  );
  y -= 10;

  const rows: [string, string][] = [
    ['Contrato', input.title],
    ['Identificador', input.contractId],
    ['Signatário', input.signerName],
    ['CPF do signatário', input.signerCpf],
    ['Forma de assinatura', input.method === 'IN_PERSON' ? 'Presencial, na clínica, em dispositivo da clínica' : 'Remota, por link enviado ao WhatsApp do paciente'],
  ];
  if (input.method === 'REMOTE') {
    if (input.linkSentAt) rows.push(['Link enviado em', fmt(input.linkSentAt)]);
    if (input.viewedAt) rows.push(['Contrato aberto em', fmt(input.viewedAt)]);
    rows.push(['Código de confirmação', `Enviado por WhatsApp para ${input.otpSentTo || '-'}${input.otpVerifiedAt ? `, validado em ${fmt(input.otpVerifiedAt)}` : ''}`]);
  }
  if (input.conductedBy) rows.push(['Conduzida por', input.conductedBy]);
  rows.push(
    ['Assinado em', fmt(input.signedAt)],
    ['Endereço IP', input.ip],
    ['Dispositivo', input.userAgent.slice(0, 220)],
    ['Hash SHA-256 do texto', input.contentHash],
  );

  for (const [k, v] of rows) {
    ensure(30);
    write(k, bold, 8.5, MUTED, 12);
    write(v, regular, 9.5, INK, 13);
    y -= 6;
  }
  footer(page, pageNo);

  return doc.save();
}
