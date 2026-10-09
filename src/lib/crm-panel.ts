// Regras puras do painel "Dados do contato" do CRM (sem I/O), cobertas por testes.

export function onlyDigits(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}

// Variantes do mesmo celular brasileiro: com e sem o 9º dígito, com e sem o 55.
export function phoneVariants(raw: string | null | undefined): string[] {
  let d = onlyDigits(raw)
  if (!d) return []
  const out = new Set<string>()
  if (d.length === 10 || d.length === 11) d = '55' + d // sem DDI: assume Brasil
  out.add(d)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const num = d.slice(4)
    if (num.length === 9 && num.startsWith('9')) out.add('55' + ddd + num.slice(1))
    if (num.length === 8) out.add('55' + ddd + '9' + num)
  }
  return Array.from(out)
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const av = new Set(phoneVariants(a))
  return phoneVariants(b).some((v) => av.has(v))
}

export function formatPhoneBR(raw: string | null | undefined): string {
  const d = onlyDigits(raw)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const num = d.slice(4)
    return `+55 ${ddd} ${num.slice(0, num.length - 4)}-${num.slice(-4)}`
  }
  return d ? `+${d}` : ''
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi

// Links citados em um texto (sem pontuação final colada).
export function extractLinks(text: string | null | undefined): string[] {
  if (!text) return []
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ''))
}

export const QUOTE_STATUS_LABEL: Record<string, string> = {
  queue: 'Na fila',
  in_progress: 'Em andamento',
  review: 'Em revisão',
  paused: 'Pausado',
  done: 'Concluído',
}

export const TEMPERATURE_LABEL: Record<string, string> = {
  cold: 'Frio',
  warm: 'Morno',
  closed: 'Fechado',
  lost: 'Perdido',
  no_forecast: 'Sem previsão',
}

export const CONTACT_TYPE_LABEL: Record<string, string> = {
  client: 'Cliente',
  architect: 'Arquiteto(a)',
  designer: 'Designer',
  electrician: 'Eletricista',
  engineer: 'Engenheiro(a)',
  plasterer: 'Gesseiro',
  other: 'Outro',
}

// Categorias de contato do sistema (enum contact_type), na ordem de exibição.
export const CONTACT_TYPES = [
  { value: 'client', label: 'Cliente' },
  { value: 'architect', label: 'Arquiteto(a)' },
  { value: 'designer', label: 'Designer' },
  { value: 'electrician', label: 'Eletricista' },
  { value: 'engineer', label: 'Engenheiro(a)' },
  { value: 'plasterer', label: 'Gesseiro' },
  { value: 'other', label: 'Outro' },
] as const

export type ContactTypeValue = (typeof CONTACT_TYPES)[number]['value']

export function isContactType(v: unknown): v is ContactTypeValue {
  return typeof v === 'string' && CONTACT_TYPES.some((t) => t.value === v)
}

// Mesmo padrão do cadastro de contatos do sistema: "55 82 9671-7950".
export function formatPhoneForContact(raw: string | null | undefined): string {
  const d = onlyDigits(raw)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const num = d.slice(4)
    return `55 ${d.slice(2, 4)} ${num.slice(0, num.length - 4)}-${num.slice(-4)}`
  }
  return d
}

// Comissão padrão de parceiros por categoria (igual ao cadastro de /partners).
export const DEFAULT_COMMISSION_BY_TYPE: Record<string, number> = {
  architect: 10, engineer: 5, electrician: 3, plasterer: 3, designer: 3, other: 3,
}
