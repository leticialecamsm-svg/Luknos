// Monta o texto da agenda da loja (usado pelo bot-conversation-engine no menu
// e pela wa-agenda-daily no disparo das 8h30). Fonte: tabela `schedules`.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ScheduleRow {
  title: string
  location: string | null
  scheduled_date: string
  scheduled_time: string | null
  team_members: string[] | null
}

const TZ = 'America/Sao_Paulo'
const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}
function hourSP(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()),
  )
}
export function greetingWord(): string {
  const h = hourSP()
  if (h < 12) return 'Bom dia ☀️'
  if (h < 18) return 'Boa tarde 🌤️'
  return 'Boa noite 🌙'
}
function fmtDM(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}` : iso
}
function weekdayOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return WEEKDAY[d.getDay()] ?? ''
}
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5).replace(':', 'h') : null
}

function weekBounds(): { start: string; end: string } {
  const today = todayISO()
  const d = new Date(today + 'T12:00:00')
  const dow = (d.getDay() + 6) % 7 // 0 = segunda
  const mon = new Date(d)
  mon.setDate(d.getDate() - dow)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) }
}

async function fetchRange(db: SupabaseClient, start: string, end: string): Promise<ScheduleRow[]> {
  const { data } = await db
    .from('schedules')
    .select('title, location, scheduled_date, scheduled_time, team_members')
    .gte('scheduled_date', start)
    .lte('scheduled_date', end)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: false })
  return (data ?? []) as ScheduleRow[]
}

function eventLine(e: ScheduleRow, withDate: boolean): string {
  const t = hhmm(e.scheduled_time)
  const datePart = withDate ? `_${weekdayOf(e.scheduled_date)} ${fmtDM(e.scheduled_date)}_ · ` : ''
  const head = t ? `⏰ *${t}* — ${e.title}` : `• ${e.title}`
  const loc = e.location ? `\n   📍 ${e.location}` : ''
  return `${datePart}${head}${loc}`
}

function linkedTail(rows: ScheduleRow[], sellerId: string | null): string {
  const mine = rows.filter((e) => sellerId && (e.team_members ?? []).includes(sellerId))
  if (mine.length === 0) {
    return '\n\nVocê não está ligado diretamente a nenhum desses eventos, mas vamos trabalhar junto à equipe pra garantir o cumprimento da agenda! 💪'
  }
  const titles = mine.map((e) => `*${e.title}*`).join('\n   • ')
  const lead = mine.length === 1
    ? '🔗 *Você está ligado diretamente ao evento:*'
    : '🔗 *Você está ligado diretamente aos eventos:*'
  return `\n\n${lead}\n   • ${titles}\n\nVamos trabalhar junto à equipe pra garantir o cumprimento da agenda! 💪`
}

export type AgendaMode = 'day' | 'week' | 'both'

// mode 'both' = resumo do dia + resto da semana (usado no disparo das 8h30).
export async function buildAgendaText(
  db: SupabaseClient,
  opts: { sellerId: string | null; firstName: string; mode: AgendaMode },
): Promise<string> {
  const { sellerId, firstName, mode } = opts
  const today = todayISO()
  const hi = `Olá${firstName ? `, *${firstName}*` : ''}! ${greetingWord()}`

  if (mode === 'day') {
    const rows = await fetchRange(db, today, today)
    if (rows.length === 0) return `${hi}\n\n📅 *Agenda de hoje (${fmtDM(today)})*\nSem eventos hoje. 🎉`
    const body = rows.map((e) => `• ${eventLine(e, false)}`).join('\n')
    return `${hi}\n\n📅 *Agenda de hoje (${fmtDM(today)})*\n${body}${linkedTail(rows, sellerId)}`
  }

  if (mode === 'week') {
    const { start, end } = weekBounds()
    const rows = await fetchRange(db, start, end)
    if (rows.length === 0) return `${hi}\n\n🗓️ *Agenda da semana*\nSem eventos nesta semana.`
    const body = rows.map((e) => `• ${eventLine(e, true)}`).join('\n')
    return `${hi}\n\n🗓️ *Agenda da semana*\n${body}${linkedTail(rows, sellerId)}`
  }

  // both — resumo do dia + resto da semana
  const { start, end } = weekBounds()
  const week = await fetchRange(db, start, end)
  const dayRows = week.filter((e) => e.scheduled_date === today)
  const restRows = week.filter((e) => e.scheduled_date > today)

  const parts: string[] = [hi, '']

  parts.push(`📅 *Hoje (${weekdayOf(today)} ${fmtDM(today)})*`)
  parts.push(
    dayRows.length === 0
      ? 'Sem eventos hoje. 🎉'
      : dayRows.map((e) => `• ${eventLine(e, false)}`).join('\n'),
  )

  if (restRows.length > 0) {
    parts.push('')
    parts.push('🗓️ *Ainda nesta semana*')
    parts.push(restRows.map((e) => `• ${eventLine(e, true)}`).join('\n'))
  }

  return parts.join('\n') + linkedTail(week, sellerId)
}
