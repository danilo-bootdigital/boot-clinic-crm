'use client';

import { useState, useEffect } from 'react';

interface Appointment {
  id: string;
  patientId: string;
  professionalId: string;
  specialtyId: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  status: string;
  notes?: string;
  patient?: { name: string };
  professional?: { name: string };
  specialty?: { name: string };
}

interface AgendaViewProps {
  selectedDate: Date;
  professionalId?: string;
  onAppointmentClick: (appointment: Appointment) => void;
}

export function AgendaView({ selectedDate, professionalId, onAppointmentClick }: AgendaViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppointments();
  }, [selectedDate, professionalId]);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date: selectedDate.toISOString().split('T')[0],
      });

      if (professionalId) {
        params.append('professionalId', professionalId);
      }

      const response = await fetch(`/api/agenda/appointments?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAppointments(data);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const timeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00'
  ];

  const SLOT_MS = 30 * 60000;
  const slotDate = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(selectedDate);
    d.setHours(h, m, 0, 0);
    return d;
  };
  // Consulta que COMEÇA dentro deste slot de 30 min (renderiza o card).
  const getAppointmentForTimeSlot = (time: string) => {
    const s = slotDate(time).getTime();
    const e = s + SLOT_MS;
    return appointments.find(apt => {
      const as = new Date(apt.startAt).getTime();
      return as >= s && as < e;
    });
  };
  // Consulta que NÃO começa aqui, mas ocupa este slot (duração > 30 min).
  const getCoveringAppointment = (time: string) => {
    const s = slotDate(time).getTime();
    return appointments.find(apt => {
      const as = new Date(apt.startAt).getTime();
      const ae = new Date(apt.endAt).getTime();
      return as < s && ae > s;
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-muted-foreground">Carregando agenda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Cabeçalho com datas */}
        <div className="flex border-b">
          {[-1, 0, 1].map((offset) => {
            const date = new Date(selectedDate);
            date.setDate(date.getDate() + offset);

            const isToday = offset === 0;
            const isSelected = offset === 0;

            return (
              <div
                key={offset}
                className={`flex-1 text-center p-4 border-r cursor-pointer ${
                  isSelected ? 'bg-accent' : 'hover:bg-muted'
                }`}
                onClick={() => {
                  const newDate = new Date(selectedDate);
                  newDate.setDate(newDate.getDate() + offset);
                  // Aqui você atualizaria o selectedDate
                }}
              >
                <div className="text-sm font-medium text-muted-foreground">
                  {date.toLocaleDateString('pt-BR', { weekday: 'short' })}
                </div>
                <div className={`text-lg font-semibold ${
                  isToday ? 'text-primary' : 'text-foreground'
                }`}>
                  {formatDate(date)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grade da agenda */}
        <div className="flex">
          {/* Coluna de horários */}
          <div className="w-20 border-r">
            {timeSlots.map((time) => (
              <div key={time} className="h-16 border-b flex items-center justify-end pr-2">
                <span className="text-sm text-muted-foreground">{time}</span>
              </div>
            ))}
          </div>

          {/* Coluna principal */}
          <div className="flex-1">
            {timeSlots.map((time) => {
              const appointment = getAppointmentForTimeSlot(time);
              const covering = appointment ? null : getCoveringAppointment(time);

              return (
                <div key={time} className="h-16 border-b flex">
                  {appointment ? (
                    <div
                      className="w-full h-full p-2 m-1 bg-accent border border-primary rounded cursor-pointer hover:bg-accent"
                      onClick={() => onAppointmentClick(appointment)}
                    >
                      <div className="text-sm font-medium text-accent-foreground truncate">
                        {appointment.patient?.name || 'Paciente'}
                      </div>
                      <div className="text-xs text-primary">
                        {appointment.professional?.name || 'Profissional'}
                      </div>
                      <div className="text-xs text-primary">
                        {appointment.specialty?.name || 'Especialidade'}
                      </div>
                    </div>
                  ) : covering ? (
                    <div
                      className="w-full h-full p-2 m-1 bg-accent border border-primary/30 rounded cursor-pointer hover:bg-accent"
                      onClick={() => onAppointmentClick(covering)}
                    >
                      <div className="text-xs text-primary text-center">Ocupado</div>
                    </div>
                  ) : (
                    <div className="w-full h-full p-2 m-1 bg-muted border border-border rounded opacity-50">
                      <div className="text-xs text-muted-foreground text-center">Disponível</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}