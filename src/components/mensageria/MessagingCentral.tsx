'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
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
  Bell,
  Settings,
  Reply,
  Smile,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { contactLabel } from '@/lib/messaging/contact-label';
import { EditableContactPhone } from './EditableContactPhone';
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
import { NewQuoteFromConversation } from '@/components/mensageria/NewQuoteFromConversation';
import { ConversationTasks } from '@/components/mensageria/ConversationTasks';
import { EmojiButton } from '@/components/mensageria/EmojiButton';
import { MarkDealLost } from '@/components/mensageria/MarkDealLost';
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
  nextTaskDueAt?: string | null;
  nextTaskOverdue?: boolean;
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
  /** "Respondendo a" — preview mínimo da mensagem citada; null quando não é resposta. */
  replyTo?: {
    id: string;
    content: string;
    caption: string | null;
    messageType: string;
    direction?: 'INCOMING' | 'OUTGOING';
    attachment?: { id: string; mimeType: string } | null;
  } | null;
}

interface WhatsAppQuickReply {
  id: string;
  title: string;
  message: string;
  content?: string;
  keyword?: string | null;
  isActive?: boolean;
  hasAttachment?: boolean;
  attachments?: { id: string; fileName: string; mimeType: string; sizeBytes: number | null; caption: string | null }[];
}

/** Um anexo na fila do composer, ainda não enviado — `file` já pronto pro POST multipart. */
interface PendingAttachment {
  key: string;
  file: File;
  caption: string;
  previewUrl: string | null;
}

interface MessagingCentralProps {
  onMessageSend?: (message: string, conversationId: string) => void;
}

const REPLY_MEDIA_LABEL: Record<string, string> = { IMAGE: '📷 Imagem', AUDIO: '🎤 Áudio', VIDEO: '🎬 Vídeo', DOCUMENT: '📎 Documento' };

/** Texto curto pro preview de "respondendo a" — legenda/texto, ou o rótulo do tipo de mídia. */
function replySnippet(m: { content: string; caption?: string | null; messageType?: string | null }) {
  const texto = m.caption || m.content;
  if (m.messageType && m.messageType !== 'TEXT' && REPLY_MEDIA_LABEL[m.messageType]) {
    return m.caption ? `${REPLY_MEDIA_LABEL[m.messageType]} · ${m.caption}` : REPLY_MEDIA_LABEL[m.messageType];
  }
  return texto;
}

/** Barrinha de preview "respondendo a" — usada acima do composer e dentro da bolha citante. */
function QuotedPreview({ quoted, onCancel }: { quoted: { content: string; caption?: string | null; messageType?: string | null; direction?: 'INCOMING' | 'OUTGOING' }; onCancel?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border-l-4 border-primary bg-primary/5 px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-primary">{quoted.direction === 'INCOMING' ? 'Paciente' : 'Você'}</p>
        <p className="truncate text-xs text-muted-foreground">{replySnippet(quoted)}</p>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Cancelar resposta">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
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
  // Atalho "/palavra" no composer (padrão WhatsApp Business) — substituiu os
  // botões de clique: menos poluição visual, mais rápido pra quem já sabe a
  // palavra-chave de cor.
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
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
  // Mídia (imagem/documento) — fila: dá pra anexar/enviar mais de um arquivo
  // de uma vez (é o que uma mensagem pronta com várias imagens precisa), cada
  // um com a própria legenda.
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  // "Responder": mensagem citada, igual ao "swipe to reply" do WhatsApp — some
  // ao trocar de conversa (contexto errado) ou depois do envio.
  const [replyTarget, setReplyTarget] = useState<WhatsAppMessage | null>(null);
  // Arrastar-e-soltar: overlay visual enquanto o arquivo paira sobre a
  // conversa. Contador (não boolean) porque dragenter/dragleave disparam em
  // CADA filho do painel — um boolean simples pisca o overlay a cada pixel.
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);
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

  // Chegada pelo CRM: /mensageria?conversa=<id> abre a thread daquele lead.
  // Sem isto o cartão do funil só conseguia jogar o atendente na lista, para ele
  // procurar de novo a pessoa que acabou de clicar.
  useEffect(() => {
    const alvo = new URLSearchParams(window.location.search).get('conversa');
    if (alvo) setSelectedId(alvo);
  }, []);

  // Troca de conversa: carrega a thread e desce para a última mensagem.
  useEffect(() => {
    setReplyTarget(null); // contexto de resposta é desta conversa — não segue pra outra
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

  // "/" no INÍCIO do campo, sem espaço ainda: modo comando. Some assim que o
  // texto deixa de bater nesse formato (ex.: depois de escolher e editar).
  const slashQuery = /^\/[a-z0-9_-]*$/i.test(newMessage) ? newMessage.slice(1).toLowerCase() : null;
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    return quickReplies.filter((qr) => qr.keyword && qr.keyword.toLowerCase().startsWith(slashQuery));
  }, [quickReplies, slashQuery]);
  const slashOpen = slashQuery !== null && slashMatches.length > 0;

  useEffect(() => { setSlashActiveIndex(0); }, [slashQuery]);

  // Rede de segurança: se o arquivo for solto um pixel fora da área da
  // conversa (ex.: em cima da lista de conversas), o padrão do navegador é
  // abrir a imagem na aba — perde a tela inteira. Isso barra em qualquer
  // ponto da página; o drop DENTRO da conversa já é tratado (e some daqui
  // por já ter sido interceptado antes de borbulhar).
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

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

  /** Uma mensagem de texto isolada — usada tanto sozinha quanto depois da fila de anexos. */
  async function sendTextMessage(texto: string): Promise<boolean> {
    if (!selectedConversation) return false;
    try {
      const response = await fetch('/api/mensageria/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // A conta de saída é resolvida no servidor a partir da conversa —
          // o cliente não escolhe por qual número a clínica responde.
          conversationId: selectedConversation.id,
          type: 'TEXT',
          content: texto,
          replyToMessageId: replyTarget?.id,
        }),
      });
      if (!response.ok) {
        const er = await response.json().catch(() => ({}));
        setSendError(er.error || 'Falha ao enviar a mensagem');
        return false;
      }
      await loadMessages(selectedConversation.id);
      if (onMessageSend) onMessageSend(texto, selectedConversation.id);
      return true;
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      setSendError('Falha de rede ao enviar a mensagem');
      return false;
    }
  }

  const addFilesToQueue = (files: File[]) => {
    setFileError(null);
    setSendError(null);
    const novos: PendingAttachment[] = [];
    for (const f of files) {
      const v = clientValidateFile({ type: f.type, name: f.name, size: f.size });
      if (!v.ok) { setFileError(`${f.name}: ${v.error || 'arquivo inválido'}`); continue; }
      novos.push({
        key: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file: f,
        caption: '',
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      });
    }
    if (novos.length) setAttachments((prev) => [...prev, ...novos]);
  };

  // Arrastar-e-soltar sobre a conversa inteira (não só o composer) — colar
  // uma imagem tem que funcionar de onde o mouse estiver, sem procurar um
  // alvo exato. `preventDefault` no dragOver é OBRIGATÓRIO: sem ele o
  // navegador recusa o drop (e em muitos casos navega pra própria imagem).
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (recording || !!recordedUrl) return; // gravando/revisando áudio: sem anexo por cima
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    if (recording || !!recordedUrl) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) addFilesToQueue(files);
  };

  /**
   * Colar (Ctrl+V) imagem copiada — print de tela, imagem de outro app/aba.
   * Só intercepta quando o clipboard TEM arquivo; colar texto continua normal.
   */
  const onPasteComposer = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      addFilesToQueue(files);
    }
  };

  /** Insere no ponto do cursor (não só no fim) — comum digitar, abrir o emoji, continuar. */
  const insertEmoji = (emoji: string) => {
    const el = composerRef.current;
    if (!el) { setNewMessage((m) => m + emoji); return; }
    const start = el.selectionStart ?? newMessage.length;
    const end = el.selectionEnd ?? newMessage.length;
    const next = newMessage.slice(0, start) + emoji + newMessage.slice(end);
    setNewMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFilesToQueue(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = ''; // permite escolher o mesmo arquivo de novo depois
  };

  const removeAttachment = (key: string) => {
    setAttachments((prev) => {
      const alvo = prev.find((a) => a.key === key);
      if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl);
      return prev.filter((a) => a.key !== key);
    });
  };

  const setAttachmentCaption = (key: string, caption: string) => {
    setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, caption } : a)));
  };

  const clearAttachments = () => {
    attachments.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
    setAttachments([]);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Escolher uma mensagem pronta: preenche o texto e, se ela tiver anexos,
   * baixa cada um já salvo (com a legenda cadastrada) e entra na MESMA fila
   * do composer — o atendente ainda revisa (e pode editar legenda/remover
   * item) e clica em enviar, igual a qualquer anexo manual.
   */
  async function pickQuickReply(qr: WhatsAppQuickReply) {
    setNewMessage(qr.content || qr.message || '');
    composerRef.current?.focus();
    if (!qr.attachments?.length) return;
    try {
      const baixados = await Promise.all(
        qr.attachments.map(async (a) => {
          const res = await fetch(`/api/mensageria/quick-replies/${qr.id}/attachments/${a.id}`);
          if (!res.ok) return null;
          const blob = await res.blob();
          const f = new File([blob], a.fileName, { type: a.mimeType || blob.type });
          const item: PendingAttachment = {
            key: `${Date.now()}_${Math.random().toString(36).slice(2)}_${a.id}`,
            file: f,
            caption: a.caption || '',
            previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
          };
          return item;
        })
      );
      const ok = baixados.filter((x): x is PendingAttachment => x !== null);
      if (ok.length < qr.attachments.length) setFileError('Alguns anexos desta mensagem não puderam ser carregados.');
      if (ok.length) setAttachments((prev) => [...prev, ...ok]);
    } catch {
      setFileError('Falha de rede ao carregar os anexos desta mensagem.');
    }
  }

  /**
   * Envio único: texto sozinho OU fila de anexos (cada um vira uma mensagem
   * de mídia própria, na ordem, com a própria legenda) seguida do texto
   * solto, se sobrar algo digitado. Trava por sendingRef: sem ela, cada
   * Enter/clique durante os 1-2s de resposta do provedor era UMA mensagem a
   * mais chegando no paciente.
   */
  const handleSend = async () => {
    const texto = newMessage.trim();
    if (!selectedConversation || sendingRef.current || (!texto && attachments.length === 0)) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    nearBottomRef.current = true;

    try {
      if (attachments.length > 0) {
        // Fila de mídia primeiro. Uma falha no meio para o envio e deixa o
        // restante (a partir dali) na fila para o atendente tentar de novo —
        // o que já saiu não precisa ser reenviado.
        for (const item of attachments) {
          const fd = new FormData();
          fd.append('file', item.file);
          fd.append('conversationId', selectedConversation.id);
          const legenda = item.caption.trim();
          if (legenda) fd.append('caption', legenda);
          if (replyTarget) fd.append('replyToMessageId', replyTarget.id);
          const res = await fetch('/api/mensageria/messages/media', { method: 'POST', body: fd });
          if (!res.ok) {
            const er = await res.json().catch(() => ({}));
            setSendError(er.error || `Falha ao enviar ${item.file.name}`);
            return;
          }
          removeAttachment(item.key);
          await loadMessages(selectedConversation.id);
        }
        if (texto) {
          setNewMessage('');
          if (!(await sendTextMessage(texto))) setNewMessage(texto);
        }
        setReplyTarget(null);
      } else {
        // Limpa o campo AGORA: sem retorno visual imediato o atendente aperta
        // Enter de novo. Se o envio falhar, o texto volta — nada se perde.
        setNewMessage('');
        if (await sendTextMessage(texto)) setReplyTarget(null);
        else setNewMessage(texto);
      }
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
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashActiveIndex((i) => Math.min(i + 1, slashMatches.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashActiveIndex((i) => Math.max(i - 1, 0)); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault();
        pickQuickReply(slashMatches[slashActiveIndex]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Telefone informado à mão reflete na lista e no cabeçalho sem recarregar. */
  const applyPhone = (contactId: string, fone: string | null) => {
    setConversations((prev) =>
      prev.map((c) => (c.contact?.id === contactId ? { ...c, contact: { ...c.contact!, phone: fone } } : c))
    );
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
                        {(contactLabel(conversation.contact?.name, conversation.contact?.phone).trim()[0] || '?').toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn('truncate text-sm', conversation.unreadCount ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                            {contactLabel(conversation.contact?.name, conversation.contact?.phone)}
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
                          {conversation.nextTaskDueAt && (
                            <span
                              title={`Tarefa ${conversation.nextTaskOverdue ? 'vencida' : 'pendente'} · ${new Date(conversation.nextTaskDueAt).toLocaleDateString('pt-BR')}`}
                              className={cn(
                                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                conversation.nextTaskOverdue ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
                              )}
                            >
                              <Bell className="h-2.5 w-2.5" /> Tarefa
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
      <section
        className={cn('relative flex min-w-0 flex-1 flex-col', !selectedId && 'hidden md:flex')}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-primary/10 backdrop-blur-[1px]">
            <div className="rounded-xl border-2 border-dashed border-primary bg-card px-6 py-4 text-center shadow-popover">
              <Paperclip className="mx-auto h-6 w-6 text-primary" />
              <p className="mt-1.5 text-sm font-medium text-foreground">Solte para anexar</p>
              <p className="text-xs text-muted-foreground">Imagem ou documento</p>
            </div>
          </div>
        )}
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
                  {(contactLabel(selectedConversation.contact?.name, selectedConversation.contact?.phone).trim()[0] || '?').toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  {selectedConversation.contact?.id ? (
                    <EditableContactName
                      contactId={selectedConversation.contact.id}
                      value={contactLabel(selectedConversation.contact.name, selectedConversation.contact.phone)}
                      fallback={selectedConversation.contact.phone}
                      onSaved={(nome) => applyRename(selectedConversation.contact!.id!, nome)}
                    />
                  ) : (
                    <h3 className="truncate text-base font-semibold text-foreground">
                      {contactLabel(selectedConversation.contact?.name, selectedConversation.contact?.phone)}
                    </h3>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {/* Sem telefone NÃO é defeito do cadastro: o WhatsApp esconde o
                          número de quem escreve (@lid) e a resposta sai pela conversa
                          do mesmo jeito. "sem telefone" fazia o atendente achar que
                          estava travado. */}
                      {selectedConversation.contact?.phone || 'número não enviado pelo WhatsApp'}
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
                <NewQuoteFromConversation
                  patientId={selectedConversation.patientId}
                  contactName={selectedConversation.contact?.name}
                />
                <ConversationTasks
                  conversationId={selectedConversation.id}
                  patientId={selectedConversation.patientId}
                />
                <SendToPipeline conversationId={selectedConversation.id} />
                {/* Perdido também mora aqui: quem descobre o motivo é quem está
                    conversando, e obrigar a abrir o CRM é o que faz a perda
                    nunca ser registrada. */}
                <MarkDealLost conversationId={selectedConversation.id} />
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
                        <div className={cn('group flex items-center gap-1', isIn ? 'justify-start' : 'justify-end')}>
                          {/* Responder: só aparece no hover (padrão WhatsApp) — some no
                              lugar errado da tela seria ruído em toda mensagem sempre visível. */}
                          {!isIn && (
                            <button
                              onClick={() => { setReplyTarget(message); composerRef.current?.focus(); }}
                              title="Responder"
                              aria-label="Responder"
                              className="shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <div
                            className={cn(
                              'max-w-[85%] rounded-xl px-3 py-2 shadow-sm sm:max-w-md',
                              isIn ? 'chat-bubble-in rounded-tl-sm' : 'chat-bubble-out rounded-tr-sm'
                            )}
                            // A procedência sai do visual mas continua acessível: numa
                            // thread de um só canal a etiqueta em cada bolha era ruído.
                            title={provenanceTitle(message)}
                          >
                            {message.replyTo && (
                              <div className="mb-1.5">
                                <QuotedPreview quoted={message.replyTo} />
                              </div>
                            )}
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
                          {isIn && (
                            <button
                              onClick={() => { setReplyTarget(message); composerRef.current?.focus(); }}
                              title="Responder"
                              aria-label="Responder"
                              className="shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                          )}
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
                {/* "Respondendo a" — mesma ideia do swipe-to-reply do WhatsApp. */}
                {replyTarget && (
                  <div className="mb-2.5">
                    <QuotedPreview quoted={replyTarget} onCancel={() => setReplyTarget(null)} />
                  </div>
                )}
                {/* Fila de anexos — um ou vários, cada um com a própria legenda. */}
                {attachments.length > 0 && (
                  <div className="mb-2.5 space-y-2">
                    {attachments.map((att) => (
                      <div key={att.key} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
                        {att.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={att.previewUrl} alt="Pré-visualização" className="h-14 w-14 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="grid h-14 w-14 shrink-0 place-items-center rounded bg-muted">
                            <Paperclip className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate text-sm font-medium text-foreground">{att.file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(att.file.size)}</p>
                          <Input
                            value={att.caption}
                            onChange={(e) => setAttachmentCaption(att.key, e.target.value)}
                            placeholder="Legenda desta imagem (opcional)"
                            className="h-7 w-full text-xs"
                          />
                        </div>
                        <button onClick={() => removeAttachment(att.key)} className="grid h-8 w-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted" aria-label="Remover anexo">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {attachments.length > 1 && (
                      <button type="button" onClick={clearAttachments} className="text-xs text-muted-foreground underline hover:text-foreground">
                        Remover todos
                      </button>
                    )}
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

                <div className="flex items-end gap-2">
                  <input ref={fileInputRef} type="file" accept={CLIENT_ACCEPT_ATTR} multiple className="hidden" onChange={onPickFile} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || recording || !!recordedUrl}
                    title="Anexar imagem ou documento (pode escolher mais de um)"
                    aria-label="Anexar imagem ou documento"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={sending || attachments.length > 0 || !!recordedUrl}
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
                  <EmojiButton onSelect={insertEmoji} />
                  <Link
                    href="/mensageria/mensagens-prontas"
                    title="Mensagens prontas"
                    aria-label="Mensagens prontas"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>

                  {/* Atalho "/palavra": digitar "/" no início do campo abre a
                      lista de mensagens prontas cujo keyword bate com o que já
                      foi digitado — mesmo padrão do WhatsApp Business. */}
                  <div className="relative min-w-0 flex-1">
                    {slashOpen && (
                      <div className="absolute bottom-full left-0 z-10 mb-2 w-full max-w-sm overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-popover">
                        {slashMatches.map((qr, i) => (
                          <button
                            key={qr.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); pickQuickReply(qr); }}
                            className={cn(
                              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                              i === slashActiveIndex ? 'bg-muted' : 'hover:bg-muted'
                            )}
                          >
                            <code className="shrink-0 text-xs text-primary">/{qr.keyword}</code>
                            <span className="truncate text-muted-foreground">{qr.title}</span>
                            {qr.hasAttachment && <Paperclip className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />}
                          </button>
                        ))}
                      </div>
                    )}
                    <Textarea
                      ref={composerRef}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={attachments.length > 0 ? undefined : handleKeyDown}
                      onPaste={onPasteComposer}
                      placeholder={attachments.length > 0 ? 'Mensagem de texto separada (opcional)…' : 'Escreva uma mensagem…  (Enter envia · "/" chama mensagem pronta · Ctrl+V cola imagem)'}
                      className="max-h-40 min-h-[40px] w-full resize-none py-2.5"
                      rows={1}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || (attachments.length === 0 && !newMessage.trim())}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {sending ? 'Enviando…' : attachments.length > 1 ? `Enviar (${attachments.length})` : attachments.length === 1 ? 'Enviar arquivo' : 'Enviar'}
                    </span>
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
                {contactLabel(selectedConversation.contact?.name, selectedConversation.contact?.phone)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Telefone</p>
              {selectedConversation.contact?.id ? (
                <EditableContactPhone
                  contactId={selectedConversation.contact.id}
                  value={selectedConversation.contact.phone}
                  onSaved={(fone) => applyPhone(selectedConversation.contact!.id!, fone)}
                />
              ) : (
                <p className="text-muted-foreground">não informado</p>
              )}
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
              placeholder="11 99999-8888"
              value={newConv.contactPhone}
              onChange={(e) => setNewConv({ ...newConv, contactPhone: e.target.value })}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              DDI 55 é assumido. Para número de fora do Brasil, escreva com +DDI (ex.: +1 305 555 0134).
            </p>
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
