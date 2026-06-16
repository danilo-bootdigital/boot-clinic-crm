'use client';

import { useState } from 'react';
import { formatPhone } from '@/lib/validations/patient';

interface Patient {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email?: string | null;
  status: string;
  origin: string;
  birthDate: string;
  gender: string;
  whatsapp?: string | null;
  createdAt: string;
  notes?: string | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
  createdBy?: { name: string };
  clinic?: { name: string };
  company?: { name: string };
  contacts?: Array<{ id: string; type: string; value: string }>;
  addresses?: Array<{ id: string; street: string; number?: string; complement?: string; district?: string; city: string; state: string; zipCode?: string; isMain?: boolean }>;
  documents?: Array<{ id: string; type: string; number: string; issuer?: string; issueDate?: string; expiryDate?: string }>;
  timelineEvents?: Array<{ id: string; title: string; content: string; type: string; createdAt: string; author?: { name: string } }>;
}

interface PatientDetailProps {
  patient: Patient;
  onEdit: (patient: Patient) => void;
}

export default function PatientDetail({ patient, onEdit }: PatientDetailProps) {
  const [activeTab, setActiveTab] = useState('info');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'INACTIVE':
        return 'bg-yellow-100 text-yellow-800';
      case 'ARCHIVED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getOriginLabel = (origin: string) => {
    switch (origin) {
      case 'GOOGLE':
        return 'Google';
      case 'FACEBOOK':
        return 'Facebook';
      case 'INSTAGRAM':
        return 'Instagram';
      case 'REFERRAL':
        return 'Indicação';
      case 'WALK_IN':
        return 'Passagem';
      case 'PHONE':
        return 'Telefone';
      case 'WHATSAPP':
        return 'WhatsApp';
      case 'OTHER':
        return 'Outro';
      default:
        return origin;
    }
  };

  const getContactTypeLabel = (type: string) => {
    switch (type) {
      case 'PHONE':
        return 'Telefone';
      case 'MOBILE':
        return 'Celular';
      case 'WHATSAPP':
        return 'WhatsApp';
      case 'EMAIL':
        return 'E-mail';
      case 'OTHER':
        return 'Outro';
      default:
        return type;
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    switch (type) {
      case 'RG':
        return 'RG';
      case 'CPF':
        return 'CPF';
      case 'CNH':
        return 'CNH';
      case 'PASSPORT':
        return 'Passaporte';
      case 'HEALTH_CARD':
        return 'Cartão de Saúde';
      case 'OTHER':
        return 'Outro';
      default:
        return type;
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow">
        {/* Cabeçalho */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
              <div className="mt-2 flex items-center space-x-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(patient.status)}`}>
                  {patient.status === 'ACTIVE' ? 'Ativo' :
                   patient.status === 'INACTIVE' ? 'Inativo' : 'Arquivado'}
                </span>
                <span className="text-sm text-gray-500">
                  Criado em: {new Date(patient.createdAt).toLocaleDateString('pt-BR')}
                </span>
                {patient.createdBy && (
                  <span className="text-sm text-gray-500">
                    Por: {patient.createdBy.name}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => onEdit(patient)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Editar Paciente
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('info')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'info'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Informações
            </button>
            <button
              onClick={() => setActiveTab('contacts')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'contacts'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Contatos
            </button>
            <button
              onClick={() => setActiveTab('addresses')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'addresses'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Endereços
            </button>
            <button
              onClick={() => activeTab === 'documents'}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'documents'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Documentos
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'timeline'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Timeline
            </button>
          </nav>
        </div>

        {/* Conteúdo das Abas */}
        <div className="p-6">
          {/* Informações Básicas */}
          {activeTab === 'info' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Dados Pessoais
                  </h3>
                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">CPF</dt>
                      <dd className="mt-1 text-sm text-gray-900">{patient.cpf}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Data de Nascimento</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {new Date(patient.birthDate).toLocaleDateString('pt-BR')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Sexo/Gênero</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {patient.gender === 'MALE' ? 'Masculino' :
                         patient.gender === 'FEMALE' ? 'Feminino' :
                         patient.gender === 'OTHER' ? 'Outro' : 'Prefere não informar'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Contato
                  </h3>
                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Telefone Principal</dt>
                      <dd className="mt-1 text-sm text-gray-900">{formatPhone(patient.phone)}</dd>
                    </div>
                    {patient.whatsapp && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">WhatsApp</dt>
                        <dd className="mt-1 text-sm text-gray-900">{formatPhone(patient.whatsapp)}</dd>
                      </div>
                    )}
                    {patient.email && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">E-mail</dt>
                        <dd className="mt-1 text-sm text-gray-900">{patient.email}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                  Informações da Clínica
                </h3>
                <dl className="mt-4 space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Origem</dt>
                    <dd className="mt-1 text-sm text-gray-900">{getOriginLabel(patient.origin)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Clínica</dt>
                    <dd className="mt-1 text-sm text-gray-900">{patient.clinic?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Empresa</dt>
                    <dd className="mt-1 text-sm text-gray-900">{patient.company?.name}</dd>
                  </div>
                </dl>
              </div>

              {patient.notes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Observações
                  </h3>
                  <div className="mt-2 text-sm text-gray-900 bg-gray-50 p-4 rounded-md">
                    {patient.notes}
                  </div>
                </div>
              )}

              {patient.tags && patient.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Tags
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {patient.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 text-sm font-medium rounded-full"
                        style={{ backgroundColor: tag.color ? `${tag.color}20` : '#e5e7eb', color: tag.color || '#374151' }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contatos */}
          {activeTab === 'contacts' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Contatos do Paciente</h3>
              {patient.contacts && patient.contacts.length > 0 ? (
                <div className="space-y-3">
                  {patient.contacts.map((contact, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {getContactTypeLabel(contact.type)}
                          </h4>
                          <p className="mt-1 text-sm text-gray-600">{contact.value}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Nenhum contato cadastrado</p>
              )}
            </div>
          )}

          {/* Endereços */}
          {activeTab === 'addresses' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Endereços do Paciente</h3>
              {patient.addresses && patient.addresses.length > 0 ? (
                <div className="space-y-3">
                  {patient.addresses.map((address, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          {address.isMain && (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                              Principal
                            </span>
                          )}
                          <h4 className="mt-2 font-medium text-gray-900">
                            {address.street}, {address.number || 's/n'}{address.complement ? ` - ${address.complement}` : ''}
                          </h4>
                          <p className="mt-1 text-sm text-gray-600">
                            {address.district}, {address.city} - {address.state}
                          </p>
                          <p className="mt-1 text-sm text-gray-600">{address.zipCode}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Nenhum endereço cadastrado</p>
              )}
            </div>
          )}

          {/* Documentos */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Documentos do Paciente</h3>
              {patient.documents && patient.documents.length > 0 ? (
                <div className="space-y-3">
                  {patient.documents.map((document, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {getDocumentTypeLabel(document.type)}: {document.number}
                          </h4>
                          {document.issuer && (
                            <p className="mt-1 text-sm text-gray-600">
                              Órgão emissor: {document.issuer}
                            </p>
                          )}
                          {document.issueDate && (
                            <p className="mt-1 text-sm text-gray-600">
                              Emissão: {new Date(document.issueDate).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                          {document.expiryDate && (
                            <p className="mt-1 text-sm text-gray-600">
                              Validade: {new Date(document.expiryDate).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Nenhum documento cadastrado</p>
              )}
            </div>
          )}

          {/* Timeline */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Timeline do Paciente</h3>
              {patient.timelineEvents && patient.timelineEvents.length > 0 ? (
                <div className="space-y-4">
                  {patient.timelineEvents.map((event, index) => (
                    <div key={index} className="relative">
                      <div className="absolute left-0 top-0 h-full w-0.5 bg-gray-200"></div>
                      <div className="flex items-start">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 text-sm">
                            {event.type === 'CREATED' ? 'C' :
                             event.type === 'UPDATED' ? 'U' :
                             event.type === 'INACTIVATED' ? 'A' : 'E'}
                          </span>
                        </div>
                        <div className="ml-4 flex-1">
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium text-gray-900">{event.title}</h4>
                              <span className="text-sm text-gray-500">
                                {new Date(event.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            {event.content && (
                              <p className="mt-2 text-sm text-gray-600">{event.content}</p>
                            )}
                            {event.author && (
                              <p className="mt-2 text-sm text-gray-500">
                                Por: {event.author.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Nenhum evento na timeline</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}