// Regras puras do Kanban do CRM (sem I/O) — compartilhadas entre as server
// actions e a UI, e cobertas por testes (crm-stages.test.ts).

export const MAX_STAGES = 20
export const STAGE_NAME_MAX = 40
export const STAGE_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#22c55e', '#ef4444', '#ec4899', '#64748b',
] as const

export interface CrmStage {
  id: string
  name: string
  color: string
  position: number
  restart_on_inbound: boolean
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function normalizeStageName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

export function sameStageName(a: string, b: string): boolean {
  return normalizeStageName(a).toLocaleLowerCase('pt-BR') === normalizeStageName(b).toLocaleLowerCase('pt-BR')
}

export function validateStageInput(
  input: { name: string; color: string; restart_on_inbound?: boolean },
): { error: string } | { name: string; color: string; restart_on_inbound: boolean } {
  const name = normalizeStageName(input.name ?? '')
  if (!name) return { error: 'Dê um nome para a coluna' }
  if (name.length > STAGE_NAME_MAX) return { error: `Nome pode ter no máximo ${STAGE_NAME_MAX} caracteres` }
  if (!HEX.test(input.color ?? '')) return { error: 'Cor inválida' }
  return { name, color: input.color.toLowerCase(), restart_on_inbound: !!input.restart_on_inbound }
}

// Conversa sem etapa (ou com etapa que não existe mais) cai na PRIMEIRA coluna.
export function groupByStage<T extends { id: string; stage_id: string | null }>(
  stages: CrmStage[],
  cards: T[],
): Map<string, T[]> {
  const ordered = [...stages].sort((a, b) => a.position - b.position)
  const map = new Map<string, T[]>(ordered.map((s) => [s.id, []]))
  const first = ordered[0]?.id
  for (const c of cards) {
    const key = c.stage_id && map.has(c.stage_id) ? c.stage_id : first
    if (key) map.get(key)!.push(c)
  }
  return map
}

// Nome da instância vira parte de URL da Evolution: só letras, números, espaço,
// ponto, hífen, sublinhado e acentos. Barra, ?, # e % quebrariam a chamada.
export function isValidInstanceName(name: string): boolean {
  const n = name.trim()
  return n.length >= 1 && n.length <= 60 && !/[\/?#%\\\u0000-\u001f]/.test(n)
}

// Telefone E.164 comparado só pelos dígitos.
export function samePhoneDigits(a: string | null, b: string | null): boolean {
  const da = (a ?? '').replace(/\D/g, '')
  const db = (b ?? '').replace(/\D/g, '')
  return !!da && da === db
}
