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
// esse vínculo). Por isso o botão fica desabilitado até existir patientId.
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
    if (!open) return;
    fetch('/api/clinico/access')
      .then((r) => (r.ok ? r.json() : {}))
      .then((access: Record<string, string>) => setCanEdit(access.orcamentos === 'edit'))
      .catch(() => setCanEdit(false));
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => patientId && setOpen(true)}
        disabled={!patientId}
        title={patientId ? undefined : 'Vincule esta conversa a um paciente (agende uma consulta) para criar orçamento'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FileText className="h-3.5 w-3.5" />
        Novo orçamento
      </button>

      {patientId && (
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Orçamentos"
          description={contactName ?? undefined}
          width="max-w-2xl"
        >
          {/* `prefill={{}}` abre direto no formulário de criação — o pedido
              era um atalho para criar, não mais uma lista pra navegar. */}
          <Quotes patientId={patientId} canEdit={canEdit} prefill={{}} />
        </Drawer>
      )}
    </>
  );
}

export default NewQuoteFromConversation;
