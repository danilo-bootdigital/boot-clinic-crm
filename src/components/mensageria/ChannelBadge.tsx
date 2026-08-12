'use client';

// Etiqueta de procedência (diretriz §4.3). Lê os campos da PRÓPRIA mensagem ou
// conversa — nunca deduz o canal a partir do contexto. Numa thread de contato
// com identidades em dois canais, as etiquetas divergem na mesma lista, e é
// justamente esse caso que a dedução quebraria.
//
// Regra de acessibilidade da diretriz: ícone/cor nunca são a única marcação —
// sempre acompanham texto (rótulo visível ou aria-label).

export type ChannelValue = 'WHATSAPP' | 'INSTAGRAM' | 'TIKTOK';
export type SourceValue = 'CONTACT' | 'CRM' | 'MOBILE' | 'AUTOMATION';

const CHANNEL_META: Record<ChannelValue, { label: string; className: string }> = {
  WHATSAPP: { label: 'WhatsApp', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  INSTAGRAM: { label: 'Instagram', className: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200' },
  TIKTOK: { label: 'TikTok', className: 'bg-slate-100 text-slate-700 ring-slate-300' },
};

// Só marcamos a origem do ENVIO quando ela não é a esperada. Mensagem enviada
// pelo celular fora do CRM precisa aparecer marcada: sem isso o atendente olha a
// fila, não vê resposta e responde de novo — o paciente recebe duas.
const SOURCE_META: Partial<Record<SourceValue, { label: string; title: string }>> = {
  MOBILE: { label: 'pelo celular', title: 'Enviada fora do CRM, direto do aparelho' },
  AUTOMATION: { label: 'automática', title: 'Enviada por automação' },
};

export function ChannelBadge({
  channel,
  accountLabel,
  source,
  className = '',
}: {
  channel: ChannelValue;
  /** Conta/número NOSSO onde a mensagem caiu (ex.: Recepção, Comercial). */
  accountLabel?: string | null;
  source?: SourceValue | null;
  className?: string;
}) {
  const meta = CHANNEL_META[channel] ?? CHANNEL_META.TIKTOK;
  const sourceMeta = source ? SOURCE_META[source] : undefined;
  const aria = [meta.label, accountLabel, sourceMeta?.label].filter(Boolean).join(' · ');

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${className}`}>
      <span
        className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset ${meta.className}`}
        aria-label={`Canal: ${aria}`}
      >
        {meta.label}
      </span>
      {accountLabel && (
        <span className="text-muted-foreground" title={`Conta de entrada: ${accountLabel}`}>
          {accountLabel}
        </span>
      )}
      {sourceMeta && (
        <span
          className="rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
          title={sourceMeta.title}
        >
          {sourceMeta.label}
        </span>
      )}
    </span>
  );
}
