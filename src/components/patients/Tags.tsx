import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface TagsProps {
  patientId: string
}

export default function Tags({ patientId }: TagsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tags do Paciente</CardTitle>
          <CardDescription>
            Categorias e classificações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            Nenhuma tag atribuída
          </div>
        </CardContent>
      </Card>
    </div>
  )
}