'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import Quotes from '@/components/clinical/Quotes';

// Botão "Novo orçamento" dentro da conversa: abre o MESMO módulo de
// orçamentos do paciente (components/clinical/Quotes) num drawer, sem sair
// do chat. Irmão do ScheduleFromConversation — mesma ideia, outro destino.
//
// Diferente do agendamento, o orçamento não cria paciente: exige que a
// conversa já esteja vinculada a um cadastro (o primeiro agendamento cria
// esse vínculo). O botão fica sempre clicável — sem patientId ele abre o
// drawer com a explicação em vez de travar silenciosamente (um `title` de
// botão desabilitado é affordance ruim, some no toque/celular).
export function NewQuoteFromConversation({
  patientId,
  contactName,
}: {
  patientId?: string | null;
  contactName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (!open || !patientId) return;
    fetch('/api/clinico/access')
      .then((r) => (r.ok ? r.json() : {}))
      .then((access: Record<string, string>) => setCanEdit(access.orcamentos === 'edit'))
      .catch(() => setCanEdit(false));
  }, [open, patientId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <FileText className="h-3.5 w-3.5" />
        Novo orçamento
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Orçamentos"
        description={contactName ?? undefined}
        width="max-w-2xl"
      >
        {patientId ? (
          // `prefill={{}}` abre direto no formulário de criação — o pedido
          // era um atalho para criar, não mais uma lista pra navegar.
          <Quotes patientId={patientId} canEdit={canEdit} prefill={{}} />
        ) : (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
            Esta conversa ainda não está vinculada a um paciente. Agende uma consulta pelo botão
            &quot;Novo agendamento&quot; primeiro — isso cria o cadastro e vincula à conversa — para
            depois conseguir gerar orçamento.
          </p>
        )}
      </Drawer>
    </>
  );
}

export default NewQuoteFromConversation;
