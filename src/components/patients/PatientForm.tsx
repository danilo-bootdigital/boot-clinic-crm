'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreatePatientSchema, Gender, PatientOrigin } from '@/lib/validations/patient';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/filter-bar';

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
      <div className="bg-card rounded-xl border border-border shadow-card p-6">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
              Nome Completo *
            </label>
            <Input
              type="text"
              id="name"
              {...register('name')}
              className="w-full"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="cpf" className="block text-sm font-medium text-foreground mb-1">
              CPF *
            </label>
            <Input
              type="text"
              id="cpf"
              {...register('cpf')}
              placeholder="000.000.000-00"
              readOnly={!!patient}
              aria-readonly={!!patient}
              className={`w-full ${patient ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''}`}
            />
            {patient && (
              <p className="mt-1 text-xs text-muted-foreground">O CPF é protegido e não pode ser alterado após o cadastro.</p>
            )}
            {errors.cpf && (
              <p className="mt-1 text-sm text-destructive">{errors.cpf.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="birthDate" className="block text-sm font-medium text-foreground mb-1">
              Data de Nascimento *
            </label>
            <Input
              type="date"
              id="birthDate"
              {...register('birthDate')}
              className="w-full"
            />
            {errors.birthDate && (
              <p className="mt-1 text-sm text-destructive">{errors.birthDate.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-foreground mb-1">
              Gênero *
            </label>
            <FilterSelect
              id="gender"
              {...register('gender')}
              className="w-full"
            >
              <option value={Gender.MALE}>Masculino</option>
              <option value={Gender.FEMALE}>Feminino</option>
              <option value={Gender.OTHER}>Outro</option>
              <option value={Gender.PREFER_NOT_TO_SAY}>Prefiro não informar</option>
            </FilterSelect>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1">
              Telefone *
            </label>
            <Input
              type="tel"
              id="phone"
              {...register('phone')}
              placeholder="(00) 00000-0000"
              className="w-full"
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="whatsapp" className="block text-sm font-medium text-foreground mb-1">
              WhatsApp
            </label>
            <Input
              type="tel"
              id="whatsapp"
              {...register('whatsapp')}
              placeholder="(00) 00000-0000"
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
              E-mail
            </label>
            <Input
              type="email"
              id="email"
              {...register('email')}
              className="w-full"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="origin" className="block text-sm font-medium text-foreground mb-1">
              Origem *
            </label>
            <FilterSelect
              id="origin"
              {...register('origin')}
              className="w-full"
            >
              <option value={PatientOrigin.GOOGLE}>Google</option>
              <option value={PatientOrigin.FACEBOOK}>Facebook</option>
              <option value={PatientOrigin.INSTAGRAM}>Instagram</option>
              <option value={PatientOrigin.REFERRAL}>Indicação</option>
              <option value={PatientOrigin.WALK_IN}>Passagem</option>
              <option value={PatientOrigin.PHONE}>Telefone</option>
              <option value={PatientOrigin.WHATSAPP}>WhatsApp</option>
              <option value={PatientOrigin.OTHER}>Outro</option>
            </FilterSelect>
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-foreground mb-1">Endereço</label>
            <Input type="text" id="address" {...register('address')} className="w-full" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-foreground mb-1">Cidade</label>
              <Input type="text" id="city" {...register('city')} className="w-full" />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-foreground mb-1">Estado</label>
              <Input type="text" id="state" maxLength={2} placeholder="UF" {...register('state')} className="w-full" />
            </div>
            <div>
              <label htmlFor="zipCode" className="block text-sm font-medium text-foreground mb-1">CEP</label>
              <Input type="text" id="zipCode" placeholder="00000-000" {...register('zipCode')} className="w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="insurance" className="block text-sm font-medium text-foreground mb-1">Convênio</label>
              <Input type="text" id="insurance" {...register('insurance')} className="w-full" />
            </div>
            <div>
              <label htmlFor="insuranceNumber" className="block text-sm font-medium text-foreground mb-1">Nº da carteirinha</label>
              <Input type="text" id="insuranceNumber" {...register('insuranceNumber')} className="w-full" />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1">
              Observações
            </label>
            <Textarea
              id="notes"
              {...register('notes')}
              rows={3}
              className="w-full"
            />
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}