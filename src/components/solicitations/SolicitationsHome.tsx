'use client'

// Tela inicial do módulo Solicitações.
// O card azul responde, em poucos segundos: o que tenho pra fazer hoje, o que
// está atrasado, o que chegou, o que mudou e o que está parado. Cada número
// é clicável e vira um foco sobre o quadro logo abaixo.

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewSolicitationButton } from './NewSolicitationButton'
import { SolicitationsIndex } from './SolicitationsIndex'
import { dueState, localYmd, type IndexRow } from '@/lib/solicitations/index-types'

type Focus = 'today' | 'overdue' | 'new' | 'changed' | 'stalled' | 'unassigned'

const FOCUS_LABEL: Record<Focus, string> = {
  today: 'Para hoje',
  overdue: 'Atrasadas',
  new: 'Novas nas últimas 24h',
  changed: 'Movimentadas nas últimas 24h',
  stalled: 'Paradas há 7 dias ou mais',
  unassigned: 'Sem responsável',
}

const DAY = 86_400_000

function greeting(hour: number | null) {
  if (hour === null) return 'Olá'
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function Kpi({
  value, label, hint, accent, active, onClick,
}: { value: number; label: string; hint: string; accent?: string; active: boolean; onClick: () => void }) {
  const zero = value === 0
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        'text-left rounded-xl px-3.5 py-2.5 border transition-colors min-w-[118px]',
        active ? 'bg-white/20 border-white/60' : 'bg-white/[0.07] border-white/10 hover:bg-white/[0.13]',
      )}
    >
      <span
        className="block text-[28px] font-bold leading-none"
        style={{ color: zero ? 'rgba(255,255,255,.55)' : (accent ?? '#fff') }}
      >
        {value}
      </span>
      <span className="block text-[11.5px] text-white/70 mt-1">{label}</span>
    </button>
  )
}

function Small({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[16px] font-semibold leading-none text-white">{value}</span>
      <span className="text-[11px] text-white/55">{label}</span>
    </div>
  )
}

export function SolicitationsHome({ rows, userName }: { rows: IndexRow[]; userName: string }) {
  const [view, setView] = useState<'team' | 'mine'>(rows.some(r => r.isMine) ? 'mine' : 'team')
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [focus, setFocus] = useState<Focus | null>(null)
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => { setHour(new Date().getHours()) }, [])

  const firstName = userName.split(' ')[0]
  const viewRows = useMemo(() => (view === 'mine' ? rows.filter(r => r.isMine) : rows), [rows, view])

  // Cada foco = uma regra sobre a linha. "Aberta" = sem desfecho de venda.
  const matchers = useMemo(() => {
    const today = localYmd()
    const now = Date.now()
    const isOpen = (r: IndexRow) => r.status === 'in_progress'
    const isNew = (r: IndexRow) => now - new Date(r.createdAt).getTime() < DAY
    return {
      today: (r: IndexRow) => dueState(r, today) === 'today',
      overdue: (r: IndexRow) => dueState(r, today) === 'overdue',
      new: isNew,
      changed: (r: IndexRow) => !isNew(r) && now - new Date(r.lastActivityAt).getTime() < DAY,
      stalled: (r: IndexRow) => isOpen(r) && now - new Date(r.lastActivityAt).getTime() >= 7 * DAY,
      unassigned: (r: IndexRow) => isOpen(r) && r.team.length === 0,
    } satisfies Record<Focus, (r: IndexRow) => boolean>
  }, [])

  const counts = useMemo(() => {
    const c = {} as Record<Focus, number>
    ;(Object.keys(matchers) as Focus[]).forEach(f => { c[f] = viewRows.filter(matchers[f]).length })
    return c
  }, [viewRows, matchers])

  const k = useMemo(() => {
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
      .map(r => Math.round((new Date(r.closedAt!).getTime() - new Date(r.createdAt).getTime()) / DAY))
      .filter(d => d >= 0 && d < 365)
    return {
      open: open.length,
      closedMonth: closed.filter(r => sameMonth(r.closedAt)).length,
      conversion: closed.length + lost.length > 0 ? Math.round((closed.length / (closed.length + lost.length)) * 100) : null,
      cycle: cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length) : null,
    }
  }, [viewRows, month])

  const boardRows = useMemo(
    () => (focus ? viewRows.filter(matchers[focus]) : viewRows),
    [viewRows, focus, matchers],
  )

  const toggle = (f: Focus) => setFocus(cur => (cur === f ? null : f))
  const nothingUrgent = counts.today + counts.overdue + counts.new + counts.changed + counts.stalled === 0

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
              {view === 'mine'
                ? 'Confira como estão as suas solicitações hoje.'
                : 'Confira como está o time hoje.'}
              {nothingUrgent && ' Nada urgente por aqui.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="inline-flex rounded-lg bg-white/10 border border-white/20 p-0.5">
              {([['mine', firstName], ['team', 'Time']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setView(key); setFocus(null) }}
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

        {/* O que fazer agora */}
        <div className="flex flex-wrap gap-2 mt-5">
          <Kpi value={counts.today} label="para hoje" hint="Prazos, visitas, entregas e instalações marcadas para hoje" active={focus === 'today'} onClick={() => toggle('today')} />
          <Kpi value={counts.overdue} label={counts.overdue === 1 ? 'atrasada' : 'atrasadas'} hint="Algo em aberto com data já vencida" accent="#f87171" active={focus === 'overdue'} onClick={() => toggle('overdue')} />
          <Kpi value={counts.new} label={counts.new === 1 ? 'nova (24h)' : 'novas (24h)'} hint="Solicitações que chegaram nas últimas 24 horas" accent="#86efac" active={focus === 'new'} onClick={() => toggle('new')} />
          <Kpi value={counts.changed} label="movimentadas (24h)" hint="Já existiam e tiveram alguma mudança nas últimas 24 horas" accent="#93c5fd" active={focus === 'changed'} onClick={() => toggle('changed')} />
          <Kpi value={counts.stalled} label="paradas (7d+)" hint="Em aberto e sem nenhuma movimentação há 7 dias ou mais" accent="#fcd34d" active={focus === 'stalled'} onClick={() => toggle('stalled')} />
          {view === 'team' && (
            <Kpi value={counts.unassigned} label="sem responsável" hint="Em aberto e ninguém designado em nenhuma etapa" accent="#fdba74" active={focus === 'unassigned'} onClick={() => toggle('unassigned')} />
          )}
        </div>

        {/* Panorama */}
        <div className="flex items-end gap-x-7 gap-y-3 flex-wrap mt-5 pt-4 border-t border-white/10">
          <Small value={String(k.open)} label="abertas" />
          <Small value={String(k.closedMonth)} label="fechadas no mês" />
          <Small value={k.conversion != null ? `${k.conversion}%` : '—'} label="orçamento → venda" />
          <Small value={k.cycle != null ? `${k.cycle} dias` : '—'} label="ciclo médio até a venda" />
        </div>
      </div>

      {focus && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Mostrando:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy text-white text-xs font-semibold pl-3 pr-1.5 py-1">
            {FOCUS_LABEL[focus]} · {boardRows.length}
            <button type="button" onClick={() => setFocus(null)} aria-label="Limpar foco" className="rounded-full hover:bg-white/20 p-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      <SolicitationsIndex rows={boardRows} month={month} onMonthChange={setMonth} />
    </div>
  )
}
