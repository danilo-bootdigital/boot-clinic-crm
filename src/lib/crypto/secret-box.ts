// Cifra segredos que precisam ficar NO BANCO, por clínica.
//
// Existe porque integrações multiempresa guardam credencial de longa duração
// por cliente (o token de Página do Instagram, por exemplo). Isso não cabe em
// env — é um segredo por clínica, não do sistema — e não pode ficar em texto
// puro numa coluna Json: quem lesse um dump do banco falaria pelo Instagram da
// clínica.
//
// AES-256-GCM: cifra + autentica (detecta adulteração). A chave vem de
// MESSAGING_SECRET_KEY (32 bytes em base64 ou hex).
//
// FAIL-CLOSED de propósito: sem chave configurada, `encryptSecret` LANÇA em vez
// de gravar texto puro. Preferimos a integração não conectar a gravar
// credencial exposta silenciosamente.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // recomendado para GCM
const PREFIX = 'v1'; // versão do formato, p/ rotação futura

function readKey(): Buffer {
  const raw = process.env.MESSAGING_SECRET_KEY;
  if (!raw) {
    throw new Error(
      'MESSAGING_SECRET_KEY ausente: sem ela não é possível guardar credencial de canal com segurança.'
    );
  }
  // Aceita base64 ou hex; exige exatamente 32 bytes (AES-256).
  const key = /^[0-9a-fA-F]{64}$/.test(raw.trim())
    ? Buffer.from(raw.trim(), 'hex')
    : Buffer.from(raw.trim(), 'base64');
  if (key.length !== 32) {
    throw new Error('MESSAGING_SECRET_KEY inválida: precisa ter 32 bytes (base64 ou hex).');
  }
  return key;
}

/** True quando a cifra está utilizável — use para decidir se a UI oferece conexão. */
export function isSecretBoxConfigured(): boolean {
  try {
    readKey();
    return true;
  } catch {
    return false;
  }
}

/** Cifra um segredo. Formato: v1.<iv b64>.<tag b64>.<ciphertext b64> */
export function encryptSecret(plain: string): string {
  const key = readKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/**
 * Decifra. Devolve null quando o valor não é decifrável (formato estranho,
 * chave trocada, conteúdo adulterado) — o chamador trata como "não conectado"
 * em vez de estourar no meio de um webhook.
 */
export function decryptSecret(packed: string | null | undefined): string | null {
  if (!packed) return null;
  const parts = packed.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const key = readKey();
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
