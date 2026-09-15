'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import { Crosshair, Trophy, Repeat } from 'lucide-react'
import { TEMP_LABEL } from '@/lib/negotiation-rules'
import { type ReportRow, nf, pct, brlShort, isOpen, isStale, daysSince, median } from './lib'
import { Card, Delta, Empty, MiniStat, SellerName, TH } from './ui'

type PartnerStat = {
  id: string
  name: string
  seller: { id: string; name: string; color: string } | null
  quotes: ReportRow[]
  open: ReportRow[]
  staleOpen: ReportRow[]
  closedCount: number
  lostCount: number
  lifetime: number
  rev90: number
  prev90: number
  sales90: number
  lastQuoteDays: number
  lastSaleDays: number
  avgInterval: number | null
}

function buildPartners(rows: ReportRow[]): PartnerStat[] {
  const now = new Date()
  const by = new Map<string, ReportRow[]>()
  rows.forEach(r => {
    if (!r.partnerId) return
    const list = by.get(r.partnerId) ?? []
    list.push(r)
    by.set(r.partnerId, list)
  })

  return Array.from(by.entries()).map(([id, quotes]) => {
    const sorted = [...quotes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const latest = sorted[sorted.length - 1]
    const closed = quotes.filter(r => r.temperature === 'closed' && r.closedAt)
    const d = (iso: string) => daysSince(iso, now)
    const gaps = sorted.slice(1).map((r, i) => Math.round((new Date(r.createdAt).getTime() - new Date(sorted[i].createdAt).getTime()) / 86400000))
    const open = quotes.filter(isOpen)
    return {
      id,
      name: latest.partnerName ?? '—',
      seller: latest.owners[0] ?? null,
      quotes,
      open,
      staleOpen: open.filter(r => isStale(r, now)),
      closedCount: closed.length,
      lostCount: quotes.filter(r => r.temperature === 'lost').length,
      lifetime: closed.reduce((s, r) => s + r.value, 0),
      rev90: closed.filter(r => d(r.closedAt!) <= 90).reduce((s, r) => s + r.value, 0),
      prev90: closed.filter(r => d(r.closedAt!) > 90 && d(r.closedAt!) <= 180).reduce((s, r) => s + r.value, 0),
      sales90: closed.filter(r => d(r.closedAt!) <= 90).length,
      lastQuoteDays: d(latest.createdAt),
      lastSaleDays: closed.length ? Math.min(...closed.map(r => d(r.closedAt!))) : 999,
      avgInterval: gaps.length ? (median(gaps) ?? null) : null,
    }
  })
}

// ── Radar: quem atacar hoje / na semana / no mês ───────────────────────────

type Signal = { p: PartnerStat; why: string; value: number; quote?: ReportRow }

export function PartnerRadar({ rows, sellerFilter }: { rows: ReportRow[]; sellerFilter: string }) {
  const partners = buildPartners(rows)
    .filter(p => sellerFilter === 'all' || p.quotes.some(q => q.owners.some(o => o.id === sellerFilter)))

  const today: Signal[] = [], week: Signal[] = [], month: Signal[] = []

  partners.forEach(p => {
    const hotStale = p.staleOpen
      .filter(r => r.temperature === 'hot' || r.temperature === 'warm')
      .sort((a, b) => b.quoted - a.quoted)[0]
    const bigStale = p.staleOpen.filter(r => r.quoted >= 3000).sort((a, b) => b.quoted - a.quoted)[0]

    // HOJE — tem dinheiro na mesa esfriando
    if (hotStale || bigStale) {
      const q = hotStale ?? bigStale
      const days = daysSince(q.lastTouch ?? q.createdAt)
      today.push({ p, quote: q, value: p.staleOpen.reduce((s, r) => s + r.quoted, 0),
        why: `Cobrar retorno do #${q.number} (${q.client}) — ${TEMP_LABEL[q.temperature ?? 'no_forecast'].toLowerCase()}, ${days >= 999 ? 'nunca atualizado' : `${days} dias sem notícia`}` })
      return
    }
    // SEMANA — orçamento aberto parado, ou parceiro frequente que sumiu
    if (p.staleOpen.length) {
      const q = [...p.staleOpen].sort((a, b) => b.quoted - a.quoted)[0]
      week.push({ p, quote: q, value: p.staleOpen.reduce((s, r) => s + r.quoted, 0),
        why: `${p.staleOpen.length} orçamento${p.staleOpen.length > 1 ? 's' : ''} parado${p.staleOpen.length > 1 ? 's' : ''} — o maior é o #${q.number} (${q.client})` })
      return
    }
    if (p.open.length === 0 && p.avgInterval && p.quotes.length >= 2
        && p.lastQuoteDays > p.avgInterval * 1.3 && p.lastQuoteDays <= 60) {
      week.push({ p, value: p.lifetime,
        why: `Costuma mandar orçamento a cada ~${nf(p.avgInterval)} dias — o último foi há ${p.lastQuoteDays}` })
      return
    }
    // MÊS — já comprou e sumiu: reativar
    if (p.open.length === 0 && p.closedCount > 0 && p.lastQuoteDays > 60) {
      month.push({ p, value: p.lifetime,
        why: `Sem orçamento há ${p.lastQuoteDays} dias · já trouxe ${brlShort(p.lifetime)} em ${p.closedCount} venda${p.closedCount > 1 ? 's' : ''}` })
    }
  })

  const sort = (xs: Signal[]) => xs.sort((a, b) => b.value - a.value)

  return (
    <Card icon={Crosshair} title="Parceiros pra procurar"
      subtitle="Montado a partir dos orçamentos em aberto e do histórico de cada parceiro — cada um aparece só na coluna mais urgente"
      help="Hoje: tem orçamento quente/morno ou acima de R$ 3 mil sem notícia. Semana: orçamento parado, ou parceiro frequente que passou do intervalo normal dele. Mês: já gerou venda e está há mais de 60 dias sem mandar orçamento.">
      {partners.length === 0 ? <Empty text="Nenhum parceiro com orçamento registrado." /> : (
        <div className="grid lg:grid-cols-3 gap-4">
          <RadarColumn title="Hoje" hint="dinheiro na mesa esfriando" tone="red" items={sort(today)} />
          <RadarColumn title="Esta semana" hint="orçamento parado ou parceiro sumindo" tone="amber" items={sort(week)} />
          <RadarColumn title="Este mês" hint="reativar quem já comprou" tone="blue" items={sort(month)} />
        </div>
      )}
    </Card>
  )
}

function RadarColumn({ title, hint, tone, items }: { title: string; hint: string; tone: 'red' | 'amber' | 'blue'; items: Signal[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 6)
  const toneCls = { red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-brand-50 text-brand-700' }[tone]
  const dot = { red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-brand-500' }[tone]

  return (
    <div className="rounded-xl border border-surface-border overflow-hidden flex flex-col">
      <div className={cn('px-3 py-2.5 flex items-center justify-between', toneCls)}>
        <div>
          <p className="text-sm font-bold flex items-center gap-2"><i className={cn('w-2 h-2 rounded-full', dot)} />{title}</p>
          <p className="text-[11px] opacity-80">{hint}</p>
        </div>
        <span className="text-lg font-bold tabular-nums">{items.length}</span>
      </div>
      <div className="divide-y divide-gray-50 flex-1">
        {items.length === 0 && <p className="text-xs text-gray-400 px-3 py-4">Nada aqui agora.</p>}
        {shown.map(s => (
          <div key={s.p.id} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">{s.p.name}</p>
              {s.p.seller && (
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-gray-500">
                  <i className="w-1.5 h-1.5 rounded-full" style={{ background: s.p.seller.color }} />{s.p.seller.name.split(' ')[0]}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              {s.quote
                ? <Link href={`/quotes/${s.quote.id}`} className="hover:text-brand-600">{s.why}</Link>
                : s.why}
            </p>
          </div>
        ))}
      </div>
      {items.length > 6 && (
        <button onClick={() => setAll(v => !v)} className="text-xs font-medium text-gray-500 hover:text-gray-800 py-2 border-t border-surface-border">
          {all ? 'Mostrar menos' : `Ver todos (${items.length})`}
        </button>
      )}
    </div>
  )
}

// ── Ranking de parceiros ───────────────────────────────────────────────────

export function PartnerRanking({ rows }: { rows: ReportRow[] }) {
  const [showAll, setShowAll] = useState(false)
  const partners = buildPartners(rows).filter(p => p.lifetime > 0 || p.open.length > 0)
    .sort((a, b) => b.rev90 - a.rev90 || b.lifetime - a.lifetime)
  const active = partners.filter(p => p.lastQuoteDays <= 60).length
  const top5 = partners.slice(0, 5).reduce((s, p) => s + p.rev90, 0)
  const total90 = partners.reduce((s, p) => s + p.rev90, 0)
  const shown = showAll ? partners : partners.slice(0, 12)

  const status = (p: PartnerStat) => {
    if (p.lastQuoteDays > 60) return ['Parado', 'bg-gray-100 text-gray-600']
    if (p.prev90 === 0 && p.rev90 > 0) return ['Novo', 'bg-brand-50 text-brand-700']
    if (p.rev90 > p.prev90 * 1.15) return ['Crescendo', 'bg-emerald-50 text-emerald-700']
    if (p.rev90 < p.prev90 * 0.85) return ['Caindo', 'bg-red-50 text-red-600']
    return ['Estável', 'bg-gray-50 text-gray-600']
  }

  return (
    <Card icon={Trophy} title="Ranking de parceiros"
      subtitle="Últimos 90 dias comparados com os 90 anteriores"
      help="Conversão = vendas ÷ (vendas + perdas) desse parceiro no histórico todo. Concentração alta nos 5 maiores é risco: se um deles para, o faturamento sente.">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <MiniStat label="Parceiros ativos (60 dias)" value={nf(active)} />
        <MiniStat label="Faturamento via parceiros (90d)" value={brlShort(total90)} />
        <MiniStat label="Concentração nos 5 maiores" value={total90 ? pct(top5 / total90) : '—'}
          tone={total90 && top5 / total90 > 0.6 ? 'warn' : undefined} />
      </div>
      {partners.length === 0 ? <Empty text="Nenhum parceiro com venda." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className={cn(TH, 'text-left pr-3 w-8')}>#</th>
                <th className={cn(TH, 'text-left pr-4')}>Parceiro</th>
                <th className={cn(TH, 'text-left px-3')}>Situação</th>
                <th className={cn(TH, 'text-right px-3')}>Vendas 90d</th>
                <th className={cn(TH, 'text-right px-3')}>Faturamento 90d</th>
                <th className={cn(TH, 'text-right px-3')}>vs 90d antes</th>
                <th className={cn(TH, 'text-right px-3')}>Conversão</th>
                <th className={cn(TH, 'text-right px-3')}>Em aberto</th>
                <th className={cn(TH, 'text-right pl-3')}>Último orçamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map((p, i) => {
                const [label, cls] = status(p)
                const decided = p.closedCount + p.lostCount
                return (
                  <tr key={p.id}>
                    <td className="py-2 pr-3 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <p className="font-medium text-gray-800 truncate max-w-[220px]">{p.name}</p>
                      {p.seller && <p className="text-[10px] text-gray-400">com {p.seller.name}</p>}
                    </td>
                    <td className="py-2 px-3"><span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', cls)}>{label}</span></td>
                    <td className="py-2 px-3 text-right tabular-nums">{nf(p.sales90)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatCurrency(p.rev90)}</td>
                    <td className="py-2 px-3 text-right"><Delta cur={p.rev90} prev={p.prev90} /></td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{decided ? pct(p.closedCount / decided) : '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">
                      {p.open.length ? <>{p.open.length} · {brlShort(p.open.reduce((s, r) => s + r.quoted, 0))}</> : '—'}
                    </td>
                    <td className={cn('py-2 pl-3 text-right tabular-nums text-xs', p.lastQuoteDays > 60 ? 'text-red-500' : 'text-gray-500')}>
                      há {p.lastQuoteDays} dias
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {partners.length > 12 && (
            <button onClick={() => setShowAll(v => !v)} className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-800">
              {showAll ? 'Mostrar só os 12 primeiros' : `Ver todos os ${partners.length} parceiros`}
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Clientes que voltam ────────────────────────────────────────────────────

export function RepeatClients({ closed }: { closed: ReportRow[] }) {
  // Pedidos fechados no mesmo dia pro mesmo cliente contam como UMA compra
  // (é comum dividir um pedido em mais de um orçamento).
  const by = new Map<string, { name: string; days: Set<string>; value: number; last: string }>()
  closed.forEach(r => {
    if (!r.clientId) return
    const c = by.get(r.clientId) ?? { name: r.client, days: new Set<string>(), value: 0, last: r.closedAt! }
    c.days.add(r.closedAt!)
    c.value += r.value
    if (r.closedAt! > c.last) c.last = r.closedAt!
    by.set(r.clientId, c)
  })
  const clients = Array.from(by.entries()).map(([id, c]) => ({ id, ...c, purchases: c.days.size }))
  const repeat = clients.filter(c => c.purchases >= 2)
  const total = clients.reduce((s, c) => s + c.value, 0)
  const repeatValue = repeat.reduce((s, c) => s + c.value, 0)
  const gaps = repeat.flatMap(c => {
    const ds = Array.from(c.days).sort()
    return ds.slice(1).map((d, i) => Math.round((new Date(d).getTime() - new Date(ds[i]).getTime()) / 86400000))
  })
  const top = [...clients].sort((a, b) => b.value - a.value).slice(0, 10)

  return (
    <Card icon={Repeat} title="Clientes que voltam a comprar"
      subtitle="Todo o histórico registrado no sistema"
      help="Compras no mesmo dia pro mesmo cliente contam como uma só. Com poucos meses de sistema esse número ainda é baixo — ele fica mais útil com o tempo.">
      {clients.length === 0 ? <Empty /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <MiniStat label="Clientes com compra" value={nf(clients.length)} />
            <MiniStat label="Voltaram a comprar" value={`${nf(repeat.length)} · ${pct(repeat.length / clients.length)}`} />
            <MiniStat label="Faturamento de quem voltou" value={total ? pct(repeatValue / total) : '—'} />
            <MiniStat label="Tempo típico até voltar" value={gaps.length ? `${nf(median(gaps) ?? 0)} dias` : '—'} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Clientes que mais compraram</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {top.map((c, i) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 text-xs text-gray-400 tabular-nums w-6">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-gray-800">{c.name}</td>
                    <td className="py-2 px-3 text-right text-xs text-gray-500">{c.purchases} compra{c.purchases > 1 ? 's' : ''}</td>
                    <td className="py-2 px-3 text-right text-xs text-gray-500">última há {daysSince(c.last)} dias</td>
                    <td className="py-2 pl-3 text-right tabular-nums font-semibold">{formatCurrency(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
