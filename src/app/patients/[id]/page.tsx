import { Timeline } from '@/components/patients/Timeline'
import { Attachments } from '@/components/patients/Attachments'
import { Tags } from '@/components/patients/Tags'

export default function PatientDetailPage({ params }: { params: { id: string } }) {
  const patientId = params.id

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Detalhes do Paciente</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Timeline patientId={patientId} />
        </div>

        <div>
          <Tags patientId={patientId} />
        </div>
      </div>

      <Attachments patientId={patientId} />
    </div>
  )
}