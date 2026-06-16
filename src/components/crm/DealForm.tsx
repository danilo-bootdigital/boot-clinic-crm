'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDealSchema, UpdateDealSchema, DealSource, Priority } from '@/lib/validations/crm';
import { CreateDealInput, UpdateDealInput } from '@/lib/validations/crm';

interface Patient {
  id: string;
  name: string;
  cpf: string;
  phone: string;
}

interface DealFormProps {
  deal?: CreateDealInput & UpdateDealInput & { id?: string };
  onSubmit: (data: CreateDealInput | UpdateDealInput) => void;
  onCancel: () => void;
}

export default function DealForm({ deal, onSubmit, onCancel }: DealFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPatients();
    loadPipelines();
    loadUsers();
  }, []);

  useEffect(() => {
    if (deal?.pipelineId) {
      loadStages(deal.pipelineId);
    }
  }, [deal?.pipelineId]);

  const loadPatients = async () => {
    try {
      const response = await fetch('/api/patients');
      if (response.ok) {
        const data = await response.json();
        setPatients(data.patients);
      }
    } catch (error) {
      console.error('Erro ao carregar pacientes:', error);
    }
  };

  const loadPipelines = async () => {
    try {
      const response = await fetch('/api/crm/pipelines');
      if (response.ok) {
        const data = await response.json();
        setPipelines(data);
      }
    } catch (error) {
      console.error('Erro ao carregar pipelines:', error);
    }
  };

  const loadStages = async (pipelineId: string) => {
    try {
      const response = await fetch(`/api/crm/pipelines/${pipelineId}/stages`);
      if (response.ok) {
        const data = await response.json();
        setStages(data);
      }
    } catch (error) {
      console.error('Erro ao carregar etapas:', error);
    }
  };

  const loadUsers = async () => {
    try {
      // Aqui você caria os usuários disponíveis
      // Por enquanto, vamos usar dados mock
      setUsers([
        { id: '1', name: 'João Silva' },
        { id: '2', name: 'Maria Santos' },
        { id: '3', name: 'Pedro Oliveira' },
      ]);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<CreateDealInput | UpdateDealInput>({
    resolver: zodResolver(deal ? UpdateDealSchema : CreateDealSchema),
    defaultValues: deal ? {
      title: deal.title,
      description: deal.description || '',
      valueEstimated: deal.valueEstimated || undefined,
      priority: deal.priority || Priority.MEDIUM,
      pipelineId: deal.pipelineId,
      stageId: deal.stageId,
      patientId: deal.patientId || undefined,
      source: deal.source || DealSource.WEBSITE,
      responsibleUserId: deal.responsibleUserId,
      nextFollowUpAt: deal.nextFollowUpAt ? new Date(deal.nextFollowUpAt).toISOString().split('T')[0] : '',
      lastContactAt: deal.lastContactAt ? new Date(deal.lastContactAt).toISOString().split('T')[0] : '',
    } : {
      title: '',
      description: '',
      valueEstimated: undefined,
      priority: Priority.MEDIUM,
      pipelineId: '',
      stageId: '',
      patientId: undefined,
      source: DealSource.WEBSITE,
      responsibleUserId: '',
      nextFollowUpAt: '',
      lastContactAt: '',
    },
  });

  const handleFormSubmit = (data: CreateDealInput | UpdateDealInput) => {
    onSubmit(data);
  };

  const handlePipelineChange = (pipelineId: string) => {
    setValue('pipelineId', pipelineId);
    setValue('stageId', '');
    loadStages(pipelineId);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {deal ? 'Editar Deal' : 'Criar Novo Deal'}
          </h2>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-6">
          {/* Informações Básicas */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Informações Básicas</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título *
              </label>
              <input
                type="text"
                {...register('title')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor Estimado (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register('valueEstimated', { valueAsNumber: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prioridade
                </label>
                <select
                  {...register('priority')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={Priority.LOW}>Baixa</option>
                  <option value={Priority.MEDIUM}>Média</option>
                  <option value={Priority.HIGH}>Alta</option>
                  <option value={Priority.URGENT}>Urgente</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pipeline *
                </label>
                <select
                  {...register('pipelineId')}
                  onChange={(e) => handlePipelineChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione um pipeline</option>
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
                {errors.pipelineId && (
                  <p className="mt-1 text-sm text-red-600">{errors.pipelineId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Etapa *
                </label>
                <select
                  {...register('stageId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione uma etapa</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
                {errors.stageId && (
                  <p className="mt-1 text-sm text-red-600">{errors.stageId.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Paciente (opcional)
              </label>
              <select
                {...register('patientId')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione um paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.cpf}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Origem
                </label>
                <select
                  {...register('source')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={DealSource.WEBSITE}>Website</option>
                  <option value={DealSource.REFERRAL}>Indicação</option>
                  <option value={DealSource.PHONE}>Telefone</option>
                  <option value={DealSource.WHATSAPP}>WhatsApp</option>
                  <option value={DealSource.SOCIAL_MEDIA}>Redes Sociais</option>
                  <option value={DealSource.WALK_IN}>Passagem</option>
                  <option value={DealSource.EMAIL}>E-mail</option>
                  <option value={DealSource.OTHER}>Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Responsável *
                </label>
                <select
                  {...register('responsibleUserId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione um responsável</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                {errors.responsibleUserId && (
                  <p className="mt-1 text-sm text-red-600">{errors.responsibleUserId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Próximo Follow-up
                </label>
                <input
                  type="date"
                  {...register('nextFollowUpAt')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Último Contato
                </label>
                <input
                  type="date"
                  {...register('lastContactAt')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}