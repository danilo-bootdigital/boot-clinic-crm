'use client';

import { useState, useEffect } from 'react';
import { DealSource } from '@/lib/validations/crm';
import { FunnelPipeline, type FunnelVariant } from '@/components/charts';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/filter-bar';

enum DealStatus {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  IN_NEGOTIATION = "IN_NEGOTIATION",
  APPOINTMENT_SCHEDULED = "APPOINTMENT_SCHEDULED",
  APPOINTMENT_ATTENDED = "APPOINTMENT_ATTENDED",
  QUOTE_SENT = "QUOTE_SENT",
  WON = "WON",
  LOST = "LOST",
}

interface Deal {
  id: string;
  title: string;
  value?: number;
  valueEstimated?: number;
  stageId: string;
  patientId?: string;
  patient?: { id: string; name: string; phone?: string };
  responsibleUserId: string;
  responsibleUser?: { name: string };
  source: string;
  priority: string;
  status: string;
  description?: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
}

interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  probability?: number;
  isFinal: boolean;
}

interface DealLossReason {
  id: string;
  name: string;
}

interface KanbanBoardProps {
  pipelineId?: string;
  onDealClick?: (deal: Deal) => void;
}

const FUNNEL_VARIANT_KEY = 'crm:funnelVariant';

const FUNNEL_VARIANTS: { value: FunnelVariant; label: string; title: string }[] = [
  { value: 'funnel', label: 'Funil', title: 'Desenho de funil' },
  { value: 'list', label: 'Texto', title: 'Lista de estágios' },
];

export default function KanbanBoard({ pipelineId, onDealClick }: KanbanBoardProps) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedDeal, setDraggedDeal] = useState<Deal | null>(null);
  // Perda pendente de motivo: guarda o que o servidor recusou até a escolha.
  const [lossPrompt, setLossPrompt] = useState<{ deal: Deal; stageId: string; reasons: DealLossReason[] } | null>(null);
  const [lossReasonId, setLossReasonId] = useState('');
  const [lossBusy, setLossBusy] = useState(false);
  const [lossError, setLossError] = useState<string | null>(null);
  const [funnelVariant, setFunnelVariant] = useState<FunnelVariant>('funnel');
  const [filters, setFilters] = useState({
    responsibleUserId: '',
    source: '',
    status: '',
    search: '',
  });

  // Carregar dados
  useEffect(() => {
    loadStages();
    loadDeals();
  }, [pipelineId]);

  // Formato do funil: lido depois da montagem para não divergir do HTML do servidor.
  useEffect(() => {
    const stored = window.localStorage.getItem(FUNNEL_VARIANT_KEY);
    if (stored === 'funnel' || stored === 'list') setFunnelVariant(stored);
  }, []);

  const changeFunnelVariant = (variant: FunnelVariant) => {
    setFunnelVariant(variant);
    window.localStorage.setItem(FUNNEL_VARIANT_KEY, variant);
  };

  const loadStages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/crm/pipelines/${pipelineId}/stages`);
      if (!response.ok) throw new Error('Erro ao carregar etapas');
      const data = await response.json();
      setStages(data);
    } catch (error) {
      console.error('Erro ao carregar etapas:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeals = async () => {
    try {
      const params = new URLSearchParams();
      if (pipelineId) params.append('pipelineId', pipelineId);
      if (filters.responsibleUserId) params.append('responsibleUserId', filters.responsibleUserId);
      if (filters.source) params.append('source', filters.source);
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);

      const response = await fetch(`/api/crm/deals?${params}`);
      if (!response.ok) throw new Error('Erro ao carregar deals');
      const data = await response.json();
      setDeals(data);
    } catch (error) {
      console.error('Erro ao carregar deals:', error);
    }
  };

  // Filtrar deals por etapa
  const getDealsByStage = (stageId: string) => {
    return deals.filter(deal => deal.stageId === stageId);
  };

  // Calcular valor total por etapa
  const getValueByStage = (stageId: string) => {
    const stageDeals = getDealsByStage(stageId);
    return stageDeals.reduce((sum, deal) => sum + (deal.valueEstimated || 0), 0);
  };

  const brl = (n: number) =>
    `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // Métricas do resumo — derivadas dos deals já carregados (respeita os filtros).
  const won = deals.filter((deal) => deal.status === DealStatus.WON);
  const lost = deals.filter((deal) => deal.status === DealStatus.LOST);
  const open = deals.filter(
    (deal) => deal.status !== DealStatus.WON && deal.status !== DealStatus.LOST
  );
  const openValue = open.reduce((sum, deal) => sum + (deal.valueEstimated || 0), 0);
  const closed = won.length + lost.length;

  const pipelineSummary: { label: string; value: string; hint?: string }[] = [
    { label: 'Oportunidades', value: String(deals.length), hint: `${open.length} em aberto` },
    { label: 'Em aberto', value: brl(openValue), hint: 'valor estimado' },
    {
      label: 'Ticket médio',
      value: open.length > 0 ? brl(openValue / open.length) : '—',
      hint: 'por oportunidade aberta',
    },
    {
      label: 'Conversão',
      value: closed > 0 ? `${Math.round((won.length / closed) * 100)}%` : '—',
      hint: closed > 0 ? `${won.length} de ${closed} fechadas` : 'nada fechado ainda',
    },
  ];

  // Mover deal entre etapas.
  //
  // Etapa final de PERDA exige motivo: o servidor recusa com `needsLossReason` e
  // manda os motivos cadastrados. A tela não precisa saber qual etapa é final —
  // quem sabe é quem valida. Escolhido o motivo, repete o move com ele.
  const moveDeal = async (deal: Deal, stageId: string, lossReasonId?: string) => {
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: deal.id, newStageId: stageId, lossReasonId }),
      });
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        // Status vem do servidor: sem ele o cartão troca de coluna mas o resumo
        // (ganhos/perdidos/conversão) continua contando o desfecho antigo.
        setDeals(prev => prev.map(d =>
          d.id === deal.id ? { ...d, stageId, status: body?.status ?? d.status } : d
        ));
        setDraggedDeal(null);
        setLossPrompt(null);
        return true;
      }

      if (body?.needsLossReason) {
        const reasons: DealLossReason[] = body.reasons ?? [];
        setLossPrompt({ deal, stageId, reasons });
        setLossReasonId(reasons[0]?.id ?? '');
        setLossError(reasons.length ? null : 'Nenhum motivo cadastrado. Cadastre em "Motivos de perda".');
        return false;
      }

      setLossError(body?.error ?? 'Não foi possível mover a oportunidade.');
      return false;
    } catch (error) {
      console.error('Erro ao mover deal:', error);
      setLossError('Falha de rede ao mover a oportunidade.');
      return false;
    }
  };

  const handleDrop = async (stageId: string) => {
    if (!draggedDeal) return;
    setLossError(null);
    await moveDeal(draggedDeal, stageId);
  };

  const confirmarPerda = async () => {
    if (!lossPrompt || !lossReasonId) return;
    setLossBusy(true);
    setLossError(null);
    try {
      await moveDeal(lossPrompt.deal, lossPrompt.stageId, lossReasonId);
    } finally {
      setLossBusy(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (deal: Deal) => {
    setDraggedDeal(deal);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted p-4">
      {/* Filtros */}
      <div className="mb-6 bg-card rounded-xl border border-border shadow-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Buscar
            </label>
            <Input
              type="text"
              placeholder="Título, descrição..."
              className="w-full"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Responsável
            </label>
            <FilterSelect
              className="w-full"
              value={filters.responsibleUserId}
              onChange={(e) => setFilters(prev => ({ ...prev, responsibleUserId: e.target.value }))}
            >
              <option value="">Todos</option>
              {/* Aqui carregar usuários disponíveis */}
            </FilterSelect>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Origem
            </label>
            <FilterSelect
              className="w-full"
              value={filters.source}
              onChange={(e) => setFilters(prev => ({ ...prev, source: e.target.value }))}
            >
              <option value="">Todas</option>
              <option value="WEBSITE">Website</option>
              <option value="REFERRAL">Indicação</option>
              <option value="PHONE">Telefone</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SOCIAL_MEDIA">Redes Sociais</option>
              <option value="WALK_IN">Passagem</option>
              <option value="EMAIL">E-mail</option>
              <option value="OTHER">Outro</option>
            </FilterSelect>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Status
            </label>
            <FilterSelect
              className="w-full"
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value={DealStatus.NEW}>Novo</option>
              <option value={DealStatus.CONTACTED}>Contatado</option>
              <option value={DealStatus.IN_NEGOTIATION}>Em negociação</option>
              <option value={DealStatus.APPOINTMENT_SCHEDULED}>Consulta agendada</option>
              <option value={DealStatus.APPOINTMENT_ATTENDED}>Compareceu</option>
              <option value={DealStatus.QUOTE_SENT}>Orçamento enviado</option>
              <option value={DealStatus.WON}>Ganho</option>
              <option value={DealStatus.LOST}>Perdido</option>
            </FilterSelect>
          </div>
        </div>
      </div>

      {/* Funil do pipeline + resumo */}
      {stages.length > 0 && deals.length > 0 && (
        <div
          className={`mb-6 grid gap-4 ${
            funnelVariant === 'funnel'
              ? 'lg:grid-cols-[minmax(0,24rem)_1fr]'
              : 'lg:grid-cols-[minmax(0,20rem)_1fr]'
          }`}
        >
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Funil do pipeline</h3>
                <p className="text-sm text-muted-foreground">Negócios por estágio</p>
              </div>
              <div
                role="tablist"
                aria-label="Formato do funil"
                className="inline-flex shrink-0 rounded-lg border border-border bg-muted/60 p-0.5"
              >
                {FUNNEL_VARIANTS.map((option) => {
                  const active = option.value === funnelVariant;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      title={option.title}
                      onClick={() => changeFunnelVariant(option.value)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                        active
                          ? 'bg-card text-foreground shadow-card'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <FunnelPipeline
              variant={funnelVariant}
              data={stages.map((stage) => ({
                name: stage.name,
                value: getDealsByStage(stage.id).length,
              }))}
              valueFormatter={(n) => `${n} deal${n !== 1 ? 's' : ''}`}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-1 text-base font-semibold text-foreground">Resumo</h3>
            <p className="mb-4 text-sm text-muted-foreground">Oportunidades no filtro atual</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {pipelineSummary.map((metric) => (
                <div key={metric.label}>
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {metric.value}
                  </p>
                  {metric.hint && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{metric.hint}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {stages.map((stage) => {
          const stageDeals = getDealsByStage(stage.id);
          const stageValue = getValueByStage(stage.id);

          return (
            <div
              key={stage.id}
              className="bg-card rounded-xl border border-border shadow-card"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Cabeçalho da etapa */}
              <div
                className="p-4 border-b"
                style={{ backgroundColor: stage.color + '20' }}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-foreground">{stage.name}</h3>
                  <span className="text-sm text-muted-foreground">
                    {stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {stageValue > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Total: R$ {stageValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>

              {/* Cards da etapa */}
              <div className="p-4 space-y-3 min-h-[200px]">
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => handleDragStart(deal)}
                    onClick={() => onDealClick?.(deal)}
                    className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-sm text-foreground truncate">
                        {deal.title}
                      </h4>
                      {deal.priority === 'URGENT' && (
                        <span className="px-1 py-0.5 text-xs bg-destructive/15 text-destructive rounded">
                          Urgente
                        </span>
                      )}
                    </div>

                    {deal.valueEstimated && (
                      <p className="text-xs text-muted-foreground mb-1">
                        R$ {deal.valueEstimated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{deal.source}</span>
                      {deal.lastContactAt && (
                        <span>
                          Último contato: {new Date(deal.lastContactAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {deal.patient && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          {deal.patient.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {deal.patient.phone}
                        </p>
                      </div>
                    )}

                    {deal.nextFollowUpAt && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-accent text-accent-foreground">
                          Follow-up: {new Date(deal.nextFollowUpAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {stageDeals.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum deal nesta etapa
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Motivo da perda: o cartão só entra em Perdido depois da escolha. */}
      {lossPrompt && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-motivo-perda"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 id="titulo-motivo-perda" className="text-base font-semibold text-foreground">
              Por que perdeu?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{lossPrompt.deal.title}</p>

            <div className="mt-4">
              <label htmlFor="motivo-perda-kanban" className="mb-1 block text-sm font-medium text-foreground">
                Motivo *
              </label>
              <FilterSelect
                id="motivo-perda-kanban"
                className="w-full"
                value={lossReasonId}
                onChange={(e) => setLossReasonId(e.target.value)}
              >
                {lossPrompt.reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </FilterSelect>
            </div>

            {lossError && <p className="mt-3 text-sm text-destructive">{lossError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setLossPrompt(null);
                  setDraggedDeal(null);
                  setLossError(null);
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPerda}
                disabled={lossBusy || !lossReasonId}
                className="rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {lossBusy ? 'Registrando…' : 'Confirmar perdido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}