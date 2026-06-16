import { User } from 'lucide-react'
import Timeline from '@/components/patients/Timeline'
import Attachments from '@/components/patients/Attachments'
import Tags from '@/components/patients/Tags'
import { PageHeader } from '@/components/ui/page-header'

export default function PatientDetailPage({ params }: { params: { id: string } }) {
  const patientId = params.id

  return (
    <div className="space-y-6">
      <PageHeader title="Detalhes do Paciente" icon={<User className="h-5 w-5" />} />

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