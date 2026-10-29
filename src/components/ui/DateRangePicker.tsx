'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Intervalo de dias livre (pode atravessar meses e anos). Datas sempre como 'AAAA-MM-DD'.
// As setas ao lado passam o mês inteiro (ou andam o mesmo tamanho do intervalo, se não for um mês fechado).

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const parts = (s: string) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d } }
const norm = (y: number, m: number) => ({ y: y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 })
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
export function shiftDay(s: string, delta: number) {
  const d = new Date(`${s}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
export function todayBR() { return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) }
export function monthRange(y: number, m: number) {
  const { y: yy, m: mm } = norm(y, m)
  return { from: iso(yy, mm, 1), to: iso(yy, mm, daysIn(yy, mm)) }
}
export const fmtDay = (s: string) => { const { y, m, d } = parts(s); return `${pad(d)}/${pad(m + 1)}/${y}` }
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

function wholeMonth(from: string, to: string) {
  const a = parts(from), b = parts(to)
  return a.d === 1 && a.y === b.y && a.m === b.m && b.d === daysIn(b.y, b.m)
}

export function rangeLabel(from: string, to: string) {
  if (wholeMonth(from, to)) { const { y, m } = parts(from); return `${MONTHS[m]} de ${y}` }
  if (from === to) return fmtDay(from)
  return `${fmtDay(from)} – ${fmtDay(to)}`
}

export function DateRangePicker({ from, to, onChange, earliest, className }: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  earliest?: string | null // para o atalho "Desde o início"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState<string | null>(null) // primeiro clique (falta o fim)
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState(() => { const p = parts(to); return norm(p.y, p.m - 1) }) // mês da esquerda
  const ref = useRef<HTMLDivElement>(null)
  const today = todayBR()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const openPicker = () => {
    const p = parts(to)
    setView(norm(p.y, p.m - 1))
    setStart(null)
    setHover(null)
    setOpen((o) => !o)
  }

  const step = (dir: -1 | 1) => {
    if (wholeMonth(from, to)) {
      const { y, m } = parts(from)
      const r = monthRange(y, m + dir)
      onChange(r.from, r.to)
    } else {
      const len = daysBetween(from, to) + 1
      onChange(shiftDay(from, dir * len), shiftDay(to, dir * len))
    }
  }

  const pick = (day: string) => {
    if (!start) { setStart(day); return }
    const [a, b] = day < start ? [day, start] : [start, day]
    setStart(null)
    setOpen(false)
    onChange(a, b)
  }

  const apply = (a: string, b: string) => { setStart(null); setOpen(false); onChange(a, b) }
  const t = parts(today)
  const presets: { label: string; from: string; to: string }[] = [
    { label: 'Hoje', from: today, to: today },
    { label: 'Últimos 7 dias', from: shiftDay(today, -6), to: today },
    { label: 'Últimos 30 dias', from: shiftDay(today, -29), to: today },
    { label: 'Este mês', ...monthRange(t.y, t.m) },
    { label: 'Mês passado', ...monthRange(t.y, t.m - 1) },
    { label: 'Últimos 3 meses', from: monthRange(t.y, t.m - 2).from, to: today },
    { label: 'Este ano', from: `${t.y}-01-01`, to: today },
    ...(earliest ? [{ label: 'Desde o início', from: earliest, to: today }] : []),
  ]

  // faixa mostrada: a escolhida, ou a que está sendo escolhida (primeiro clique + mouse)
  const lo = start ? (hover && hover < start ? hover : start) : from
  const hi = start ? (hover && hover > start ? hover : start) : to

  const month = (y: number, m: number) => {
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay()
    const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysIn(y, m) }, (_, i) => iso(y, m, i + 1))]
    return (
      <div className="w-[15.5rem]">
        <p className="text-sm font-semibold text-gray-900 text-center capitalize mb-2">{MONTHS[m]} {y}</p>
        <div className="grid grid-cols-7 text-[11px] text-gray-400 mb-1">{WEEK.map((w, i) => <span key={i} className="text-center">{w}</span>)}</div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((day, i) => {
            if (!day) return <span key={i} />
            const inRange = day >= lo && day <= hi
            const edge = day === lo || day === hi
            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(day)}
                onMouseEnter={() => setHover(day)}
                className={cn(
                  'h-8 text-sm tabular-nums transition-colors',
                  inRange && !edge && 'bg-gray-100 text-gray-900',
                  edge ? 'bg-gray-900 text-white rounded-md font-semibold' : 'hover:bg-gray-200 rounded-md',
                  !inRange && day > today && 'text-gray-300',
                  !inRange && day === today && 'font-semibold text-emerald-700',
                )}
              >
                {parts(day).d}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const left = view
  const right = norm(view.y, view.m + 1)

  return (
    <div ref={ref} className={cn('relative inline-flex items-center gap-1', className)}>
      <button type="button" onClick={() => step(-1)} aria-label="Período anterior" className="p-2 rounded-full hover:bg-gray-100 text-gray-600">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 min-w-[12rem] justify-center"
      >
        <CalendarDays className="w-4 h-4 text-gray-500" />
        <span className="first-letter:uppercase">{rangeLabel(from, to)}</span>
      </button>
      <button type="button" onClick={() => step(1)} aria-label="Próximo período" className="p-2 rounded-full hover:bg-gray-100 text-gray-600">
        <ChevronRight className="w-4 h-4" />
      </button>

      {open && (
        <div role="dialog" aria-label="Escolher período" className="absolute right-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex max-sm:flex-col gap-3 max-w-[calc(100vw-2rem)]">
          <div className="flex sm:flex-col gap-1 sm:w-36 shrink-0 overflow-x-auto sm:border-r sm:border-gray-100 sm:pr-3">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => apply(p.from, p.to)}
                className={cn(
                  'text-left whitespace-nowrap text-sm px-2.5 py-1.5 rounded-md hover:bg-gray-100',
                  p.from === from && p.to === to ? 'bg-gray-900 text-white hover:bg-gray-900' : 'text-gray-700',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div onMouseLeave={() => setHover(null)}>
            <div className="flex items-center justify-between mb-1">
              <button type="button" onClick={() => setView((v) => norm(v.y, v.m - 1))} aria-label="Mês anterior" className="p-1.5 rounded-md hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
              <p className="text-xs text-gray-500">{start ? 'Agora clique no último dia' : 'Clique no primeiro e no último dia'}</p>
              <button type="button" onClick={() => setView((v) => norm(v.y, v.m + 1))} aria-label="Próximo mês" className="p-1.5 rounded-md hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-4">
              {month(left.y, left.m)}
              <div className="max-md:hidden">{month(right.y, right.m)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
