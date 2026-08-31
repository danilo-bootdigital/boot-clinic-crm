'use client';

import { useEffect, useRef, useState } from 'react';

// Telefone do contato editável no painel da conversa.
//
// Existe porque o WhatsApp migrou parte dos contatos para `@lid` e parou de
// enviar o número — a Evolution 2.3.7 não recebe `senderPn`/`remoteJidAlt`. O
// atendente conseguia responder, mas ficava sem como registrar o telefone que a
// pessoa informa na própria conversa ("meu número é ..."), e sem telefone não
// há follow-up, lembrete nem vínculo com o cadastro do paciente.
//
// A rota PATCH já aceitava `phone` desde sempre; faltava o campo na tela.
//
// Quando a Evolution passar a mandar o número, o `enrichContact` só preenche
// telefone VAZIO — então o que foi digitado aqui não é sobrescrito.

/** Só dígitos, para não gravar máscara no banco. */
function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

/** Exibição amigável de número BR; qualquer outro formato sai como veio. */
function formatBr(digits: string): string {
  const d = digits.replace(/\D/g, '');
  const br = d.startsWith('55') ? d.slice(2) : d;
  if (br.length === 11) return `+55 (${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}`;
  if (br.length === 10) return `+55 (${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`;
  return digits;
}

export function EditableContactPhone({
  contactId,
  value,
  onSaved,
}: {
  contactId: string;
  value?: string | null;
  onSaved?: (phone: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value ?? '');
    setEditing(false);
    setErro(null);
  }, [contactId, value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function salvar() {
    const digits = onlyDigits(draft);
    // 10 a 13 dígitos cobre fixo e celular BR com/sem DDI. Abaixo disso é
    // digitação incompleta — gravar meio número é pior que não gravar.
    if (digits && (digits.length < 10 || digits.length > 13)) {
      setErro('Informe DDD + número (e o 55 se for de fora do Brasil).');
      return;
    }
    if (digits === onlyDigits(value ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      const res = await fetch(`/api/mensageria/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErro(j.error || 'Não foi possível salvar o telefone.');
        return;
      }
      onSaved?.(digits || null);
      setEditing(false);
    } catch {
      setErro('Não foi possível salvar o telefone.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') salvar();
            if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); setErro(null); }
          }}
          disabled={saving}
          inputMode="tel"
          placeholder="11 91234-5678"
          aria-label="Telefone do contato"
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground disabled:opacity-50"
        />
        <div className="flex gap-2">
          <button onClick={salvar} disabled={saving} className="text-xs text-primary underline disabled:opacity-50">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            onClick={() => { setDraft(value ?? ''); setEditing(false); setErro(null); }}
            disabled={saving}
            className="text-xs text-muted-foreground underline disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
        {erro && <p className="text-xs text-destructive">{erro}</p>}
      </div>
    );
  }

  if (value) {
    return (
      <p className="text-foreground">
        {formatBr(value)}{' '}
        <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground underline hover:text-foreground">
          editar
        </button>
      </p>
    );
  }

  return (
    <div>
      <p className="text-muted-foreground">
        Não enviado pelo WhatsApp{' '}
        <button onClick={() => setEditing(true)} className="text-xs text-primary underline">
          informar
        </button>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        A conversa responde normalmente sem ele. Registre quando a pessoa informar.
      </p>
    </div>
  );
}
