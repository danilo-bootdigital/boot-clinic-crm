'use client';

import { useState, useEffect, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { clientValidateFile, formatBytes, CLIENT_ACCEPT_ATTR } from '@/lib/whatsapp/media-client';
import { WhatsAppMediaBubble } from '@/components/whatsapp/WhatsAppMediaBubble';

interface WhatsAppConversation {
  id: string;
  patientId: string;
  patientName: string;
  contactId?: string;
  instanceId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  status: string;
  contact?: { name: string; phone: string };
  messages?: WhatsAppMessage[];
  patient?: { name: string };
}

interface WhatsAppAttachment {
  id: string;
  mimeType: string;
  sizeBytes?: number | null;
  originalFileName?: string | null;
}

interface WhatsAppMessage {
  id: string;
  conversationId: string;
  content: string;
  caption?: string | null;
  messageType?: string | null;
  mediaStatus?: string | null;
  status?: string;
  direction?: 'INCOMING' | 'OUTGOING';
  isFromPatient: boolean;
  createdAt: string;
  attachment?: WhatsAppAttachment | null;
}

interface WhatsAppContact {
  id: string;
  name: string;
  phone: string;
}

interface WhatsAppQuickReply {
  id: string;
  title: string;
  message: string;
  content?: string;
  isActive?: boolean;
}

interface WhatsAppCentralProps {
  onMessageSend?: (message: string, conversationId: string) => void;
}

export default function WhatsAppCentral({ onMessageSend }: WhatsAppCentralProps) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [quickReplies, setQuickReplies] = useState<WhatsAppQuickReply[]>([]);
  const [patientData, setPatientData] = useState<any>(null);
  // Mídia (imagem/documento)
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Gravação de áudio (nota de voz)
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Carregar conversas
  useEffect(() => {
    loadConversations();
    loadQuickReplies();
  }, []);

  // Carregar mensagens quando conversa for selecionada
  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
      loadPatientData(selectedConversation.patientId);
    }
  }, [selectedConversation]);

  // Tempo real (polling estável p/ Vercel): atualiza a lista de conversas e a conversa
  // aberta sem refresh manual. Silencioso (não pisca o loading). Inbound novo aparece aqui.
  useEffect(() => {
    const id = setInterval(() => {
      loadConversations(true);
      if (selectedConversation) loadMessages(selectedConversation.id);
    }, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation]);

  const loadConversations = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch('/api/whatsapp/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/messages?conversationId=${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    }
  };

  const loadPatientData = async (patientId?: string) => {
    if (!patientId) {
      setPatientData(null);
      return;
    }

    try {
      // TODO: Implementar API para buscar paciente por ID
      // Por enquanto, vamos apenas armazenar o ID
      setPatientData({ id: patientId, name: 'Carregando...' });
    } catch (error) {
      console.error('Erro ao carregar dados do paciente:', error);
      setPatientData(null);
    }
  };

  const loadQuickReplies = async () => {
    try {
      const response = await fetch('/api/whatsapp/quick-replies');
      if (response.ok) {
        const data = await response.json();
        setQuickReplies(data.filter((qr: WhatsAppQuickReply) => qr.isActive));
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens rápidas:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      const response = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          contactId: selectedConversation.contactId,
          instanceId: selectedConversation.instanceId,
          type: 'TEXT',
          content: newMessage,
        }),
      });

      if (response.ok) {
        setNewMessage('');
        await loadMessages(selectedConversation.id);

        // Notificar callback se existir
        if (onMessageSend) {
          onMessageSend(newMessage, selectedConversation.id);
        }
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };

  const handleQuickReply = (content: string) => {
    setNewMessage(content);
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
    if (!file || !selectedConversation || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('conversationId', selectedConversation.id);
      if (newMessage.trim()) fd.append('caption', newMessage.trim());
      const res = await fetch('/api/whatsapp/messages/media', { method: 'POST', body: fd });
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
      setSending(false);
    }
  };

  const handleRetry = async (messageId: string) => {
    const res = await fetch(`/api/whatsapp/messages/${messageId}/retry`, { method: 'POST' });
    if (res.ok && selectedConversation) await loadMessages(selectedConversation.id);
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
    if (!recordedBlob || !selectedConversation || sending) return;
    setSending(true); setSendError(null);
    try {
      const ext = (recordedBlob.type.split(';')[0].split('/')[1] || 'webm');
      const fd = new FormData();
      fd.append('file', new File([recordedBlob], `nota-de-voz.${ext}`, { type: recordedBlob.type.split(';')[0] || 'audio/webm' }));
      fd.append('conversationId', selectedConversation.id);
      const res = await fetch('/api/whatsapp/messages/media', { method: 'POST', body: fd });
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
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-muted">
      {/* Lista de Conversas */}
      <div className="w-1/3 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">Conversas</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={`p-4 border-b border-border cursor-pointer hover:bg-muted ${
                  selectedConversation?.id === conversation.id ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-medium">
                      {conversation.contact?.name?.charAt(0) || '?'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-foreground truncate">
                        {conversation.contact?.name || conversation.contact?.phone}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {conversation.lastMessageAt && new Date(conversation.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {conversation.lastMessage || conversation.messages?.[0]?.content}
                    </p>
                    {conversation.patient && (
                      <div className="mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/15 text-success">
                          Paciente: {conversation.patient.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Área de Chat */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Cabeçalho da Conversa */}
            <div className="p-4 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-medium">
                    {selectedConversation.contact?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-foreground">
                      {selectedConversation.contact?.name || selectedConversation.contact?.phone}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedConversation.contact?.phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                    selectedConversation.status === 'OPEN' ? 'bg-success/15 text-success' :
                    selectedConversation.status === 'PENDING' ? 'bg-warning/15 text-warning' :
                    'bg-muted text-foreground'
                  }`}>
                    {selectedConversation.status}
                  </span>
                  <button className="px-3 py-1 text-sm bg-primary text-white rounded hover:bg-primary/90">
                    Transferir
                  </button>
                </div>
              </div>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 bg-muted">
              <div className="space-y-4">
                {messages.map((message) => {
                  const isIn = message.direction === 'INCOMING';
                  const isMedia = message.messageType === 'IMAGE' || message.messageType === 'DOCUMENT' || message.messageType === 'AUDIO';
                  const showCaption = message.caption || (!isMedia && message.content);
                  return (
                    <div key={message.id} className={`flex ${isIn ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          isIn ? 'bg-card text-foreground border border-border' : 'bg-primary text-white'
                        }`}
                      >
                        {isMedia && (
                          <WhatsAppMediaBubble
                            messageType={message.messageType as 'IMAGE' | 'DOCUMENT' | 'AUDIO'}
                            mediaStatus={message.mediaStatus}
                            attachment={message.attachment}
                            dark={!isIn}
                          />
                        )}
                        {showCaption && <p className="text-sm whitespace-pre-wrap break-words">{message.caption || message.content}</p>}
                        <div className="mt-1 flex items-center justify-end gap-1.5">
                          <span className="text-xs opacity-75">
                            {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!isIn && message.status === 'PENDING' && <span className="text-xs opacity-75">· enviando…</span>}
                          {!isIn && message.status === 'FAILED' && (
                            <button onClick={() => handleRetry(message.id)} className="text-xs underline opacity-90 hover:opacity-100">falhou · reenviar</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Painel Lateral com Dados do Paciente */}
            {patientData && (
              <div className="w-80 bg-card border-l border-border p-4">
                <h3 className="text-lg font-medium text-foreground mb-4">Informações do Paciente</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">Nome</label>
                    <p className="text-sm text-foreground">{patientData.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">CPF</label>
                    <p className="text-sm text-foreground">{patientData.cpf}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Telefone</label>
                    <p className="text-sm text-foreground">{patientData.phone}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">E-mail</label>
                    <p className="text-sm text-foreground">{patientData.email || 'Não informado'}</p>
                  </div>
                  <button className="w-full px-3 py-2 bg-primary text-white rounded hover:bg-primary/90">
                    Criar Nova Consulta
                  </button>
                </div>
              </div>
            )}

            {/* Área de Envio de Mensagens */}
            <div className="p-4 bg-card border-t border-border">
              {/* Preview do anexo selecionado */}
              {file && (
                <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
                  {filePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={filePreview} alt="Pré-visualização" className="h-16 w-16 rounded object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded bg-muted text-2xl">📎</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                    <p className="text-xs text-muted-foreground">Adicione uma legenda abaixo (opcional).</p>
                  </div>
                  <button onClick={clearFile} className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted" title="Remover">✕</button>
                </div>
              )}
              {/* Gravação / preview do áudio */}
              {recording && (
                <div className="mb-3 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2">
                  <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                  <span className="flex-1 text-sm text-foreground">Gravando áudio…</span>
                  <button onClick={stopRecording} className="rounded-md bg-primary px-3 py-1 text-sm text-white hover:bg-primary/90">Parar</button>
                  <button onClick={cancelRecording} className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
                </div>
              )}
              {recordedUrl && !recording && (
                <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={recordedUrl} className="h-9 flex-1" />
                  <button onClick={sendRecording} disabled={sending} className="rounded-md bg-primary px-3 py-1 text-sm text-white hover:bg-primary/90 disabled:opacity-50">{sending ? 'Enviando…' : 'Enviar áudio'}</button>
                  <button onClick={cancelRecording} className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted" title="Descartar">✕</button>
                </div>
              )}
              {fileError && <p className="mb-2 text-sm text-destructive">{fileError}</p>}
              {sendError && <p className="mb-2 text-sm text-destructive">{sendError}</p>}

              <div className="flex items-end space-x-3">
                <input ref={fileInputRef} type="file" accept={CLIENT_ACCEPT_ATTR} className="hidden" onChange={onPickFile} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || recording || !!recordedUrl}
                  title="Anexar imagem ou documento"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-lg hover:bg-muted disabled:opacity-50"
                >
                  📎
                </button>
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={sending || !!file || !!recordedUrl}
                  title={recording ? 'Parar gravação' : 'Gravar áudio'}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-lg disabled:opacity-50 ${recording ? 'border-destructive/40 bg-destructive/10' : 'border-border hover:bg-muted'}`}
                >
                  🎤
                </button>
                <div className="flex-1">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={file ? undefined : handleKeyPress}
                    placeholder={file ? 'Legenda (opcional)…' : 'Digite sua mensagem...'}
                    className="w-full resize-none"
                    rows={2}
                  />
                </div>
                <button
                  onClick={file ? handleSendMedia : handleSendMessage}
                  disabled={sending || (!file && !newMessage.trim())}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {sending ? 'Enviando…' : file ? 'Enviar arquivo' : 'Enviar'}
                </button>
              </div>

              {/* Mensagens Rápidas */}
              {quickReplies.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground mb-2">Mensagens Rápidas:</p>
                  <div className="flex flex-wrap gap-2">
                    {quickReplies.map((quickReply) => (
                      <button
                        key={quickReply.id}
                        onClick={() => handleQuickReply(quickReply.content || quickReply.message)}
                        className="px-3 py-1 text-sm bg-muted text-foreground rounded hover:bg-muted"
                      >
                        {quickReply.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted">
            <div className="text-center">
              <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Selecione uma conversa</h3>
              <p className="text-muted-foreground">Escolha uma conversa para começar a conversar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}