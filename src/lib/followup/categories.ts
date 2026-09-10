// Categoria da tarefa: string livre no banco (não enum — evita migration para
// adicionar categoria nova), com uma lista sugerida na UI. "OUTRO" abre um
// campo de texto livre em vez de gravar literalmente "OUTRO".
export const TASK_CATEGORIES = [
  'COMERCIAL',
  'MARKETING',
  'OPERACIONAL',
  'FINANCEIRO',
  'ADMINISTRATIVO',
  'PACIENTE',
] as const;

export const TASK_CATEGORY_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  MARKETING: 'Marketing',
  OPERACIONAL: 'Operacional',
  FINANCEIRO: 'Financeiro',
  ADMINISTRATIVO: 'Administrativo',
  PACIENTE: 'Paciente',
  OUTRO: 'Outro',
};

/** Rótulo de exibição — categorias fora da lista sugerida aparecem como digitadas. */
export function categoryLabel(category?: string | null): string {
  if (!category) return '';
  return TASK_CATEGORY_LABELS[category] ?? category;
}
