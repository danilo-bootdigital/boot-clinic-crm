'use client';

import { useEffect, useState } from 'react';

// Botão "Dar perdido" dentro da conversa (diretriz §5).
//
// A atendente descobre o motivo falando — se o perdido só existisse no Kanban,
// ela fecharia a conversa e a perda nunca seria registrada. O motivo é
// OBRIGATÓRIO: é o que separa "perdemos 12 leads" de "perdemos 8 por preço e 4
// por distância", e só a segunda versão muda alguma decisão da clínica.
//
// Sem negócio no funil, o servidor cria já perdido: lead que nunca entrou no
// funil também é perda, e desapareceria do relatório se dependesse de alguém ter
// clicado em "Enviar para o funil" antes.

interface Reason {
  id: string;
  name: string;
}

interface Contexto {
  contact: { id: string; name: string };
  reasons: Reason[];
  openDeal: { id: string; title: string } | null;
  lostDeal: { id: string; title: string; lostAt: string | null; reasonName: string | null } | null;
  hasLostStage: boolean;
}

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

export function MarkDealLost({
  conversationId,
  onLost,
}: {
  conversationId: string;
  onLost?: (dealId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reasonId, setReasonId] = useState('');
  const [nota, setNota] = useState('');
  const [feito, setFeito] = useState<{ dealId: string; reason: string; criado: boolean } | null>(null);

  useEffect(() => {
    // Troca de conversa limpa tudo — senão o painel mostra o contato anterior e
    // a perda é registrada na pessoa errada.
    setOpen(false);
    setCtx(null);
    setFeito(null);
    setErro(null);
    setReasonId('');
    setNota('');
  }, [conversationId]);

  async function abrir() {
    setOpen(true);
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/mensageria/conversations/${conversationId}/deal/lost`);
      const body = await res.json();
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível carregar os motivos.');
        return;
      }
      setCtx(body);
      setReasonId(body.reasons?.[0]?.id ?? '');
    } catch {
      setErro('Falha de rede ao carregar os motivos.');
    } finally {
      setLoading(false);
    }
  }

  async function darPerdido() {
    if (!reasonId) {
      setErro('Escolha o motivo da perda.');
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/mensageria/conversations/${conversationId}/deal/lost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lossReasonId: reasonId, notes: nota.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível dar como perdido.');
        if (Array.isArray(body?.reasons)) setCtx((c) => (c ? { ...c, reasons: body.reasons } : c));
        return;
      }
      setFeito({ dealId: body.deal.id, reason: body.reason.name, criado: !!body.created });
      onLost?.(body.deal.id);
    } catch {
      setErro('Falha de rede ao dar como perdido.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-card hover:bg-muted"
      >
        Dar perdido
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Dar perdido</h4>
          <p className="text-xs text-muted-foreground">O motivo fica no funil e no relatório.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Fechar
        </button>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Carregando motivos…</p>}

      {feito && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
          Perdido por <strong>{feito.reason}</strong>
          {feito.criado && ' — a oportunidade foi criada já perdida, para a perda entrar no relatório'}.{' '}
          <a href={`/crm?deal=${feito.dealId}`} className="underline">
            Abrir no CRM
          </a>
        </div>
      )}

      {!loading && !feito && ctx && (
        <div className="space-y-3">
          {ctx.lostDeal ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs text-foreground">
                Este contato já está perdido{ctx.lostDeal.reasonName ? ` por ${ctx.lostDeal.reasonName}` : ''}
                {ctx.lostDeal.lostAt ? ` em ${dataCurta(ctx.lostDeal.lostAt)}` : ''}.
              </p>
              <a href={`/crm?deal=${ctx.lostDeal.id}`} className="inline-block text-xs text-primary underline">
                Abrir no CRM
              </a>
            </div>
          ) : null}

          <div>
            <label htmlFor="motivo-perda" className="mb-1 block text-xs font-medium text-foreground">
              Motivo *
            </label>
            {ctx.reasons.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum motivo cadastrado. Cadastre em <a href="/crm" className="underline">CRM → Motivos de perda</a>.
              </p>
            ) : (
              <select
                id="motivo-perda"
                value={reasonId}
                onChange={(e) => setReasonId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              >
                {ctx.reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="nota-perda" className="mb-1 block text-xs font-medium text-foreground">
              Observação <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="nota-perda"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="o que a pessoa falou"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {ctx.openDeal
              ? `A oportunidade "${ctx.openDeal.title}" vai para Perdido.`
              : 'Este contato não tem oportunidade em aberto — ela será criada já perdida, para a perda contar no relatório.'}
          </p>

          {!ctx.hasLostStage && (
            <p className="text-xs text-muted-foreground">
              O pipeline não tem etapa final de perda: o negócio fica com status Perdido, sem cartão numa coluna.
            </p>
          )}

          {erro && <p className="text-xs text-destructive">{erro}</p>}

          <button
            type="button"
            onClick={darPerdido}
            disabled={busy || !reasonId}
            className="w-full rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Registrando…' : 'Confirmar perdido'}
          </button>
        </div>
      )}

      {!loading && !ctx && erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
