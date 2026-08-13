'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
export interface Modelo {
  id: string;
  name: string;
  clinicalIndication?: string | null;
  observations?: string | null;
  items: { name: string; group: string; subgroup: string | null }[];
  totalExames: number;
}

export function ExamRequestForm({
  patientId,
  origin = 'PATIENT_CHART',
  teleconsultationId,
  /** Profissional do atendimento: quando informado, já vem selecionado. */
  defaultProfessionalId,
  /**
   * Modelo escolhido no passo anterior; o pedido abre JÁ preenchido com ele.
   * Sem modelo E sem `blank`, abre o painel da clínica com nada marcado.
   */
  template = null,
  /**
   * Folha limpa: só a área de digitação, sem painel e sem sugestões.
   *
   * É explícito, e não "ausência de modelo", porque existem TRÊS pontos de
   * partida: painel da clínica, modelo salvo e em branco. Derivar do template
   * nulo deixava o painel inalcançável para clínica sem modelo salvo.
   */
  blank = false,
  onIssued,
}: {
  patientId: string;
  origin?: 'PATIENT_CHART' | 'TELEMEDICINE';
  teleconsultationId?: string;
  defaultProfessionalId?: string;
  template?: Modelo | null;
  blank?: boolean;
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
  // Exames digitados: um por linha. Existe para o médico não ficar preso ao
  // catálogo quando precisa de algo fora do painel.
  const [livres, setLivres] = useState('');
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  // Os dados do profissional e do paciente entram no documento de qualquer
  // forma, porque vêm do cadastro no momento da emissão (snapshot), não deste
  // formulário — então o modo em branco não perde nada disso.
  const emBranco = blank;

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
          // As sugestões do painel só fazem sentido quando se parte dele.
          if (!blank) {
            setIndicacao(cat.sugestoes?.indicacaoClinica ?? '');
            setObservacoes(cat.sugestoes?.observacoes ?? '');
          }
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
  }, [defaultProfessionalId, blank]);

  // Aplica o modelo escolhido UMA vez, quando o catálogo já existe — antes
  // disso não há como casar os itens salvos com os do painel.
  const modeloAplicado = useRef(false);
  useEffect(() => {
    if (!template || modeloAplicado.current || grupos.length === 0) return;
    modeloAplicado.current = true;
    aplicarModelo(template);
    // aplicarModelo é estável dentro do render do componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, grupos]);

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
    const digitados = livres.split('\n').map((l) => l.trim()).filter(Boolean);
    if (selecionados.size === 0 && digitados.length === 0) {
      setErro('Selecione ao menos um exame ou digite um na área livre.');
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
          freeItems: livres.split('\n').map((l) => l.trim()).filter(Boolean),
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

  // Aplica um modelo: casa os itens salvos com o catálogo pelo NOME. O que não
  // existir mais no catálogo não some — vai para a área livre, para o médico ver
  // que o modelo pedia aquilo.
  function aplicarModelo(m: Modelo) {
    const porNome = new Map<string, string>();
    for (const g of grupos) {
      for (const sg of g.subgroups) {
        for (const item of sg.items) porNome.set(item.name.toLowerCase(), item.id);
      }
    }
    const ids = new Set<string>();
    const foraDoCatalogo: string[] = [];
    for (const item of m.items) {
      const id = porNome.get(item.name.toLowerCase());
      if (id) ids.add(id);
      else foraDoCatalogo.push(item.name);
    }
    setSelecionados(ids);
    setLivres(foraDoCatalogo.join('\n'));
    if (m.clinicalIndication) setIndicacao(m.clinicalIndication);
    if (m.observations) setObservacoes(m.observations);
    setErro(null);
  }

  async function salvarComoModelo(requestId: string) {
    const nome = prompt('Nome do modelo (ex.: Check-up metabólico):');
    if (!nome?.trim()) return;
    setSalvandoModelo(true);
    try {
      const res = await fetch('/api/clinico/exames/modelos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome.trim(), fromRequestId: requestId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível salvar o modelo.');
        return;
      }
    } finally {
      setSalvandoModelo(false);
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
            Médico(a) responsável*
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
              Este médico está sem CRM. Preencha em Agenda → Médicos(as) antes de emitir.
            </p>
          )}
        </div>
        <div className={emBranco ? 'hidden' : ''}>
          <label htmlFor="ind" className="mb-1 block text-sm font-medium text-foreground">
            Indicação clínica
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

      <div className={emBranco ? 'hidden' : 'space-y-4'}>
        {!emBranco && grupos.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Esta clínica ainda não tem um painel de exames montado. Use o campo de digitação
            abaixo para listar os exames deste pedido.
          </p>
        )}
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
        <label htmlFor="livres" className="mb-1 block text-sm font-medium text-foreground">
          {emBranco ? 'Exames solicitados' : 'Outros exames'}{' '}
          <span className="text-muted-foreground">(um por linha)</span>
        </label>
        <textarea
          id="livres"
          rows={emBranco ? 10 : 3}
          value={livres}
          onChange={(e) => setLivres(e.target.value)}
          placeholder={'Ecocardiograma\nUltrassom de abdome total'}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {emBranco
            ? 'Digite um exame por linha. O documento sai com os dados do paciente e do profissional preenchidos automaticamente.'
            : 'Para o que não está no painel. Sai no documento sob "Outros exames".'}
        </p>
      </div>

      <div className={emBranco ? 'hidden' : ''}>
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
          disabled={emitindo || semCrm || (selecionados.size === 0 && livres.trim() === '')}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {emitindo
            ? 'Emitindo…'
            : `Emitir e imprimir (${selecionados.size + livres.split('\n').filter((l) => l.trim()).length})`}
        </button>
        {emitido && (
          <>
            <button
              type="button"
              onClick={() => imprimir(emitido)}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Imprimir de novo
            </button>
            <button
              type="button"
              onClick={() => salvarComoModelo(emitido)}
              disabled={salvandoModelo}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              {salvandoModelo ? 'Salvando…' : 'Salvar como modelo'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
