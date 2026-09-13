export const STATUS_LABEL: Record<string, string> = {
  incompleto: 'Incompleto',
  pendente: 'Pendente',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  pago: 'Pago',
}

export const STATUS_CLASS: Record<string, string> = {
  incompleto: 'bg-amber-50 text-amber-700',
  pendente: 'bg-blue-50 text-blue-700',
  aguardando_aprovacao: 'bg-purple-50 text-purple-700',
  aprovado: 'bg-teal-50 text-teal-700',
  rejeitado: 'bg-red-50 text-red-700',
  pago: 'bg-green-50 text-green-700',
}

export const canMarkPaid = (status: string) => status !== 'pago' && status !== 'aguardando_aprovacao' && status !== 'rejeitado'
