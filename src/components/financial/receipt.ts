import { brl, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/financial-format'

// Escapa HTML — campos do paciente/descrição são dados não confiáveis; sem isso
// o document.write abaixo executaria <script>/onerror injetados (XSS).
function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )
}

// Emite um recibo simples (HTML imprimível) numa nova janela e dispara a
// impressão. Fase 1: sem PDF server-side — o navegador imprime/salva em PDF.
// Recibo = soma dos pagamentos NÃO estornados do recebível.
export function printReceipt(r: any) {
  const payments = (r.installments || []).flatMap((i: any) =>
    (i.payments || [])
      .filter((p: any) => !p.reversedAt)
      .map((p: any) => ({ ...p, installment: i.number })),
  )
  const total = payments.reduce((s: number, p: any) => s + p.amount, 0)
  const rows = payments
    .map(
      (p: any) =>
        `<tr><td>Parcela ${esc(p.installment)}</td><td>${esc(PAYMENT_METHOD_LABELS[p.method] || p.method)}</td><td>${esc(formatDate(p.paidAt))}</td><td style="text-align:right">${esc(brl(p.amount))}</td></tr>`,
    )
    .join('')

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo</title>
  <style>
    body{font-family:system-ui,Arial,sans-serif;color:#111;max-width:640px;margin:40px auto;padding:0 24px}
    h1{font-size:20px;margin-bottom:4px} .muted{color:#666;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
    th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}
    .total{margin-top:16px;font-size:16px;font-weight:600;text-align:right}
    .sign{margin-top:64px;border-top:1px solid #111;width:260px;text-align:center;padding-top:6px;font-size:13px}
  </style></head><body>
    <h1>Recibo de pagamento</h1>
    <p class="muted">Paciente: ${esc(r.patientName || '—')}</p>
    <p class="muted">Descrição: ${esc(r.description || '—')}</p>
    <p class="muted">Emitido em ${esc(formatDate(new Date()))}</p>
    <table><thead><tr><th>Item</th><th>Forma</th><th>Data</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">Sem pagamentos.</td></tr>'}</tbody></table>
    <p class="total">Total recebido: ${brl(total)}</p>
    <div class="sign">Assinatura</div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) { alert('Permita pop-ups para emitir o recibo.'); return }
  w.document.write(html)
  w.document.close()
}
