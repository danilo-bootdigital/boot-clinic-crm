import { redirect } from 'next/navigation'

// Rota legada em inglês — consolidada na página oficial /pacientes/[id].
export default function PatientDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/pacientes/${params.id}`)
}
