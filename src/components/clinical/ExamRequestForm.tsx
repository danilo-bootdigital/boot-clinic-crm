'use client';

import { useEffect, useMemo, useState } from 'react';
import { printExamRequest } from '@/lib/clinical/print-exam-request';

// Emissão de pedido de exames. Componente único, montado em dois lugares:
// a ficha do paciente e o atendimento de telemedicina (o `origin` distingue).
//
// Os dados do profissional NÃO são digitados: vêm do cadastro (nome, CRM e
// assinatura). Por isso o seletor é de profissional, não campos de texto.

interface CatalogItem {
  id: string;
  group: string;
  subgroup: string | null;
  name: string;
}
interface Grupo {
  group: string;
  subgroups: { subgroup: string | null; items: CatalogItem[] }[];
}
interface Professional {
  id: string;
  name: string;
  crm?: string | null;
}

export function ExamRequestForm({
  patientId,
  origin = 'PATIENT_CHART',
  teleconsultationId,
  /** Profissional do atendimento: quando informado, já vem selecionado. */
  defaultProfessionalId,
  onIssued,
}: {
  patientId: string;
  origin?: 'PATIENT_CHART' | 'TELEMEDICINE';
  teleconsultationId?: string;
  defaultProfessionalId?: string;
  onIssued?: (id: string) => void;
}) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [profissionais, setProfissionais] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId ?? '');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [indicacao, setIndicacao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emitido, setEmitido] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [cat, profs] = await Promise.all([
          fetch('/api/clinico/exames/catalogo').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/professionals?activeOnly=1').then((r) => (r.ok ? r.json() : [])),
        ]);
        if (!ativo) return;
        if (cat) {
          setGrupos(cat.grupos ?? []);
          setIndicacao(cat.sugestoes?.indicacaoClinica ?? '');
          setObservacoes(cat.sugestoes?.observacoes ?? '');
        }
        const lista: Professional[] = Array.isArray(profs) ? profs : profs?.professionals ?? [];
        setProfissionais(lista);
        if (!defaultProfessionalId && lista.length === 1) setProfessionalId(lista[0].id);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [defaultProfessionalId]);

  const profSelecionado = useMemo(
    () => profissionais.find((p) => p.id === professionalId),
    [profissionais, professionalId]
  );
  // Bloqueio ANTES de emitir: pedido com CRM em branco é papel inútil.
  const semCrm = Boolean(profSelecionado && !profSelecionado.crm?.trim());

  function alternar(id: string) {
    setSelecionados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function marcarGrupo(g: Grupo, marcar: boolean) {
    const ids = g.subgroups.flatMap((sg) => sg.items.map((i) => i.id));
    setSelecionados((prev) => {
      const s = new Set(prev);
      for (const id of ids) marcar ? s.add(id) : s.delete(id);
      return s;
    });
  }

  async function emitir() {
    if (!professionalId) {
      setErro('Escolha o profissional responsável.');
      return;
    }
    if (selecionados.size === 0) {
      setErro('Selecione ao menos um exame.');
      return;
    }
    setEmitindo(true);
    setErro(null);
    try {
      const res = await fetch('/api/clinico/exames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          professionalId,
          itemIds: Array.from(selecionados),
          clinicalIndication: indicacao,
          observations: observacoes || undefined,
          origin,
          teleconsultationId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível emitir o pedido.');
        return;
      }
      setEmitido(body.id);
      onIssued?.(body.id);
      // Já abre a impressão: o fluxo real é emitir e entregar na hora.
      await imprimir(body.id);
    } catch {
      setErro('Falha de rede ao emitir o pedido.');
    } finally {
      setEmitindo(false);
    }
  }

  async function imprimir(id: string) {
    const res = await fetch(`/api/clinico/exames/${id}`);
    if (!res.ok) {
      setErro('Pedido emitido, mas não foi possível abrir a impressão.');
      return;
    }
    printExamRequest(await res.json());
  }

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando catálogo…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="prof" className="mb-1 block text-sm font-medium text-foreground">
            Profissional responsável*
          </label>
          <select
            id="prof"
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Selecione…</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.crm ? ` — ${p.crm}` : ' — sem CRM'}
              </option>
            ))}
          </select>
          {semCrm && (
            <p className="mt-1 text-xs text-destructive">
              Este profissional está sem CRM. Preencha em Agenda → Profissionais antes de emitir.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="ind" className="mb-1 block text-sm font-medium text-foreground">
            Indicação clínica*
          </label>
          <textarea
            id="ind"
            rows={2}
            value={indicacao}
            onChange={(e) => setIndicacao(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
      </div>

      <div className="space-y-4">
        {grupos.map((g) => {
          const ids = g.subgroups.flatMap((sg) => sg.items.map((i) => i.id));
          const todos = ids.every((id) => selecionados.has(id));
          return (
            <fieldset key={g.group} className="rounded-xl border border-border p-4">
              <legend className="flex items-center gap-3 px-1 text-sm font-semibold text-foreground">
                {g.group}
                <button
                  type="button"
                  onClick={() => marcarGrupo(g, !todos)}
                  className="rounded px-1.5 py-0.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {todos ? 'desmarcar todos' : 'marcar todos'}
                </button>
              </legend>
              {g.subgroups.map((sg) => (
                <div key={sg.subgroup ?? 'base'} className="mt-2">
                  {sg.subgroup && (
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{sg.subgroup}</p>
                  )}
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {sg.items.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selecionados.has(item.id)}
                          onChange={() => alternar(item.id)}
                          className="mt-0.5"
                        />
                        <span>{item.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          );
        })}
      </div>

      <div>
        <label htmlFor="obs" className="mb-1 block text-sm font-medium text-foreground">
          Observações
        </label>
        <textarea
          id="obs"
          rows={3}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={emitir}
          disabled={emitindo || semCrm || selecionados.size === 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {emitindo ? 'Emitindo…' : `Emitir e imprimir (${selecionados.size})`}
        </button>
        {emitido && (
          <button
            type="button"
            onClick={() => imprimir(emitido)}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Imprimir de novo
          </button>
        )}
      </div>
    </div>
  );
}
