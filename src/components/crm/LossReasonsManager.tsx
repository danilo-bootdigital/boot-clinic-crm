'use client';

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/drawer';

// Cadastro dos motivos de perda, aberto de dentro do CRM.
//
// Fica aqui, e não em Configurações, pelo mesmo motivo do cadastro de médico na
// Agenda: cadastro perto de onde é usado é cadastro que alguém mantém.
//
// Remover é reversível de propósito: negócio já perdido guarda o motivo, e
// apagar a linha deixaria o relatório antigo com um id órfão.

interface Reason {
  id: string;
  name: string;
}

export function LossReasonsManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setLoading(true);
    fetch('/api/crm/loss-reasons')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Falha ao carregar os motivos');
        setReasons(body);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    const name = novo.trim();
    if (!name) return;
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch('/api/crm/loss-reasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao cadastrar');
      setReasons((prev) => [...prev, body]);
      setNovo('');
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function renomear(id: string) {
    const name = editNome.trim();
    if (!name) return;
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/crm/loss-reasons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao renomear');
      setReasons((prev) => prev.map((r) => (r.id === id ? { ...r, name: body.name } : r)));
      setEditId(null);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remover(r: Reason) {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/crm/loss-reasons/${r.id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao remover');
      setReasons((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Motivos de perda"
      description="O que a atendente escolhe ao dar um lead como perdido."
      width="max-w-md"
    >
      <div className="space-y-4">
        <form onSubmit={cadastrar} className="flex gap-2">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Novo motivo"
            maxLength={60}
            className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={busy || !novo.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            Cadastrar
          </button>
        </form>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        <ul className="divide-y divide-border rounded-lg border border-border">
          {reasons.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2">
              {editId === r.id ? (
                <>
                  <input
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    maxLength={60}
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => renomear(r.id)}
                    disabled={busy}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-foreground">{r.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(r.id);
                      setEditNome(r.name);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    onClick={() => remover(r)}
                    disabled={busy}
                    className="text-xs text-destructive hover:underline disabled:opacity-60"
                  >
                    Remover
                  </button>
                </>
              )}
            </li>
          ))}
          {!loading && reasons.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum motivo cadastrado.</li>
          )}
        </ul>

        <p className="text-xs text-muted-foreground">
          Motivo removido sai da lista de escolha, mas continua aparecendo nos negócios que já foram
          perdidos por ele.
        </p>
      </div>
    </Drawer>
  );
}
