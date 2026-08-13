'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExamRequestForm } from '@/components/clinical/ExamRequestForm';
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
  const [criando, setCriando] = useState(false);
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

  useEffect(() => {
    carregar();
  }, [carregar]);

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
            onClick={() => setCriando((v) => !v)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {criando ? 'Fechar' : 'Novo pedido'}
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {criando && canEdit && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <ExamRequestForm
            patientId={patientId}
            origin="PATIENT_CHART"
            onIssued={() => {
              // Recarrega o histórico para o pedido recém-emitido aparecer.
              carregar();
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
