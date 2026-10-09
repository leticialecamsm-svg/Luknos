// "Aguardando resposta": a última mensagem da conversa é do cliente.
// Urgente = o cliente espera há mais de URGENT_AFTER_MS.
export const URGENT_AFTER_MS = 3 * 60 * 60 * 1000

export function isUrgentWait(waitingSince: string | number | Date, now = Date.now()): boolean {
  return now - new Date(waitingSince).getTime() >= URGENT_AFTER_MS
}

// "há 5 min", "há 2 h", "há 1 d 3 h"
export function formatWaiting(waitingSince: string | number | Date, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - new Date(waitingSince).getTime()) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  const rest = h % 24
  return rest ? `há ${d} d ${rest} h` : `há ${d} d`
}
