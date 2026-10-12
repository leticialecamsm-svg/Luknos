// Hora/data curta da última mensagem na lista, como no WhatsApp:
// hoje → "09:40", ontem → "Ontem", últimos 6 dias → "seg.", antes → "08/10/2026".
const TZ = 'America/Sao_Paulo'

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d) // AAAA-MM-DD
}

export function formatListTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const k = dayKey(d)
  if (k === dayKey(now)) return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d)
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(k)) / 86400000)
  if (days === 1) return 'Ontem'
  if (days > 1 && days < 7) return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short' }).format(d).replace('.', '')
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

// Separador de dia dentro da conversa: "Hoje", "Ontem", "Segunda-feira" (últimos 6 dias), "08/10/2026".
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const k = dayKey(d)
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(k)) / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days > 1 && days < 7) {
    const w = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' }).format(d)
    return w.charAt(0).toUpperCase() + w.slice(1)
  }
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export function sameDay(a: string, b: string): boolean {
  return dayKey(new Date(a)) === dayKey(new Date(b))
}
