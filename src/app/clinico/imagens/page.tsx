'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Image as ImageIcon, FileText, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { IMAGE_CATEGORY_LABELS, DOCUMENT_CATEGORY_LABELS } from '@/lib/validations/clinical'

// Biblioteca de mídia clínica da clínica (imagens + documentos), só leitura.
// Upload e remoção acontecem na ficha do paciente (aba Imagens).
export default function ImagensPage() {
  const [images, setImages] = useState<any[] | null>(null)
  const [docs, setDocs] = useState<any[] | null>(null)

  useEffect(() => {
    fetch('/api/clinico/images', { cache: 'no-store' }).then((r) => r.ok ? r.json() : []).then(setImages).catch(() => setImages([]))
    fetch('/api/clinico/documents', { cache: 'no-store' }).then((r) => r.ok ? r.json() : []).then(setDocs).catch(() => setDocs([]))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Imagens e anexos" description="Fotos clínicas, exames e documentos da clínica" icon={<ImageIcon className="h-5 w-5" />} />

      <SectionCard title="Imagens">
        {images === null ? <LoadingState rows={3} /> : images.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma imagem.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {images.map((img) => (
              <Link key={img.id} href={`/pacientes/${img.patientId}`} className="group overflow-hidden rounded-lg border border-border">
                {img.url ? <img src={img.url} alt="" className="h-28 w-full object-cover" /> : <div className="grid h-28 w-full place-items-center bg-muted text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>}
                <div className="px-2 py-1 text-xs">
                  <p className="truncate font-medium text-foreground">{img.patientName || 'Paciente'}</p>
                  <p className="text-muted-foreground">{IMAGE_CATEGORY_LABELS[img.category] || img.category}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Documentos">
        {docs === null ? <LoadingState rows={3} /> : docs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum documento.</p>
        ) : (
          <div className="divide-y divide-border">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{DOCUMENT_CATEGORY_LABELS[d.category] || d.category} · {new Date(d.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/pacientes/${d.patientId}`} className="text-sm text-blue-600 hover:underline">{d.patientName || 'Ver paciente'}</Link>
                  {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="p-2 rounded-md text-blue-600 hover:bg-blue-50"><ExternalLink className="h-4 w-4" /></a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
