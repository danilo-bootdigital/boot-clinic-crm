'use client';

import { useState, useEffect } from 'react';

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

interface WhatsAppMessage {
  id: string;
  conversationId: string;
  content: string;
  direction?: 'INCOMING' | 'OUTGOING';
  isFromPatient: boolean;
  createdAt: string;
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

  const loadConversations = async () => {
    try {
      setLoading(true);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Lista de Conversas */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Conversas</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                  selectedConversation?.id === conversation.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                      {conversation.contact?.name?.charAt(0) || '?'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {conversation.contact?.name || conversation.contact?.phone}
                      </h3>
                      <span className="text-xs text-gray-500">
                        {conversation.lastMessageAt && new Date(conversation.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {conversation.lastMessage || conversation.messages?.[0]?.content}
                    </p>
                    {conversation.patient && (
                      <div className="mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
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
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                    {selectedConversation.contact?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {selectedConversation.contact?.name || selectedConversation.contact?.phone}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedConversation.contact?.phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                    selectedConversation.status === 'OPEN' ? 'bg-green-100 text-green-800' :
                    selectedConversation.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedConversation.status}
                  </span>
                  <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                    Transferir
                  </button>
                </div>
              </div>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.direction === 'INCOMING' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.direction === 'INCOMING'
                          ? 'bg-white text-gray-900 border border-gray-200'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-75 mt-1">
                        {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Painel Lateral com Dados do Paciente */}
            {patientData && (
              <div className="w-80 bg-white border-l border-gray-200 p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Informações do Paciente</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Nome</label>
                    <p className="text-sm text-gray-900">{patientData.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">CPF</label>
                    <p className="text-sm text-gray-900">{patientData.cpf}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Telefone</label>
                    <p className="text-sm text-gray-900">{patientData.phone}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">E-mail</label>
                    <p className="text-sm text-gray-900">{patientData.email || 'Não informado'}</p>
                  </div>
                  <button className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Criar Nova Consulta
                  </button>
                </div>
              </div>
            )}

            {/* Área de Envio de Mensagens */}
            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-end space-x-3">
                <div className="flex-1">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Digite sua mensagem..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={2}
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>

              {/* Mensagens Rápidas */}
              {quickReplies.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-gray-600 mb-2">Mensagens Rápidas:</p>
                  <div className="flex flex-wrap gap-2">
                    {quickReplies.map((quickReply) => (
                      <button
                        key={quickReply.id}
                        onClick={() => handleQuickReply(quickReply.content || quickReply.message)}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
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
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Selecione uma conversa</h3>
              <p className="text-gray-600">Escolha uma conversa para começar a conversar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}