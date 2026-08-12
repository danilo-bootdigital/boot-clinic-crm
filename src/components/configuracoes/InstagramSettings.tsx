'use client';

import { useEffect, useState } from 'react';

// Conexão do Instagram com a mensageria.
//
// NÃO existe campo de senha aqui, de propósito: a Meta não expõe DM por
// login/senha, e guardar a senha de um cliente para um serviço de terceiro é
// coleta de credencial. O fluxo correto é OAuth — a pessoa autentica no site da
// Meta e o sistema recebe um token de escopo limitado, revogável.

interface IgAccount {
  id: string;
  label: string;
  status: string;
  username: string | null;
  displayName: string | null;
  lastConnectedAt: string | null;
  hasToken: boolean;
}

interface IgState {
  configured: boolean;
  secretsReady: boolean;
  account: IgAccount | null;
}

const ERROS: Record<string, string> = {
  autorizacao_recusada: 'Você cancelou a autorização na Meta.',
  state_invalido: 'A autorização expirou ou não conferiu. Tente conectar novamente.',
  code_ausente: 'A Meta não devolveu o código de autorização.',
  troca_de_token_falhou: 'A Meta recusou a troca do código por token.',
  paginas_indisponiveis: 'Não foi possível listar suas Páginas do Facebook.',
  sem_instagram_profissional:
    'Nenhuma Página sua tem conta profissional do Instagram vinculada. Converta a conta para Profissional e vincule à Página.',
  webhook_nao_assinado:
    'Conta conectada, mas a assinatura do webhook falhou — mensagens podem não chegar. Tente reconectar.',
  erro_interno: 'Erro interno ao concluir a conexão.',
};

export default function InstagramSettings() {
  const [state, setState] = useState<IgState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null);

  useEffect(() => {
    // Mensagem trazida pelo redirect do callback.
    const params = new URLSearchParams(window.location.search);
    if (params.get('ig_ok')) setFeedback({ kind: 'ok', text: 'Instagram conectado à mensageria.' });
    const erro = params.get('ig_error');
    if (erro) setFeedback({ kind: 'erro', text: ERROS[erro] ?? 'Não foi possível conectar.' });
    load();
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/mensageria/accounts/instagram');
      if (res.ok) setState(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function connect() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/mensageria/accounts/instagram/connect');
      const body = await res.json();
      if (!res.ok) {
        setFeedback({ kind: 'erro', text: body?.error ?? 'Não foi possível iniciar a conexão.' });
        return;
      }
      // Sai daqui para o site da Meta: é lá que a senha é digitada, nunca aqui.
      window.location.href = body.url;
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar o Instagram? O histórico de conversas é preservado.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/mensageria/accounts/instagram', { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ kind: 'ok', text: 'Instagram desconectado. As conversas seguem no histórico.' });
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const conectado = state?.account?.status === 'CONNECTED' && state.account.hasToken;
  const bloqueado = !state?.configured || !state?.secretsReady;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Instagram</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Direct do Instagram entrando na mensageria, junto com o WhatsApp.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            feedback.kind === 'ok'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {bloqueado && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium text-foreground">Integração ainda não habilitada no servidor</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {!state?.configured && <li>· Falta configurar <code>META_APP_ID</code> e <code>META_APP_SECRET</code>.</li>}
            {!state?.secretsReady && <li>· Falta configurar <code>MESSAGING_SECRET_KEY</code> (cifra a credencial do canal).</li>}
          </ul>
          <p className="mt-2 text-muted-foreground">
            São variáveis de ambiente do sistema — não há nada a digitar nesta tela.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        {conectado ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {state!.account!.username ? `@${state!.account!.username}` : state!.account!.displayName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Conectado
                {state!.account!.lastConnectedAt &&
                  ` desde ${new Date(state!.account!.lastConnectedAt).toLocaleString('pt-BR')}`}
              </p>
            </div>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              Desconectar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Antes de conectar, confira:</p>
              <ul className="space-y-1">
                <li>· A conta do Instagram é <strong>Profissional</strong> (Business ou Criador).</li>
                <li>· Ela está <strong>vinculada a uma Página do Facebook</strong>.</li>
                <li>· Você é administrador dessa Página.</li>
              </ul>
              <p>
                Ao continuar você vai para o site da Meta para autorizar. Sua senha é digitada lá —
                o Boot Clinic nunca recebe login nem senha, só uma autorização que você pode revogar
                quando quiser.
              </p>
            </div>
            <button
              type="button"
              onClick={connect}
              disabled={busy || bloqueado}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? 'Abrindo a Meta…' : 'Conectar Instagram'}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Limite do Instagram, não do sistema</p>
        <p className="mt-1">
          A Meta só permite responder livremente até <strong>24 horas</strong> depois da última
          mensagem da pessoa. Passado esse prazo, a mensageria bloqueia o envio e explica o motivo em
          vez de deixar a Meta recusar em silêncio.
        </p>
      </div>
    </div>
  );
}
