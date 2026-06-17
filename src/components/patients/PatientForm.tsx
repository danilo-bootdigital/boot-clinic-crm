'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreatePatientSchema, Gender, PatientOrigin } from '@/lib/validations/patient';

interface PatientFormData {
  name: string;
  cpf: string;
  birthDate: string;
  gender: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  origin: string;
  status?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  insurance?: string;
  insuranceNumber?: string;
  notes?: string;
}

interface PatientFormProps {
  patient?: PatientFormData;
  onSubmit: (data: PatientFormData) => void;
  onCancel: () => void;
}

export default function PatientForm({ patient, onSubmit, onCancel }: PatientFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormData>({
    resolver: zodResolver(CreatePatientSchema),
    defaultValues: patient ? {
      name: patient.name,
      cpf: patient.cpf,
      birthDate: patient.birthDate ? new Date(patient.birthDate).toISOString().split('T')[0] : '',
      gender: patient.gender,
      phone: patient.phone,
      whatsapp: patient.whatsapp || '',
      email: patient.email || '',
      origin: patient.origin,
      status: patient.status,
      address: (patient as any).address || '',
      city: (patient as any).city || '',
      state: (patient as any).state || '',
      zipCode: (patient as any).zipCode || '',
      insurance: (patient as any).insurance || '',
      insuranceNumber: (patient as any).insuranceNumber || '',
      notes: patient.notes || '',
    } : {
      name: '',
      cpf: '',
      birthDate: '',
      gender: Gender.MALE,
      phone: '',
      whatsapp: '',
      email: '',
      origin: PatientOrigin.OTHER,
      status: 'ACTIVE',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      insurance: '',
      insuranceNumber: '',
      notes: '',
    },
  });

  const handleFormSubmit = (data: PatientFormData) => {
    onSubmit(data);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nome Completo *
            </label>
            <input
              type="text"
              id="name"
              {...register('name')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-1">
              CPF *
            </label>
            <input
              type="text"
              id="cpf"
              {...register('cpf')}
              placeholder="000.000.000-00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.cpf && (
              <p className="mt-1 text-sm text-red-600">{errors.cpf.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1">
              Data de Nascimento *
            </label>
            <input
              type="date"
              id="birthDate"
              {...register('birthDate')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.birthDate && (
              <p className="mt-1 text-sm text-red-600">{errors.birthDate.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
              Gênero *
            </label>
            <select
              id="gender"
              {...register('gender')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={Gender.MALE}>Masculino</option>
              <option value={Gender.FEMALE}>Feminino</option>
              <option value={Gender.OTHER}>Outro</option>
              <option value={Gender.PREFER_NOT_TO_SAY}>Prefiro não informar</option>
            </select>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Telefone *
            </label>
            <input
              type="tel"
              id="phone"
              {...register('phone')}
              placeholder="(00) 00000-0000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-700 mb-1">
              WhatsApp
            </label>
            <input
              type="tel"
              id="whatsapp"
              {...register('whatsapp')}
              placeholder="(00) 00000-0000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              type="email"
              id="email"
              {...register('email')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="origin" className="block text-sm font-medium text-gray-700 mb-1">
              Origem *
            </label>
            <select
              id="origin"
              {...register('origin')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
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

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
            <input type="text" id="address" {...register('address')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input type="text" id="city" {...register('city')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <input type="text" id="state" maxLength={2} placeholder="UF" {...register('state')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
              <input type="text" id="zipCode" placeholder="00000-000" {...register('zipCode')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="insurance" className="block text-sm font-medium text-gray-700 mb-1">Convênio</label>
              <input type="text" id="insurance" {...register('insurance')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="insuranceNumber" className="block text-sm font-medium text-gray-700 mb-1">Nº da carteirinha</label>
              <input type="text" id="insuranceNumber" {...register('insuranceNumber')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              id="notes"
              {...register('notes')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}