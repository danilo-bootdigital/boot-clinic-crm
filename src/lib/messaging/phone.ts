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
