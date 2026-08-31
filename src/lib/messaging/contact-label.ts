// Rótulo do contato na tela.
//
// O WhatsApp migrou parte dos contatos para `@lid` (Linked ID) e, quando não
// tem nome da pessoa, repete o PRÓPRIO lid no `pushName`. O ingest gravou esse
// valor como nome e a tela passou a exibir "156061965279481" no lugar de gente.
//
// O ingest já não aceita mais esse nome (contacts.ts), mas os contatos criados
// ANTES continuam com o lid gravado — e nunca vão se corrigir sozinhos, porque
// o pushName que chega é sempre o mesmo lid. Mascarar na exibição conserta o
// passado sem tocar no banco e sem apagar o dado.
import { looksLikePhone } from './phone';

/**
 * True quando o texto é um identificador opaco (lid do WhatsApp, IGSID do
 * Instagram) e não um nome nem um telefone: só dígitos, e comprido demais para
 * ser telefone. `looksLikePhone` já rejeita 14–15 dígitos por causa do lid.
 */
export function looksLikeOpaqueId(value?: string | null): boolean {
  const v = value?.trim();
  if (!v) return false;
  if (!/^\d+$/.test(v)) return false;
  return !looksLikePhone(v);
}

/**
 * Nome para mostrar. Telefone serve de nome (o atendente reconhece); o
 * identificador opaco não diz nada, então vira rótulo legível com os 4 últimos
 * dígitos — o suficiente para distinguir uma linha da outra na lista.
 */
export function contactLabel(name?: string | null, phone?: string | null): string {
  const n = name?.trim();
  if (n && !looksLikeOpaqueId(n)) return n;
  const p = phone?.trim();
  if (p) return p;
  if (n) return `Sem nome · ${n.slice(-4)}`;
  return 'Sem nome';
}
