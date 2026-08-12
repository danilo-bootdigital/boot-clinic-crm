'use client';

import { useEffect, useRef, useState } from 'react';

// Assinatura digitalizada do profissional.
//
// Fica em bucket privado e é exibida por URL assinada de curta duração — a
// imagem da assinatura de um médico, se vazar, permite falsificar documento.
// Por isso o componente nunca recebe o caminho no storage, só a URL temporária.

export function ProfessionalSignature({
  professionalId,
  professionalName,
}: {
  professionalId: string;
  professionalName: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    fetch(`/api/professionals/${professionalId}/signature`)
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((b) => ativo && setUrl(b.url ?? null))
      .catch(() => ativo && setUrl(null))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [professionalId]);

  async function enviar(file: File) {
    setEnviando(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/professionals/${professionalId}/signature`, { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) {
        setErro(body?.error ?? 'Não foi possível anexar a assinatura.');
        return;
      }
      setUrl(body.url ?? null);
    } catch {
      setErro('Falha de rede ao enviar a assinatura.');
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remover() {
    if (!confirm(`Remover a assinatura de ${professionalName}?`)) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/professionals/${professionalId}/signature`, { method: 'DELETE' });
      if (res.ok) setUrl(null);
      else setErro('Não foi possível remover a assinatura.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Assinatura digitalizada</p>
          <p className="text-xs text-muted-foreground">
            Opcional. PNG, JPG ou WebP, até 2 MB. Usada para estampar documentos assinados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={`Assinatura de ${professionalName}`}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviar(f);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : url ? 'Substituir' : 'Anexar assinatura'}
          </button>
          {url && (
            <button
              type="button"
              onClick={remover}
              disabled={enviando}
              className="rounded-lg px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
            >
              Remover
            </button>
          )}
        </div>
      </div>

      {carregando ? (
        <p className="mt-2 text-xs text-muted-foreground">Carregando…</p>
      ) : url ? (
        // Fundo branco de propósito: assinatura é traço escuro sobre claro, e em
        // tema escuro ela desapareceria.
        <div className="mt-3 inline-block rounded-md border border-border bg-white p-2">
          <img src={url} alt={`Assinatura de ${professionalName}`} className="h-16 w-auto object-contain" />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Nenhuma assinatura anexada.</p>
      )}

      {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
    </div>
  );
}
