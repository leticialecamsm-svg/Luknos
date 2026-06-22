'use client'

import { TrendingUp, Handshake, CircleDollarSign, Trophy } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface PartnerStats {
  byId: Record<string, { openValue: number; openCount: number; closedValue: number; closedCount: number; totalCount: number }>
  byName: Record<string, { openValue: number; openCount: number; closedValue: number; closedCount: number; totalCount: number }>
}

const EMPTY = { openValue: 0, openCount: 0, closedValue: 0, closedCount: 0, totalCount: 0 }

export function statsFor(contact: any, stats?: PartnerStats) {
  if (!stats) return EMPTY
  return stats.byId[contact.id] ?? stats.byName[String(contact.name).trim().toLowerCase()] ?? EMPTY
}

const BAR_COLORS = ['#185FA5', '#CBA455', '#0E7C66', '#7C3AED', '#DB2777', '#EA580C', '#0891B2', '#65A30D']

export function PartnersDashboard({ contacts, stats }: { contacts: any[]; stats?: PartnerStats }) {
  const ranked = contacts
    .map(c => ({ contact: c, s: statsFor(c, stats) }))
    .filter(x => x.s.openValue > 0)
    .sort((a, b) => b.s.openValue - a.s.openValue)

  const top = ranked.slice(0, 8)
  const maxVal = top.length ? top[0].s.openValue : 1

  const totalOpen = ranked.reduce((sum, x) => sum + x.s.openValue, 0)
  const totalClosed = contacts.reduce((sum, c) => sum + statsFor(c, stats).closedValue, 0)
  const activePartners = ranked.length

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
          <div className="flex items-center gap-2 text-blue-700"><TrendingUp className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Em negociação</span></div>
          <p className="text-2xl font-bold text-blue-700 mt-2">{formatCurrency(totalOpen)}</p>
          <p className="text-xs text-gray-500 mt-0.5">via parceiros</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
          <div className="flex items-center gap-2 text-emerald-700"><CircleDollarSign className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Fechado</span></div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{formatCurrency(totalClosed)}</p>
          <p className="text-xs text-gray-500 mt-0.5">vendas via parceiros</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
          <div className="flex items-center gap-2 text-amber-700"><Handshake className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Parceiros ativos</span></div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{activePartners}</p>
          <p className="text-xs text-gray-500 mt-0.5">com orçamento em negociação</p>
        </div>
      </div>

      {/* Ranking */}
      <div className="rounded-xl border border-surface-border bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-amber-500" /> Maiores parceiros em negociação
        </h3>
        {top.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum parceiro com orçamento em negociação</p>
        ) : (
          <div className="space-y-3">
            {top.map((x, i) => {
              const pct = Math.max(4, (x.s.openValue / maxVal) * 100)
              const color = BAR_COLORS[i % BAR_COLORS.length]
              return (
                <div key={x.contact.id} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-gray-400 shrink-0 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800 truncate">{x.contact.name}</span>
                      <span className="text-sm font-bold shrink-0" style={{ color }}>{formatCurrency(x.s.openValue)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{x.s.openCount} orçamento{x.s.openCount !== 1 ? 's' : ''} em negociação</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
