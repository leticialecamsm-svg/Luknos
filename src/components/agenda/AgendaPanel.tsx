'use client'

import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, Calendar, Maximize2,
  MapPin, FileText, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'

// Mesmos tons do WeekView.tsx / SchedulesContainer.tsx — visita=azul,
// reunião=âmbar, follow-up=verde. Mantidos aqui pra agenda inteira falar
// a mesma língua visual do resto do sistema.
const TYPE: Record<string, { label: string; tint: string; text: string; bar: string; dot: string }> = {
  visita:    { label: 'Visita',    tint: 'bg-blue-50',  text: 'text-blue-700',  bar: 'border-l-blue-500',  dot: 'bg-blue-500' },
  reuniao:   { label: 'Reunião',   tint: 'bg-amber-50', text: 'text-amber-700', bar: 'border-l-amber-500', dot: 'bg-amber-500' },
  follow_up: { label: 'Follow-up', tint: 'bg-green-50', text: 'text-green-700', bar: 'border-l-green-500', dot: 'bg-green-500' },
}
const FALLBACK = { label: 'Compromisso', tint: 'bg-gray-50', text: 'text-gray-600', bar: 'border-l-gray-400', dot: 'bg-gray-400' }
const typeOf = (t: string) => TYPE[t] ?? FALLBACK

const HOUR_PX = 56

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseISO(s: string) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}
/** Segunda-feira da semana que contém `date`. */
function startOfWeek(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
function hhmm(time?: string | null) {
  if (!time) return null
  return String(time).slice(0, 5).replace(':', 'h')
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini calendário do mês
// ─────────────────────────────────────────────────────────────────────────────

const DOW_MINI = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function MiniCalendar({ schedules, selected, onSelect }: {
  schedules: any[]
  selected: string
  onSelect: (iso: string) => void
}) {
  const [cursor, setCursor] = useState(() => { const d = parseISO(selected); d.setDate(1); return d })
  const todayIso = toISO(new Date())

  const typesByDate = useMemo(() => {
    const map: Record<string, string[]> = {}
    schedules.forEach(s => {
      const list = map[s.scheduled_date] ?? (map[s.scheduled_date] = [])
      if (!list.includes(s.type)) list.push(s.type)
    })
    return map
  }, [schedules])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDow = new Date(year, month, 1).getDay()          // 0=domingo
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(cursor)

  const cells: { day: number; iso: string | null }[] = []
  for (let i = firstDow - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, iso: null })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, iso: toISO(new Date(year, month, d)) })

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="flex items-center justify-center gap-3 mb-3">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-sm font-semibold text-gray-900 first-letter:uppercase">{monthLabel}</span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7">
        {DOW_MINI.map((d, i) => (
          <div key={i} className="text-[9px] font-bold text-gray-400 text-center pb-1.5 uppercase">{d}</div>
        ))}
        {cells.map((c, i) => {
          if (!c.iso) return <div key={i} className="aspect-square flex items-center justify-center text-[11px] text-gray-300">{c.day}</div>
          const isToday = c.iso === todayIso
          const isSel = c.iso === selected
          const types = (typesByDate[c.iso] ?? []).slice(0, 3)
          return (
            <button key={i} onClick={() => onSelect(c.iso!)}
              className={cn('relative aspect-square flex items-center justify-center rounded-full text-[11.5px] transition-colors',
                isToday ? 'bg-brand-500 text-white font-bold'
                  : isSel ? 'bg-gray-900 text-white font-semibold'
                  : 'text-gray-700 hover:bg-gray-100')}>
              {c.day}
              {types.length > 0 && (
                <span className="absolute bottom-0.5 flex gap-[2px]">
                  {types.map(t => (
                    <i key={t} className={cn('w-[3px] h-[3px] rounded-full',
                      (isToday || isSel) ? 'bg-white/90' : typeOf(t).dot)} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista "de hoje em diante"
// ─────────────────────────────────────────────────────────────────────────────

export function UpcomingList({ schedules, onSelect, onNew }: {
  schedules: any[]
  onSelect: (s: any) => void
  onNew?: () => void
}) {
  const todayIso = toISO(new Date())
  const tomorrowIso = toISO(new Date(Date.now() + 86400000))

  const upcoming = useMemo(() => (
    schedules
      .filter(s => s.scheduled_date >= todayIso)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)
        || String(a.scheduled_time ?? '').localeCompare(String(b.scheduled_time ?? '')))
  ), [schedules, todayIso])

  function label(iso: string) {
    if (iso === todayIso) return 'Hoje'
    if (iso === tomorrowIso) return 'Amanhã'
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
      .format(parseISO(iso)).replace(/\./g, '').toUpperCase()
  }

  if (upcoming.length === 0) {
    return (
      <div className="px-4 pb-5 pt-2">
        <p className="text-xs text-gray-400 py-3">Nenhum compromisso de hoje em diante.</p>
        {onNew && (
          <button onClick={onNew} className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
            <Plus className="w-3.5 h-3.5" /> Novo agendamento
          </button>
        )}
      </div>
    )
  }

  let lastLabel: string | null = null

  return (
    <div className="px-3 pb-5">
      {upcoming.map(s => {
        const t = typeOf(s.type)
        const l = label(s.scheduled_date)
        const showLabel = l !== lastLabel
        lastLabel = l
        return (
          <div key={s.id}>
            {showLabel && (
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mt-4 mb-2 first:mt-1">{l}</p>
            )}
            <button onClick={() => onSelect(s)}
              className={cn('w-full text-left border-l-[3px] rounded-lg px-3 py-2.5 mb-2 transition-all hover:brightness-[0.98]', t.tint, t.bar)}>
              <p className={cn('text-[11.5px] font-bold flex items-center gap-1.5', t.text)}>
                {hhmm(s.scheduled_time) ?? 'Sem horário'}
                <span className={cn('w-1 h-1 rounded-full', t.dot)} />
                {t.label}
              </p>
              <p className="text-[13px] font-semibold text-gray-900 leading-snug mt-0.5">{s.title}</p>
              {s.location && (
                <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{s.location}</span>
                </p>
              )}
              {s.quote && (
                <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="font-semibold text-brand-600">ORC #{s.quote.number}</span>
                  <span className="truncate">· {s.quote.client_name}</span>
                </p>
              )}
              {s.participants?.length > 0 && (
                <div className="flex justify-end mt-1.5">
                  {s.participants.length === 1 ? (
                    <span className="inline-flex items-center gap-1.5 bg-white border border-surface-border rounded-full pl-0.5 pr-2.5 py-0.5">
                      <Avatar user={s.participants[0]} size={18} />
                      <span className="text-[11px] font-medium text-gray-600">{s.participants[0].name.split(' ')[0]}</span>
                    </span>
                  ) : (
                    <div className="flex -space-x-1.5">
                      {s.participants.slice(0, 4).map((p: any) => (
                        <Avatar key={p.id} user={p} size={20} className="ring-2 ring-white" />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Semana — sem linhas de hora, só as colunas dos dias
// ─────────────────────────────────────────────────────────────────────────────

const DOW_WEEK = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']

export function AgendaWeek({ schedules, weekStart, onPrev, onNext, onSelect, compact }: {
  schedules: any[]
  weekStart: Date
  onPrev: () => void
  onNext: () => void
  onSelect: (s: any) => void
  compact?: boolean
}) {
  const todayIso = toISO(new Date())
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d
  })
  const isoDays = days.map(toISO)
  const weekSchedules = schedules.filter(s => isoDays.includes(s.scheduled_date))

  // Faixa de horas que cobre os compromissos da semana (mínimo 8h–18h)
  const hours = useMemo(() => {
    let min = 8, max = 18
    weekSchedules.forEach(s => {
      if (!s.scheduled_time) return
      const h = parseInt(String(s.scheduled_time).slice(0, 2), 10)
      if (!Number.isNaN(h)) { if (h < min) min = h; if (h + 1 > max) max = h + 1 }
    })
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }, [weekSchedules])

  const px = compact ? 44 : HOUR_PX
  const gridH = hours.length * px
  const fmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
  const rangeLabel = `${fmt.format(days[0]).replace('.', '')} – ${fmt.format(days[6]).replace('.', '')}`

  return (
    <div className={compact ? 'px-3 pb-4 pt-2' : 'px-1 pb-6'}>
      <div className="flex items-center justify-between px-1 pb-3">
        <span className="text-sm font-semibold text-gray-900">{rangeLabel}</span>
        <div className="flex gap-1">
          <button onClick={onPrev} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onNext} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: `${compact ? 30 : 44}px repeat(7, minmax(0,1fr))` }}>
        {/* Cabeçalho dos dias */}
        <div />
        {days.map((d, i) => {
          const isToday = toISO(d) === todayIso
          return (
            <div key={i} className="text-center pb-3 border-l border-gray-100">
              <p className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wide">{DOW_WEEK[i]}</p>
              <p className={cn('mt-0.5', compact ? 'text-xs' : 'text-sm', 'font-bold',
                isToday ? 'inline-flex items-center justify-center rounded-full bg-brand-500 text-white' : 'text-gray-800')}
                style={isToday ? { width: compact ? 20 : 24, height: compact ? 20 : 24 } : undefined}>
                {d.getDate()}
              </p>
            </div>
          )
        })}

        {/* Coluna das horas — só rótulos, sem linhas */}
        <div className="relative" style={{ height: gridH }}>
          {hours.map((h, i) => (
            <span key={h} className={cn('absolute right-0 left-0 text-right text-gray-400', compact ? 'text-[8.5px] pr-1' : 'text-[9.5px] pr-2')}
              style={{ top: i * px - 6 }}>
              {h}h
            </span>
          ))}
        </div>

        {/* Colunas dos dias */}
        {isoDays.map(iso => {
          const list = weekSchedules.filter(s => s.scheduled_date === iso)
          const timed = list.filter(s => s.scheduled_time)
          const untimed = list.filter(s => !s.scheduled_time)
          return (
            <div key={iso} className="relative border-l border-gray-100" style={{ height: gridH }}>
              {untimed.map((s, i) => {
                const t = typeOf(s.type)
                return (
                  <button key={s.id} onClick={() => onSelect(s)}
                    className={cn('absolute left-1 right-1 rounded-md border-l-[3px] px-1.5 py-1 text-left truncate', t.tint, t.bar)}
                    style={{ top: i * 22 }}>
                    <span className={cn('text-[9.5px] font-bold', t.text)}>{s.title}</span>
                  </button>
                )
              })}
              {timed.map(s => {
                const t = typeOf(s.type)
                const h = parseInt(String(s.scheduled_time).slice(0, 2), 10)
                const m = parseInt(String(s.scheduled_time).slice(3, 5), 10) || 0
                const top = (h + m / 60 - hours[0]) * px + untimed.length * 22
                return (
                  <button key={s.id} onClick={() => onSelect(s)}
                    className={cn('absolute left-1 right-1 bg-white border border-gray-200 border-l-[3px] rounded-lg shadow-sm hover:shadow-md transition-shadow text-left overflow-hidden flex flex-col',
                      compact ? 'px-1.5 py-1' : 'px-2 py-1.5', t.bar)}
                    style={{ top, height: Math.max(px - 4, compact ? 30 : 38) }}>
                    <span className={cn('font-bold leading-tight truncate w-full', compact ? 'text-[9.5px]' : 'text-[11px]', t.text)}>
                      {s.title}
                    </span>
                    <span className={cn('text-gray-400', compact ? 'text-[8px]' : 'text-[9.5px]')}>{hhmm(s.scheduled_time)}</span>
                    {!compact && s.participants?.length > 0 && (
                      <div className="flex -space-x-1.5 mt-auto pt-1">
                        {s.participants.slice(0, 3).map((p: any) => (
                          <Avatar key={p.id} user={p} size={18} className="ring-2 ring-white" />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel lateral da página de Tarefas
// ─────────────────────────────────────────────────────────────────────────────

export function AgendaPanel({ schedules, onSelect, onNew }: {
  schedules: any[]
  onSelect: (s: any) => void
  onNew: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [selectedDay, setSelectedDay] = useState(() => toISO(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 flex flex-col items-center bg-white rounded-2xl border border-gray-200 shadow-xl py-3">
        <button onClick={() => setCollapsed(false)} title="Abrir agenda"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Calendar className="w-4 h-4 text-gray-300 mt-3" />
      </aside>
    )
  }

  return (
    <aside className={cn('shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden transition-[width] duration-200',
      expanded ? 'w-[640px]' : 'w-80')}>
      <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-100 shrink-0">
        <Calendar className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-bold text-gray-900 mr-auto">Agenda</span>
        <button onClick={onNew} title="Novo agendamento"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-brand-600">
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={() => setExpanded(v => !v)} title={expanded ? 'Voltar pro mês' : 'Expandir para a semana'}
          className={cn('w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
            expanded ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700')}>
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setCollapsed(true)} title="Recolher painel"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {expanded ? (
          <AgendaWeek
            compact
            schedules={schedules}
            weekStart={weekStart}
            onPrev={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n })}
            onNext={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n })}
            onSelect={onSelect}
          />
        ) : (
          <>
            <MiniCalendar schedules={schedules} selected={selectedDay} onSelect={setSelectedDay} />
            <UpcomingList schedules={schedules} onSelect={onSelect} onNew={onNew} />
          </>
        )}
      </div>
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Agenda" cheia — calendário + lista à esquerda, semana à direita
// ─────────────────────────────────────────────────────────────────────────────

export function AgendaFull({ schedules, onSelect, onNew }: {
  schedules: any[]
  onSelect: (s: any) => void
  onNew: () => void
}) {
  const [selectedDay, setSelectedDay] = useState(() => toISO(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  return (
    <div className="flex gap-5 h-full min-h-0">
      <aside className="w-72 shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <MiniCalendar schedules={schedules} selected={selectedDay} onSelect={setSelectedDay} />
          <UpcomingList schedules={schedules} onSelect={onSelect} onNew={onNew} />
        </div>
      </aside>

      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 overflow-y-auto p-4">
        <AgendaWeek
          schedules={schedules}
          weekStart={weekStart}
          onPrev={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n })}
          onNext={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n })}
          onSelect={onSelect}
        />
      </div>
    </div>
  )
}
