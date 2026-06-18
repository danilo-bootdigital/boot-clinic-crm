// Formatação e rótulos do Módulo Financeiro (client-safe).

export const brl = (n: number) =>
  (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente',
  PARCIAL: 'Parcial',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
  VENCIDO: 'Vencido',
};

export const INSTALLMENT_STATUS_LABELS = RECEIVABLE_STATUS_LABELS;

export const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'neutral'> = {
  PENDENTE: 'warning',
  PARCIAL: 'info',
  PAGO: 'success',
  CANCELADO: 'neutral',
  VENCIDO: 'destructive',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_CREDITO: 'Cartão de crédito',
  CARTAO_DEBITO: 'Cartão de débito',
  TRANSFERENCIA: 'Transferência',
  BOLETO: 'Boleto',
  CHEQUE: 'Cheque',
  OUTRO: 'Outro',
};

export const formatDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';
