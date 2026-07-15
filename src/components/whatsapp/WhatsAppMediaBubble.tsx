'use client';

import { useEffect, useState } from 'react';
import { formatBytes } from '@/lib/whatsapp/media-client';

interface Attachment {
  id: string;
  mimeType: string;
  sizeBytes?: number | null;
  originalFileName?: string | null;
}

interface Props {
  messageType: 'IMAGE' | 'DOCUMENT' | 'AUDIO';
  mediaStatus?: string | null;
  attachment?: Attachment | null;
  dark?: boolean;
}

// Busca uma signed URL efêmera para o anexo (não persistida no DOM/banco).
async function fetchSignedUrl(id: string): Promise<string | null> {
  const res = await fetch(`/api/whatsapp/attachments/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return j?.url ?? null;
}

export function WhatsAppMediaBubble({ messageType, mediaStatus, attachment, dark }: Props) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [busy, setBusy] = useState(false);
  const muted = dark ? 'text-white/80' : 'text-muted-foreground';

  const isImage = messageType === 'IMAGE';
  const isAudio = messageType === 'AUDIO';
  const icon = isImage ? '📷' : isAudio ? '🎤' : '📎';
  const available = mediaStatus === 'AVAILABLE' && !!attachment;

  // Carrega a URL assinada sob demanda quando disponível (imagem e áudio).
  useEffect(() => {
    let alive = true;
    if ((isImage || isAudio) && available && attachment) {
      fetchSignedUrl(attachment.id).then((u) => { if (alive) { if (u) setMediaUrl(u); else setImgError(true); } });
    }
    return () => { alive = false; };
  }, [isImage, isAudio, available, attachment]);

  if (mediaStatus === 'PENDING') {
    return <p className={`text-sm italic ${muted}`}>{icon} Carregando mídia…</p>;
  }
  if (mediaStatus === 'FAILED' || !attachment) {
    return <p className={`text-sm italic ${muted}`}>{icon} Mídia indisponível</p>;
  }

  async function openDoc() {
    if (!attachment || busy) return;
    setBusy(true);
    try {
      const u = await fetchSignedUrl(attachment.id);
      if (u) window.open(u, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  }

  if (isImage) {
    if (imgError) return <p className={`text-sm italic ${muted}`}>📷 Falha ao carregar imagem</p>;
    if (!mediaUrl) return <div className="mb-1 flex h-40 w-56 items-center justify-center rounded bg-black/10 text-sm">carregando…</div>;
    return (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl} alt={attachment.originalFileName || 'Imagem'} className="mb-1 max-h-64 w-full rounded object-cover" onError={() => setImgError(true)} />
      </a>
    );
  }

  if (isAudio) {
    if (imgError) return <p className={`text-sm italic ${muted}`}>🎤 Falha ao carregar áudio</p>;
    if (!mediaUrl) return <p className={`text-sm italic ${muted}`}>🎤 carregando áudio…</p>;
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio controls preload="none" src={mediaUrl} className="mb-1 w-56 max-w-full" onError={() => setImgError(true)} />;
  }

  // Documento
  return (
    <button onClick={openDoc} disabled={busy} className={`mb-1 flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left ${dark ? 'border-white/30 hover:bg-white/10' : 'border-border hover:bg-muted'} disabled:opacity-60`}>
      <span className="text-2xl">📄</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{attachment.originalFileName || 'Documento'}</span>
        <span className={`block text-xs ${muted}`}>{formatBytes(attachment.sizeBytes)} · {busy ? 'abrindo…' : 'abrir / baixar'}</span>
      </span>
    </button>
  );
}
