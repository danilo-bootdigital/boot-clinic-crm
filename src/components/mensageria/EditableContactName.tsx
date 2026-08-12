'use client';

import { useEffect, useRef, useState } from 'react';

// Nome do contato editável no cabeçalho da conversa.
//
// Existe porque o WhatsApp só entrega o `pushName` — o nome que a própria pessoa
// escolheu — e às vezes ele não vem (contato que nunca escreveu, ou identidade
// `@lid` sem perfil). Nesses casos a conversa fica com o número, e alguém da
// clínica precisa poder escrever o nome à mão.
//
// Salvar marca `nameSource = MANUAL` no servidor: a partir daí o canal não
// sobrescreve mais, então a correção não é desfeita pela próxima mensagem.

export function EditableContactName({
  contactId,
  value,
  fallback,
  onSaved,
}: {
  contactId: string;
  value: string;
  /** Mostrado quando não há nome (ex.: o identificador do canal). */
  fallback?: string | null;
  onSaved?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
    setEditing(false);
    setErro(null);
  }, [contactId, value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function salvar() {
    const nome = draft.trim();
    if (!nome) {
      setErro('O nome não pode ficar vazio.');
      return;
    }
    if (nome === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      const res = await fetch(`/api/mensageria/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível salvar o nome.');
        return;
      }
      onSaved?.(body.contact.name);
      setEditing(false);
    } catch {
      setErro('Falha de rede ao salvar o nome.');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-medium text-foreground">{value || fallback || 'Sem nome'}</h3>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Editar o nome deste contato"
        >
          editar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') salvar();
            // Esc cancela sem salvar — evita gravar edição acidental.
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
              setErro(null);
            }
          }}
          aria-label="Nome do contato"
          className="w-56 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={salvar}
          disabled={saving}
          className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(false);
            setErro(null);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
