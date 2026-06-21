'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, RefreshCw, Power, QrCode, CheckCircle2, AlertTriangle } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'

// Estados possíveis da instância (espelham o enum WhatsAppInstanceStatus).
type WaStatus = 'DISCONNECTED' | 'CONNECTING' | 'QRCODE' | 'CONNECTED' | 'ERROR'

type StatusResp = {
  configured: boolean
  hasInstance: boolean
  status: WaStatus
  phoneNumber: string | null
  profileName: string | null
  label: string | null
  lastConnectedAt: string | null
  disconnectedAt: string | null
  qrCode: string | null
}

const STATUS_META: Record<WaStatus, { label: string; cls: string }> = {
  DISCONNECTED: { label: 'Desconectado', cls: 'bg-muted text-muted-foreground' },
  CONNECTING: { label: 'Conectando…', cls: 'bg-warning/15 text-warning' },
  QRCODE: { label: 'Aguardando leitura do QR', cls: 'bg-warning/15 text-warning' },
  CONNECTED: { label: 'Conectado', cls: 'bg-success/15 text-success' },
  ERROR: { label: 'Erro de sessão', cls: 'bg-destructive/15 text-destructive' },
}

// Normaliza o QR para um src de <img> (a Evolution costuma mandar com o prefixo data:).
function qrSrc(qr: string): string {
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(s))
  } catch {
    return s
  }
}

const btnPrimary = 'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50'
const btnOutline = 'inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50'
const btnDanger = 'inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50'

export default function WhatsAppSettings() {
  const router = useRouter()
  const [data, setData] = useState<StatusResp | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const initial = useRef(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/whatsapp/status', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/configuracoes'); return }
    if (res.status === 403) { setError('Sem acesso ao módulo WhatsApp.'); setData(null); return }
    if (res.ok) { setData(await res.json()); setError(null) }
  }, [router])

  useEffect(() => { load().finally(() => { initial.current = false }) }, [load])

  // Polling enquanto está parear/conectar — captura a transição para CONNECTED e o QR.
  useEffect(() => {
    const st = data?.status
    if (st !== 'CONNECTING' && st !== 'QRCODE') return
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [data?.status, load])

  // Ação genérica: chama a rota, trata erro, recarrega o status.
  async function act(action: string, url: string, method: 'POST' | 'GET', confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(action); setError(null)
    try {
      const res = await fetch(url, { method, cache: 'no-store' })
      if (res.status === 401) { router.push('/login?redirect=/configuracoes'); return }
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Falha na operação') }
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (initial.current && !data && !error) return <LoadingState rows={3} />

  // Estado: Evolution não configurada no servidor.
  if (data && !data.configured) {
    return (
      <SectionCard title="WhatsApp">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-foreground">Integração com a Evolution API não configurada</p>
            <p className="text-muted-foreground">Defina <code>WHATSAPP_API_URL</code> e <code>WHATSAPP_API_KEY</code> no servidor para conectar um número.</p>
          </div>
        </div>
      </SectionCard>
    )
  }

  const st = data?.status ?? 'DISCONNECTED'
  const meta = STATUS_META[st]
  const qr = data?.qrCode || null

  return (
    <SectionCard
      title="WhatsApp"
      description="Conecte o número de WhatsApp da clínica (instância principal)."
    >
      {error && <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}

      {/* Cabeçalho: instância + status */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{data?.hasInstance ? (data?.label || 'Principal') : 'Nenhuma instância'}</p>
            <p className="text-xs text-muted-foreground">{data?.hasInstance ? 'Instância principal da clínica' : 'Conecte o WhatsApp para começar'}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
      </div>

      {/* Sem instância → Conectar */}
      {!data?.hasInstance && (
        <button className={btnPrimary} disabled={busy !== null} onClick={() => act('connect', '/api/whatsapp/instance/connect', 'POST')}>
          <MessageCircle className="h-4 w-4" />{busy === 'connect' ? 'Conectando…' : 'Conectar WhatsApp'}
        </button>
      )}

      {/* Parear: QRCODE / CONNECTING */}
      {data?.hasInstance && (st === 'QRCODE' || st === 'CONNECTING') && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrSrc(qr)} alt="QR Code do WhatsApp" className="h-56 w-56 rounded-md bg-white p-2" />
            ) : (
              <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-muted-foreground">
                <QrCode className="h-8 w-8" />
                <span className="text-xs">Gerando QR Code…</span>
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong> e aponte para o QR.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnOutline} disabled={busy !== null} onClick={() => act('qr', '/api/whatsapp/instance/qrcode', 'GET')}>
              <RefreshCw className="h-4 w-4" />{busy === 'qr' ? 'Atualizando…' : 'Atualizar QR Code'}
            </button>
            <button className={btnDanger} disabled={busy !== null} onClick={() => act('logout', '/api/whatsapp/instance/logout', 'POST', 'Cancelar o pareamento e desconectar a instância?')}>
              <Power className="h-4 w-4" />Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Conectado */}
      {data?.hasInstance && st === 'CONNECTED' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-medium text-foreground">WhatsApp conectado</p>
              <p className="text-xs text-muted-foreground">
                {data.profileName ? `${data.profileName} · ` : ''}{data.phoneNumber || 'número conectado'} · desde {fmtDate(data.lastConnectedAt)}
              </p>
            </div>
          </div>
          <button className={btnDanger} disabled={busy !== null} onClick={() => act('logout', '/api/whatsapp/instance/logout', 'POST', 'Desconectar o WhatsApp da clínica? As conversas existentes são preservadas.')}>
            <Power className="h-4 w-4" />{busy === 'logout' ? 'Desconectando…' : 'Desconectar'}
          </button>
        </div>
      )}

      {/* Desconectado / Erro (com instância) → Reconectar (reusa a MESMA instância) */}
      {data?.hasInstance && (st === 'DISCONNECTED' || st === 'ERROR') && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {st === 'ERROR' ? 'A sessão apresentou erro.' : 'O WhatsApp está desconectado.'} Reconecte para gerar um novo QR Code — a mesma instância e as conversas existentes são mantidas.
          </p>
          <button className={btnPrimary} disabled={busy !== null} onClick={() => act('reconnect', '/api/whatsapp/instance/reconnect', 'POST')}>
            <RefreshCw className="h-4 w-4" />{busy === 'reconnect' ? 'Reconectando…' : 'Reconectar'}
          </button>
        </div>
      )}

      {data?.lastConnectedAt && st !== 'CONNECTED' && (
        <p className="mt-4 text-xs text-muted-foreground">Última conexão: {fmtDate(data.lastConnectedAt)}</p>
      )}
    </SectionCard>
  )
}
