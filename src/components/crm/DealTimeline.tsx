'use client';

import { useEffect, useState } from 'react';

// Histórico do negócio na tela de edição.
//
// O rastro já era gravado a cada movimento (etapa, perda com motivo, conversão
// pela conversa) e ninguém conseguia ler. Sem ele, "quem deu esse lead como
// perdido, quando e por quê" só existia no banco.

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
  authorName: string | null;
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export function DealTimeline({ dealId }: { dealId: string }) {
  const [itens, setItens] = useState<Activity[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/crm/deals/${dealId}/activities`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Falha ao carregar o histórico');
        return body;
      })
      .then((d) => vivo && setItens(d))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [dealId]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">Histórico</h3>
        <p className="text-sm text-muted-foreground">O que aconteceu com este lead, do mais recente ao mais antigo.</p>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {!itens && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {itens && itens.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nada registrado ainda. Movimentos de etapa e perdas passam a aparecer aqui.
        </p>
      )}

      {itens && itens.length > 0 && (
        <ol className="space-y-3 border-l border-border pl-4">
          {itens.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
              <p className="text-sm font-medium text-foreground">{a.title}</p>
              {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
              <p className="text-xs text-muted-foreground">
                {quando(a.createdAt)}
                {a.authorName ? ` · ${a.authorName}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
