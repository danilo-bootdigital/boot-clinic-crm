'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Paperclip,
  Mic,
  Plus,
  Send,
  PanelRightClose,
  PanelRightOpen,
  MessageCircle,
  User,
  CalendarDays,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Drawer } from '@/components/ui/drawer';
import { clientValidateFile, formatBytes, CLIENT_ACCEPT_ATTR } from '@/lib/messaging/media-client';
import { MessageMediaBubble } from '@/components/mensageria/MessageMediaBubble';
import { AudioMessagePlayer } from '@/components/mensageria/AudioMessagePlayer';
import { ChannelBadge, type ChannelValue, type SourceValue } from '@/components/mensageria/ChannelBadge';
import { SendToPipeline } from '@/components/mensageria/SendToPipeline';
import { ScheduleFromConversation } from '@/components/mensageria/ScheduleFromConversation';
import { EditableContactName } from '@/components/mensageria/EditableContactName';

// Procedência no `title` da bolha: a informação continua acessível (hover) sem
// poluir a thread. A regra 7 da diretriz é sobre GRAVAR a procedência no
// ingest; exibi-la em CADA bolha era decisão de tela, e em canal único só
// atrapalha.
const SOURCE_TEXTO: Record<string, string> = {
  CONTACT: 'recebida',
  CRM: 'enviada pelo sistema',
  MOBILE: 'enviada pelo celular, fora do sistema',
  AUTOMATION: 'envio automático',
};

function provenanceTitle(m: {
  channel?: string | null;
  accountLabel?: string | null;
  source?: string | null;
}): string {
  const canal =
    m.channel === 'WHATSAPP' ? 'WhatsApp'
    : m.channel === 'INSTAGRAM' ? 'Instagram'
    : m.channel === 'TIKTOK' ? 'TikTok'
    : null;
  return [canal, m.accountLabel, m.source ? SOURCE_TEXTO[m.source] : null].filter(Boolean).join(' · ');
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Aberta', className: 'bg-success/15 text-success' },
  PENDING: { label: 'Pendente', className: 'bg-warning/15 text-warning' },
  CLOSED: { label: 'Encerrada', className: 'bg-muted text-muted-foreground' },
};

interface WhatsAppConversation {
  id: string;
  // Etiqueta de procedência da conversa (§4.3).
  channel: ChannelValue;
  account?: { id: string; label: string } | null;
  entryPoint?: string | null;
  patientId?: string | null;
  patientName?: string;
  contactId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  status: string;
  contact?: { id?: string; name: string; phone: string | null };
  messages?: WhatsAppMessage[];
}

interface WhatsAppAttachment {
  id: string;
  mimeType: string;
  sizeBytes?: number | null;
  originalFileName?: string | null;
  /** Duração declarada pelo provedor — a do container de áudio não é confiável. */
  durationSeconds?: number | null;
}

interface WhatsAppMessage {
  id: string;
  conversationId: string;
  // Etiqueta de procedência da mensagem — lida da própria mensagem, nunca
  // deduzida da conversa (§4.3).
  channel?: ChannelValue | null;
  accountLabel?: string | null;
  source?: SourceValue | null;
  content: string;
  caption?: string | null;
  messageType?: string | null;
  mediaStatus?: string | null;
  status?: string;
  direction?: 'INCOMING' | 'OUTGOING';
  isFromPatient: boolean;
  createdAt: string;
  /** Motivo da falha, quando o provedor recusou o envio. */
  errorMessage?: string | null;
  attachment?: WhatsAppAttachment | null;
}

interface WhatsAppQuickReply {
  id: string;
  title: string;
  message: string;
  content?: string;
  isActive?: boolean;
}

interface MessagingCentralProps {
  onMessageSend?: (message: string, conversationId: string) => void;
}

/** Dia da mensagem em rótulo curto — separador da thread. */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, hoje)) return 'Hoje';
  if (same(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
}

/** Hora na lista de conversas: hora hoje, data nos dias anteriores. */
function listTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function MessagingCentral({ onMessageSend }: MessagingCentralProps) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [quickReplies, setQuickReplies] = useState<WhatsAppQuickReply[]>([]);
  const [evolution, setEvolution] = useState<boolean | null>(null);
  // Lista: busca + filtro de não lidas
  const [query, setQuery] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  // Painel de contexto (direita) — colapsável para dar mais largura à thread.
  const [infoOpen, setInfoOpen] = useState(true);
  // Nova conversa
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConv, setNewConv] = useState({ contactName: '', contactPhone: '' });
  const [newConvError, setNewConvError] = useState<string | null>(null);
  const [creatingConv, setCreatingConv] = useState(false);
  // Mídia (imagem/documento)
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Espelho do `sending` em ref: dois Enter no mesmo frame leem o MESMO valor de
  // estado e passariam os dois pela trava. A ref muda na hora e barra o segundo.
  const sendingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Gravação de áudio (nota de voz)
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // Thread: só rola sozinho se o atendente já estava no fim — senão a leitura
  // de mensagem antiga era interrompida a cada polling.
  const threadRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const loadConversations = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch('/api/mensageria/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(`/api/mensageria/messages?conversationId=${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    }
  }, []);

  const loadQuickReplies = useCallback(async () => {
    try {
      const response = await fetch('/api/mensageria/quick-replies');
      if (response.ok) {
        const data = await response.json();
        setQuickReplies(data.filter((qr: WhatsAppQuickReply) => qr.isActive));
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens rápidas:', error);
    }
  }, []);

  // Carga inicial: conversas, respostas rápidas e estado da integração.
  useEffect(() => {
    loadConversations();
    loadQuickReplies();
    fetch('/api/mensageria/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEvolution(d?.configured ?? false))
      .catch(() => setEvolution(false));
  }, [loadConversations, loadQuickReplies]);

  // Troca de conversa: carrega a thread e desce para a última mensagem.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    nearBottomRef.current = true;
    setMessages([]);
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Tempo real (polling estável p/ Vercel): atualiza a lista de conversas e a
  // conversa aberta sem refresh manual. Silencioso (não pisca o loading).
  useEffect(() => {
    const id = setInterval(() => {
      loadConversations(true);
      if (selectedId) loadMessages(selectedId);
    }, 6000);
    return () => clearInterval(id);
  }, [selectedId, loadConversations, loadMessages]);

  // Autoscroll condicional.
  useEffect(() => {
    if (!nearBottomRef.current) return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Composer cresce com o texto até um limite — mensagem de três linhas não
  // deveria ser digitada dentro de uma fresta de uma linha.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [newMessage]);

  const onThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (onlyUnread && !c.unreadCount) return false;
      if (!q) return true;
      return [c.contact?.name, c.contact?.phone, c.lastMessage]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [conversations, query, onlyUnread]);

  const totalUnread = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
    [conversations]
  );

  async function createConversation(e: React.FormEvent) {
    e.preventDefault();
    setNewConvError(null);
    setCreatingConv(true);
    try {
      const res = await fetch('/api/mensageria/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConv),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNewConvError(body.error || 'Falha ao criar conversa');
        return;
      }
      setNewConv({ contactName: '', contactPhone: '' });
      setNewConvOpen(false);
      await loadConversations(true);
      if (body?.id) setSelectedId(body.id);
    } catch {
      setNewConvError('Falha de rede ao criar a conversa');
    } finally {
      setCreatingConv(false);
    }
  }

  const handleSendMessage = async () => {
    const enviada = newMessage.trim();
    // Trava de envio em curso: sem ela, cada Enter/clique durante os 1-2s de
    // resposta do provedor era UMA mensagem a mais chegando no paciente.
    if (!enviada || !selectedConversation || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    nearBottomRef.current = true;
    // Limpa o campo AGORA: sem retorno visual imediato o atendente aperta Enter
    // de novo. Se o envio falhar, o texto volta — nada digitado se perde.
    setNewMessage('');

    try {
      const response = await fetch('/api/mensageria/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // A conta de saída é resolvida no servidor a partir da conversa —
          // o cliente não escolhe por qual número a clínica responde.
          conversationId: selectedConversation.id,
          type: 'TEXT',
          content: enviada,
        }),
      });

      if (!response.ok) {
        const er = await response.json().catch(() => ({}));
        setSendError(er.error || 'Falha ao enviar a mensagem');
        setNewMessage(enviada);
        return;
      }
      await loadMessages(selectedConversation.id);
      if (onMessageSend) onMessageSend(enviada, selectedConversation.id);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      setSendError('Falha de rede ao enviar a mensagem');
      setNewMessage(enviada);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setSendError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const v = clientValidateFile({ type: f.type, name: f.name, size: f.size });
    if (!v.ok) {
      setFileError(v.error || 'Arquivo inválido');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(f);
    setFilePreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };

  const clearFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMedia = async () => {
    if (!file || !selectedConversation || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    nearBottomRef.current = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('conversationId', selectedConversation.id);
      if (newMessage.trim()) fd.append('caption', newMessage.trim());
      const res = await fetch('/api/mensageria/messages/media', { method: 'POST', body: fd });
      if (!res.ok) {
        const er = await res.json().catch(() => ({}));
        setSendError(er.error || 'Falha ao enviar o arquivo');
        return;
      }
      clearFile();
      setNewMessage('');
      await loadMessages(selectedConversation.id);
    } catch {
      setSendError('Falha ao enviar o arquivo');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleRetry = async (messageId: string) => {
    const res = await fetch(`/api/mensageria/messages/${messageId}/retry`, { method: 'POST' });
    if (res.ok && selectedId) await loadMessages(selectedId);
  };

  // --- Gravação de áudio (nota de voz) ---
  const startRecording = async () => {
    setSendError(null); setFileError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSendError('Gravação de áudio não suportada neste navegador.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setSendError('Não foi possível acessar o microfone.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const cancelRecording = () => {
    if (recording) { mediaRecorderRef.current?.stop(); setRecording(false); }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null); setRecordedUrl(null);
    chunksRef.current = [];
  };

  const sendRecording = async () => {
    if (!recordedBlob || !selectedConversation || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true); setSendError(null);
    nearBottomRef.current = true;
    try {
      const ext = (recordedBlob.type.split(';')[0].split('/')[1] || 'webm');
      const fd = new FormData();
      fd.append('file', new File([recordedBlob], `nota-de-voz.${ext}`, { type: recordedBlob.type.split(';')[0] || 'audio/webm' }));
      fd.append('conversationId', selectedConversation.id);
      const res = await fetch('/api/mensageria/messages/media', { method: 'POST', body: fd });
      if (!res.ok) {
        const er = await res.json().catch(() => ({}));
        setSendError(er.error || 'Falha ao enviar o áudio');
        return;
      }
      cancelRecording();
      await loadMessages(selectedConversation.id);
    } catch {
      setSendError('Falha ao enviar o áudio');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /** Renomear reflete na lista e no cabeçalho sem recarregar tudo. */
  const applyRename = (contactId: string, nome: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.contact?.id === contactId
          ? { ...c, contact: { ...c.contact!, name: nome }, patientName: nome }
          : c
      )
    );
  };

  const statusMeta = selectedConversation
    ? STATUS_META[selectedConversation.status] ?? { label: selectedConversation.status, className: 'bg-muted text-muted-foreground' }
    : null;

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* ------------------------------------------------ Lista de conversas */}
      <aside
        className={cn(
          'flex w-full min-w-0 flex-col border-r border-border bg-card md:w-[336px] md:shrink-0 lg:w-[368px]',
          selectedId && 'hidden md:flex'
        )}
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Conversas</h2>
              {totalUnread > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {totalUnread}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setNewConvError(null); setNewConvOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova
            </button>
          </div>

          <div className="mt-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar por nome, telefone ou mensagem…"
              containerClassName="max-w-none"
              className="h-9"
            />
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            {[
              { key: false, label: 'Todas' },
              { key: true, label: 'Não lidas' },
            ].map((chip) => (
              <button
                key={String(chip.key)}
                type="button"
                onClick={() => setOnlyUnread(chip.key)}
                aria-pressed={onlyUnread === chip.key}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  onlyUnread === chip.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {evolution === false && (
          <p className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-[11px] leading-snug text-foreground">
            WhatsApp não conectado — o que você enviar fica <strong>pendente</strong> até conectar um número
            em Configurações.
          </p>
        )}

        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex animate-pulse items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/2 rounded bg-muted" />
                    <div className="h-3 w-4/5 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {conversations.length === 0 ? 'Nenhuma conversa ainda' : 'Nada encontrado'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {conversations.length === 0
                  ? 'Mensagens recebidas aparecem aqui. Você também pode iniciar uma conversa.'
                  : 'Ajuste a busca ou o filtro de não lidas.'}
              </p>
            </div>
          ) : (
            <ul>
              {filteredConversations.map((conversation) => {
                const ativa = selectedId === conversation.id;
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      aria-current={ativa}
                      className={cn(
                        'flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors',
                        ativa ? 'bg-primary/5' : 'hover:bg-muted/60'
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold',
                          ativa ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                        )}
                        aria-hidden
                      >
                        {(conversation.contact?.name?.trim()?.[0] || '?').toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn('truncate text-sm', conversation.unreadCount ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                            {conversation.contact?.name || conversation.contact?.phone || 'Sem nome'}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {listTime(conversation.lastMessageAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={cn('truncate text-xs', conversation.unreadCount ? 'text-foreground' : 'text-muted-foreground')}>
                            {conversation.lastMessage || 'Sem mensagens'}
                          </span>
                          {conversation.unreadCount > 0 && (
                            <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              {conversation.unreadCount}
                            </span>
                          )}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ChannelBadge channel={conversation.channel} accountLabel={conversation.account?.label} />
                          {conversation.patientId && (
                            <span className="inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                              Paciente
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ------------------------------------------------------------ Thread */}
      <section className={cn('flex min-w-0 flex-1 flex-col', !selectedId && 'hidden md:flex')}>
        {selectedConversation ? (
          <>
            {/* Cabeçalho da conversa */}
            <div className="shrink-0 border-b border-border bg-card px-3 py-2.5 lg:px-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
                  aria-label="Voltar para a lista"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-white" aria-hidden>
                  {(selectedConversation.contact?.name?.trim()?.[0] || '?').toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  {selectedConversation.contact?.id ? (
                    <EditableContactName
                      contactId={selectedConversation.contact.id}
                      value={selectedConversation.contact.name || ''}
                      fallback={selectedConversation.contact.phone}
                      onSaved={(nome) => applyRename(selectedConversation.contact!.id!, nome)}
                    />
                  ) : (
                    <h3 className="truncate text-base font-semibold text-foreground">
                      {selectedConversation.contact?.name || selectedConversation.contact?.phone}
                    </h3>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedConversation.contact?.phone || 'sem telefone'}
                    </span>
                    <ChannelBadge channel={selectedConversation.channel} accountLabel={selectedConversation.account?.label} />
                    {statusMeta && (
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', statusMeta.className)}>
                        {statusMeta.label}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoOpen((v) => !v)}
                  className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground xl:grid"
                  aria-label={infoOpen ? 'Ocultar painel do contato' : 'Mostrar painel do contato'}
                  aria-pressed={infoOpen}
                >
                  {infoOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
              </div>

              {/* Conversão (§5): agendar e mandar para o funil, sem sair do chat. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <ScheduleFromConversation
                  conversationId={selectedConversation.id}
                  contactName={selectedConversation.contact?.name}
                  onScheduled={(criado) => {
                    // Confirmação sugerida no composer — o atendente revisa e envia.
                    const quando = new Date(criado.startAt).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    });
                    setNewMessage(
                      `Olá! Sua consulta ficou marcada para ${quando}` +
                      (criado.professionalName ? ` com ${criado.professionalName}` : '') +
                      '. Qualquer coisa, é só responder por aqui.'
                    );
                    loadConversations(true);
                  }}
                />
                <SendToPipeline conversationId={selectedConversation.id} />
              </div>
            </div>

            {/* Área de mensagens.
                Superfície de conversa no registro visual de app de mensagem.
                É uma EXCEÇÃO deliberada ao DS, restrita à thread: as cores estão
                em variáveis locais (não são tokens globais) para não vazarem para
                o resto do produto. Sem imagem de fundo — o padrão de rabiscos do
                WhatsApp é asset proprietário deles. */}
            <div
              ref={threadRef}
              onScroll={onThreadScroll}
              className="chat-surface scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-6"
              style={
                {
                  '--chat-bg': '#EFEAE2',
                  '--chat-bg-dark': '#0B141A',
                  '--bubble-in': '#FFFFFF',
                  '--bubble-in-dark': '#202C33',
                  '--bubble-out': '#D9FDD3',
                  '--bubble-out-dark': '#005C4B',
                } as React.CSSProperties
              }
            >
              {messages.length === 0 ? (
                <p className="mx-auto w-fit rounded-full bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                  Nenhuma mensagem nesta conversa ainda.
                </p>
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
                  {messages.map((message, i) => {
                    const isIn = message.direction === 'INCOMING';
                    const isMedia = message.messageType === 'IMAGE' || message.messageType === 'DOCUMENT' || message.messageType === 'AUDIO';
                    const showCaption = message.caption || (!isMedia && message.content);
                    const anterior = messages[i - 1];
                    const novoDia = !anterior || new Date(anterior.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                    return (
                      <div key={message.id}>
                        {novoDia && (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                              {dayLabel(message.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className={cn('flex', isIn ? 'justify-start' : 'justify-end')}>
                          <div
                            className={cn(
                              'max-w-[85%] rounded-xl px-3 py-2 shadow-sm sm:max-w-md',
                              isIn ? 'chat-bubble-in rounded-tl-sm' : 'chat-bubble-out rounded-tr-sm'
                            )}
                            // A procedência sai do visual mas continua acessível: numa
                            // thread de um só canal a etiqueta em cada bolha era ruído.
                            title={provenanceTitle(message)}
                          >
                            {isMedia && (
                              <MessageMediaBubble
                                messageType={message.messageType as 'IMAGE' | 'DOCUMENT' | 'AUDIO'}
                                mediaStatus={message.mediaStatus}
                                attachment={message.attachment}
                                dark={false}
                              />
                            )}
                            {showCaption && (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {message.caption || message.content}
                              </p>
                            )}
                            {/* Só aparece quando a mensagem DIVERGE do canal da
                                conversa — o caso de contato unificado em dois canais.
                                Em thread de canal único não há o que informar. */}
                            {message.channel && message.channel !== selectedConversation.channel && (
                              <div className="mt-1">
                                <ChannelBadge channel={message.channel} accountLabel={message.accountLabel} />
                              </div>
                            )}
                            <div className="mt-1 flex items-center justify-end gap-1.5">
                              <span className="text-[11px] opacity-75">
                                {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {/* PENDING recente é envio em curso. PENDING VELHO é
                                  mensagem que não saiu: dizer "enviando…" para
                                  sempre foi exatamente a reclamação da clínica. */}
                              {!isIn && message.status === 'PENDING' && (
                                Date.now() - new Date(message.createdAt).getTime() < 60_000 ? (
                                  <span className="text-[11px] opacity-75">· enviando…</span>
                                ) : (
                                  <button
                                    onClick={() => handleRetry(message.id)}
                                    title="A mensagem não chegou a sair. Clique para tentar de novo."
                                    className="text-[11px] underline opacity-90 hover:opacity-100"
                                  >
                                    não enviada · reenviar
                                  </button>
                                )
                              )}
                              {!isIn && message.status === 'SENT' && <span className="text-[11px] opacity-75" title="Enviado">✓</span>}
                              {!isIn && message.status === 'DELIVERED' && <span className="text-[11px] opacity-75" title="Entregue">✓✓</span>}
                              {/* Azul do "lido" precisa contrastar com a bolha CLARA
                                  de saída — o sky-300 anterior sumia no verde. */}
                              {!isIn && message.status === 'READ' && <span className="chat-tick-read text-[11px] font-semibold" title="Lido">✓✓</span>}
                              {!isIn && message.status === 'FAILED' && (
                                <button
                                  onClick={() => handleRetry(message.id)}
                                  title={message.errorMessage || 'Falha no envio. Clique para tentar de novo.'}
                                  className="text-[11px] underline opacity-90 hover:opacity-100"
                                >
                                  falhou · reenviar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-border bg-card px-3 py-3 lg:px-4">
              <div className="mx-auto max-w-3xl">
                {/* Preview do anexo selecionado */}
                {file && (
                  <div className="mb-2.5 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
                    {filePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={filePreview} alt="Pré-visualização" className="h-14 w-14 rounded object-cover" />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded bg-muted">
                        <Paperclip className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · legenda opcional abaixo</p>
                    </div>
                    <button onClick={clearFile} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted" aria-label="Remover anexo">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {/* Gravação / preview do áudio */}
                {recording && (
                  <div className="mb-2.5 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2">
                    <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                    <span className="flex-1 text-sm text-foreground">Gravando áudio…</span>
                    <button onClick={stopRecording} className="rounded-md bg-primary px-3 py-1 text-sm text-white hover:opacity-90">Parar</button>
                    <button onClick={cancelRecording} className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
                  </div>
                )}
                {recordedUrl && !recording && (
                  <div className="mb-2.5 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
                    {/* Mesmo player da bolha: o WebM do MediaRecorder também chega
                        sem duração no cabeçalho, então o `<audio>` nativo mostrava
                        barra quebrada e cortava a prévia antes do fim. */}
                    <AudioMessagePlayer
                      src={recordedUrl}
                      mimeType={recordedBlob?.type.split(';')[0] || 'audio/webm'}
                      sizeBytes={recordedBlob?.size ?? null}
                      fileName="nota-de-voz"
                      className="mb-0 flex-1"
                    />
                    <button onClick={sendRecording} disabled={sending} className="rounded-md bg-primary px-3 py-1 text-sm text-white hover:opacity-90 disabled:opacity-50">
                      {sending ? 'Enviando…' : 'Enviar áudio'}
                    </button>
                    <button onClick={cancelRecording} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted" aria-label="Descartar áudio">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {fileError && <p className="mb-2 text-sm text-destructive">{fileError}</p>}
                {sendError && <p className="mb-2 text-sm text-destructive">{sendError}</p>}

                {/* Mensagens rápidas — linha compacta, rolando na horizontal. */}
                {quickReplies.length > 0 && !file && !recordedUrl && (
                  <div className="scrollbar-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
                    {quickReplies.map((quickReply) => (
                      <button
                        key={quickReply.id}
                        type="button"
                        onClick={() => setNewMessage(quickReply.content || quickReply.message)}
                        className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {quickReply.title}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input ref={fileInputRef} type="file" accept={CLIENT_ACCEPT_ATTR} className="hidden" onChange={onPickFile} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || recording || !!recordedUrl}
                    title="Anexar imagem ou documento"
                    aria-label="Anexar imagem ou documento"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={sending || !!file || !!recordedUrl}
                    title={recording ? 'Parar gravação' : 'Gravar áudio'}
                    aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition-colors disabled:opacity-50',
                      recording
                        ? 'border-destructive/40 bg-destructive/10 text-destructive'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  <Textarea
                    ref={composerRef}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={file ? undefined : handleKeyDown}
                    placeholder={file ? 'Legenda (opcional)…' : 'Escreva uma mensagem…  (Enter envia, Shift+Enter quebra a linha)'}
                    className="max-h-40 min-h-[40px] flex-1 resize-none py-2.5"
                    rows={1}
                  />
                  <button
                    type="button"
                    onClick={file ? handleSendMedia : handleSendMessage}
                    disabled={sending || (!file && !newMessage.trim())}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">{sending ? 'Enviando…' : file ? 'Enviar arquivo' : 'Enviar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-muted/30 px-6">
            <div className="max-w-sm text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10">
                <MessageCircle className="h-7 w-7 text-primary" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Selecione uma conversa</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Escolha alguém na lista para responder, agendar uma consulta ou mandar o lead para o funil.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* -------------------------------------------- Painel do contato (xl) */}
      {selectedConversation && infoOpen && (
        <aside className="scrollbar-thin hidden w-[300px] shrink-0 overflow-y-auto border-l border-border bg-card px-4 py-4 xl:block">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</h3>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Nome</p>
              <p className="font-medium text-foreground">
                {selectedConversation.contact?.name || 'Sem nome'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Telefone</p>
              <p className="text-foreground">{selectedConversation.contact?.phone || 'não informado'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Canal de entrada</p>
              <div className="mt-0.5">
                <ChannelBadge channel={selectedConversation.channel} accountLabel={selectedConversation.account?.label} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cadastro</p>
              {selectedConversation.patientId ? (
                <a
                  href={`/pacientes/${selectedConversation.patientId}`}
                  className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <User className="h-3.5 w-3.5" />
                  Abrir ficha do paciente
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ainda não é paciente. O primeiro agendamento cria o cadastro e vincula a esta conversa.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atalhos</h3>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href="/agenda"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Ver a Agenda
              </a>
              <a
                href="/crm"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Ver o funil no CRM
              </a>
            </div>
          </div>
        </aside>
      )}

      {/* ------------------------------------------------------ Nova conversa */}
      <Drawer
        open={newConvOpen}
        onClose={() => setNewConvOpen(false)}
        title="Nova conversa"
        description="Abre uma thread com um contato pelo número de WhatsApp."
        width="max-w-md"
      >
        <form onSubmit={createConversation} className="space-y-4">
          <div>
            <label htmlFor="nc-nome" className="mb-1 block text-xs font-medium text-foreground">
              Nome do contato *
            </label>
            <Input
              id="nc-nome"
              className="w-full"
              value={newConv.contactName}
              onChange={(e) => setNewConv({ ...newConv, contactName: e.target.value })}
              required
            />
          </div>
          <div>
            <label htmlFor="nc-tel" className="mb-1 block text-xs font-medium text-foreground">
              Telefone com DDD *
            </label>
            <Input
              id="nc-tel"
              className="w-full"
              placeholder="11999998888"
              value={newConv.contactPhone}
              onChange={(e) => setNewConv({ ...newConv, contactPhone: e.target.value })}
              required
            />
          </div>
          {newConvError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{newConvError}</p>
          )}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setNewConvOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creatingConv}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {creatingConv ? 'Criando…' : 'Criar conversa'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
