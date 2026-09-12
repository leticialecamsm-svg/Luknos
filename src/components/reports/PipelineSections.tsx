'use client'

import { cn, formatCurrency } from '@/lib/utils'
import { Activity, Gauge, Filter, XCircle, Timer } from 'lucide-react'
import { TEMP_LABEL } from '@/lib/negotiation-rules'
import {
  type ReportRow, type Dim, type TeamHealth, type Goal, channelOf, colorOf, monthOf, monthLabel,
  nf, pct, brlShort, participations, isOpen, isStale, LOSS_LABEL, median, daysSince, currentMonthBR,
} from './lib'
import { Card, Empty, MiniStat, SellerName, TH } from './ui'

// ── Saúde das atualizações ─────────────────────────────────────────────────

export function UpdateHealth({ health, team }: { health: TeamHealth[]; team: { open: number; overdue: number; overdueValue: number } }) {
  const totalOpen = team.open
  const totalOverdue = team.overdue
  const overdueValue = team.overdueValue

  return (
    <Card icon={Activity} title="As negociações estão atualizadas?"
      subtitle="Negociação sem notícia não serve pra previsão — é por aqui que você sabe se dá pra confiar no funil"
      help="Uma negociação fica 'sem notícia' quando passa do prazo da temperatura dela sem nota ou mudança feita por alguém: quente 2 dias, morna 4, fria 7, sem previsão 14. Constância = das negociações que entraram na lista do dia, quantas foram atualizadas (últimos 30 dias).">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <MiniStat label="Negociações abertas" value={nf(totalOpen)} />
        <MiniStat label="Sem notícia (atrasadas)" value={`${nf(totalOverdue)} · ${totalOpen ? pct(totalOverdue / totalOpen) : '0%'}`}
          tone={totalOpen && totalOverdue / totalOpen > 0.3 ? 'bad' : 'warn'} />
        <MiniStat label="Valor sem notícia" value={formatCurrency(overdueValue)} />
      </div>
      {health.length === 0 ? <Empty text="Ninguém com negociação aberta." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={cn(TH, 'text-left pr-4')}>Colaborador</th>
                <th className={cn(TH, 'text-right px-3')}>Abertas</th>
                <th className={cn(TH, 'text-left px-3 w-[28%]')}>Sem notícia</th>
                <th className={cn(TH, 'text-center px-3')}>Lista de hoje</th>
                <th className={cn(TH, 'text-right pl-3')}>Constância (30 dias)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {health.map(h => {
                const share = h.open ? h.overdue / h.open : 0
                return (
                  <tr key={h.userId}>
                    <td className="py-2.5 pr-4"><SellerName name={h.name} color={h.color} /></td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{nf(h.open)}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', share > 0.5 ? 'bg-red-400' : share > 0.25 ? 'bg-amber-400' : 'bg-emerald-400')}
                            style={{ width: `${share * 100}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-gray-600 w-16 text-right">{h.overdue} · {pct(share)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {h.todayDue
                        ? <span className={cn('text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full',
                            h.todayDone >= h.todayDue ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                            {Math.min(h.todayDone, h.todayDue)}/{h.todayDue}
                          </span>
                        : <span className="text-xs text-gray-300">ainda não abriu</span>}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums">
                      {h.compliance30 === null
                        ? <span className="text-xs text-gray-300">começa hoje</span>
                        : <span className={cn('font-semibold', h.compliance30 >= 0.8 ? 'text-emerald-600' : h.compliance30 >= 0.5 ? 'text-amber-600' : 'text-red-500')}>
                            {pct(h.compliance30)} <span className="text-[10px] font-normal text-gray-400">({h.daysTracked}d)</span>
                          </span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── Cobertura de pipeline ──────────────────────────────────────────────────

export function PipelineCoverage({ rows, closedNow, goals }: { rows: ReportRow[]; closedNow: ReportRow[]; goals: Goal[] }) {
  const cm = currentMonthBR()
  const [y, m] = cm.split('-').map(Number)
  const teamGoal = goals.find(g => g.userId === null && g.year === y && g.month === m)?.target
    ?? goals.filter(g => g.userId && g.year === y && g.month === m).reduce((s, g) => s + g.target, 0)
  const sold = closedNow.reduce((s, r) => s + r.value, 0)
  const remaining = Math.max(0, (teamGoal || 0) - sold)

  const open = rows.filter(isOpen)
  const byTemp = ['hot', 'warm', 'cold', 'no_forecast'].map(t => {
    const list = open.filter(r => (r.temperature ?? 'no_forecast') === t)
    const fresh = list.filter(r => !isStale(r))
    return { t, value: list.reduce((s, r) => s + r.quoted, 0), fresh: fresh.reduce((s, r) => s + r.quoted, 0), n: list.length }
  })
  const openValue = byTemp.reduce((s, x) => s + x.value, 0)
  const freshValue = byTemp.reduce((s, x) => s + x.fresh, 0)
  const coverage = remaining ? freshValue / remaining : null
  const maxV = Math.max(1, ...byTemp.map(x => x.value))

  return (
    <Card icon={Gauge} title="Tem negociação suficiente pra bater a meta?"
      subtitle={`${monthLabel(cm)} · ${teamGoal ? `meta ${formatCurrency(teamGoal)}, faltam ${formatCurrency(remaining)}` : 'nenhuma meta cadastrada pra esse mês'}`}
      help="Cobertura = valor em negociação COM notícia em dia ÷ quanto falta pra meta. Referência de mercado: 3× ou mais. Negociação sem notícia fica de fora porque não dá pra saber se ainda existe.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <MiniStat label="Em negociação (total)" value={brlShort(openValue)} />
        <MiniStat label="Com notícia em dia" value={brlShort(freshValue)} />
        <MiniStat label="Falta pra meta" value={teamGoal ? brlShort(remaining) : '—'} />
        <MiniStat label="Cobertura" value={coverage === null ? (teamGoal ? 'meta batida' : '—') : `${nf(coverage, 1)}×`}
          tone={coverage === null ? (teamGoal ? 'good' : undefined) : coverage >= 3 ? 'good' : coverage >= 1.5 ? 'warn' : 'bad'} />
      </div>
      <div className="space-y-2">
        {byTemp.map(x => (
          <div key={x.t} className="grid grid-cols-[110px_1fr_150px] items-center gap-3 text-sm">
            <span className="text-gray-700 font-medium">{TEMP_LABEL[x.t]} <span className="text-xs text-gray-400">({x.n})</span></span>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-brand-500" style={{ width: `${(x.fresh / maxV) * 100}%` }} title="com notícia em dia" />
              <div className="h-full bg-amber-300" style={{ width: `${((x.value - x.fresh) / maxV) * 100}%` }} title="sem notícia" />
            </div>
            <span className="text-right text-xs tabular-nums text-gray-600">
              {brlShort(x.fresh)} <span className="text-gray-300">+</span> <span className="text-amber-600">{brlShort(x.value - x.fresh)}</span>
            </span>
          </div>
        ))}
        <p className="text-[11px] text-gray-400 pt-1">
          <i className="inline-block w-2 h-2 rounded-sm bg-brand-500 mr-1" />com notícia em dia
          <i className="inline-block w-2 h-2 rounded-sm bg-amber-300 ml-3 mr-1" />sem notícia (não conta na cobertura)
        </p>
      </div>
    </Card>
  )
}

// ── Funil por canal ─────────────────────────────────────────────────────────

export function ChannelFunnel({ dim, channels, cohort, month }: { dim: Dim; channels: string[]; cohort: ReportRow[]; month: string }) {
  const data = channels.map(c => {
    const list = cohort.filter(r => channelOf(r, dim) === c)
    const closed = list.filter(r => r.temperature === 'closed').length
    const lost = list.filter(r => r.temperature === 'lost').length
    const open = list.filter(isOpen)
    const stale = open.filter(r => isStale(r)).length
    return { c, n: list.length, closed, lost, fresh: open.length - stale, stale }
  }).filter(d => d.n > 0)
  const total = data.reduce((a, d) => ({
    n: a.n + d.n, closed: a.closed + d.closed, lost: a.lost + d.lost, fresh: a.fresh + d.fresh, stale: a.stale + d.stale,
  }), { n: 0, closed: 0, lost: 0, fresh: 0, stale: 0 })

  const Bar = ({ d }: { d: typeof total }) => (
    <div className="h-3 rounded-full overflow-hidden flex bg-gray-100">
      {[['closed', 'bg-emerald-500'], ['fresh', 'bg-brand-500'], ['stale', 'bg-amber-300'], ['lost', 'bg-gray-300']].map(([k, cls]) => {
        const v = (d as any)[k] as number
        return v ? <div key={k} className={cls} style={{ width: `${(v / d.n) * 100}%` }} /> : null
      })}
    </div>
  )

  return (
    <Card icon={Filter} title="Pra onde foram os orçamentos do mês"
      subtitle={`Orçamentos abertos em ${monthLabel(month)}, por canal, e o que aconteceu com cada um até hoje`}
      help="Olha pro grupo de orçamentos que entrou no mês (não pras vendas do mês). Meses recentes ainda têm muito em aberto — é normal a conversão subir com o tempo.">
      {data.length === 0 ? <Empty text="Nenhum orçamento aberto nesse mês." /> : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-[11px] text-gray-600">
            <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 mr-1.5 align-middle" />Fechou</span>
            <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-brand-500 mr-1.5 align-middle" />Em negociação, com notícia</span>
            <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-300 mr-1.5 align-middle" />Em negociação, sem notícia</span>
            <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-300 mr-1.5 align-middle" />Perdeu</span>
          </div>
          <div className="space-y-2.5">
            {[...data, { c: 'Total', ...total }].map(d => (
              <div key={d.c} className={cn('grid grid-cols-[140px_1fr_250px] items-center gap-3 text-sm', d.c === 'Total' && 'pt-2 border-t border-gray-100')}>
                <span className={cn('inline-flex items-center gap-2', d.c === 'Total' ? 'font-bold text-gray-900' : 'font-medium text-gray-700')}>
                  {d.c !== 'Total' && <i className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(d.c) }} />}{d.c}
                </span>
                <Bar d={d as any} />
                <span className="text-xs tabular-nums text-gray-600 text-right whitespace-nowrap">
                  {d.n} orç · <b className="text-emerald-600">{pct(d.closed / d.n)} fechou</b> · {d.lost} {d.lost === 1 ? 'perdido' : 'perdidos'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

// ── Motivos de perda ───────────────────────────────────────────────────────

export function LossReasons({ dim, lost, months }: { dim: Dim; lost: ReportRow[]; months: string[] }) {
  const reasons = ['price', 'competition', 'no_reply', 'gave_up', 'other', '_none']
  const labelOf = (k: string) => k === '_none' ? 'Motivo não informado' : LOSS_LABEL[k]
  const keyOf = (r: ReportRow) => r.lossReason ?? '_none'
  const counts = reasons.map(k => ({ k, n: lost.filter(r => keyOf(r) === k).length })).filter(x => x.n > 0)
  const total = lost.length
  const max = Math.max(1, ...counts.map(c => c.n))

  const sellers = new Map<string, { name: string; color: string; by: Record<string, number>; total: number }>()
  participations(lost).forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, by: {}, total: 0 }
    s.by[keyOf(p.row)] = (s.by[keyOf(p.row)] ?? 0) + 1
    s.total += 1
    sellers.set(p.sellerId, s)
  })
  const byChannel = new Map<string, number>()
  lost.forEach(r => byChannel.set(channelOf(r, dim), (byChannel.get(channelOf(r, dim)) ?? 0) + 1))

  return (
    <Card icon={XCircle} title="Por que estamos perdendo vendas"
      subtitle={`Orçamentos perdidos que foram abertos em ${months.map(m => monthLabel(m, true)).join(', ')}`}
      help="A partir de agora, marcar como perdida pela fila do dia exige o motivo — o 'não informado' tende a sumir.">
      {total === 0 ? <Empty text="Nenhuma perda registrada nesse período." /> : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            {counts.sort((a, b) => b.n - a.n).map(c => (
              <div key={c.k} className="grid grid-cols-[170px_1fr_70px] items-center gap-3 text-sm">
                <span className={cn('font-medium', c.k === '_none' ? 'text-gray-400 italic' : 'text-gray-700')}>{labelOf(c.k)}</span>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', c.k === '_none' ? 'bg-gray-300' : 'bg-red-400')} style={{ width: `${(c.n / max) * 100}%` }} />
                </div>
                <span className="text-right text-xs tabular-nums text-gray-600">{c.n} · {pct(c.n / total)}</span>
              </div>
            ))}
            <p className="text-[11px] text-gray-400 pt-2">
              Por canal: {Array.from(byChannel.entries()).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · ')}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className={cn(TH, 'text-left pr-3')}>Colaborador</th>
                  {counts.map(c => (
                    <th key={c.k} title={labelOf(c.k)} className={cn(TH, 'text-center px-1.5 normal-case tracking-normal')}>
                      {({ price: 'Preço', competition: 'Concorrente', no_reply: 'Sumiu', gave_up: 'Desistiu', other: 'Outro', _none: 'Sem motivo' } as Record<string, string>)[c.k]}
                    </th>
                  ))}
                  <th className={cn(TH, 'text-right pl-2')}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Array.from(sellers.entries()).sort((a, b) => b[1].total - a[1].total).map(([id, s]) => (
                  <tr key={id}>
                    <td className="py-1.5 pr-3"><SellerName name={s.name} color={s.color} /></td>
                    {counts.map(c => <td key={c.k} className="py-1.5 px-1.5 text-center tabular-nums text-gray-600">{s.by[c.k] || <span className="text-gray-300">·</span>}</td>)}
                    <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Ciclo de venda ─────────────────────────────────────────────────────────

export function SalesCycle({ dim, channels, closed, month, openRows }: {
  dim: Dim; channels: string[]; closed: ReportRow[]; month: string; openRows: ReportRow[]
}) {
  const cycle = (r: ReportRow) => {
    const d = Math.round((new Date(r.closedAt!).getTime() - new Date(r.createdAt).getTime()) / 86400000)
    return d >= 0 ? d : null
  }
  const list = closed.map(r => ({ r, d: cycle(r) })).filter((x): x is { r: ReportRow; d: number } => x.d !== null)

  const byChannel = channels.map(c => {
    const ds = list.filter(x => channelOf(x.r, dim) === c).map(x => x.d)
    return { c, med: median(ds.filter(d => d > 0)), n: ds.length }
  }).filter(x => x.n > 0)
  const sellers = new Map<string, { name: string; color: string; ds: number[] }>()
  participations(list.map(x => x.r)).forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, ds: [] }
    const d = cycle(p.row); if (d !== null) s.ds.push(d)
    sellers.set(p.sellerId, s)
  })
  // 65% das vendas fecham no mesmo dia (balcão) — se entrarem na mediana, o
  // "tempo típico" vira 0 e esconde quanto demora uma venda negociada de fato.
  const sameDay = list.filter(x => x.d === 0).length
  const teamMed = median(list.map(x => x.d).filter(d => d > 0))
  const maxD = Math.max(1, ...byChannel.map(x => x.med ?? 0), ...Array.from(sellers.values()).map(s => median(s.ds) ?? 0))

  // Quantos orçamentos abertos já passaram do ciclo típico (estão "velhos")
  const old = teamMed ? openRows.filter(r => daysSince(r.createdAt) > teamMed * 2).length : 0

  const Row = ({ label, color, value, n, dot }: { label: string; color: string; value: number | null; n: number; dot: 'square' | 'round' }) => (
    <div className="grid grid-cols-[140px_1fr_90px] items-center gap-3 text-sm">
      <span className="inline-flex items-center gap-2 font-medium text-gray-700 truncate">
        <i className={cn('w-2.5 h-2.5 shrink-0', dot === 'square' ? 'rounded-sm' : 'rounded-full')} style={{ background: color }} />{label}
      </span>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${((value ?? 0) / maxD) * 100}%`, background: color }} />
      </div>
      <span className="text-right text-xs tabular-nums text-gray-600" title={`${n} vendas`}>{value === null ? '—' : `${nf(value)} dias`}</span>
    </div>
  )

  return (
    <Card icon={Timer} title="Quanto tempo leva pra fechar"
      subtitle={`Vendas fechadas em ${monthLabel(month)} · ${list.length ? pct(sameDay / list.length) : '0%'} fecharam no mesmo dia · as negociadas levam em média ${teamMed === null ? '—' : `${nf(teamMed)} dias`}`}
      help="Dias entre abrir o orçamento e fechar a venda, contando só as vendas que NÃO fecharam no mesmo dia (as de balcão puxariam tudo pra zero). Usa a mediana (o caso do meio), que não é distorcida por uma venda que levou meses. '—' = só teve venda no mesmo dia.">
      {list.length === 0 ? <Empty /> : (
        <>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Por canal</p>
              {byChannel.map(x => <Row key={x.c} label={x.c} color={colorOf(x.c)} value={x.med} n={x.n} dot="square" />)}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Por colaborador</p>
              {Array.from(sellers.entries()).map(([id, s]) => ({ id, ...s, med: median(s.ds.filter(d => d > 0)) }))
                .sort((a, b) => (a.med ?? 0) - (b.med ?? 0))
                .map(s => <Row key={s.id} label={s.name} color={s.color} value={s.med} n={s.ds.length} dot="round" />)}
            </div>
          </div>
          {old > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-4">
              {old} orçamentos em aberto já têm mais que o dobro do tempo típico ({nf((teamMed ?? 0) * 2)} dias) — a chance de fechar cai muito depois disso.
            </p>
          )}
        </>
      )}
    </Card>
  )
}
