'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, Calendar, Maximize2,
  MapPin, FileText, Plus, CalendarX, Clock, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'

// Mesmos tons do WeekView.tsx / SchedulesContainer.tsx — visita=azul,
// reunião=âmbar, follow-up=verde. Mantidos aqui pra agenda inteira falar
// a mesma língua visual do resto do sistema.
const TYPE: Record<string, { label: string; tint: string; text: string; textOnNavy: string; bar: string; dot: string }> = {
  visita:    { label: 'Visita',    tint: 'bg-blue-50',  text: 'text-blue-700',  textOnNavy: 'text-blue-200',  bar: 'border-l-blue-500',  dot: 'bg-blue-500' },
  reuniao:   { label: 'Reunião',   tint: 'bg-amber-50', text: 'text-amber-700', textOnNavy: 'text-amber-200', bar: 'border-l-amber-500', dot: 'bg-amber-500' },
  follow_up: { label: 'Follow-up', tint: 'bg-green-50', text: 'text-green-700', textOnNavy: 'text-green-200', bar: 'border-l-green-500', dot: 'bg-green-500' },
  lembrete:  { label: 'Lembrete',  tint: 'bg-violet-50', text: 'text-violet-700', textOnNavy: 'text-violet-200', bar: 'border-l-violet-500', dot: 'bg-violet-500' },
}
const FALLBACK = { label: 'Compromisso', tint: 'bg-surface-secondary', text: 'text-gray-600', textOnNavy: 'text-white/70', bar: 'border-l-gray-400', dot: 'bg-gray-400' }
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
// Preview no hover — igual ao calendário do Viver de IA: passa o mouse em cima
// de um compromisso "espremido" na grade da semana e vê tudo por completo,
// sem precisar clicar. Clicar continua abrindo o modal de sempre.
// ─────────────────────────────────────────────────────────────────────────────

function EventPreview({ schedule: s, openLeft }: { schedule: any; openLeft?: boolean }) {
  const t = typeOf(s.type)
  return (
    <div
      className={cn(
        'invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150',
        'pointer-events-none absolute top-0 z-50 w-56 rounded-xl bg-gradient-navy-mesh shadow-hero p-3.5 text-left',
        openLeft ? 'right-full mr-2' : 'left-full ml-2'
      )}
    >
      <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide', t.textOnNavy)}>
        <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} /> {t.label}
      </span>
      <p className="text-sm font-semibold text-white leading-snug mt-1">{s.title}</p>

      <div className="mt-2.5 space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] text-white/70">
          <Clock className="w-3 h-3 shrink-0" /> {hhmm(s.scheduled_time) ?? 'Sem horário'}
        </p>
        {s.location && (
          <p className="flex items-center gap-1.5 text-[11px] text-white/70">
            <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{s.location}</span>
          </p>
        )}
        {s.quote && (
          <p className="flex items-center gap-1.5 text-[11px] text-white/70">
            <FileText className="w-3 h-3 shrink-0" />
            <span className="text-brand-400 font-semibold">#{s.quote.number}</span>
            <span className="truncate">· {s.quote.client_name}</span>
          </p>
        )}
        {s.participants?.length > 0 && (
          <div className="flex items-start gap-1.5 pt-0.5">
            <Users className="w-3 h-3 shrink-0 mt-0.5 text-white/70" />
            <p className="text-[11px] text-white/70 leading-snug">
              {s.participants.map((p: any) => p.name.split(' ')[0]).join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
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
          className="w-6 h-6 flex items-center justify-center rounded-md text-navy-muted hover:bg-surface-secondary hover:text-navy">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-sm font-semibold text-navy first-letter:uppercase">{monthLabel}</span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="w-6 h-6 flex items-center justify-center rounded-md text-navy-muted hover:bg-surface-secondary hover:text-navy">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7">
        {DOW_MINI.map((d, i) => (
          <div key={i} className="text-[9px] font-bold text-navy-muted/60 text-center pb-1.5 uppercase">{d}</div>
        ))}
        {cells.map((c, i) => {
          if (!c.iso) return <div key={i} className="aspect-square flex items-center justify-center text-[11px] text-gray-300">{c.day}</div>
          const isToday = c.iso === todayIso
          const isSel = c.iso === selected
          const types = (typesByDate[c.iso] ?? []).slice(0, 3)
          return (
            <button key={i} onClick={() => onSelect(c.iso!)}
              className={cn('relative aspect-square flex items-center justify-center rounded-full text-[11.5px] transition-colors',
                isSel ? 'bg-gradient-navy text-white font-bold shadow-[0_4px_10px_-2px_rgba(10,31,59,0.45)]'
                  : isToday ? 'bg-brand-500 text-white font-bold'
                  : 'text-navy-muted hover:bg-surface-secondary')}>
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

export function UpcomingList({ schedules, selectedDay, onSelect, onNew }: {
  schedules: any[]
  /** Dia escolhido no MiniCalendar — a lista mostra os compromissos DESSE dia. */
  selectedDay: string
  onSelect: (s: any) => void
  onNew?: () => void
}) {
  const todayIso = toISO(new Date())
  const tomorrowIso = toISO(new Date(Date.now() + 86400000))

  const dayItems = useMemo(() => (
    schedules
      .filter(s => s.scheduled_date === selectedDay)
      .sort((a, b) => String(a.scheduled_time ?? '').localeCompare(String(b.scheduled_time ?? '')))
  ), [schedules, selectedDay])

  const dayLabel = selectedDay === todayIso ? 'Hoje'
    : selectedDay === tomorrowIso ? 'Amanhã'
    : new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
        .format(parseISO(selectedDay)).replace(/^\w/, c => c.toUpperCase())

  return (
    <div className="px-3 pb-5">
      <p className="text-[10px] font-bold text-navy-muted/60 uppercase tracking-wider px-1 mt-4 mb-2">{dayLabel}</p>

      {dayItems.length === 0 ? (
        <div className="flex flex-col items-center text-center px-2 py-6">
          <div className="w-9 h-9 rounded-full bg-surface-secondary flex items-center justify-center mb-2">
            <CalendarX className="w-4 h-4 text-navy-muted/50" />
          </div>
          <p className="text-xs text-navy-muted">Nenhum compromisso nesse dia.</p>
          {onNew && (
            <button onClick={onNew} className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 mt-2">
              <Plus className="w-3.5 h-3.5" /> Novo agendamento
            </button>
          )}
        </div>
      ) : (
        dayItems.map(s => {
          const t = typeOf(s.type)
          return (
            <button key={s.id} onClick={() => onSelect(s)}
              className={cn('w-full text-left border-l-[3px] rounded-lg px-3 py-2.5 mb-2 transition-all hover:brightness-[0.98]', t.tint, t.bar)}>
              <p className={cn('text-[11.5px] font-bold flex items-center gap-1.5', t.text)}>
                {hhmm(s.scheduled_time) ?? 'Sem horário'}
                <span className={cn('w-1 h-1 rounded-full', t.dot)} />
                {t.label}
              </p>
              <p className="text-[13px] font-semibold text-navy leading-snug mt-0.5">{s.title}</p>
              {s.location && (
                <p className="text-[11px] text-navy-muted flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{s.location}</span>
                </p>
              )}
              {s.quote && (
                <p className="text-[11px] text-navy-muted flex items-center gap-1 mt-0.5">
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
                      <span className="text-[11px] font-medium text-navy-muted">{s.participants[0].name.split(' ')[0]}</span>
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
          )
        })
      )}
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

  // Relógio ao vivo — recalcula a cada 30s, o suficiente pra linha de "agora"
  // ir descendo suavemente sem custo nenhum (não tem compromisso pra recarregar).
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const nowHours = now.getHours() + now.getMinutes() / 60

  // Faixa de horas que cobre os compromissos da semana (mínimo 8h–18h, e
  // sempre incluindo a hora atual quando hoje está na semana visível, pra
  // linha de "agora" nunca ficar escondida fora da grade).
  const hours = useMemo(() => {
    let min = 8, max = 18
    weekSchedules.forEach(s => {
      if (!s.scheduled_time) return
      const h = parseInt(String(s.scheduled_time).slice(0, 2), 10)
      if (!Number.isNaN(h)) { if (h < min) min = h; if (h + 1 > max) max = h + 1 }
    })
    if (isoDays.includes(todayIso)) {
      const nh = Math.floor(nowHours)
      if (nh < min) min = nh
      if (nh + 1 > max) max = nh + 1
    }
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekSchedules, isoDays.includes(todayIso), Math.floor(nowHours)])

  const px = compact ? 44 : HOUR_PX
  const gridH = hours.length * px
  const fmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
  const rangeLabel = `${fmt.format(days[0]).replace('.', '')} – ${fmt.format(days[6]).replace('.', '')}`
  // Régua de "agora" — uma linha só, comum a todos os dias da semana (não é
  // por dia), na mesma altura em cada coluna. Só aparece quando a semana
  // visível contém hoje e a hora atual cai dentro da faixa mostrada.
  const showNowLine = isoDays.includes(todayIso) && nowHours >= hours[0] && nowHours <= hours[hours.length - 1] + 1

  return (
    <div className={compact ? 'px-3 pb-4 pt-2' : 'px-1 pb-6'}>
      <div className="flex items-center justify-between px-1 pb-3">
        <span className="text-sm font-semibold text-navy">{rangeLabel}</span>
        <div className="flex gap-1">
          <button onClick={onPrev} className="w-7 h-7 flex items-center justify-center rounded-lg text-navy-muted hover:bg-surface-secondary hover:text-navy">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onNext} className="w-7 h-7 flex items-center justify-center rounded-lg text-navy-muted hover:bg-surface-secondary hover:text-navy">
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
            <div key={i} className="text-center pb-3 border-l border-surface-border">
              <p className="text-[9.5px] font-bold text-navy-muted/60 uppercase tracking-wide">{DOW_WEEK[i]}</p>
              <p className={cn('mt-0.5', compact ? 'text-xs' : 'text-sm', 'font-bold',
                isToday ? 'inline-flex items-center justify-center rounded-full bg-gradient-navy text-white' : 'text-navy')}
                style={isToday ? { width: compact ? 20 : 24, height: compact ? 20 : 24 } : undefined}>
                {d.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      {/* Corpo da grade — gutter de horas + colunas dos dias, num wrapper
          relative só pra poder desenhar a linha de "agora" atravessando
          TODOS os dias de uma vez, numa única posição vertical (não é uma
          linha por dia — é uma régua só, comum à semana inteira). */}
      <div className="relative">
        {showNowLine && (
          <div className="absolute z-10 pointer-events-none flex items-center"
            style={{ top: (nowHours - hours[0]) * px, left: compact ? 30 : 44, right: 0 }}>
            <span className="w-2 h-2 -ml-1 rounded-full bg-brand-500 shrink-0" />
            <span className="flex-1 h-px bg-brand-500" />
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: `${compact ? 30 : 44}px repeat(7, minmax(0,1fr))` }}>
        {/* Coluna das horas — só rótulos, sem linhas */}
        <div className="relative" style={{ height: gridH }}>
          {hours.map((h, i) => (
            <span key={h} className={cn('absolute right-0 left-0 text-right text-navy-muted/50', compact ? 'text-[8.5px] pr-1' : 'text-[9.5px] pr-2')}
              style={{ top: i * px - 6 }}>
              {h}h
            </span>
          ))}
          {showNowLine && (
            <span className={cn('absolute right-0 left-0 text-right font-bold text-brand-600', compact ? 'text-[8px] pr-1' : 'text-[9px] pr-2')}
              style={{ top: (nowHours - hours[0]) * px - 6 }}>
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Colunas dos dias */}
        {isoDays.map((iso, dayIdx) => {
          const list = weekSchedules.filter(s => s.scheduled_date === iso)
          const timed = list.filter(s => s.scheduled_time)
          const untimed = list.filter(s => !s.scheduled_time)
          const openLeft = dayIdx >= 5 // sáb/dom: preview abre pra esquerda pra não estourar a tela
          return (
            <div key={iso} className="relative border-l border-surface-border" style={{ height: gridH }}>
              {untimed.map((s, i) => {
                const t = typeOf(s.type)
                return (
                  <button key={s.id} onClick={() => onSelect(s)}
                    className="group absolute left-1 right-1 text-left"
                    style={{ top: i * 22 }}>
                    <div className={cn('rounded-md border-l-[3px] px-1.5 py-1 truncate', t.tint, t.bar)}>
                      <span className={cn('text-[9.5px] font-bold', t.text)}>{s.title}</span>
                    </div>
                    <EventPreview schedule={s} openLeft={openLeft} />
                  </button>
                )
              })}
              {timed.map(s => {
                const t = typeOf(s.type)
                const h = parseInt(String(s.scheduled_time).slice(0, 2), 10)
                const m = parseInt(String(s.scheduled_time).slice(3, 5), 10) || 0
                const top = (h + m / 60 - hours[0]) * px + untimed.length * 22
                const hasAvatars = !compact && s.participants?.length > 0
                // Card cresce um pouco (pode sobrepor a hora seguinte) pra caber
                // horário + título (até 2 linhas) + avatares sem cortar nada.
                const height = compact ? Math.max(px - 4, 30) : (hasAvatars ? 88 : 44)
                return (
                  <button key={s.id} onClick={() => onSelect(s)}
                    className="group absolute left-1 right-1 text-left z-[1] hover:z-20"
                    style={{ top, height }}>
                    <div className={cn('h-full bg-gradient-card border border-surface-border border-l-[3px] rounded-lg shadow-sm group-hover:shadow-md transition-shadow overflow-hidden flex flex-col',
                        compact ? 'px-1.5 py-1' : 'px-2 py-1.5', t.bar)}>
                      <span className={cn('shrink-0 font-bold', compact ? 'text-[8px]' : 'text-[9.5px]', t.text)}>{hhmm(s.scheduled_time)}</span>
                      <span className={cn('shrink-0 font-semibold leading-tight w-full text-navy',
                        compact ? 'text-[9.5px] truncate' : 'text-[11px] line-clamp-2')}>
                        {s.title}
                      </span>
                      {hasAvatars && (
                        <div className="flex -space-x-1.5 mt-auto pt-1 shrink-0">
                          {s.participants.slice(0, 4).map((p: any) => (
                            <Avatar key={p.id} user={p} size={18} className="ring-2 ring-white" />
                          ))}
                        </div>
                      )}
                    </div>
                    <EventPreview schedule={s} openLeft={openLeft} />
                  </button>
                )
              })}
            </div>
          )
        })}
        </div>
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
      <aside className="w-12 shrink-0 flex flex-col items-center bg-gradient-card rounded-2xl border border-surface-border shadow-card py-3">
        <button onClick={() => setCollapsed(false)} title="Abrir agenda"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-navy-muted hover:bg-surface-secondary hover:text-navy">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Calendar className="w-4 h-4 text-navy-muted/40 mt-3" />
      </aside>
    )
  }

  return (
    <aside className={cn('shrink-0 flex flex-col bg-gradient-card rounded-2xl border border-surface-border shadow-card overflow-hidden transition-[width] duration-200',
      expanded ? 'w-[640px]' : 'w-80')}>
      <div className="flex items-center gap-1 px-4 py-3 border-b border-surface-border shrink-0">
        <Calendar className="w-4 h-4 text-brand-500" />
        <span className="text-sm font-bold text-navy mr-auto">Agenda</span>
        <button onClick={onNew} title="Novo agendamento"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-navy-muted hover:bg-surface-secondary hover:text-brand-600">
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={() => setExpanded(v => !v)} title={expanded ? 'Voltar pro mês' : 'Expandir para a semana'}
          className={cn('w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
            expanded ? 'bg-brand-50 text-brand-600' : 'text-navy-muted hover:bg-surface-secondary hover:text-navy')}>
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setCollapsed(true)} title="Recolher painel"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-navy-muted hover:bg-surface-secondary hover:text-navy">
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
            <UpcomingList schedules={schedules} selectedDay={selectedDay} onSelect={onSelect} onNew={onNew} />
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
      <aside className="w-72 shrink-0 flex flex-col bg-gradient-card rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <MiniCalendar schedules={schedules} selected={selectedDay} onSelect={setSelectedDay} />
          <UpcomingList schedules={schedules} selectedDay={selectedDay} onSelect={onSelect} onNew={onNew} />
        </div>
      </aside>

      <div className="flex-1 min-w-0 bg-gradient-card rounded-2xl border border-surface-border shadow-card overflow-y-auto p-4">
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
