'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CalendarCheck2, ExternalLink } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/filter-bar';

// Botão "Novo agendamento" dentro da conversa: manda o lead direto para a Agenda.
//
// Irmão do SendToPipeline — mesma ideia, outro destino. A diferença é que
// `Appointment.patientId` é obrigatório: se o lead ainda não é paciente, o painel
// pede o mínimo (CPF, nascimento, sexo) e cria o cadastro no mesmo passo, já
// vinculando o contato. Ninguém sai do chat para agendar.

interface Option { id: string; name: string }
interface ProfessionalOption extends Option { specialtyIds: string[] }
interface PatientRef { id: string; name: string; cpf: string; phone: string | null; whatsapp?: string | null }

interface Upcoming {
  id: string;
  startAt: string;
  type: string;
  status: string;
  professionalName: string | null;
}

interface Contexto {
  contact: { id: string; name: string; phone: string | null; email: string | null; patientId: string | null };
  channel: string;
  channelLabel: string;
  patient: PatientRef | null;
  patientCandidates: PatientRef[];
  professionals: ProfessionalOption[];
  specialties: Option[];
  rooms: Option[];
  telemedicineEnabled: boolean;
  upcoming: Upcoming[];
  suggested: {
    date: string;
    time: string;
    durationMinutes: number;
    type: string;
    professionalId: string;
    specialtyId: string;
    patientName: string;
    origin: string;
  };
}

interface Criado {
  id: string;
  startAt: string;
  patientName: string | null;
  professionalName: string | null;
  modality: string;
  patientCreated: boolean;
}

const TYPES = ['Consulta', 'Retorno', 'Exame', 'Avaliação'];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const GENEROS = [
  { value: 'FEMALE', label: 'Feminino' },
  { value: 'MALE', label: 'Masculino' },
  { value: 'OTHER', label: 'Outro' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefiro não informar' },
];

/** Máscara de CPF conforme digita — o banco guarda no formato mascarado. */
function maskCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function ScheduleFromConversation({
  conversationId,
  contactName,
  onScheduled,
}: {
  conversationId: string;
  contactName?: string | null;
  /** Chamado com o agendamento criado — a tela usa para sugerir a confirmação. */
  onScheduled?: (criado: Criado) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<Criado | null>(null);

  // Paciente: '' = criar novo; id = usar existente.
  const [patientId, setPatientId] = useState('');
  const [novo, setNovo] = useState({ name: '', cpf: '', birthDate: '', gender: 'FEMALE' });

  const [form, setForm] = useState({
    professionalId: '',
    specialtyId: '',
    roomId: '',
    type: 'Consulta',
    modality: 'PRESENCIAL',
    date: '',
    time: '',
    durationMinutes: 30,
    notes: '',
  });

  // Troca de conversa fecha e limpa: painel aberto com o contato anterior é
  // exatamente como se agenda na pessoa errada.
  useEffect(() => {
    setOpen(false);
    setCtx(null);
    setCriado(null);
    setErro(null);
  }, [conversationId]);

  /**
   * Busca o contexto. `preencherForm` só é true na abertura: depois de um
   * conflito de horário o painel recarrega o contexto (o paciente pode ter
   * acabado de ser criado) SEM sobrescrever o que o usuário já escolheu —
   * jogar as sugestões de volta apagaria justamente o horário que ele veio
   * corrigir.
   */
  async function carregar(preencherForm: boolean) {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/mensageria/conversations/${conversationId}/appointment`);
      const body = await res.json();
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível carregar os dados da agenda.');
        return null;
      }
      const c = body as Contexto;
      setCtx(c);
      setPatientId((atual) => c.patient?.id ?? (preencherForm ? c.patientCandidates[0]?.id ?? '' : atual));
      setNovo((n) => ({ ...n, name: n.name || c.suggested.patientName || contactName || '' }));
      if (preencherForm) {
        setForm((f) => ({
          ...f,
          professionalId: c.suggested.professionalId,
          specialtyId: c.suggested.specialtyId,
          type: c.suggested.type,
          date: c.suggested.date,
          time: c.suggested.time,
          durationMinutes: c.suggested.durationMinutes,
        }));
      }
      return c;
    } catch {
      setErro('Falha de rede ao carregar os dados da agenda.');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function abrir() {
    setOpen(true);
    setCriado(null);
    await carregar(true);
  }

  // Especialidades do profissional escolhido primeiro; se ele não tem nenhuma
  // cadastrada, mostra todas (não travar o agendamento por cadastro incompleto).
  const especialidades = useMemo(() => {
    if (!ctx) return [];
    const prof = ctx.professionals.find((p) => p.id === form.professionalId);
    if (!prof || prof.specialtyIds.length === 0) return ctx.specialties;
    const doProf = ctx.specialties.filter((s) => prof.specialtyIds.includes(s.id));
    return doProf.length ? doProf : ctx.specialties;
  }, [ctx, form.professionalId]);

  // Mantém a especialidade coerente com o profissional selecionado.
  useEffect(() => {
    if (!especialidades.length) return;
    if (!especialidades.some((s) => s.id === form.specialtyId)) {
      setForm((f) => ({ ...f, specialtyId: especialidades[0].id }));
    }
  }, [especialidades, form.specialtyId]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const criandoPaciente = !ctx?.patient && !patientId;

  async function salvar() {
    if (!ctx) return;
    setErro(null);

    if (!form.professionalId) { setErro('Escolha o profissional.'); return; }
    if (!form.specialtyId) { setErro('Escolha a especialidade.'); return; }
    if (!form.date || !form.time) { setErro('Informe data e hora.'); return; }
    if (criandoPaciente) {
      if (novo.name.trim().length < 2) { setErro('Informe o nome do paciente.'); return; }
      if (novo.cpf.replace(/\D/g, '').length !== 11) { setErro('Informe um CPF com 11 dígitos.'); return; }
      if (!novo.birthDate) { setErro('Informe a data de nascimento.'); return; }
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/mensageria/conversations/${conversationId}/appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: criandoPaciente ? undefined : patientId || ctx.patient?.id,
          newPatient: criandoPaciente
            ? { name: novo.name.trim(), cpf: novo.cpf, birthDate: novo.birthDate, gender: novo.gender }
            : undefined,
          professionalId: form.professionalId,
          specialtyId: form.specialtyId,
          roomId: form.roomId || undefined,
          type: form.type,
          modality: form.modality,
          startAt: new Date(`${form.date}T${form.time}:00`).toISOString(),
          durationMinutes: Number(form.durationMinutes),
          notes: form.notes || undefined,
        }),
      });
      const body = await res.json();

      if (res.status === 409) {
        const mensagem = body?.conflict
          ? `Esse horário já está ocupado para o profissional (${formatDateTime(body.conflict.startAt)}). Escolha outro.`
          : (body?.error ?? 'Conflito de horário.');
        // O paciente pode ter sido criado/vinculado antes do conflito — recarrega
        // o contexto para o painel refletir isso e não pedir CPF de novo. O erro
        // é setado DEPOIS porque `carregar` limpa a mensagem anterior.
        if (body?.patientCreated) await carregar(false);
        setErro(mensagem);
        return;
      }
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível criar o agendamento.');
        return;
      }

      const a = body.appointment;
      const resultado: Criado = {
        id: a.id,
        startAt: a.startAt,
        patientName: a.patientName,
        professionalName: a.professionalName,
        modality: a.modality,
        patientCreated: !!body.patientCreated,
      };
      setCriado(resultado);
      onScheduled?.(resultado);
    } catch {
      setErro('Falha de rede ao criar o agendamento.');
    } finally {
      setBusy(false);
    }
  }

  const label = 'mb-1 block text-xs font-medium text-foreground';

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Novo agendamento
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Novo agendamento"
        description={ctx ? `${ctx.contact.name} · ${ctx.channelLabel}` : contactName ?? undefined}
        width="max-w-lg"
      >
        {loading && <p className="text-sm text-muted-foreground">Carregando agenda…</p>}

        {criado && (
          <div className="space-y-3">
            <div className="rounded-xl border border-success/30 bg-success/10 p-4">
              <div className="flex items-start gap-2.5">
                <CalendarCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div className="text-sm text-success">
                  <p className="font-semibold">Agendamento criado</p>
                  <p className="mt-0.5">
                    {criado.patientName} com {criado.professionalName} em {formatDateTime(criado.startAt)}
                    {criado.modality === 'TELEMEDICINA' && ' · teleconsulta'}
                  </p>
                  {criado.patientCreated && (
                    <p className="mt-1 text-xs">O contato virou paciente e já ficou vinculado a esta conversa.</p>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Uma sugestão de mensagem de confirmação já foi colocada no campo de envio da conversa — revise antes de mandar.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/agenda?date=${criado.startAt.slice(0, 10)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Abrir na Agenda <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Voltar para a conversa
              </button>
            </div>
          </div>
        )}

        {!loading && !criado && ctx && (
          <div className="space-y-5">
            {/* Paciente ------------------------------------------------- */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paciente</h4>

              {ctx.patient ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium text-foreground">{ctx.patient.name}</p>
                  <p className="text-xs text-muted-foreground">CPF {ctx.patient.cpf}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Contato já vinculado a este paciente.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className={label} htmlFor="paciente">Cadastro</label>
                    <FilterSelect
                      id="paciente"
                      className="w-full"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                    >
                      {ctx.patientCandidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — CPF {p.cpf}
                        </option>
                      ))}
                      <option value="">Cadastrar novo paciente</option>
                    </FilterSelect>
                    {ctx.patientCandidates.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ctx.patientCandidates.length === 1 ? 'Encontramos 1 paciente' : `Encontramos ${ctx.patientCandidates.length} pacientes`} com este telefone.
                        Confirme antes de agendar.
                      </p>
                    )}
                  </div>

                  {criandoPaciente && (
                    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        A Agenda exige paciente cadastrado. Estes são os campos obrigatórios do cadastro — o
                        telefone vem da conversa e a origem entra como {ctx.channelLabel}.
                      </p>
                      <div>
                        <label className={label} htmlFor="np-nome">Nome completo *</label>
                        <Input
                          id="np-nome"
                          className="w-full"
                          value={novo.name}
                          onChange={(e) => setNovo({ ...novo, name: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={label} htmlFor="np-cpf">CPF *</label>
                          <Input
                            id="np-cpf"
                            className="w-full"
                            inputMode="numeric"
                            placeholder="000.000.000-00"
                            value={novo.cpf}
                            onChange={(e) => setNovo({ ...novo, cpf: maskCpf(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label className={label} htmlFor="np-nasc">Nascimento *</label>
                          <Input
                            id="np-nasc"
                            type="date"
                            className="w-full"
                            value={novo.birthDate}
                            onChange={(e) => setNovo({ ...novo, birthDate: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={label} htmlFor="np-sexo">Sexo *</label>
                        <FilterSelect
                          id="np-sexo"
                          className="w-full"
                          value={novo.gender}
                          onChange={(e) => setNovo({ ...novo, gender: e.target.value })}
                        >
                          {GENEROS.map((g) => (
                            <option key={g.value} value={g.value}>{g.label}</option>
                          ))}
                        </FilterSelect>
                      </div>
                    </div>
                  )}
                </>
              )}

              {ctx.upcoming.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <p className="text-xs font-medium text-foreground">Este paciente já tem consulta marcada:</p>
                  <ul className="mt-1 space-y-0.5">
                    {ctx.upcoming.map((a) => (
                      <li key={a.id} className="text-xs text-muted-foreground">
                        {formatDateTime(a.startAt)} · {a.type}
                        {a.professionalName ? ` · ${a.professionalName}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Consulta ------------------------------------------------- */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consulta</h4>

              {ctx.professionals.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Nenhum médico(a) ativo cadastrado. Cadastre em Agenda › Profissionais para poder agendar.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="ag-prof">Médico(a) *</label>
                      <FilterSelect
                        id="ag-prof"
                        className="w-full"
                        value={form.professionalId}
                        onChange={(e) => set('professionalId', e.target.value)}
                      >
                        {ctx.professionals.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div>
                      <label className={label} htmlFor="ag-esp">Especialidade *</label>
                      <FilterSelect
                        id="ag-esp"
                        className="w-full"
                        value={form.specialtyId}
                        onChange={(e) => set('specialtyId', e.target.value)}
                      >
                        {especialidades.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </FilterSelect>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className={label} htmlFor="ag-data">Data *</label>
                      <Input id="ag-data" type="date" className="w-full" value={form.date} onChange={(e) => set('date', e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="ag-hora">Hora *</label>
                      <Input id="ag-hora" type="time" className="w-full" value={form.time} onChange={(e) => set('time', e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="ag-dur">Duração</label>
                      <FilterSelect id="ag-dur" className="w-full" value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)}>
                        {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                      </FilterSelect>
                    </div>
                    <div>
                      <label className={label} htmlFor="ag-tipo">Tipo</label>
                      <FilterSelect id="ag-tipo" className="w-full" value={form.type} onChange={(e) => set('type', e.target.value)}>
                        {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </FilterSelect>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="ag-mod">Modalidade</label>
                      <FilterSelect id="ag-mod" className="w-full" value={form.modality} onChange={(e) => set('modality', e.target.value)}>
                        <option value="PRESENCIAL">Presencial</option>
                        {ctx.telemedicineEnabled && <option value="TELEMEDICINA">Teleconsulta</option>}
                      </FilterSelect>
                    </div>
                    <div>
                      <label className={label} htmlFor="ag-sala">Sala</label>
                      <FilterSelect id="ag-sala" className="w-full" value={form.roomId} onChange={(e) => set('roomId', e.target.value)}>
                        <option value="">Sem sala definida</option>
                        {ctx.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </FilterSelect>
                    </div>
                  </div>

                  {form.modality === 'TELEMEDICINA' && (
                    <p className="rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                      A sala de vídeo e o link do paciente são gerados automaticamente, e o link é enviado por WhatsApp.
                    </p>
                  )}

                  <div>
                    <label className={label} htmlFor="ag-obs">Observações</label>
                    <Textarea id="ag-obs" rows={2} className="w-full" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                  </div>
                </>
              )}
            </section>

            {erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={busy || ctx.professionals.length === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busy ? 'Agendando…' : 'Agendar'}
              </button>
            </div>
          </div>
        )}

        {!loading && !ctx && erro && <p className="text-sm text-destructive">{erro}</p>}
      </Drawer>
    </>
  );
}

export default ScheduleFromConversation;
