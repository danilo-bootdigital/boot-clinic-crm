'use client';

import { useState, useEffect } from 'react';
import { PatientStatus, PatientOrigin } from '@/lib/validations/patient';
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
}

interface PatientListProps {
  patients: Patient[];
  onEdit: (patient: Patient) => void;
  onView: (patient: Patient) => void;
}

export default function PatientList({ patients, onEdit, onView }: PatientListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [originFilter, setOriginFilter] = useState<string>('');

  const filteredPatients = patients.filter(patient => {
    const matchesSearch =
      patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.cpf.includes(searchTerm) ||
      formatPhone(patient.phone).includes(searchTerm) ||
      (patient.email && patient.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = !statusFilter || patient.status === statusFilter;
    const matchesOrigin = !originFilter || patient.origin === originFilter;

    return matchesSearch && matchesStatus && matchesOrigin;
  });

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

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-lg shadow">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar por nome, CPF, telefone ou e-mail..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value={PatientStatus.ACTIVE}>Ativo</option>
          <option value={PatientStatus.INACTIVE}>Inativo</option>
          <option value={PatientStatus.ARCHIVED}>Arquivado</option>
        </select>
        <select
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value)}
        >
          <option value="">Todas as origens</option>
          <option value={PatientOrigin.GOOGLE}>Google</option>
          <option value={PatientOrigin.FACEBOOK}>Facebook</option>
          <option value={PatientOrigin.INSTAGRAM}>Instagram</option>
          <option value={PatientOrigin.REFERRAL}>Indicação</option>
          <option value={PatientOrigin.WALK_IN}>Passagem</option>
          <option value={PatientOrigin.PHONE}>Telefone</option>
          <option value={PatientOrigin.WHATSAPP}>WhatsApp</option>
          <option value={PatientOrigin.OTHER}>Outro</option>
        </select>
      </div>

      {/* Lista de Pacientes */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CPF
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Telefone
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Origem
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredPatients.map((patient) => (
              <tr key={patient.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {patient.name}
                      </div>
                      {patient.email && (
                        <div className="text-sm text-gray-500">
                          {patient.email}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {patient.cpf}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatPhone(patient.phone)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {getOriginLabel(patient.origin)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(patient.status)}`}>
                    {patient.status === PatientStatus.ACTIVE ? 'Ativo' :
                     patient.status === PatientStatus.INACTIVE ? 'Inativo' : 'Arquivado'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => onView(patient)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    Ver
                  </button>
                  <button
                    onClick={() => onEdit(patient)}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredPatients.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            Nenhum paciente encontrado
          </div>
        )}
      </div>
    </div>
  );
}