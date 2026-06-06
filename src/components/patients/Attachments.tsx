import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AttachmentsProps {
  patientId: string
}

export default function Attachments({ patientId }: AttachmentsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Anexos do Paciente</CardTitle>
          <CardDescription>
            Documentos e arquivos relacionados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            Nenhum anexo encontrado
          </div>
        </CardContent>
      </Card>
    </div>
  )
}