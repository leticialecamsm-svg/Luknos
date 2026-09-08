export const BOT_STATUS: Record<string, { label: string; cls: string }> = {
  collecting: { label: 'Coletando', cls: 'bg-blue-50 text-blue-700' },
  awaiting_confirmation: { label: 'Aguardando confirmação', cls: 'bg-amber-50 text-amber-700' },
  submitted: { label: 'Cadastrado', cls: 'bg-green-50 text-green-700' },
  failed: { label: 'Falhou', cls: 'bg-red-50 text-red-700' },
  cancelled: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500' },
  expired: { label: 'Expirado', cls: 'bg-gray-100 text-gray-500' },
}

export function statusMeta(status: string) {
  return BOT_STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
}

export const FIELD_LABEL: Record<string, string> = {
  client: 'Cliente',
  client_pick: 'Cliente (escolha)',
  client_phone: 'Telefone do cliente',
  origin: 'Origem',
  category: 'Categoria',
  priority: 'Prioridade',
  partner: 'Parceiro',
  size: 'Porte',
  stage: 'Etapa',
  deadline: 'Prazo',
  quote_date: 'Data do orçamento',
  quote_value: 'Valor orçado',
  notes: 'Observações',
  drive_link: 'Link do Drive',
  seller: 'Vendedor responsável',
}
