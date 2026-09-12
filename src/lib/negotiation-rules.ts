// Regras de "essa negociação está sem notícia há tempo demais".
// Arquivo puro (sem server/client) — usado pela fila diária, pelo lembrete do
// robô e pelos relatórios, pra todo mundo medir com a mesma régua.

export type Temp = 'hot' | 'warm' | 'cold' | 'no_forecast'

/**
 * Dias sem atualização até a negociação entrar na fila.
 *
 * Calibrado pelo tempo real de fechamento das vendas negociadas (excluindo as
 * de balcão, que fecham no mesmo dia), medido em set/26:
 *   com parceiro → mediana 12 dias, 3 em cada 4 fecham em até 32
 *   sem parceiro → mediana  7 dias, 3 em cada 4 fecham em até 17
 *
 * Regra: quente = ¼ do tempo típico, morna = ½, fria = o tempo típico inteiro,
 * sem previsão = até onde 3 em cada 4 já fecharam (limitado a 21 dias — mais
 * que isso a negociação some do radar). Venda com parceiro demora mais porque
 * depende de obra e aprovação de projeto, então tem prazo mais longo.
 */
export const CADENCE_DAYS: Record<'partner' | 'direct', Record<Temp, number>> = {
  partner: { hot: 3, warm: 6, cold: 12, no_forecast: 21 },
  direct:  { hot: 2, warm: 4, cold: 7,  no_forecast: 17 },
}

export function cadenceFor(temp: Temp, hasPartner: boolean) {
  return CADENCE_DAYS[hasPartner ? 'partner' : 'direct'][temp] ?? 17
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
  hasPartner: boolean
}

export function isOverdue(c: QueueCandidate, now = new Date()) {
  return daysBetween(c.lastTouch, now) >= cadenceFor(c.temperature, c.hasPartner)
}

/**
 * Ordem da fila: temperatura mais quente primeiro, depois quem está mais
 * atrasado, e o valor desempata. Assim os 5 do dia são sempre os que mais
 * pesam no mês, e o backlog antigo vai sendo limpo aos poucos.
 */
export function priorityScore(c: QueueCandidate, now = new Date()) {
  const overdue = daysBetween(c.lastTouch, now) - cadenceFor(c.temperature, c.hasPartner)
  return TEMP_WEIGHT[c.temperature] * 100 + Math.min(Math.max(overdue, 0), 60) + Math.log10((c.value || 0) + 1)
}
