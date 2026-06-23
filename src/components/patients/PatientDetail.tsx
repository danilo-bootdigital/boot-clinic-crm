'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui/tabs';

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
        return 'bg-success/15 text-success';
      case 'INACTIVE':
        return 'bg-warning/15 text-warning';
      case 'ARCHIVED':
        return 'bg-muted text-foreground';
      default:
        return 'bg-muted text-foreground';
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
      <div className="bg-card rounded-xl border border-border shadow-card">
        {/* Cabeçalho */}
        <div className="border-b border-border p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{patient.name}</h1>
              <div className="mt-2 flex items-center space-x-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(patient.status)}`}>
                  {patient.status === 'ACTIVE' ? 'Ativo' :
                   patient.status === 'INACTIVE' ? 'Inativo' : 'Arquivado'}
                </span>
                <span className="text-sm text-muted-foreground">
                  Criado em: {new Date(patient.createdAt).toLocaleDateString('pt-BR')}
                </span>
                {patient.createdBy && (
                  <span className="text-sm text-muted-foreground">
                    Por: {patient.createdBy.name}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => onEdit(patient)}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
            >
              Editar Paciente
            </button>
          </div>
        </div>

        {/* Abas */}
        <Tabs
          className="px-6"
          value={activeTab}
          onValueChange={(v) => { if (v !== 'documents') setActiveTab(v); }}
          items={[
            { value: 'info', label: 'Informações' },
            { value: 'contacts', label: 'Contatos' },
            { value: 'addresses', label: 'Endereços' },
            { value: 'documents', label: 'Documentos' },
            { value: 'timeline', label: 'Timeline' },
          ]}
        />

        {/* Conteúdo das Abas */}
        <div className="p-6">
          {/* Informações Básicas */}
          {activeTab === 'info' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Dados Pessoais
                  </h3>
                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">CPF</dt>
                      <dd className="mt-1 text-sm text-foreground">{patient.cpf}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Data de Nascimento</dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {new Date(patient.birthDate).toLocaleDateString('pt-BR')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Sexo/Gênero</dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {patient.gender === 'MALE' ? 'Masculino' :
                         patient.gender === 'FEMALE' ? 'Feminino' :
                         patient.gender === 'OTHER' ? 'Outro' : 'Prefere não informar'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Contato
                  </h3>
                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Telefone Principal</dt>
                      <dd className="mt-1 text-sm text-foreground">{patient.phone || '—'}</dd>
                    </div>
                    {patient.whatsapp && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">WhatsApp</dt>
                        <dd className="mt-1 text-sm text-foreground">{patient.whatsapp}</dd>
                      </div>
                    )}
                    {patient.email && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">E-mail</dt>
                        <dd className="mt-1 text-sm text-foreground">{patient.email}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Informações da Clínica
                </h3>
                <dl className="mt-4 space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Origem</dt>
                    <dd className="mt-1 text-sm text-foreground">{getOriginLabel(patient.origin)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Clínica</dt>
                    <dd className="mt-1 text-sm text-foreground">{patient.clinic?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Empresa</dt>
                    <dd className="mt-1 text-sm text-foreground">{patient.company?.name}</dd>
                  </div>
                </dl>
              </div>

              {patient.notes && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Observações
                  </h3>
                  <div className="mt-2 text-sm text-foreground bg-muted p-4 rounded-md">
                    {patient.notes}
                  </div>
                </div>
              )}

              {patient.tags && patient.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
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
              <h3 className="text-lg font-medium text-foreground">Contatos do Paciente</h3>
              {patient.contacts && patient.contacts.length > 0 ? (
                <div className="space-y-3">
                  {patient.contacts.map((contact, index) => (
                    <div key={index} className="border border-border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-foreground">
                            {getContactTypeLabel(contact.type)}
                          </h4>
                          <p className="mt-1 text-sm text-muted-foreground">{contact.value}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum contato cadastrado</p>
              )}
            </div>
          )}

          {/* Endereços */}
          {activeTab === 'addresses' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Endereços do Paciente</h3>
              {patient.addresses && patient.addresses.length > 0 ? (
                <div className="space-y-3">
                  {patient.addresses.map((address, index) => (
                    <div key={index} className="border border-border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          {address.isMain && (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-accent text-accent-foreground">
                              Principal
                            </span>
                          )}
                          <h4 className="mt-2 font-medium text-foreground">
                            {address.street}, {address.number || 's/n'}{address.complement ? ` - ${address.complement}` : ''}
                          </h4>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {address.district}, {address.city} - {address.state}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">{address.zipCode}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum endereço cadastrado</p>
              )}
            </div>
          )}

          {/* Documentos */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Documentos do Paciente</h3>
              {patient.documents && patient.documents.length > 0 ? (
                <div className="space-y-3">
                  {patient.documents.map((document, index) => (
                    <div key={index} className="border border-border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-foreground">
                            {getDocumentTypeLabel(document.type)}: {document.number}
                          </h4>
                          {document.issuer && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Órgão emissor: {document.issuer}
                            </p>
                          )}
                          {document.issueDate && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Emissão: {new Date(document.issueDate).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                          {document.expiryDate && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Validade: {new Date(document.expiryDate).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum documento cadastrado</p>
              )}
            </div>
          )}

          {/* Timeline */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Timeline do Paciente</h3>
              {patient.timelineEvents && patient.timelineEvents.length > 0 ? (
                <div className="space-y-4">
                  {patient.timelineEvents.map((event, index) => (
                    <div key={index} className="relative">
                      <div className="absolute left-0 top-0 h-full w-0.5 bg-muted"></div>
                      <div className="flex items-start">
                        <div className="flex-shrink-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                          <span className="text-primary text-sm">
                            {event.type === 'CREATED' ? 'C' :
                             event.type === 'UPDATED' ? 'U' :
                             event.type === 'INACTIVATED' ? 'A' : 'E'}
                          </span>
                        </div>
                        <div className="ml-4 flex-1">
                          <div className="bg-muted rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium text-foreground">{event.title}</h4>
                              <span className="text-sm text-muted-foreground">
                                {new Date(event.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            {event.content && (
                              <p className="mt-2 text-sm text-muted-foreground">{event.content}</p>
                            )}
                            {event.author && (
                              <p className="mt-2 text-sm text-muted-foreground">
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
                <p className="text-muted-foreground">Nenhum evento na timeline</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}