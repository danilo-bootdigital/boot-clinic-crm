'use client';

import { useEffect, useState } from 'react';

// Botão "Enviar para o funil" dentro da conversa (diretriz §5).
//
// Pega o contato da conversa e cria a oportunidade no CRM, com a etapa
// escolhida. A origem (DealSource) NÃO é escolha do usuário: vem do canal, para
// o relatório do CRM não depender de alguém lembrar de marcar o select certo.

interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface ExistingDeal {
  id: string;
  title: string;
  status: string;
}

interface Contexto {
  contact: { id: string; name: string; phone: string | null; patientId: string | null };
  channel: string;
  suggested: { title: string; stageId: string | null; source: string; responsibleUserId: string };
  pipeline: { id: string; name: string } | null;
  stages: Stage[];
  existingDeal: ExistingDeal | null;
}

const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  SOCIAL_MEDIA: 'Redes sociais',
  OTHER: 'Outro',
};

export function SendToPipeline({
  conversationId,
  onCreated,
}: {
  conversationId: string;
  onCreated?: (dealId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<ExistingDeal | null>(null);
  const [criado, setCriado] = useState<{ id: string; stageName: string } | null>(null);

  const [stageId, setStageId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [valor, setValor] = useState('');

  useEffect(() => {
    // Fecha e limpa quando troca de conversa — senão o painel mostra o contato
    // anterior e o atendente cria a oportunidade na pessoa errada.
    setOpen(false);
    setCtx(null);
    setCriado(null);
    setDuplicado(null);
    setErro(null);
  }, [conversationId]);

  async function abrir() {
    setOpen(true);
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/mensageria/conversations/${conversationId}/deal`);
      const body = await res.json();
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível carregar as etapas.');
        return;
      }
      setCtx(body);
      setStageId(body.suggested?.stageId ?? '');
      setTitulo(body.suggested?.title ?? '');
      setDuplicado(body.existingDeal ?? null);
    } catch {
      setErro('Falha de rede ao carregar as etapas.');
    } finally {
      setLoading(false);
    }
  }

  async function criar(force = false) {
    if (!stageId) {
      setErro('Escolha a etapa do funil.');
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/mensageria/conversations/${conversationId}/deal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId,
          title: titulo || undefined,
          valueEstimated: valor || undefined,
          force,
        }),
      });
      const body = await res.json();

      if (res.status === 409) {
        setDuplicado(body.existingDeal ?? null);
        setErro('Este contato já tem oportunidade em aberto.');
        return;
      }
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível criar a oportunidade.');
        return;
      }

      setCriado({ id: body.deal.id, stageName: body.deal.stageName });
      setDuplicado(null);
      onCreated?.(body.deal.id);
    } catch {
      setErro('Falha de rede ao criar a oportunidade.');
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
        Enviar para o funil
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Enviar para o funil</h4>
          {ctx?.pipeline && (
            <p className="text-xs text-muted-foreground">Pipeline: {ctx.pipeline.name}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Fechar
        </button>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Carregando etapas…</p>}

      {criado && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
          Oportunidade criada em <strong>{criado.stageName}</strong>.{' '}
          <a href={`/crm?deal=${criado.id}`} className="underline">
            Abrir no CRM
          </a>
        </div>
      )}

      {!loading && !criado && ctx && (
        <div className="space-y-3">
          {ctx.stages.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum pipeline com etapas configurado. Crie um pipeline no CRM primeiro.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="stage" className="mb-1 block text-xs font-medium text-foreground">
                  Etapa
                </label>
                <select
                  id="stage"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                >
                  {ctx.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="titulo" className="mb-1 block text-xs font-medium text-foreground">
                  Título
                </label>
                <input
                  id="titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                />
              </div>

              <div>
                <label htmlFor="valor" className="mb-1 block text-xs font-medium text-foreground">
                  Valor estimado <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Origem: <strong>{SOURCE_LABEL[ctx.suggested.source] ?? ctx.suggested.source}</strong>,
                derivada do canal da conversa.
                {ctx.contact.patientId
                  ? ' O contato já é paciente e a oportunidade nasce vinculada a ele.'
                  : ' O contato ainda não é paciente — a oportunidade não exige isso.'}
              </p>

              {erro && <p className="text-xs text-destructive">{erro}</p>}

              {duplicado ? (
                <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs text-foreground">
                    Já existe: <strong>{duplicado.title}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/crm?deal=${duplicado.id}`}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Abrir a existente
                    </a>
                    <button
                      type="button"
                      onClick={() => criar(true)}
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
                    >
                      Criar outra mesmo assim
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => criar(false)}
                  disabled={busy || !stageId}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? 'Criando…' : 'Criar oportunidade'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!loading && !ctx && erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
