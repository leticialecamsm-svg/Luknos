'use client'

import { formatCurrency, formatDate, getInitials, isOverdue, cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { TEMPERATURE_COLOR, TEMPERATURE_LABEL } from '@/types'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { WorkingDaysCard } from './WorkingDaysCard'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuickLinksMenu } from './QuickLinksMenu'
import { TasksCardDashboard } from '../tasks/TasksCardDashboard'
import { DashboardAgenda } from './DashboardAgenda'
import { SalesSuggestions } from './SalesSuggestions'
import { NegociacoesListView } from './NegociacoesListView'

export function AdminDashboardV2({
  quotes,
  users,
  sales,
  funnel,
  prospectionsThisMonth = 0,
  salesByUser,
  goalsByUser,
  earnings,
  criticalNegotiations = [],
  flaggedAlerts = [],
  selectedYear,
  selectedMonth,
  goalsFallbackLabel,
}: {
  quotes: any[]
  users: any[]
  sales: any[]
  funnel: any[]
  prospectionsThisMonth?: number
  salesByUser?: Record<string, number>
  goalsByUser?: Record<string, number>
  earnings?: Record<string, any>
  criticalNegotiations?: any[]
  flaggedAlerts?: any[]
  selectedYear?: number
  selectedMonth?: number
  goalsFallbackLabel?: string
}) {
  const router = useRouter()
  const now = new Date()
  const currentMonth = new Date(selectedYear ?? now.getFullYear(), (selectedMonth ?? now.getMonth() + 1) - 1, 1)
  const [detail, setDetail] = useState<{ title: string; items: any[]; field: 'final' | 'quoted' | 'recebido' } | null>(null)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pipeline'>('dashboard')

  function navigateMonth(delta: number) {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1)
    router.push(`/dashboard?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
  }

  // Limites do mês selecionado (YYYY-MM-DD)
  const mStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0]
  const mEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0]

  // Vendas fechadas no mês — filtra por closed_at (única data de fechamento confiável na quotes_full)
  const closedThisMonth = quotes
    .filter(q => q.temperature === 'closed' && q.closed_at && q.closed_at >= mStart && q.closed_at <= mEnd)
    .sort((a, b) => String(b.closed_at ?? '').localeCompare(String(a.closed_at ?? '')))

  // FATURAMENTO = apenas o valor efetivamente RECEBIDO (splits com status 'paid').
  // Se a venda não tem splits (pagamento único sem controle "em aberto"), conta o valor cheio.
  // O que estiver "em aberto" some do faturamento e passa a aparecer no Financeiro como conta a receber.
  const recebidoDeQuote = (q: any) => {
    const splits = Array.isArray(q.payment_splits) ? q.payment_splits : []
    if (splits.length === 0) return Number((q.final_value ?? q.quoted_value) ?? 0)
    return splits.filter((s: any) => s.status !== 'open').reduce((a: number, s: any) => a + Number(s.amount ?? 0), 0)
  }
  const totalFaturamento = closedThisMonth.reduce((sum, q) => sum + recebidoDeQuote(q), 0)
  const detailValue = (q: any, field: 'final' | 'quoted' | 'recebido') =>
    field === 'recebido' ? recebidoDeQuote(q) : Number((field === 'final' ? (q.final_value ?? q.quoted_value) : q.quoted_value) ?? 0)

  // Perdidas no mês — ordenadas pelas mais recentes primeiro (data da perda = temperature_updated_at)
  const lostThisMonth = quotes
    .filter(q => {
      if (q.temperature !== 'lost') return false
      const d = String(q.temperature_updated_at ?? '').slice(0, 10)
      return d >= mStart && d <= mEnd
    })
    .sort((a, b) => String(b.temperature_updated_at ?? '').localeCompare(String(a.temperature_updated_at ?? '')))

  const closedQuotes = closedThisMonth.length

  // Oportunidades em aberto (tudo que não é fechado ou perdido = Frio + Morno + Quente)
  const oportunidades = quotes
    .filter(q => !['closed', 'lost'].includes(q.temperature ?? 'cold'))
    .reduce((sum, q) => sum + (q.quoted_value ?? 0), 0)

  const ticketMedio = closedQuotes > 0
    ? totalFaturamento / closedQuotes
    : 0

  const totalQuotesClosedOrOpen = quotes.filter(q => q.status !== 'done').length + quotes.filter(q => q.status === 'done').length
  const conversionRate = totalQuotesClosedOrOpen > 0
    ? Math.round((closedQuotes / totalQuotesClosedOrOpen) * 100)
    : 0

  const perdidas = lostThisMonth
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
    // Vendas do mês — mesma fonte do "Faturamento do mês" (sales_by_month), evita divergência
    const totalVendido = salesByUser?.[u.id] ?? 0

    // Tudo em aberto (tudo que não é fechado ou perdido) - dividido pela quantidade de donos
    const openQuotes = quotes.filter(q => q.owners?.some((o: any) => o.user_id === u.id) && !['closed', 'lost'].includes(q.temperature ?? 'cold'))
    const openValue = openQuotes.reduce((sum, q) => {
      const numOwners = q.owners?.length || 1
      return sum + ((q.quoted_value ?? 0) / numOwners)
    }, 0)

    const userGoal = goalsByUser?.[u.id] ?? 0

    const userEarnings = earnings?.[u.id]
    return {
      id: u.id,
      name: u.name,
      avatar_color: u.avatar_color,
      avatar_url: u.avatar_url,
      vendido: totalVendido,
      meta: userGoal,
      percentMeta: userGoal > 0 ? (totalVendido / userGoal) * 100 : 0,
      aberto: openValue,
      // Usa getCommissionEarnings (inclui projetista, arredondamento correto)
      comissao: userEarnings?.total ?? parseFloat((totalVendido * 0.01).toFixed(2)),
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
            <button onClick={() => navigateMonth(-1)} className="hover:text-gray-900">◀</button>
            <span className="w-32 text-center">{currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}</span>
            <button onClick={() => navigateMonth(1)} className="hover:text-gray-900">▶</button>
          </div>
          <QuickLinksMenu />
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'dashboard'
              ? 'text-brand-600 border-brand-600'
              : 'text-gray-600 border-transparent hover:text-gray-900'
          )}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          className={cn(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'pipeline'
              ? 'text-brand-600 border-brand-600'
              : 'text-gray-600 border-transparent hover:text-gray-900'
          )}
        >
          Pipeline de Negociações
        </button>
      </div>

      {activeTab === 'pipeline' ? (
        <NegociacoesListView />
      ) : (
        <>
          {/* Working days banner */}
          <WorkingDaysCard />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <div onClick={() => setDetail({ title: 'Vendas fechadas no mês (recebido)', items: closedThisMonth, field: 'recebido' })}
          className="cursor-pointer bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden hover:shadow-md hover:border-green-300 transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-green-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Faturamento do mês</p>
          <p className="text-xl font-bold text-green-600 mt-2">{formatCurrency(totalFaturamento)}</p>
          <p className="text-xs text-gray-500 mt-1">Meta: {formatCurrency(140000)}</p>
          <div className="h-1 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${Math.min((totalFaturamento / 140000) * 100, 100)}%` }}></div>
          </div>
          <p className="text-xs text-gray-400 mt-1">↓ vs maio: R$ 0</p>
        </div>

        <div onClick={() => setDetail({ title: 'Oportunidades em aberto', items: quotes.filter(q => !['closed', 'lost'].includes(q.temperature ?? 'cold')), field: 'quoted' })}
          className="cursor-pointer bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden hover:shadow-md hover:border-blue-300 transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Oportunidades</p>
          <p className="text-xl font-bold text-blue-600 mt-2">{formatCurrency(oportunidades)}</p>
          <p className="text-xs text-gray-500 mt-1">Frio + Morno + Quente</p>
          <p className="text-xs text-green-600 font-semibold mt-1">↑ {quotes.filter(q => !['closed', 'lost'].includes(q.temperature ?? 'cold')).length} oportunidades</p>
        </div>

        <div onClick={() => setDetail({ title: 'Vendas fechadas (ticket médio, recebido)', items: closedThisMonth, field: 'recebido' })}
          className="cursor-pointer bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden hover:shadow-md hover:border-amber-300 transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ticket médio</p>
          <p className="text-xl font-bold text-amber-600 mt-2">{formatCurrency(ticketMedio)}</p>
          <p className="text-xs text-gray-500 mt-1">por venda fechada</p>
          <p className="text-xs text-green-600 font-semibold mt-1">↑ vs média histórica</p>
        </div>

        <div onClick={() => setDetail({ title: 'Vendas fechadas (taxa de conversão)', items: closedThisMonth, field: 'final' })}
          className="cursor-pointer bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden hover:shadow-md hover:border-purple-300 transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-purple-600"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Taxa de conversão</p>
          <p className="text-xl font-bold text-purple-600 mt-2">{conversionRate}%</p>
          <p className="text-xs text-gray-500 mt-1">fechadas / total orç.</p>
          <p className="text-xs text-green-600 font-semibold mt-1">↑ +5pp vs maio</p>
        </div>

        <div onClick={() => setDetail({ title: 'Negociações perdidas no mês', items: lostThisMonth, field: 'quoted' })}
          className="cursor-pointer bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden hover:shadow-md hover:border-red-300 transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Perdidas no mês</p>
          <p className="text-xl font-bold text-red-500 mt-2">{lostThisMonth.length}</p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(perdidas)} em oportunidades</p>
          <p className="text-xs text-green-600 font-semibold mt-1">✓ Melhor que maio</p>
        </div>

        <div onClick={() => setDetail({ title: 'Orçamentos quentes', items: quotes.filter(q => q.temperature === 'hot' && q.status !== 'done'), field: 'quoted' })}
          className="cursor-pointer bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden hover:shadow-md hover:border-orange-300 transition-all">
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

      {/* Sugestões do dia */}
      <SalesSuggestions quotes={quotes} />

      {/* Radar de Alertas: orçamentos flagados */}
      {flaggedAlerts.length > 0 && (
        <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
          <div className="border-b border-amber-100 px-4 py-3 flex items-center gap-2">
            <span className="text-base">🚩</span>
            <h2 className="text-sm font-semibold text-amber-800">Radar de Alertas</h2>
            <span className="ml-auto text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{flaggedAlerts.length}</span>
          </div>
          <div className="p-3 space-y-2">
            <p className="text-xs text-gray-400 mb-2">Orçamentos em acompanhamento ativo. Requerem atualização diária.</p>
            {flaggedAlerts.map((q: any) => {
              const hoursOld = q.flagged_alert_at ? Math.floor((Date.now() - new Date(q.flagged_alert_at).getTime()) / (1000 * 60 * 60)) : 0
              const isDayOld = hoursOld >= 24
              return (
                <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-amber-50 transition-colors border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">#{String(q.number).padStart(3,'0')} · {q.client_name}</p>
                    <p className={`text-xs ${isDayOld ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {isDayOld ? `⚠️ ${hoursOld}h sem atualização` : `${hoursOld}h no radar`}
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Pontos de atenção: negociações críticas */}
      {criticalNegotiations.length > 0 && (
        <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
          <div className="border-b border-orange-100 px-4 py-3 flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <h2 className="text-sm font-semibold text-orange-800">Pontos de atenção</h2>
            <span className="ml-auto text-xs text-orange-500 font-medium bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">{criticalNegotiations.length}</span>
          </div>
          <div className="p-3 space-y-2">
            <p className="text-xs text-gray-400 mb-2">Orçamentos em etapa crítica (Fase do Gesso / Instalação Imediata) com temperatura morna, fria ou sem previsão.</p>
            {criticalNegotiations.map((q: any) => (
              <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-orange-50 transition-colors border border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">#{String(q.number).padStart(3,'0')} · {q.client_name}</p>
                  <p className="text-xs text-gray-400">{q.work_stage === 'finishing' ? 'Fase do Gesso' : 'Instalação Imediata'}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  q.temperature === 'no_forecast' ? 'bg-slate-100 text-slate-600' :
                  q.temperature === 'cold' ? 'bg-blue-50 text-blue-700' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  {q.temperature === 'no_forecast' ? 'Sem previsão' : q.temperature === 'cold' ? 'Frio' : 'Morno'}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

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
            <h3 className="text-sm font-semibold text-gray-900">
              Ranking — {currentMonth.toLocaleDateString('pt-BR', { month: 'long' }).charAt(0).toUpperCase() + currentMonth.toLocaleDateString('pt-BR', { month: 'long' }).slice(1)}
            </h3>
            <a href="/admin/goals" className="text-xs text-blue-600 hover:text-blue-700">Ver histórico →</a>
          </div>
          {goalsFallbackLabel && (
            <div className="px-4 pt-2 pb-0">
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                ⚠️ Metas não cadastradas para este mês — exibindo metas de <strong>{goalsFallbackLabel}</strong>. <a href="/admin" className="underline">Cadastrar meta</a>
              </p>
            </div>
          )}
          <div className="p-4 space-y-3">
            {userPerformance.map((u, i) => (
              <div key={u.id} className="flex items-start gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="text-sm font-bold text-gray-400 w-6 shrink-0">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </div>
                <Avatar user={u} size={28} />
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

          {/* Agenda (no lugar das antigas "Visitas da semana") */}
          <DashboardAgenda />
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

      {/* Comissões a pagar no mês */}
      {earnings && (() => {
        const rows = Object.values(earnings).filter((r: any) => r.total > 0).sort((a: any, b: any) => b.total - a.total)
        const totalGeral = rows.reduce((s: number, r: any) => s + r.total, 0)
        if (!rows.length) return null
        return (
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Comissões a pagar no mês</h2>
              <span className="text-sm font-bold text-emerald-700">Total: {formatCurrency(totalGeral)}</span>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">Colaborador</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-right">1% vendas</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-right">Projetista</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.user.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar user={r.user} size={26} />
                          <span className="text-sm font-medium text-gray-800">{r.user.name}</span>
                          {r.projetistaComm > 0 && <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded-full">projetista</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{formatCurrency(r.sellerComm)}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{r.projetistaComm > 0 ? formatCurrency(r.projetistaComm) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-emerald-700">{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Minhas Tarefas */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Minhas Tarefas</h2>
        <TasksCardDashboard />
      </div>
        </>
      )}

      {/* Modal de detalhamento do card */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{detail.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {detail.items.length} {detail.items.length === 1 ? 'orçamento' : 'orçamentos'} ·{' '}
                  Total: <strong className="text-gray-700">{formatCurrency(detail.items.reduce((s, q) => s + detailValue(q, detail.field), 0))}</strong>
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">✕</button>
            </div>
            <div className="divide-y divide-gray-100">
              {detail.items.length === 0 && <p className="px-6 py-8 text-center text-sm text-gray-400">Nenhum orçamento</p>}
              {detail.items.map((q: any) => {
                const aberto = detail.field === 'recebido' ? (Number((q.final_value ?? q.quoted_value) ?? 0) - recebidoDeQuote(q)) : 0
                return (
                <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 w-12 shrink-0">#{String(q.number).padStart(3,'0')}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{q.client_name}</p>
                    {q.architect_name && <p className="text-xs text-gray-400 truncate">{q.architect_name}</p>}
                  </div>
                  {q.owners?.slice(0,2).map((o: any) => <Avatar key={o.user_id} user={o} size={22} className="ring-1 ring-white" />)}
                  <div className="shrink-0 ml-1 text-right">
                    <span className="text-sm font-semibold text-gray-800 block">
                      {formatCurrency(detailValue(q, detail.field))}
                    </span>
                    {aberto > 0.01 && <span className="text-[10px] text-amber-600 block">+{formatCurrency(aberto)} em aberto</span>}
                    {(q.temperature === 'closed' ? q.closed_at : q.temperature === 'lost' ? q.temperature_updated_at : null) && (
                      <span className="text-[10px] text-gray-400">{formatDate(q.temperature === 'closed' ? q.closed_at : q.temperature_updated_at)}</span>
                    )}
                  </div>
                </a>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
