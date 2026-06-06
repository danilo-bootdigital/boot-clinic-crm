import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface TimelineProps {
  patientId: string
}

export default function Timeline({ patientId }: TimelineProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Linha do Tempo do Paciente</CardTitle>
          <CardDescription>
            Histórico de interações e eventos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            Nenhum evento registrado
          </div>
        </CardContent>
      </Card>
    </div>
  )
}