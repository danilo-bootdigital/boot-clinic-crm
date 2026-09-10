'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, Pencil, Trash2, Check } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

interface TagDef {
  id: string;
  name: string;
  color: string;
}

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
  '#14B8A6', '#3B82F6', '#6366F1', '#A855F7', '#EC4899',
];

function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={cn(
            'grid h-5 w-5 place-items-center rounded-full ring-offset-1 transition-transform hover:scale-110',
            value === c && 'ring-2 ring-foreground ring-offset-1'
          )}
          style={{ backgroundColor: c }}
        >
          {value === c && <Check className="h-3 w-3 text-white" />}
        </button>
      ))}
    </div>
  );
}

/**
 * Etiquetas do contato — nome e cor personalizáveis, catálogo compartilhado
 * da empresa (a mesma etiqueta pode ser usada em vários contatos). Vive no
 * painel de contato (coluna direita) da mensageria.
 */
export function ContactTags({ contactId }: { contactId: string }) {
  const [tags, setTags] = useState<TagDef[] | null>(null);
  const [catalog, setCatalog] = useState<TagDef[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[6]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[6]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/mensageria/contacts/${contactId}/tags`, { cache: 'no-store' });
    setTags(res.ok ? await res.json() : []);
  }, [contactId]);

  const loadCatalog = useCallback(async () => {
    const res = await fetch('/api/mensageria/tags', { cache: 'no-store' });
    setCatalog(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (open) loadCatalog(); }, [open, loadCatalog]);

  function resetPopoverState() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  async function attach(tagId: string) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/mensageria/contacts/${contactId}/tags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagId }),
    });
    setBusy(false);
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao adicionar'); return; }
    load();
  }

  async function detach(tagId: string) {
    setTags((prev) => (prev ? prev.filter((t) => t.id !== tagId) : prev)); // otimista — resposta é instantânea
    await fetch(`/api/mensageria/contacts/${contactId}/tags/${tagId}`, { method: 'DELETE' });
    load();
  }

  async function createAndAttach(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/mensageria/contacts/${contactId}/tags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    setBusy(false);
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao criar etiqueta'); return; }
    setName(''); setColor(PRESET_COLORS[6]); setCreating(false);
    load(); loadCatalog();
  }

  function abrirEdicao(t: TagDef) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditColor(t.color);
    setError(null);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/mensageria/tags/${editingId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });
    setBusy(false);
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao salvar'); return; }
    setEditingId(null);
    load(); loadCatalog();
  }

  async function excluirDoCatalogo(t: TagDef) {
    if (!confirm(`Excluir a etiqueta "${t.name}"? Ela some de TODOS os contatos e pacientes que a usam.`)) return;
    await fetch(`/api/mensageria/tags/${t.id}`, { method: 'DELETE' });
    load(); loadCatalog();
  }

  const assignedIds = new Set((tags ?? []).map((t) => t.id));
  const disponiveis = catalog.filter((t) => !assignedIds.has(t.id));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(tags ?? []).map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: t.color }}
          >
            {t.name}
            <button onClick={() => detach(t.id)} className="rounded-full hover:bg-white/25" aria-label={`Remover etiqueta ${t.name}`}>
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}

        <Popover.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetPopoverState(); }}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Etiqueta
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="start"
              sideOffset={6}
              className="z-50 w-64 rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-popover"
            >
              {editingId ? (
                <form onSubmit={salvarEdicao} className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Editar etiqueta</p>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    autoFocus
                  />
                  <ColorSwatches value={editColor} onChange={setEditColor} />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Cancelar</button>
                    <button type="submit" disabled={busy} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60">Salvar</button>
                  </div>
                </form>
              ) : creating ? (
                <form onSubmit={createAndAttach} className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Nova etiqueta</p>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: VIP, Lead quente…"
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    autoFocus
                  />
                  <ColorSwatches value={color} onChange={setColor} />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setCreating(false)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Voltar</button>
                    <button type="submit" disabled={busy || !name.trim()} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60">Criar</button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="mb-1.5 text-xs font-medium text-foreground">Adicionar etiqueta</p>
                  {error && <p className="mb-1.5 text-xs text-destructive">{error}</p>}
                  {disponiveis.length > 0 && (
                    <div className="mb-2 max-h-40 space-y-0.5 overflow-y-auto">
                      {disponiveis.map((t) => (
                        <div key={t.id} className="group flex items-center gap-1 rounded-md hover:bg-muted">
                          <button
                            type="button"
                            onClick={() => attach(t.id)}
                            disabled={busy}
                            className="flex flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm"
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                            <span className="truncate">{t.name}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirEdicao(t)}
                            title="Editar etiqueta"
                            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => excluirDoCatalogo(t)}
                            title="Excluir etiqueta do catálogo"
                            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Criar nova etiqueta
                  </button>
                </>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}

export default ContactTags;
