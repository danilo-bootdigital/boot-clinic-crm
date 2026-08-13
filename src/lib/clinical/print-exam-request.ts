// Impressão do pedido de exames, no layout do modelo da clínica.
//
// Segue o padrão já usado em financial/receipt.ts: HTML imprimível numa nova
// janela, sem PDF server-side. O navegador imprime ou salva em PDF.

// Escapa HTML — nome de paciente, indicação clínica e observações são texto
// digitado. Sem isso, `document.write` executaria <script>/onerror injetados.
function esc(v: unknown): string {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

function dataBR(v?: string | Date | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

interface Grupo {
  group: string;
  subgroups: { subgroup: string | null; names: string[] }[];
}

export interface ExamRequestDoc {
  clinica: { nome: string; logo?: string | null; telefone?: string | null; endereco?: string | null };
  paciente: { nome: string; nascimento?: string | Date | null };
  profissional: { nome: string; crm?: string | null; signatureUrl?: string | null };
  indicacaoClinica: string;
  observacoes?: string | null;
  emitidoEm: string | Date;
  grupos: Grupo[];
}

export function printExamRequest(doc: ExamRequestDoc) {
  // Quando o pedido é só a lista digitada, não há painel a nomear: imprimir
  // "Outros exames" como título de um documento inteiro fica sem sentido.
  const grupoUnicoLivre = doc.grupos.length === 1 && doc.grupos[0].group === 'Outros exames';

  const grupos = doc.grupos
    .map((g) => {
      const blocos = g.subgroups
        .map((sg) => {
          const itens = sg.names.map((n) => `<li>${esc(n)}</li>`).join('');
          const titulo = sg.subgroup ? `<p class="sub">${esc(sg.subgroup)}</p>` : '';
          return `${titulo}<ul class="exames">${itens}</ul>`;
        })
        .join('');
      const titulo = grupoUnicoLivre ? '<h2>Exames solicitados</h2>' : `<h2>${esc(g.group)}</h2>`;
      return `<section class="grupo">${titulo}${blocos}</section>`;
    })
    .join('');

  // Observações vêm em linhas; cada linha é um item.
  const obs = (doc.observacoes || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('');

  // Assinatura: imagem quando existe, linha para assinar à mão quando não.
  const assinatura = doc.profissional.signatureUrl
    ? `<img class="assinatura" src="${esc(doc.profissional.signatureUrl)}" alt="Assinatura">`
    : '<div class="linha-assinatura"></div>';

  const logo = doc.clinica.logo
    ? `<img class="logo" src="${esc(doc.clinica.logo)}" alt="">`
    : '';

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Solicitação de Exames — ${esc(doc.paciente.nome)}</title>
  <style>
    @page { margin: 18mm 16mm; }
    body { font-family: system-ui, Arial, sans-serif; color: #111; max-width: 760px; margin: 0 auto; padding: 24px; }
    header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 10px; }
    .logo { height: 44px; width: auto; object-fit: contain; }
    .clinica { font-size: 18px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
    .contato { font-size: 11px; color: #555; }
    h1 { font-size: 15px; text-align: center; text-transform: uppercase; letter-spacing: .6px; margin: 18px 0 14px; }
    .campos p { margin: 4px 0; font-size: 13px; }
    .campos strong { font-weight: 600; }
    .indicacao { margin: 12px 0 4px; font-size: 13px; }
    .grupo { margin-top: 14px; break-inside: avoid; }
    .grupo h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .4px; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ccc; }
    .sub { font-size: 12px; font-weight: 600; margin: 8px 0 4px; }
    /* Duas colunas: o painel é longo e em uma coluna estoura a página. */
    ul.exames { columns: 2; column-gap: 28px; margin: 0; padding-left: 18px; font-size: 12.5px; }
    ul.exames li { margin: 2px 0; break-inside: avoid; }
    .obs { margin-top: 16px; font-size: 12.5px; }
    .obs h2 { font-size: 13px; text-transform: uppercase; margin: 0 0 4px; }
    .obs ul { margin: 0; padding-left: 18px; }
    footer { margin-top: 42px; break-inside: avoid; }
    .assinatura { display: block; height: 62px; width: auto; object-fit: contain; margin-bottom: 2px; }
    .linha-assinatura { height: 62px; }
    .bloco-assinatura { border-top: 1px solid #111; width: 320px; padding-top: 5px; font-size: 12.5px; }
    .carimbo { margin-top: 4px; font-size: 11px; color: #555; }
  </style></head><body>
    <header>
      ${logo}
      <div>
        <div class="clinica">${esc(doc.clinica.nome)}</div>
        ${
          doc.clinica.telefone || doc.clinica.endereco
            ? `<div class="contato">${[doc.clinica.endereco, doc.clinica.telefone].filter(Boolean).map(esc).join(' · ')}</div>`
            : ''
        }
      </div>
    </header>

    <h1>Solicitação de Exames Laboratoriais</h1>

    <div class="campos">
      <p><strong>Paciente:</strong> ${esc(doc.paciente.nome)}</p>
      <p><strong>Data de Nascimento:</strong> ${esc(dataBR(doc.paciente.nascimento)) || '____/____/______'}</p>
      <p><strong>Data:</strong> ${esc(dataBR(doc.emitidoEm))}</p>
    </div>

    ${
      doc.indicacaoClinica?.trim()
        ? `<p class="indicacao"><strong>Indicação Clínica:</strong> ${esc(doc.indicacaoClinica)}</p>`
        : ''
    }

    ${grupos}

    ${obs ? `<div class="obs"><h2>Observações</h2><ul>${obs}</ul></div>` : ''}

    <footer>
      ${assinatura}
      <div class="bloco-assinatura">
        Médico(a): ${esc(doc.profissional.nome)}<br>
        CRM: ${esc(doc.profissional.crm || '')}
        <div class="carimbo">Assinatura e carimbo</div>
      </div>
    </footer>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
    return;
  }
  w.document.write(html);
  w.document.close();
  // A assinatura e o logo são imagens remotas: imprimir antes de carregarem sai
  // sem elas. Espera o load, com teto de tempo para não travar se falhar.
  const disparar = () => {
    w.focus();
    w.print();
  };
  if (w.document.images.length === 0) setTimeout(disparar, 150);
  else {
    w.onload = disparar;
    setTimeout(disparar, 2500);
  }
}
