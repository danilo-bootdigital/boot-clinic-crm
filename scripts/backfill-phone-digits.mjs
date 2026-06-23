// Backfill: normaliza telefones de pacientes para somente dígitos.
//
// Contexto: o cadastro de pacientes deixou de aplicar máscara e passou a salvar/
// exibir o telefone exatamente como digitado (apenas números). Registros antigos
// podem ter sido salvos com máscara (ex.: "(11) 99999-9999"); ao editá-los, a nova
// validação dígitos-only recusaria o valor com pontuação. Este script remove os
// caracteres não-numéricos de `phone` e `whatsapp` dos pacientes existentes.
//
// SEGURO POR PADRÃO: roda em modo dry-run (apenas lista o que mudaria).
// Para aplicar de fato, passe a flag --apply:
//
//   node --env-file=.env scripts/backfill-phone-digits.mjs            # dry-run
//   node --env-file=.env scripts/backfill-phone-digits.mjs --apply    # aplica
//
// Preserva zeros à esquerda (é só string). Não toca em registros já limpos.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const onlyDigits = (v) => (v == null ? v : String(v).replace(/\D/g, ''));

async function main() {
  console.log(APPLY ? '== MODO APLICAÇÃO (--apply) ==' : '== DRY-RUN (use --apply para gravar) ==');

  const patients = await prisma.patient.findMany({
    select: { id: true, name: true, phone: true, whatsapp: true },
  });

  let changed = 0;
  for (const p of patients) {
    const newPhone = onlyDigits(p.phone);
    const newWhats = onlyDigits(p.whatsapp);

    const phoneDiff = newPhone !== (p.phone ?? '') && newPhone !== p.phone;
    const whatsDiff = newWhats !== p.whatsapp;

    if (!phoneDiff && !whatsDiff) continue;
    changed++;

    console.log(
      `#${p.id} ${p.name}` +
      (phoneDiff ? `\n  phone:    "${p.phone}" -> "${newPhone}"` : '') +
      (whatsDiff ? `\n  whatsapp: "${p.whatsapp}" -> "${newWhats}"` : '')
    );

    if (APPLY) {
      await prisma.patient.update({
        where: { id: p.id },
        data: {
          ...(phoneDiff ? { phone: newPhone } : {}),
          ...(whatsDiff ? { whatsapp: newWhats } : {}),
        },
      });
    }
  }

  console.log(`\n${changed} paciente(s) ${APPLY ? 'atualizado(s)' : 'seriam atualizados'} de ${patients.length} total.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
