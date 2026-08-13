'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExamRequestForm, type Modelo } from '@/components/clinical/ExamRequestForm';
import { printExamRequest } from '@/lib/clinical/print-exam-request';

// Aba "Pedido de exames" da ficha do paciente: consulta o histórico e emite um
// novo. Todo pedido entregue ao paciente fica registrado aqui e pode ser
// reimpresso — o documento é reconstruído do snapshot, então sai idêntico ao
// que foi entregue, mesmo que o cadastro tenha mudado depois.

interface Pedido {
  id: string;
  professionalName: string;
  professionalCrm?: string | null;
  clinicalIndication: string;
  origin: 'PATIENT_CHART' | 'TELEMEDICINE';
  issuedAt: string;
  totalExames: number;
}

export function ExamRequests({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  // Fluxo em dois passos: primeiro escolhe o ponto de partida (modelo salvo ou
  // em branco), depois abre o pedido já carregado. Encarar o painel inteiro sem
  // decidir isso antes é o que tornava a emissão trabalhosa.
  const [etapa, setEtapa] = useState<'fechado' | 'escolha' | 'form'>('fechado');
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [modeloEscolhido, setModeloEscolhido] = useState<Modelo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoModelo, setSalvandoModelo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/clinico/exames?patientId=${patientId}`, { cache: 'no-store' });
      setPedidos(res.ok ? await res.json() : []);
    } catch {
      setPedidos([]);
    }
  }, [patientId]);

  const carregarModelos = useCallback(async () => {
    try {
      const res = await fetch('/api/clinico/exames/modelos', { cache: 'no-store' });
      setModelos(res.ok ? await res.json() : []);
    } catch {
      setModelos([]);
    }
  }, []);

  useEffect(() => {
    carregar();
    carregarModelos();
  }, [carregar, carregarModelos]);

  function abrirEscolha() {
    setModeloEscolhido(null);
    setEtapa((e) => (e === 'fechado' ? 'escolha' : 'fechado'));
  }

  function escolher(m: Modelo | null) {
    setModeloEscolhido(m);
    setEtapa('form');
  }

  async function reimprimir(id: string) {
    const res = await fetch(`/api/clinico/exames/${id}`);
    if (!res.ok) {
      setErro('Não foi possível abrir o pedido para impressão.');
      return;
    }
    printExamRequest(await res.json());
  }

  async function salvarComoModelo(id: string) {
    const nome = prompt('Nome do modelo (ex.: Check-up metabólico):');
    if (!nome?.trim()) return;
    setSalvandoModelo(id);
    setErro(null);
    try {
      const res = await fetch('/api/clinico/exames/modelos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome.trim(), fromRequestId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body?.error ?? 'Não foi possível salvar o modelo.');
      }
    } finally {
      setSalvandoModelo(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Pedidos de exames</h3>
          <p className="text-sm text-muted-foreground">
            Histórico do paciente. Todo pedido emitido fica salvo aqui.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={abrirEscolha}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {etapa === 'fechado' ? 'Novo pedido' : 'Fechar'}
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {etapa === 'escolha' && canEdit && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-sm font-medium text-foreground">Começar a partir de</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Escolha um modelo salvo ou comece em branco. Dá para ajustar tudo depois.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => escolher(null)}
              className="rounded-lg border border-dashed border-border px-3 py-3 text-left hover:bg-muted"
            >
              <span className="block text-sm font-medium text-foreground">Pedido em branco</span>
              <span className="block text-xs text-muted-foreground">Nenhum exame marcado</span>
            </button>
            {modelos.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => escolher(m)}
                className="rounded-lg border border-border px-3 py-3 text-left hover:bg-muted"
              >
                <span className="block truncate text-sm font-medium text-foreground">{m.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {m.totalExames} {m.totalExames === 1 ? 'exame' : 'exames'}
                </span>
              </button>
            ))}
          </div>
          {modelos.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Nenhum modelo salvo ainda. Emita um pedido e use &quot;Salvar como modelo&quot; para
              reaproveitar depois.
            </p>
          )}
        </div>
      )}

      {etapa === 'form' && canEdit && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <p className="text-sm text-muted-foreground">
              {modeloEscolhido ? (
                <>
                  Modelo: <strong className="text-foreground">{modeloEscolhido.name}</strong>
                </>
              ) : (
                'Pedido em branco'
              )}
            </p>
            <button
              type="button"
              onClick={() => setEtapa('escolha')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Trocar ponto de partida
            </button>
          </div>
          <ExamRequestForm
            // A key força remontar ao trocar de modelo: sem isso o formulário
            // manteria a seleção do modelo anterior misturada com a nova.
            key={modeloEscolhido?.id ?? 'em-branco'}
            patientId={patientId}
            origin="PATIENT_CHART"
            template={modeloEscolhido}
            onIssued={() => {
              // Recarrega histórico e modelos: o pedido novo aparece na lista e
              // um "salvar como modelo" feito no formulário reflete aqui.
              carregar();
              carregarModelos();
            }}
          />
        </div>
      )}

      {pedidos === null ? (
        <p className="text-sm text-muted-foreground">Carregando histórico…</p>
      ) : pedidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum pedido emitido para este paciente ainda.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {pedidos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {p.totalExames} {p.totalExames === 1 ? 'exame' : 'exames'}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {new Date(p.issuedAt).toLocaleDateString('pt-BR')}
                  </span>
                  {p.origin === 'TELEMEDICINE' && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      telemedicina
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.professionalName}
                  {p.professionalCrm ? ` — ${p.professionalCrm}` : ''} · {p.clinicalIndication}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => reimprimir(p.id)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Reimprimir
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => salvarComoModelo(p.id)}
                    disabled={salvandoModelo === p.id}
                    className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                  >
                    {salvandoModelo === p.id ? 'Salvando…' : 'Salvar como modelo'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
