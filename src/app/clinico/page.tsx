'use client'

import { useEffect, useState } from 'react'
import { Stethoscope, ClipboardList, FileText, FileSignature, Receipt, Image as ImageIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { ModuleCard } from '@/components/ui/module-card'

// Hub do Módulo Clínico Documental. Cada card respeita o acesso por área.
const CARDS = [
  { key: 'anamnese', title: 'Anamneses', description: 'Modelos e anamneses digitais por paciente', href: '/clinico/anamneses', icon: <ClipboardList className="h-5 w-5" /> },
  { key: 'prontuario', title: 'Prontuário', description: 'Evolução clínica e histórico de atendimento', href: '/clinico/prontuario', icon: <FileText className="h-5 w-5" /> },
  { key: 'contratos', title: 'Contratos', description: 'Contratos personalizáveis e modelos', href: '/clinico/contratos', icon: <FileSignature className="h-5 w-5" /> },
  { key: 'orcamentos', title: 'Orçamentos', description: 'Orçamentos clínicos e procedimentos', href: '/clinico/orcamentos', icon: <Receipt className="h-5 w-5" /> },
  { key: 'imagens', title: 'Imagens e anexos', description: 'Fotos clínicas, exames e documentos', href: '/clinico/imagens', icon: <ImageIcon className="h-5 w-5" /> },
]

export default function ClinicoHubPage() {
  const [access, setAccess] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    fetch('/api/clinico/access').then((r) => r.ok ? r.json() : {}).then(setAccess).catch(() => setAccess({}))
  }, [])

  const can = (key: string) => access === null || access[key] === 'view' || access[key] === 'edit'
  const cards = CARDS.filter((c) => can(c.key))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clínico"
        description="Anamnese, prontuário, contratos, orçamentos e imagens — tudo vinculado ao paciente"
        icon={<Stethoscope className="h-5 w-5" />}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => <ModuleCard key={c.key} title={c.title} description={c.description} href={c.href} icon={c.icon} />)}
      </div>
      {access !== null && cards.length === 0 && (
        <p className="text-sm text-muted-foreground">Você não tem acesso a nenhuma área clínica.</p>
      )}
    </div>
  )
}
