// Regras puras do follow-up do CRM (sem I/O), cobertas por testes.

export type DueState = 'overdue' | 'today' | 'soon' | 'later'

// Atrasado = já passou do horário. Hoje = é hoje (ainda não passou). Em breve = próximos 3 dias.
export function dueState(dueIso: string, now: Date = new Date()): DueState {
  const due = new Date(dueIso)
  if (due.getTime() <= now.getTime()) return 'overdue'
  const sameDay = due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate()
  if (sameDay) return 'today'
  if (due.getTime() - now.getTime() <= 3 * 24 * 3600 * 1000) return 'soon'
  return 'later'
}

function at(base: Date, addDays: number, hour: number, minute = 0): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + addDays)
  d.setHours(hour, minute, 0, 0)
  return d
}

// Atalhos de data. Dia útil: pula sábado e domingo.
export function nextBusinessDay(from: Date, hour = 9): Date {
  let d = at(from, 1, hour)
  while (d.getDay() === 0 || d.getDay() === 6) d = at(d, 1, hour)
  return d
}

export function followupPresets(now: Date = new Date()): { id: string; label: string; date: Date }[] {
  const inHours = new Date(now.getTime() + 3 * 3600 * 1000)
  inHours.setMinutes(0, 0, 0)
  inHours.setHours(inHours.getHours() + 1) // arredonda para a próxima hora cheia
  return [
    { id: '3h', label: 'Daqui a 3 horas', date: inHours },
    { id: 'tomorrow', label: 'Amanhã 9h', date: nextBusinessDay(now) },
    { id: '3d', label: 'Em 3 dias', date: at(now, 3, 9) },
    { id: '1w', label: 'Em 1 semana', date: at(now, 7, 9) },
    { id: '2w', label: 'Em 2 semanas', date: at(now, 14, 9) },
  ]
}

// <input type="datetime-local"> trabalha com "YYYY-MM-DDTHH:mm" no horário local.
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDue(dueIso: string, now: Date = new Date()): string {
  const d = new Date(dueIso)
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const st = dueState(dueIso, now)
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  if (sameDay) return `hoje às ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `amanhã às ${time}`
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...(d.getFullYear() !== now.getFullYear() ? { year: '2-digit' } : {}) })
  return st === 'overdue' ? `${date} às ${time}` : `${date} às ${time}`
}

export const FOLLOWUP_NOTE_MAX = 1000
