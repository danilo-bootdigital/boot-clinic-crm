// Exportação CSV client-side (sem dependências). Usa separador ';' e BOM UTF-8
// para abrir corretamente no Excel em pt-BR (que espera ';' e vírgula decimal).

type Cell = string | number | null | undefined

function escapeCell(v: Cell): string {
  const s = v == null ? '' : String(v)
  // Aspas o campo se houver ';', aspas, ou quebra de linha; dobra aspas internas.
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Número monetário → string pt-BR (vírgula decimal, 2 casas), p/ célula de CSV. */
export function csvMoney(n: number): string {
  return (n ?? 0).toFixed(2).replace('.', ',')
}

/** Monta o conteúdo CSV (cabeçalho + linhas) com separador ';'. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(';'))
  return lines.join('\r\n')
}

/** Gera o CSV e dispara o download no navegador. */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const blob = new Blob(['﻿' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Sufixo de data (YYYY-MM-DD) p/ nome de arquivo, a partir da data local. */
export function dateStamp(d = new Date()): string {
  return d.toLocaleDateString('sv-SE') // sv-SE → formato ISO YYYY-MM-DD
}
