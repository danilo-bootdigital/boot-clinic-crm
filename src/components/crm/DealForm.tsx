'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDealSchema, UpdateDealSchema, DealSource, Priority } from '@/lib/validations/crm';
import { CreateDealInput, UpdateDealInput } from '@/lib/validations/crm';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/filter-bar';

interface Patient {
  id: string;
  name: string;
  cpf: string;
  phone: string;
}

/** Contato da mensageria por trás do lead — de onde vem o telefone. */
interface DealContact {
  id: string;
  name: string;
  phone: string | null;
}

interface DealFormProps {
  deal?: CreateDealInput &
    UpdateDealInput & {
      id?: string;
      contact?: DealContact | null;
      conversation?: { id: string; channel: string } | null;
      patient?: { id: string; name: string; phone?: string | null } | null;
      lossReason?: { id: string; name: string } | null;
      status?: string;
    };
  onSubmit: (data: CreateDealInput | UpdateDealInput) => void;
  onCancel: () => void;
}

/** Telefone legível: 5511987654321 -> +55 (11) 98765-4321. */
function formatPhone(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
    const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);
    return `+55 (${ddd}) ${meio}-${fim}`;
  }
  return `+${d}`;
}

export default function DealForm({ deal, onSubmit, onCancel }: DealFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [lossReasons, setLossReasons] = useState<{ id: string; name: string }[]>([]);
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPatients();
    loadPipelines();
    loadUsers();
    // Motivos de perda: o select de etapa inclui "Perdido", e sem o motivo aqui
    // o formulário seria o caminho por onde se perde um lead sem dizer por quê.
    fetch('/api/crm/loss-reasons')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setLossReasons(Array.isArray(d) ? d : []))
      .catch(() => setLossReasons([]));
  }, []);

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
        const data: any[] = await response.json();
        setPipelines(data);
        // Deal sem pipeline gravado (ou novo) precisa de um: sem isto a lista de
        // etapas nunca carregava e "Etapa" ficava em "Selecione uma etapa" mesmo
        // com o cartão parado numa coluna.
        const alvo =
          deal?.pipelineId ||
          data.find((p) => p.isDefault)?.id ||
          data[0]?.id ||
          '';
        if (alvo) {
          setValue('pipelineId', alvo, { shouldDirty: false });
          await loadStages(alvo);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar pipelines:', error);
    }
  };

  const loadStages = async (pipelineId: string) => {
    try {
      const response = await fetch(`/api/crm/pipelines/${pipelineId}/stages`);
      if (response.ok) {
        const data: any[] = await response.json();
        setStages(data);
        // Deal existente sem pipeline mas COM etapa: a etapa manda. Deal novo
        // começa na primeira etapa, não em branco.
        if (!deal) {
          setValue('stageId', data[0]?.id ?? '', { shouldDirty: false });
        } else if (deal.stageId && data.some((s) => s.id === deal.stageId)) {
          setValue('stageId', deal.stageId, { shouldDirty: false });
        }
      }
    } catch (error) {
      console.error('Erro ao carregar etapas:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data: any[] = await response.json();
        setUsers(data);
        if (deal?.responsibleUserId && data.some((u) => u.id === deal.responsibleUserId)) {
          // Reafirma o responsável DEPOIS que as opções existem — o select nativo
          // descarta um value que ainda não tem <option>, e era por isso que o
          // campo aparecia vazio num deal que tem responsável gravado.
          setValue('responsibleUserId', deal.responsibleUserId, { shouldDirty: false });
        } else if (!deal) {
          // Deal novo nasce com quem está atendendo — ninguém quer escolher a si
          // mesmo num select a cada lead.
          const me = await fetch('/api/me')
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (me?.id && data.some((u) => u.id === me.id)) {
            setValue('responsibleUserId', me.id, { shouldDirty: false });
          }
        }
      }
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

  // Etapa escolhida é final de PERDA? Vem do finalType da própria etapa — a tela
  // não adivinha por nome ("Perdido" é editável pela clínica).
  const stageIdAtual = watch('stageId');
  const etapaDePerda = stages.some((s) => s.id === stageIdAtual && s.finalType === 'LOST');

  const handleFormSubmit = (data: CreateDealInput | UpdateDealInput) => {
    if (etapaDePerda && !data.lossReasonId) {
      setErrorMotivo('Escolha o motivo da perda.');
      return;
    }
    setErrorMotivo(null);
    onSubmit(etapaDePerda ? data : { ...data, lossReasonId: undefined });
  };

  const handlePipelineChange = (pipelineId: string) => {
    setValue('pipelineId', pipelineId);
    setValue('stageId', '');
    loadStages(pipelineId);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-card rounded-xl border border-border shadow-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-xl font-semibold text-foreground">
            {deal ? 'Editar Deal' : 'Criar Novo Deal'}
          </h2>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-6">
          {/* Contato — dado que JÁ existe e antes ficava invisível aqui.
              O lead veio da mensageria com telefone; esconder isso obrigava a
              atendente a procurar a pessoa em outra tela para poder ligar. */}
          {(deal?.contact || deal?.patient) && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contato
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {deal.contact?.name ?? deal.patient?.name}
                  </p>
                  {formatPhone(deal.contact?.phone ?? deal.patient?.phone) ? (
                    <a
                      href={`tel:${(deal.contact?.phone ?? deal.patient?.phone ?? '').replace(/\D/g, '')}`}
                      className="block text-sm text-foreground underline decoration-border hover:decoration-foreground"
                    >
                      {formatPhone(deal.contact?.phone ?? deal.patient?.phone)}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem telefone cadastrado</p>
                  )}
                  {deal.lossReason && (
                    <p className="text-xs text-muted-foreground">
                      Perdido por <strong className="text-foreground">{deal.lossReason.name}</strong>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {deal.conversation && (
                    <a
                      href={`/mensageria?conversa=${deal.conversation.id}`}
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      Abrir conversa
                    </a>
                  )}
                  {deal.patientId && (
                    <a
                      href={`/pacientes/${deal.patientId}`}
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      Ficha do paciente
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Informações Básicas */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground">Informações Básicas</h3>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Título *
              </label>
              <Input
                type="text"
                {...register('title')}
                className="w-full"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Descrição
              </label>
              <Textarea
                {...register('description')}
                rows={3}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Valor Estimado (R$)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('valueEstimated', { valueAsNumber: true })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Prioridade
                </label>
                <FilterSelect
                  {...register('priority')}
                  value={watch('priority') || 'MEDIUM'}
                  onChange={(e) => setValue('priority', e.target.value as any, { shouldValidate: true })}
                  className="w-full"
                >
                  <option value={Priority.LOW}>Baixa</option>
                  <option value={Priority.MEDIUM}>Média</option>
                  <option value={Priority.HIGH}>Alta</option>
                  <option value={Priority.URGENT}>Urgente</option>
                </FilterSelect>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Pipeline *
                </label>
                <FilterSelect
                  {...register('pipelineId')}
                  value={watch('pipelineId') || ''}
                  onChange={(e) => handlePipelineChange(e.target.value)}
                  className="w-full"
                >
                  <option value="">Selecione um pipeline</option>
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </FilterSelect>
                {errors.pipelineId && (
                  <p className="mt-1 text-sm text-destructive">{errors.pipelineId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Etapa *
                </label>
                <FilterSelect
                  {...register('stageId')}
                  value={watch('stageId') || ''}
                  onChange={(e) => setValue('stageId', e.target.value, { shouldValidate: true })}
                  className="w-full"
                >
                  <option value="">Selecione uma etapa</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </FilterSelect>
                {errors.stageId && (
                  <p className="mt-1 text-sm text-destructive">{errors.stageId.message}</p>
                )}
              </div>
            </div>

            {etapaDePerda && (
              <div>
                <label htmlFor="deal-loss-reason" className="mb-1 block text-sm font-medium text-foreground">
                  Motivo da perda *
                </label>
                <FilterSelect
                  id="deal-loss-reason"
                  {...register('lossReasonId')}
                  value={watch('lossReasonId') || ''}
                  onChange={(e) => setValue('lossReasonId', e.target.value, { shouldValidate: true })}
                  className="w-full"
                >
                  <option value="">Selecione o motivo</option>
                  {lossReasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </FilterSelect>
                {errorMotivo ? (
                  <p className="mt-1 text-sm text-destructive">{errorMotivo}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Etapa final de perda: o motivo é obrigatório e fica no histórico.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Paciente (opcional)
              </label>
              <FilterSelect
                {...register('patientId')}
                value={watch('patientId') || ''}
                onChange={(e) => setValue('patientId', e.target.value || undefined, { shouldValidate: true })}
                className="w-full"
              >
                <option value="">Selecione um paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.cpf}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Origem
                </label>
                <FilterSelect
                  {...register('source')}
                  value={watch('source') || 'OTHER'}
                  onChange={(e) => setValue('source', e.target.value as any, { shouldValidate: true })}
                  className="w-full"
                >
                  <option value={DealSource.WEBSITE}>Website</option>
                  <option value={DealSource.REFERRAL}>Indicação</option>
                  <option value={DealSource.PHONE}>Telefone</option>
                  <option value={DealSource.WHATSAPP}>WhatsApp</option>
                  <option value={DealSource.SOCIAL_MEDIA}>Redes Sociais</option>
                  <option value={DealSource.WALK_IN}>Passagem</option>
                  <option value={DealSource.EMAIL}>E-mail</option>
                  <option value={DealSource.OTHER}>Outro</option>
                </FilterSelect>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Responsável *
                </label>
                <FilterSelect
                  {...register('responsibleUserId')}
                  value={watch('responsibleUserId') || ''}
                  onChange={(e) => setValue('responsibleUserId', e.target.value, { shouldValidate: true })}
                  className="w-full"
                >
                  <option value="">Selecione um responsável</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </FilterSelect>
                {errors.responsibleUserId && (
                  <p className="mt-1 text-sm text-destructive">{errors.responsibleUserId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Próximo Follow-up
                </label>
                <Input
                  type="date"
                  {...register('nextFollowUpAt')}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Último Contato
                </label>
                <Input
                  type="date"
                  {...register('lastContactAt')}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-border">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-border rounded-md text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}