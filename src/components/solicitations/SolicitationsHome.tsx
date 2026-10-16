'use client'

// Tela inicial do módulo Solicitações: card azul com saudação, visão
// Time / Minhas e os KPIs condensados; abaixo, filtros por etapa + kanban/lista.

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { NewSolicitationButton } from './NewSolicitationButton'
import { SolicitationsIndex } from './SolicitationsIndex'
import type { IndexRow } from '@/lib/solicitations/index-data'

function greeting(hour: number | null) {
  if (hour === null) return 'Olá'
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function Big({ value, label, accent }: { value: number; label: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[26px] font-bold leading-none" style={{ color: accent ?? '#fff' }}>{value}</span>
      <span className="text-[11px] text-white/55">{label}</span>
    </div>
  )
}

function Small({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[17px] font-semibold leading-none text-white">{value}</span>
      <span className="text-[11px] text-white/55">{label}</span>
    </div>
  )
}

export function SolicitationsHome({ rows, userName }: { rows: IndexRow[]; userName: string }) {
  const [view, setView] = useState<'team' | 'mine'>(rows.some(r => r.isMine) ? 'mine' : 'team')
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => { setHour(new Date().getHours()) }, [])

  const viewRows = useMemo(() => (view === 'mine' ? rows.filter(r => r.isMine) : rows), [rows, view])

  const k = useMemo(() => {
    const now = Date.now()
    const week = now - 7 * 86_400_000
    const sameMonth = (iso: string | null) => {
      if (!iso) return false
      const d = new Date(iso)
      return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
    }
    const open = viewRows.filter(r => r.status === 'in_progress')
    const closed = viewRows.filter(r => r.status === 'closed')
    const lost = viewRows.filter(r => r.status === 'lost')
    const cycle = closed
      .filter(r => r.closedAt)
      .map(r => Math.round((new Date(r.closedAt!).getTime() - new Date(r.createdAt).getTime()) / 86_400_000))
      .filter(d => d >= 0 && d < 365)
    return {
      open: open.length,
      closedMonth: closed.filter(r => sameMonth(r.closedAt)).length,
      overdue: open.filter(r => r.overdue).length,
      simultaneous: open.filter(r => r.activeStages >= 2).length,
      newWeek: viewRows.filter(r => new Date(r.createdAt).getTime() >= week).length,
      conversion: closed.length + lost.length > 0 ? Math.round((closed.length / (closed.length + lost.length)) * 100) : null,
      cycle: cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length) : null,
    }
  }, [viewRows, month])

  const firstName = userName.split(' ')[0]

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl px-7 py-6 text-white"
        style={{
          background: 'linear-gradient(180deg,#0d2445 0%,#0a1f3b 55%,#02162a 100%)',
          boxShadow: 'rgba(2,22,42,.55) 0 16px 40px -16px, rgba(255,255,255,.09) 0 1px 0 0 inset',
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold">{greeting(hour)}, {firstName}!</h1>
            <p className="text-[12.5px] text-white/60 mt-1">
              {view === 'mine' ? 'Confira como estão as suas solicitações hoje.' : 'Confira como está o time hoje.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="inline-flex rounded-lg bg-white/10 border border-white/20 p-0.5">
              {([['mine', firstName], ['team', 'Time']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-semibold transition-colors',
                    view === key ? 'bg-white text-navy' : 'text-white/70 hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <NewSolicitationButton />
          </div>
        </div>

        <div className="flex items-end gap-x-7 gap-y-4 flex-wrap mt-5">
          <Big value={k.open} label="abertas" />
          <Big value={k.closedMonth} label="fechadas no mês" />
          <Big value={k.overdue} label={k.overdue === 1 ? 'atrasada' : 'atrasadas'} accent={k.overdue > 0 ? '#f87171' : undefined} />
          <Big value={k.simultaneous} label="em etapas simultâneas" />
          <span className="hidden md:block self-stretch w-px bg-white/15" aria-hidden />
          <Small value={String(k.newWeek)} label="novas esta semana" />
          <Small value={k.conversion != null ? `${k.conversion}%` : '—'} label="orçamento → venda" />
          <Small value={k.cycle != null ? `${k.cycle} dias` : '—'} label="ciclo médio até a venda" />
        </div>
      </div>

      <SolicitationsIndex rows={viewRows} month={month} onMonthChange={setMonth} />
    </div>
  )
}
