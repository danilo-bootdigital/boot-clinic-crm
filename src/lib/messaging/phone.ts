// Plausibilidade de telefone.
//
// Existe porque o WhatsApp passou a usar `@lid` — identificador opaco que
// PARECE número (15 dígitos) mas não é telefone. Como guardamos só a parte
// numérica do jid, o domínio se perde e não há marca de "isto era um lid".
// Então a defesa é positiva: só aceita como telefone o que tem forma de
// telefone.
//
// Critério deliberadamente CONSERVADOR — na dúvida, aceita. Rejeitar um
// telefone real é pior que deixar passar um lid.

/** Só dígitos, ou undefined. */
export function digitsOnly(value?: string | null): string | undefined {
  if (!value) return undefined;
  const d = value.replace(/\D/g, '');
  return d || undefined;
}

/**
 * True quando a sequência tem forma de telefone E.164 discável.
 *
 * - 10 a 13 dígitos. E.164 permite 15, mas telefone real com 14–15 dígitos é
 *   praticamente inexistente, enquanto lid nessa faixa é o caso comum.
 * - Brasil (`55`): 12 ou 13 dígitos (55 + DDD + 8 ou 9).
 * - NANP (`1`): exatamente 11 dígitos (1 + 10).
 * - Outros códigos de país: aceita, porque não temos como desmentir.
 */
export function looksLikePhone(value?: string | null): boolean {
  const d = digitsOnly(value);
  if (!d) return false;
  if (d.length < 10 || d.length > 13) return false;
  if (d.startsWith('55')) return d.length === 12 || d.length === 13;
  if (d.startsWith('1')) return d.length === 11;
  return true;
}

/** DDI do Brasil — padrão assumido para número digitado só com DDD. */
const BR_DDI = '55';

/**
 * DDDs que existem de verdade no Brasil.
 *
 * A lista completa importa: "11 a 99 sem zero" transformava o celular chileno
 * `56 9 7380 8664` em "DDD 56 + celular" e prefixava 55 num número que já
 * estava certo. Faixa inexistente = não é brasileiro.
 */
const BR_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function hasBrDdd(d: string): boolean {
  return BR_DDD.has(Number(d.slice(0, 2)));
}

/**
 * Número no formato que o WhatsApp discou de verdade: E.164 COMPLETO, com DDI.
 *
 * Existe porque o provedor recebe o número cru e não adivinha o país. Um celular
 * paulistano digitado como `11 93709-2490` (11 dígitos, sem o 55) chega no
 * WhatsApp como se fosse número dos EUA (+1 193…) e a resposta é HTTP 400 — foi
 * exatamente isso que fez a mensagem "não ir" na clínica.
 *
 * Regras, na ordem:
 * - `+` na frente = a pessoa escreveu o internacional; respeita o que veio.
 * - já começa com 55 e tem 12–13 dígitos: é BR completo, passa direto (idempotente).
 * - 11 dígitos com DDD que existe e 3º dígito 9: celular BR sem DDI -> prefixa 55.
 *   Não colide com os EUA: código de área NANP nunca começa com 1, então
 *   `1[1-9]9…` só pode ser DDD brasileiro.
 * - 10 dígitos com DDD válido e 3º dígito 2–5: fixo BR sem DDI -> prefixa 55.
 * - resto: devolve como veio, se tiver forma de telefone. Não inventa DDI para
 *   número estrangeiro (a base tem contatos de EUA, Portugal, Itália, Chile).
 *
 * `undefined` quando não há forma de telefone discável — aí a rota recusa o
 * envio com motivo legível em vez de deixar o provedor devolver 400 opaco.
 */
export function dialableNumber(value?: string | null): string | undefined {
  const raw = (value ?? '').trim();
  const d = digitsOnly(raw);
  if (!d) return undefined;
  if (raw.startsWith('+')) return looksLikePhone(d) ? d : undefined;
  if (d.startsWith(BR_DDI) && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 11 && hasBrDdd(d) && d[2] === '9') return BR_DDI + d;
  if (d.length === 10 && hasBrDdd(d) && /[2-5]/.test(d[2])) return BR_DDI + d;
  return looksLikePhone(d) ? d : undefined;
}

/**
 * True quando o identificador é de GRUPO do WhatsApp.
 *
 * O filtro original checava o domínio `@g.us`, mas o payload da Evolution não
 * sempre traz o domínio — e aí grupo entrava como contato. Foi assim que
 * "NETWORKING TOP" e "Comunidade Master Build" viraram contatos da clínica,
 * com o id de 18 dígitos gravado como telefone.
 *
 * Duas marcas: o domínio quando existe, e a forma do id (grupos usam 17–19
 * dígitos, tipicamente com prefixo 12036).
 */
export function looksLikeGroupId(value?: string | null): boolean {
  if (!value) return false;
  if (value.includes('@g.us')) return true;
  const d = digitsOnly(value);
  if (!d) return false;
  if (d.startsWith('12036') && d.length >= 15) return true;
  return d.length >= 16;
}
