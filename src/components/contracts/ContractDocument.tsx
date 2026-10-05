// Texto do contrato como o paciente vai assinar: título + corpo preservando as
// quebras de linha do modelo. Rolagem própria para o formulário de assinatura
// ficar sempre perto.
export function ContractDocument({ title, content }: { title: string; content: string }) {
  return (
    <article className="rounded-xl border border-border bg-card shadow-card">
      <header className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </header>
      <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{content}</p>
      </div>
    </article>
  )
}

export function maskCpfInput(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}
