// O webhook do Instagram é PÚBLICO: a assinatura é a única coisa que impede
// qualquer pessoa de injetar mensagem na mensageria de qualquer clínica. Por
// isso estes testes cobrem os caminhos de recusa, não só o caminho feliz.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { resolveHubChallenge, verifyMetaSignature } from '@/lib/messaging/adapters/instagram/webhook-verify';

const SECRET = 'app-secret-de-teste';
const VERIFY = 'verify-token-de-teste';

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

describe('handshake do webhook (GET)', () => {
  beforeEach(() => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY;
  });
  afterEach(() => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  });

  it('devolve o challenge quando modo e token conferem', () => {
    const r = resolveHubChallenge({ mode: 'subscribe', verifyToken: VERIFY, challenge: '12345' });
    expect(r).toEqual({ ok: true, challenge: '12345' });
  });

  it('recusa token errado sem devolver o challenge', () => {
    const r = resolveHubChallenge({ mode: 'subscribe', verifyToken: 'errado', challenge: '12345' });
    expect(r.ok).toBe(false);
    expect(r.challenge).toBeUndefined();
  });

  it('recusa modo diferente de subscribe', () => {
    expect(resolveHubChallenge({ mode: 'unsubscribe', verifyToken: VERIFY, challenge: 'x' }).ok).toBe(false);
  });

  it('recusa quando o sistema não tem verify token configurado', () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    expect(resolveHubChallenge({ mode: 'subscribe', verifyToken: VERIFY, challenge: 'x' }).ok).toBe(false);
  });
});

describe('assinatura do webhook (POST)', () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.META_APP_SECRET;
  });

  const body = JSON.stringify({ object: 'instagram', entry: [{ id: '1' }] });

  it('aceita assinatura correta do corpo cru', () => {
    expect(verifyMetaSignature(body, sign(body))).toBe(true);
  });

  it('recusa corpo alterado com a assinatura antiga', () => {
    const adulterado = JSON.stringify({ object: 'instagram', entry: [{ id: '666' }] });
    expect(verifyMetaSignature(adulterado, sign(body))).toBe(false);
  });

  it('recusa assinatura feita com outro segredo', () => {
    expect(verifyMetaSignature(body, sign(body, 'segredo-do-atacante'))).toBe(false);
  });

  it('recusa header ausente ou em outro algoritmo', () => {
    expect(verifyMetaSignature(body, null)).toBe(false);
    expect(verifyMetaSignature(body, 'sha1=abc')).toBe(false);
    expect(verifyMetaSignature(body, 'lixo')).toBe(false);
  });

  it('recusa quando o sistema não tem app secret', () => {
    delete process.env.META_APP_SECRET;
    expect(verifyMetaSignature(body, sign(body))).toBe(false);
  });

  it('mesmo JSON reserializado NÃO valida — a assinatura é sobre os bytes crus', () => {
    // Documenta a pegadinha: usar await request.json() e re-stringify quebra tudo.
    const reserializado = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyMetaSignature(reserializado, sign(body))).toBe(false);
  });
});
