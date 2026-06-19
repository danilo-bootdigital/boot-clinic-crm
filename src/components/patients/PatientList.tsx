'use client';

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

interface Filters { search: string; status: string; origin: string }
interface Pagination { page: number; pages: number; total: number }

interface PatientListProps {
  patients: Patient[];
  onEdit: (patient: Patient) => void;
  onView: (patient: Patient) => void;
  /** Quando fornecido, exibe ação "Restaurar" (modo arquivados). */
  onRestore?: (patient: Patient) => void;
  // FE2: filtros e paginação CONTROLADOS pela página (busca/filtros são server-side;
  // a lista deixou de filtrar/cortar em memória, então registros além de 100 aparecem).
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
  pagination?: Pagination;
  onPageChange?: (page: number) => void;
}

export default function PatientList({ patients, onEdit, onView, onRestore, filters, onFiltersChange, pagination, onPageChange }: PatientListProps) {
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
      {/* Filtros (server-side) */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-lg shadow">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar por nome, CPF, telefone ou e-mail..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          />
        </div>
        <select
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filters.status}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
        >
          <option value="">Todos os status</option>
          <option value={PatientStatus.ACTIVE}>Ativo</option>
          <option value={PatientStatus.INACTIVE}>Inativo</option>
          <option value={PatientStatus.ARCHIVED}>Arquivado</option>
        </select>
        <select
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filters.origin}
          onChange={(e) => onFiltersChange({ ...filters, origin: e.target.value })}
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPF</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telefone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origem</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {patients.map((patient) => (
              <tr key={patient.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                      {patient.email && <div className="text-sm text-gray-500">{patient.email}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{patient.cpf}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatPhone(patient.phone)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getOriginLabel(patient.origin)}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(patient.status)}`}>
                    {patient.status === PatientStatus.ACTIVE ? 'Ativo' :
                     patient.status === PatientStatus.INACTIVE ? 'Inativo' : 'Arquivado'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {onRestore ? (
                    <button onClick={() => onRestore(patient)} className="text-green-600 hover:text-green-900">Restaurar</button>
                  ) : (
                    <>
                      <button onClick={() => onView(patient)} className="text-blue-600 hover:text-blue-900 mr-3">Ver</button>
                      <button onClick={() => onEdit(patient)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {patients.length === 0 && (
          <div className="text-center py-8 text-gray-500">Nenhum paciente encontrado</div>
        )}

        {/* Paginação (server-side) */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 text-sm">
            <span className="text-gray-500">
              Página {pagination.page} de {pagination.pages} · {pagination.total} paciente{pagination.total === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => onPageChange?.(pagination.page - 1)}
                className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
              >
                Anterior
              </button>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => onPageChange?.(pagination.page + 1)}
                className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
