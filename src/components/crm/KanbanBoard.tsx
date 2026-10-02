'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
  pipelineId?: string;
  patientId?: string | null;
  patient?: { id: string; name: string; phone?: string | null } | null;
  responsibleUserId: string;
  responsibleUser?: { name: string } | null;
  source: string;
  priority: string;
  status: string;
  description?: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  // Rastro até o atendimento: contato da mensageria, conversa e motivo da perda.
  contact?: { id: string; name: string; phone?: string | null } | null;
  conversation?: { id: string; channel: string; unreadCount?: number } | null;
  lossReason?: { id: string; name: string } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: 'Website',
  REFERRAL: 'Indicação',
  PHONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  SOCIAL_MEDIA: 'Redes sociais',
  WALK_IN: 'Passagem',
  EMAIL: 'E-mail',
  OTHER: 'Outro',
};

/** Telefone legível: 5511987654321 -> +55 (11) 98765-4321. */
function formatPhone(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const resto = d.slice(4);
    const corte = resto.length === 9 ? 5 : 4;
    return `+55 (${d.slice(2, 4)}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  return `+${d}`;
}

/** "há 3 dias" — o número que diz se o lead está esfriando. */
function diasDesde(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  probability?: number;
  isFinal: boolean;
  finalType?: 'NONE' | 'WON' | 'LOST';
}

/**
 * Cores oferecidas para a etapa. São as mesmas das etapas padrão (getDefaultStages):
 * a cor fica gravada no banco e tinge o cabeçalho, então a escolha é fechada
 * para o quadro não virar um arco-íris de tons parecidos.
 */
const STAGE_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#06B6D4', '#EC4899', '#EF4444', '#64748B'];

/** Cartões visíveis por coluna antes de a coluna ganhar rolagem própria. */
const VISIBLE_CARDS = 5;

/**
 * Lista de cartões de uma etapa. Até {@link VISIBLE_CARDS} cartões a coluna
 * cresce normalmente; a partir do sexto, a altura trava no fim do quinto e o
 * resto rola dentro da coluna — o quadro fica com as colunas alinhadas em vez
 * de uma etapa cheia empurrar a página inteira.
 *
 * A altura é medida (e não um `max-h` fixo) porque o cartão varia: com ou sem
 * telefone, motivo de perda, follow-up. Um valor fixo cortaria o quinto no meio.
 */
function StageCardList({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (count <= VISIBLE_CARDS) return setMaxHeight(null);
      const last = el.children[VISIBLE_CARDS - 1] as HTMLElement | undefined;
      if (!last) return setMaxHeight(null);
      const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      setMaxHeight(last.offsetTop + last.offsetHeight + padBottom);
    };
    measure();
    const ro = new ResizeObserver(measure);
    Array.from(el.children).slice(0, VISIBLE_CARDS).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [count]);

  return (
    <div
      ref={ref}
      // `relative` faz do container o offsetParent dos cartões (medição acima).
      className="scrollbar-thin relative min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-4"
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
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
  // Exclusão de etapa: etapa escolhida + destino dos negócios que estiverem nela.
  const [stageToDelete, setStageToDelete] = useState<PipelineStage | null>(null);
  const [moveToStageId, setMoveToStageId] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Criar/renomear etapa: um só diálogo; `stage` presente = edição.
  const [stageForm, setStageForm] = useState<{ stage: PipelineStage | null; name: string; color: string } | null>(null);
  const [stageFormBusy, setStageFormBusy] = useState(false);
  const [stageFormError, setStageFormError] = useState<string | null>(null);
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

  // Etapas que aceitam negócio parado: as finais (Fechado/Perdido) ficam de fora
  // porque o servidor não as deixa excluir nem receber negócios em lote.
  const isOpenStage = (s: PipelineStage) => (s.finalType ?? (s.isFinal ? 'WON' : 'NONE')) === 'NONE';
  const openStages = stages.filter(isOpenStage);
  const canDeleteStage = (s: PipelineStage) => isOpenStage(s) && openStages.length > 1;

  const askDeleteStage = (stage: PipelineStage) => {
    const others = openStages.filter((s) => s.id !== stage.id);
    // Sugere a etapa vizinha anterior (ou a próxima): é para onde o negócio
    // naturalmente voltaria se a etapa nunca tivesse existido.
    const before = [...others].reverse().find((s) => s.order < stage.order);
    setMoveToStageId((before ?? others[0])?.id ?? '');
    setDeleteError(null);
    setStageToDelete(stage);
  };

  const confirmDeleteStage = async () => {
    if (!stageToDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/crm/pipelines/${pipelineId}/stages/${stageToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveToStageId: moveToStageId || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDeleteError(body?.error ?? 'Não foi possível excluir a etapa.');
        return;
      }
      setStageToDelete(null);
      await Promise.all([loadStages(), loadDeals()]);
    } catch (error) {
      console.error('Erro ao excluir etapa:', error);
      setDeleteError('Falha de rede ao excluir a etapa.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const openStageForm = (stage: PipelineStage | null) => {
    setStageFormError(null);
    setStageForm(
      stage
        ? { stage, name: stage.name, color: stage.color }
        : { stage: null, name: '', color: STAGE_COLORS[openStages.length % STAGE_COLORS.length] }
    );
  };

  const saveStageForm = async () => {
    if (!stageForm) return;
    const name = stageForm.name.trim();
    if (!name) {
      setStageFormError('Dê um nome à etapa.');
      return;
    }
    setStageFormBusy(true);
    setStageFormError(null);
    try {
      const url = stageForm.stage
        ? `/api/crm/pipelines/${pipelineId}/stages/${stageForm.stage.id}`
        : `/api/crm/pipelines/${pipelineId}/stages`;
      const response = await fetch(url, {
        method: stageForm.stage ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: stageForm.color }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStageFormError(body?.error ?? 'Não foi possível salvar a etapa.');
        return;
      }
      setStageForm(null);
      await loadStages();
    } catch (error) {
      console.error('Erro ao salvar etapa:', error);
      setStageFormError('Falha de rede ao salvar a etapa.');
    } finally {
      setStageFormBusy(false);
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
    <div>
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

      {/* Kanban Board — uma fileira só, na ordem do funil. As colunas esticam
          para preencher telas largas e, quando não cabem, o quadro rola na
          horizontal em vez de quebrar em duas fileiras. */}
      <div className="scrollbar-thin -mx-1 flex items-start gap-4 overflow-x-auto px-1 pb-3">
        {stages.map((stage) => {
          const stageDeals = getDealsByStage(stage.id);
          const stageValue = getValueByStage(stage.id);

          return (
            <div
              key={stage.id}
              className="flex min-w-[17rem] flex-1 basis-0 flex-col rounded-xl border border-border bg-card shadow-card"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Cabeçalho da etapa */}
              <div
                className="rounded-t-xl border-b p-4"
                style={{ backgroundColor: stage.color + '20' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate font-semibold text-foreground">{stage.name}</h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => openStageForm(stage)}
                      title={`Editar etapa ${stage.name}`}
                      aria-label={`Editar etapa ${stage.name}`}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {canDeleteStage(stage) && (
                      <button
                        type="button"
                        onClick={() => askDeleteStage(stage)}
                        title={`Excluir etapa ${stage.name}`}
                        aria-label={`Excluir etapa ${stage.name}`}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {stageValue > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Total: R$ {stageValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>

              {/* Cards da etapa */}
              <StageCardList count={stageDeals.length}>
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => handleDragStart(deal)}
                    onClick={() => onDealClick?.(deal)}
                    className="group bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {deal.contact?.name ?? deal.patient?.name ?? deal.title}
                      </h4>
                      <div className="flex shrink-0 items-center gap-1">
                        {deal.priority === 'URGENT' && (
                          <span className="rounded bg-destructive/15 px-1 py-0.5 text-xs text-destructive">
                            Urgente
                          </span>
                        )}
                        {/* Não lidas: o cartão avisa que tem gente esperando resposta. */}
                        {!!deal.conversation?.unreadCount && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-white">
                            {deal.conversation.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Telefone no cartão: é o dado que a atendente usa para agir. */}
                    {(deal.contact?.phone || deal.patient?.phone) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatPhone(deal.contact?.phone ?? deal.patient?.phone)}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5">{SOURCE_LABEL[deal.source] ?? deal.source}</span>
                      {deal.valueEstimated ? (
                        <span className="font-medium text-foreground">
                          R$ {deal.valueEstimated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : null}
                      {deal.responsibleUser?.name && <span>· {deal.responsibleUser.name}</span>}
                    </div>

                    {deal.lastContactAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Último contato: {new Date(deal.lastContactAt).toLocaleDateString('pt-BR')}
                        {' · '}
                        {diasDesde(deal.lastContactAt)}
                      </p>
                    )}

                    {/* Motivo da perda no próprio cartão: a coluna Perdido sem o
                        porquê não serve para decidir nada. */}
                    {deal.status === DealStatus.LOST && deal.lossReason?.name && (
                      <p className="mt-1 text-xs text-destructive">Perdido: {deal.lossReason.name}</p>
                    )}

                    {deal.nextFollowUpAt && (
                      <div className="mt-2">
                        <span className="inline-flex items-center rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
                          Follow-up: {new Date(deal.nextFollowUpAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}

                    {/* Caminhos de volta. `stopPropagation` porque o cartão inteiro
                        abre a edição — sem isso o link abriria as duas coisas. */}
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                      {deal.conversation ? (
                        <a
                          href={`/mensageria?conversa=${deal.conversation.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          Conversa
                        </a>
                      ) : null}
                      {deal.patientId ? (
                        <a
                          href={`/pacientes/${deal.patientId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          Paciente
                        </a>
                      ) : (
                        <span className="rounded-md px-2 py-1 text-xs text-muted-foreground">
                          Sem ficha de paciente
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {stageDeals.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum deal nesta etapa
                  </div>
                )}
              </StageCardList>
            </div>
          );
        })}

        {/* Nova etapa: no fim do quadro, que é onde se procura. No funil ela
            entra antes de Fechado/Perdido (o servidor posiciona). */}
        {stages.length > 0 && (
          <button
            type="button"
            onClick={() => openStageForm(null)}
            className="flex min-h-[200px] w-56 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-5 w-5" />
            Nova etapa
          </button>
        )}
      </div>

      {/* Criar / editar etapa */}
      {stageForm && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-form-etapa"
        >
          <form
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg"
            onSubmit={(e) => {
              e.preventDefault();
              saveStageForm();
            }}
          >
            <h3 id="titulo-form-etapa" className="text-base font-semibold text-foreground">
              {stageForm.stage ? 'Editar etapa' : 'Nova etapa'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {stageForm.stage
                ? stageForm.stage.isFinal
                  ? 'Etapa de desfecho: o nome muda, a função (ganho/perda) continua a mesma.'
                  : 'Os negócios desta etapa continuam nela.'
                : 'Entra no funil antes de Fechado e Perdido.'}
            </p>

            <div className="mt-4">
              <label htmlFor="nome-etapa" className="mb-1 block text-sm font-medium text-foreground">
                Nome *
              </label>
              <Input
                id="nome-etapa"
                autoFocus
                maxLength={40}
                value={stageForm.name}
                onChange={(e) => setStageForm((f) => (f ? { ...f, name: e.target.value } : f))}
                placeholder="Ex.: Avaliação agendada"
                className="w-full"
              />
            </div>

            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-medium text-foreground">Cor</legend>
              <div className="flex flex-wrap gap-2">
                {STAGE_COLORS.map((c) => {
                  const selected = stageForm.color.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setStageForm((f) => (f ? { ...f, color: c } : f))}
                      aria-label={`Cor ${c}`}
                      aria-pressed={selected}
                      className={`h-7 w-7 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        selected ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  );
                })}
              </div>
            </fieldset>

            {stageFormError && <p className="mt-3 text-sm text-destructive">{stageFormError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStageForm(null)}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={stageFormBusy || !stageForm.name.trim()}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {stageFormBusy ? 'Salvando…' : stageForm.stage ? 'Salvar' : 'Criar etapa'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Excluir etapa: os negócios dela vão para a etapa escolhida. */}
      {stageToDelete && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-excluir-etapa"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 id="titulo-excluir-etapa" className="text-base font-semibold text-foreground">
              Excluir a etapa “{stageToDelete.name}”?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A etapa sai do funil. Nenhum negócio é apagado: os que estiverem nela vão para a etapa abaixo.
            </p>

            <div className="mt-4">
              <label htmlFor="destino-etapa" className="mb-1 block text-sm font-medium text-foreground">
                Mover os negócios para
              </label>
              <FilterSelect
                id="destino-etapa"
                className="w-full"
                value={moveToStageId}
                onChange={(e) => setMoveToStageId(e.target.value)}
              >
                {openStages
                  .filter((s) => s.id !== stageToDelete.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </FilterSelect>
            </div>

            {deleteError && <p className="mt-3 text-sm text-destructive">{deleteError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStageToDelete(null)}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteStage}
                disabled={deleteBusy || !moveToStageId}
                className="rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {deleteBusy ? 'Excluindo…' : 'Excluir etapa'}
              </button>
            </div>
          </div>
        </div>
      )}

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