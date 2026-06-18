'use client'

import { formatCurrency, formatDate, getInitials, isOverdue, cn } from '@/lib/utils'
import { TEMPERATURE_COLOR, TEMPERATURE_LABEL } from '@/types'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { WorkingDaysCard } from './WorkingDaysCard'
import { useState } from 'react'
import { QuickLinksMenu } from './QuickLinksMenu'
import { TasksCardDashboard } from '../tasks/TasksCardDashboard'

export function AdminDashboardV2({
  quotes,
  users,
  sales,
  funnel,
  prospectionsThisMonth = 0,
}: {
  quotes: any[]
  users: any[]
  sales: any[]
  funnel: any[]
  prospectionsThisMonth?: number
}) {
  const now = new Date()
  const [currentMonth, setCurrentMonth] = useState(now)

  // KPIs
  const totalFaturamento = quotes
    .filter(q => q.status === 'done' && q.temperature === 'closed')
    .reduce((sum, q) => sum + (q.final_value ?? 0), 0)

  // Oportunidades em aberto (tudo que não é fechado ou perdido = Frio + Morno + Quente)
  const oportunidades = quotes
    .filter(q => !['closed', 'lost'].includes(q.temperature ?? 'cold'))
    .reduce((sum, q) => sum + (q.quoted_value ?? 0), 0)

  const closedQuotes = quotes.filter(q => q.status === 'done' && q.temperature === 'closed').length
  const ticketMedio = closedQuotes > 0
    ? totalFaturamento / closedQuotes
    : 0

  const totalQuotesClosedOrOpen = quotes.filter(q => q.status !== 'done').length + quotes.filter(q => q.status === 'done').length
  const conversionRate = totalQuotesClosedOrOpen > 0
    ? Math.round((closedQuotes / totalQuotesClosedOrOpen) * 100)
    : 0

  const perdidas = quotes
    .filter(q => q.temperature === 'lost')
    .reduce((sum, q) => sum + (q.quoted_value ?? 0), 0)

  const hotValue = quotes
    .filter(q => q.temperature === 'hot')
    .reduce((sum, q) => sum + (q.quoted_value ?? 0), 0)
  const hotCount = quotes.filter(q => q.temperature === 'hot').length

  // Faturamento mensal (últimos 6 meses)
  const monthlyData = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)

    const faturado = quotes
      .filter(q => q.status === 'done' && q.temperature === 'closed' && q.closed_at && new Date(q.closed_at) >= start && new Date(q.closed_at) <= end)
      .reduce((sum, q) => sum + (q.final_value ?? 0), 0)

    return {
      month: d.toLocaleDateString('pt-BR', { month: 'short' }),
      faturado,
      meta: 140000,
    }
  })

  const maxValue = Math.max(...monthlyData.map(d => Math.max(d.faturado, d.meta))) || 1

  // Ranking colaboradores
  const userPerformance = users.map(u => {
    // Vendas fechadas
    const closedQuotes = quotes.filter(q => q.owners?.some((o: any) => o.user_id === u.id) && q.status === 'done' && q.temperature === 'closed')
    const totalVendido = closedQuotes.reduce((sum, q) => sum + (q.final_value ?? 0), 0)

    // Tudo em aberto (tudo que não é fechado ou perdido) - dividido pela quantidade de donos
    const openQuotes = quotes.filter(q => q.owners?.some((o: any) => o.user_id === u.id) && !['closed', 'lost'].includes(q.temperature ?? 'cold'))
    const openValue = openQuotes.reduce((sum, q) => {
      const numOwners = q.owners?.length || 1
      return sum + ((q.quoted_value ?? 0) / numOwners)
    }, 0)

    const userGoal = 70000

    return {
      id: u.id,
      name: u.name,
      avatar_color: u.avatar_color,
      vendido: totalVendido,
      meta: userGoal,
      percentMeta: userGoal > 0 ? (totalVendido / userGoal) * 100 : 0,
      aberto: openValue,
      comissao: Math.round(totalVendido * 0.01), // 1% de comissão
    }
  }).sort((a, b) => b.vendido - a.vendido)

  // Funil data
  const funnelByTemp = {
    cold: funnel.find(f => f.temperature === 'cold')?.count ?? 0,
    warm: funnel.find(f => f.temperature === 'warm')?.count ?? 0,
    hot: funnel.find(f => f.temperature === 'hot')?.count ?? 0,
    closed: funnel.find(f => f.temperature === 'closed')?.count ?? 0,
  }

  const maxFunnelCount = Math.max(...Object.values(funnelByTemp)) || 1

  const funnelByTempValue = {
    cold: funnel.find(f => f.temperature === 'cold')?.total_quoted ?? 0,
    warm: funnel.find(f => f.temperature === 'warm')?.total_quoted ?? 0,
    hot: funnel.find(f => f.temperature === 'hot')?.total_quoted ?? 0,
    closed: funnel.find(f => f.temperature === 'closed')?.total_quoted ?? 0,
  }

  // Visitas (simulado - será melhorado com dados reais depois)
  const visits = quotes
    .filter(q => q.deadline && new Date(q.deadline) <= new Date(Date.now() + 7 * 86400000))
    .slice(0, 3)
    .map((q, i) => ({
      id: q.id,
      date: q.deadline,
      client: q.client_name,
      owner: q.owners?.[0]?.name || 'Sem responsável',
      owner_color: q.owners?.[0]?.avatar_color || '#9B9A96',
      location: 'Local' + (i + 1),
      status: i === 0 ? 'scheduled' : 'paused',
    }))

  // Top arquitetos
  const archCount: Record<string, any> = {}
  quotes.forEach(q => {
    if (q.architect_name) {
      if (!archCount[q.architect_name]) {
        archCount[q.architect_name] = { count: 0, total: 0 }
      }
      archCount[q.architect_name].count++
      archCount[q.architect_name].total += q.quoted_value ?? 0
    }
  })

  const topArchs = Object.entries(archCount)
    .map(([name, data]: [string, any]) => ({
      name,
      count: data.count,
      total: data.total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)

  // Origem dos leads
  const originCount: Record<string, number> = {}
  quotes.forEach(q => {
    const origin = q.origin || 'outro'
    originCount[origin] = (originCount[origin] || 0) + 1
  })

  const origins = [
    { label: 'Indicação', value: originCount.referral || 0, color: '#185FA5' },
    { label: 'Loja', value: originCount.store || 0, color: '#10B981' },
    { label: 'WhatsApp', value: originCount.whatsapp || 0, color: '#F59E0B' },
    { label: 'Visita / Outro', value: (originCount.visit || 0) + (originCount.other || 0), color: '#E5E3DC' },
  ]

  const totalOrigins = origins.reduce((s, o) => s + o.value, 0)
  const originsPct = origins.map(o => ({
    ...o,
    pct: totalOrigins > 0 ? Math.round((o.value / totalOrigins) * 100) : 0,
  }))

  // Atenção necessária
  const urgentQuotes = quotes
    .filter(q => isOverdue(q.deadline) && q.status !== 'done')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 2)

  const hotNoFollowup = quotes
    .filter(q => q.temperature === 'hot' && q.status !== 'done')
    .filter(q => {
      const lastUpdate = new Date(q.updated_at)
      const daysSince = Math.floor((Date.now() - lastUpdate.getTime()) / 86400000)
      return daysSince >= 3
    })
    .slice(0, 2)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard da Loja</h1>
          <p className="text-sm text-gray-500 mt-1">Visão gerencial · Luknos Iluminação</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700">
            <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              className="hover:text-gray-900">◀</button>
            <span className="w-24 text-center">{currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}</span>
            <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              className="hover:text-gray-900">▶</button>
          </div>
          <QuickLinksMenu />
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Working days banner */}
      <WorkingDaysCard />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-green-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Faturamento do mês</p>
          <p className="text-xl font-bold text-green-600 mt-2">{formatCurrency(totalFaturamento)}</p>
          <p className="text-xs text-gray-500 mt-1">Meta: {formatCurrency(140000)}</p>
          <div className="h-1 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${Math.min((totalFaturamento / 140000) * 100, 100)}%` }}></div>
          </div>
          <p className="text-xs text-gray-400 mt-1">↓ vs maio: R$ 0</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Oportunidades</p>
          <p className="text-xl font-bold text-blue-600 mt-2">{formatCurrency(oportunidades)}</p>
          <p className="text-xs text-gray-500 mt-1">Frio + Morno + Quente</p>
          <p className="text-xs text-green-600 font-semibold mt-1">↑ {quotes.filter(q => !['closed', 'lost'].includes(q.temperature ?? 'cold')).length} oportunidades</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ticket médio</p>
          <p className="text-xl font-bold text-amber-600 mt-2">{formatCurrency(ticketMedio)}</p>
          <p className="text-xs text-gray-500 mt-1">por venda fechada</p>
          <p className="text-xs text-green-600 font-semibold mt-1">↑ vs média histórica</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-purple-600"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Taxa de conversão</p>
          <p className="text-xl font-bold text-purple-600 mt-2">{conversionRate}%</p>
          <p className="text-xs text-gray-500 mt-1">fechadas / total orç.</p>
          <p className="text-xs text-green-600 font-semibold mt-1">↑ +5pp vs maio</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Perdidas no mês</p>
          <p className="text-xl font-bold text-red-500 mt-2">{quotes.filter(q => q.temperature === 'lost').length}</p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(perdidas)} em oportunidades</p>
          <p className="text-xs text-green-600 font-semibold mt-1">✓ Melhor que maio</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Orç. quentes</p>
          <p className="text-xl font-bold text-orange-500 mt-2">{formatCurrency(hotValue)}</p>
          <p className="text-xs text-gray-500 mt-1">{hotCount} orçamento{hotCount !== 1 ? 's' : ''} quente{hotCount !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-teal-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Prospecções</p>
          <p className="text-xl font-bold text-teal-600 mt-2">{prospectionsThisMonth}</p>
          <p className="text-xs text-gray-500 mt-1">novos parceiros este mês</p>
        </div>
      </div>

      {/* Grid 3 colunas: Gráfico + Ranking + Funil/Visitas */}
      <div className="grid grid-cols-3 gap-4">
        {/* Gráfico Faturamento */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Faturamento mensal <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded ml-2">2026</span></h3>
            <select className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600">
              <option>Faturado</option>
            </select>
          </div>
          <div className="p-4">
            <div className="flex items-end justify-between gap-1 h-24">
              {monthlyData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end h-20">
                    <div className="flex-1 bg-blue-100 rounded-sm" style={{ height: `${(d.meta / maxValue) * 100}%` }}></div>
                    <div className="flex-1 bg-blue-600 rounded-sm" style={{ height: `${(d.faturado / maxValue) * 100}%` }}></div>
                  </div>
                  <span className="text-xs text-gray-500">{d.month}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded bg-blue-100"></div>Meta
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded bg-blue-600"></div>Realizado
              </div>
            </div>
            <div className="mt-3 p-2 bg-gray-50 rounded-lg grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500">Melhor mês</p>
                <p className="text-sm font-bold text-gray-900">Abr · R$ 137k</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Média 2026</p>
                <p className="text-sm font-bold text-gray-900">R$ 108k</p>
              </div>
            </div>
          </div>
        </div>

        {/* Ranking Colaboradores */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Ranking — Junho</h3>
            <a href="/admin" className="text-xs text-blue-600 hover:text-blue-700">Ver histórico →</a>
          </div>
          <div className="p-4 space-y-3">
            {userPerformance.map((u, i) => (
              <div key={u.id} className="flex items-start gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="text-sm font-bold text-gray-400 w-6 shrink-0">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: u.avatar_color }}>
                  {getInitials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900">{u.name}</p>
                  <div className="h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${Math.min(u.percentMeta, 100)}%` }}></div>
                  </div>
                  {u.aberto > 0 && <p className="text-xs text-amber-600 font-medium mt-0.5">{formatCurrency(u.aberto)} em aberto</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-gray-900">{formatCurrency(u.vendido)}</p>
                  <p className="text-xs text-gray-500">{Math.round(u.percentMeta)}% da meta</p>
                  {u.vendido > 0 && <p className="text-xs text-green-600 font-semibold">Comissão: {formatCurrency(u.comissao)}</p>}
                </div>
              </div>
            ))}
            <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs font-semibold text-green-700">🎯 Bônus coletivo</p>
              <p className="text-xs text-green-700 mt-1">Faltam {formatCurrency(Math.max(0, 140000 - totalFaturamento))} para meta da loja</p>
            </div>
          </div>
        </div>

        {/* Funil + Visitas */}
        <div className="space-y-4">
          {/* Funil */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Funil da loja</h3>
              <a href="/quotes" className="text-xs text-blue-600 hover:text-blue-700">Ver Kanban →</a>
            </div>
            <div className="p-4 space-y-1.5">
              {[
                { label: 'Frio', count: funnelByTemp.cold, color: '#BFDBFE', value: funnelByTempValue.cold },
                { label: 'Morno', count: funnelByTemp.warm, color: '#FCD34D', value: funnelByTempValue.warm },
                { label: 'Quente', count: funnelByTemp.hot, color: '#FCA5A5', value: funnelByTempValue.hot },
                { label: 'Fechada', count: funnelByTemp.closed, color: '#6EE7B7', value: funnelByTempValue.closed },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                  <p className="text-xs font-medium text-gray-600 flex-1">{item.label}</p>
                  <p className="text-xs font-bold text-gray-900 shrink-0">{item.count}</p>
                  <div className="w-8 h-1 bg-gray-200 rounded-full overflow-hidden shrink-0">
                    <div className="h-full" style={{
                      backgroundColor: item.color,
                      width: `${maxFunnelCount > 0 ? (item.count / maxFunnelCount) * 100 : 0}%`
                    }}></div>
                  </div>
                  <p className="text-xs text-gray-500 text-right shrink-0 min-w-max">{formatCurrency(item.value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Visitas */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Visitas da semana <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded ml-2">{visits.length}</span></h3>
            </div>
            <div className="p-4 space-y-2">
              {visits.map(v => (
                <div key={v.id} className="flex items-center gap-2 pb-2 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="text-center shrink-0">
                    <p className="text-sm font-bold text-gray-900">{new Date(v.date).getDate()}</p>
                    <p className="text-xs text-gray-500">{new Date(v.date).toLocaleDateString('pt-BR', { month: 'short' })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900">{v.client}</p>
                    <p className="text-xs text-gray-500">{v.location}</p>
                  </div>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: v.owner_color }}>
                    {getInitials(v.owner)}
                  </div>
                  <span className={cn('text-xs font-semibold px-2 py-1 rounded whitespace-nowrap', {
                    'bg-green-50 text-green-700': v.status === 'scheduled',
                    'bg-amber-50 text-amber-700': v.status === 'paused',
                  })}>
                    {v.status === 'scheduled' ? 'Agendada' : 'À agendar'}
                  </span>
                </div>
              ))}
              {visits.length === 0 && <p className="text-xs text-gray-500">Nenhuma visita agendada</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Grid 2 colunas: Top Parceiros + Atenção */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top Parceiros */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Top parceiros <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded ml-2">por volume</span></h3>
            <a href="/partners" className="text-xs text-blue-600 hover:text-blue-700">Ver todos →</a>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Arquitetos */}
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Arquitetos</p>
                <div className="space-y-2">
                  {topArchs.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 pb-2 border-b border-gray-100 last:border-0 last:pb-0">
                      <div className="w-6 h-6 rounded bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                        {getInitials(a.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{a.name}</p>
                        <p className="text-xs text-gray-500">{a.count} orçamento{a.count !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-xs font-bold text-blue-600 shrink-0">{formatCurrency(a.total)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Origem dos Leads */}
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Origem dos leads</p>
                <div className="space-y-1.5 mb-2">
                  {originsPct.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }}></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600">{o.label}</p>
                      </div>
                      <p className="text-xs font-bold text-gray-900">{o.pct}%</p>
                    </div>
                  ))}
                </div>
                <div className="flex h-2 rounded-full overflow-hidden gap-0.5 bg-gray-200">
                  {originsPct.map((o, i) => (
                    <div key={i} style={{ backgroundColor: o.color, width: `${o.pct}%` }}></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Atenção Necessária */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">⚠️ Atenção necessária</h3>
            <span className="bg-red-50 text-red-600 text-xs font-semibold px-2 py-1 rounded-full">
              {urgentQuotes.length + hotNoFollowup.length} itens
            </span>
          </div>
          <div className="p-4 space-y-3">
            {urgentQuotes.length > 0 && (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Prazos vencidos</p>
                  <div className="space-y-1.5">
                    {urgentQuotes.map(q => (
                      <div key={q.id} className="flex items-center gap-2 pb-1.5 border-b border-gray-100 last:border-0 last:pb-0">
                        <p className="text-xs font-bold text-red-600">#{String(q.number).padStart(3, '0')}</p>
                        <p className="text-xs font-semibold text-gray-900 flex-1">{q.client_name}</p>
                        <p className="text-xs font-semibold text-red-600">Vencido {formatDate(q.deadline)}</p>
                        <p className="text-xs text-gray-500">{q.owners?.[0]?.name || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {hotNoFollowup.length > 0 && (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Quentes sem follow-up (+3 dias)</p>
                  <div className="space-y-1.5">
                    {hotNoFollowup.map(q => (
                      <div key={q.id} className="flex items-center gap-2 pb-1.5 border-b border-gray-100 last:border-0 last:pb-0">
                        <p className="text-xs font-bold text-amber-600">#{String(q.number).padStart(3, '0')}</p>
                        <p className="text-xs font-semibold text-gray-900 flex-1">{q.client_name}</p>
                        <p className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          {Math.floor((Date.now() - new Date(q.updated_at).getTime()) / 86400000)} dias
                        </p>
                        <p className="text-xs text-gray-500">{q.owners?.[0]?.name || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {urgentQuotes.length === 0 && hotNoFollowup.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">Tudo certo! ✓</p>
            )}
          </div>
        </div>
      </div>

      {/* Minhas Tarefas */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Minhas Tarefas</h2>
        <TasksCardDashboard />
      </div>
    </div>
  )
}
