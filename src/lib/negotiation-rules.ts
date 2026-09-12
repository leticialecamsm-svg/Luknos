// Regras de "essa negociação está sem notícia há tempo demais".
// Arquivo puro (sem server/client) — usado pela fila diária, pelo lembrete do
// robô e pelos relatórios, pra todo mundo medir com a mesma régua.

export type Temp = 'hot' | 'warm' | 'cold' | 'no_forecast'

/** Dias sem atualização até a negociação entrar na fila, por temperatura. */
export const CADENCE_DAYS: Record<Temp, number> = {
  hot: 2,          // quente esfria rápido — precisa de notícia a cada 2 dias
  warm: 4,
  cold: 7,
  no_forecast: 14,
}

/** Quantas negociações cada vendedor recebe por dia na fila. */
export const DAILY_UPDATE_CAP = 5

export const TEMP_LABEL: Record<string, string> = {
  hot: 'Quente', warm: 'Morna', cold: 'Fria', no_forecast: 'Sem previsão', closed: 'Fechada', lost: 'Perdida',
}

const TEMP_WEIGHT: Record<Temp, number> = { hot: 4, warm: 3, cold: 2, no_forecast: 1 }

export function daysBetween(fromIso: string | null | undefined, now = new Date()) {
  if (!fromIso) return 999
  return Math.floor((now.getTime() - new Date(fromIso).getTime()) / 86400000)
}

/** Data de hoje no fuso de Brasília (YYYY-MM-DD). */
export function todayBR(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

export type QueueCandidate = {
  quoteId: string
  temperature: Temp
  lastTouch: string | null
  value: number
}

export function isOverdue(c: QueueCandidate, now = new Date()) {
  return daysBetween(c.lastTouch, now) >= (CADENCE_DAYS[c.temperature] ?? 14)
}

/**
 * Ordem da fila: temperatura mais quente primeiro, depois quem está mais
 * atrasado, e o valor desempata. Assim os 5 do dia são sempre os que mais
 * pesam no mês, e o backlog antigo vai sendo limpo aos poucos.
 */
export function priorityScore(c: QueueCandidate, now = new Date()) {
  const overdue = daysBetween(c.lastTouch, now) - (CADENCE_DAYS[c.temperature] ?? 14)
  return TEMP_WEIGHT[c.temperature] * 100 + Math.min(Math.max(overdue, 0), 60) + Math.log10((c.value || 0) + 1)
}
