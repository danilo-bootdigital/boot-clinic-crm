'use client';

import { useState, useEffect } from 'react';
import { DealSource } from '@/lib/validations/crm';

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

export default function KanbanBoard({ pipelineId, onDealClick }: KanbanBoardProps) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedDeal, setDraggedDeal] = useState<Deal | null>(null);
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

  // Mover deal entre etapas
  const handleDrop = async (stageId: string) => {
    if (!draggedDeal) return;

    try {
      const response = await fetch(`/api/crm/deals/${draggedDeal.id}/move`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: draggedDeal.id,
          newStageId: stageId,
        }),
      });

      if (response.ok) {
        // Atualizar estado local
        setDeals(prev => prev.map(deal =>
          deal.id === draggedDeal.id
            ? { ...deal, stageId }
            : deal
        ));
        setDraggedDeal(null);
      }
    } catch (error) {
      console.error('Erro ao mover deal:', error);
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Filtros */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <input
              type="text"
              placeholder="Título, descrição..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Responsável
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={filters.responsibleUserId}
              onChange={(e) => setFilters(prev => ({ ...prev, responsibleUserId: e.target.value }))}
            >
              <option value="">Todos</option>
              {/* Aqui carregar usuários disponíveis */}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Origem
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
            </select>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {stages.map((stage) => {
          const stageDeals = getDealsByStage(stage.id);
          const stageValue = getValueByStage(stage.id);

          return (
            <div
              key={stage.id}
              className="bg-white rounded-lg shadow"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Cabeçalho da etapa */}
              <div
                className="p-4 border-b"
                style={{ backgroundColor: stage.color + '20' }}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-900">{stage.name}</h3>
                  <span className="text-sm text-gray-500">
                    {stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {stageValue > 0 && (
                  <p className="text-sm text-gray-600">
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
                    className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-sm text-gray-900 truncate">
                        {deal.title}
                      </h4>
                      {deal.priority === 'URGENT' && (
                        <span className="px-1 py-0.5 text-xs bg-red-100 text-red-800 rounded">
                          Urgente
                        </span>
                      )}
                    </div>

                    {deal.valueEstimated && (
                      <p className="text-xs text-gray-600 mb-1">
                        R$ {deal.valueEstimated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{deal.source}</span>
                      {deal.lastContactAt && (
                        <span>
                          Último contato: {new Date(deal.lastContactAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {deal.patient && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-600">
                          {deal.patient.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {deal.patient.phone}
                        </p>
                      </div>
                    )}

                    {deal.nextFollowUpAt && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          Follow-up: {new Date(deal.nextFollowUpAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {stageDeals.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Nenhum deal nesta etapa
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}