'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate, getInitials, isOverdue, cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { TEMPERATURE_COLOR, TEMPERATURE_LABEL, QUOTE_STATUS_LABEL } from '@/types'
import { TrendingUp, AlertCircle, Calendar } from 'lucide-react'
import { QuickLinksMenu } from './QuickLinksMenu'
import { TasksCardDashboard } from '../tasks/TasksCardDashboard'
import { WorkingDaysCard } from './WorkingDaysCard'
import { DashboardAgenda } from './DashboardAgenda'
import { NewQuoteButton } from '@/components/quotes/NewQuoteButton'

export function VendorDashboard({
  myGoal, myQuotes, funnel, sales, userName, allQuotes, users, currentUserId, prospectionsThisMonth, salesByUser, goalsByUser, myEarnings, selectedYear, selectedMonth, goalsFallbackLabel, collaboratorRoles = ['admin', 'seller']
}: {
  myGoal: number
  myQuotes: any[]
  funnel: any[]
  sales: number
  userName: string
  allQuotes?: any[]
  users?: any[]
  currentUserId?: string
  prospectionsThisMonth?: number
  salesByUser?: Record<string, number>
  goalsByUser?: Record<string, number>
  myEarnings?: any
  collaboratorRoles?: string[]
  selectedYear?: number
  selectedMonth?: number
  goalsFallbackLabel?: string
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'meu' | 'geral'>('meu')

  const now = new Date()
  const currentMonth = new Date(selectedYear ?? now.getFullYear(), (selectedMonth ?? now.getMonth() + 1) - 1, 1)
  const monthName = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const todayDate = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })

  function navigateMonth(delta: number) {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1)
    router.push(`/dashboard?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
  }

  // KPIs
  const negotiating = myQuotes
    .filter(q => q.temperature && ['warm', 'hot'].includes(q.temperature) && q.status !== 'done')
    .reduce((sum, q) => sum + (q.quoted_value ?? 0), 0)

  const opportunities = myQuotes.filter(q => q.status !== 'done').length
  const urgent = myQuotes.filter(q => isOverdue(q.deadline) && q.status !== 'done').length

  // Meta progress
  const metaPercent = myGoal > 0 ? Math.round((sales / myGoal) * 100) : 0
  const metaRemaining = Math.max(0, myGoal - sales)

  // Funnel data
  const funnelByTemp = {
    cold: funnel.find(f => f.temperature === 'cold') || { count: 0, total: 0 },
    warm: funnel.find(f => f.temperature === 'warm') || { count: 0, total: 0 },
    hot: funnel.find(f => f.temperature === 'hot') || { count: 0, total: 0 },
    closed: funnel.find(f => f.temperature === 'closed') || { count: 0, total: 0 },
    lost: funnel.find(f => f.temperature === 'lost') || { count: 0, total: 0 },
  }

  const maxFunnelCount = Math.max(
    funnelByTemp.cold.count,
    funnelByTemp.warm.count,
    funnelByTemp.hot.count,
    funnelByTemp.closed.count,
    funnelByTemp.lost.count
  ) || 1

  // Urgências
  const urgentQuotes = myQuotes
    .filter(q => isOverdue(q.deadline) && q.status !== 'done')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 3)

  // Orçamentos recentes
  const recentQuotes = myQuotes
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  // Cálculos para aba "Geral" — filtrados pelo mês selecionado (mStart/mEnd)
  const gMStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0]
  const gMEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0]
  const totalFaturamento = (allQuotes ?? [])
    .filter(q => q.status === 'done' && q.temperature === 'closed' && q.closed_at && q.closed_at >= gMStart && q.closed_at <= gMEnd)
    .reduce((sum, q) => sum + (q.final_value ?? q.quoted_value ?? 0), 0)

  const pipelineTotal = (allQuotes ?? [])
    .filter(q => q.status !== 'done')
    .reduce((sum, q) => sum + (q.quoted_value ?? 0), 0)

  // Ranking de colaboradores — usa a MESMA fonte do card "Vendido no mês" (sales_by_month do mês atual)
  // Só entra quem é admin ou vendedor — marketing/logística ficam de fora
  const userPerformance = (users ?? []).filter((u: any) => collaboratorRoles.includes(u.role) || u.is_projetista).map(u => {
    const totalVendido = salesByUser?.[u.id] ?? 0
    const userGoal = goalsByUser?.[u.id] ?? 0
    const comissao = Math.round(totalVendido * 0.01) // 1% de comissão

    return {
      id: u.id,
      name: u.name,
      avatar_color: u.avatar_color,
      avatar_url: u.avatar_url,
      vendido: totalVendido,
      meta: userGoal,
      percentMeta: userGoal > 0 ? (totalVendido / userGoal) * 100 : 0,
      comissao,
    }
  }).sort((a, b) => b.vendido - a.vendido)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Olá, {userName.split(' ')[0]} 👋</h1>
          <p className="text-sm text-gray-500 mt-1">{monthName.charAt(0).toUpperCase() + monthName.slice(1)} · {todayDate.charAt(0).toUpperCase() + todayDate.slice(1)}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700">
            <button onClick={() => navigateMonth(-1)} className="hover:text-gray-900">◀</button>
            <span className="w-32 text-center">{monthName.toUpperCase()}</span>
            <button onClick={() => navigateMonth(1)} className="hover:text-gray-900">▶</button>
          </div>
          <QuickLinksMenu />
          <NewQuoteButton className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            + Novo orçamento
          </NewQuoteButton>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('meu')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            activeTab === 'meu' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Meu Dashboard
        </button>
        <button
          onClick={() => setActiveTab('geral')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            activeTab === 'geral' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Geral
        </button>
      </div>

      {/* Aba: Meu Dashboard */}
      {activeTab === 'meu' && (
        <>
      {/* Working days banner */}
      <WorkingDaysCard />

      {/* Minha comissão do mês (privado) */}
      {myEarnings && (
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Minha comissão do mês</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{formatCurrency(myEarnings.total)}</p>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-1">
              <p>1% das minhas vendas: <strong className="text-gray-700">{formatCurrency(myEarnings.sellerComm)}</strong></p>
              {myEarnings.projetistaComm > 0 && (
                <p>Como projetista: <strong className="text-gray-700">{formatCurrency(myEarnings.projetistaComm)}</strong></p>
              )}
            </div>
          </div>
          {myEarnings.projetistaSales?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-100 space-y-1">
              <p className="text-[11px] font-semibold text-gray-500 uppercase">Vendas como projetista</p>
              {myEarnings.projetistaSales.map((p: any) => (
                <div key={p.number} className="flex items-center justify-between text-xs text-gray-600">
                  <span><span className="font-semibold text-brand-600">#{p.number}</span> {p.client_name} <span className="text-gray-400">({p.rate}%)</span></span>
                  <span className="font-medium text-emerald-700">{formatCurrency(p.comm)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {goalsFallbackLabel && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
          ⚠️ Meta não cadastrada para este mês — exibindo meta de <strong>{goalsFallbackLabel}</strong>. <a href="/admin" className="underline">Cadastrar meta</a>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-green-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Vendido no mês</p>
          <p className="text-2xl font-bold text-green-600 mt-2">{formatCurrency(sales)}</p>
          <p className="text-xs text-gray-500 mt-2">
            Meta: {myGoal > 0 ? formatCurrency(myGoal) : <span className="text-amber-500">não cadastrada</span>}
            {goalsFallbackLabel && <span className="text-amber-500"> ({goalsFallbackLabel})</span>}
          </p>
          <div className="h-1 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${Math.min(metaPercent, 100)}%` }}></div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Em negociação</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{formatCurrency(negotiating)}</p>
          <p className="text-xs text-gray-500 mt-2">Morno + Quente</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Oportunidades</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">{opportunities}</p>
          <p className="text-xs text-gray-500 mt-2">orçamentos ativos</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Urgentes</p>
          <p className="text-2xl font-bold text-red-500 mt-2">{urgent}</p>
          <p className="text-xs text-gray-500 mt-2">precisam de atenção</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Novas Prospecções</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{prospectionsThisMonth ?? 0}</p>
          <p className="text-xs text-gray-500 mt-2">parceiros este mês</p>
        </div>
      </div>

      {/* Grid 3 colunas: Meta + Tarefas */}
      <div className="grid grid-cols-2 gap-4">
        {/* Minha Meta */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Minha meta</h3>
            <p className="text-xs text-gray-500">{monthName}</p>
          </div>
          <div className="p-4">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto relative mb-4">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 90 90">
                  <circle cx="45" cy="45" r="38" fill="none" stroke="#f0f0f0" strokeWidth="8" />
                  <circle
                    cx="45"
                    cy="45"
                    r="38"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 38}`}
                    strokeDashoffset={`${2 * Math.PI * 38 * (1 - metaPercent / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-lg font-bold text-blue-600">{metaPercent}%</p>
                </div>
              </div>
              <p className="font-semibold text-gray-900">{formatCurrency(sales)} vendido</p>
              <p className="text-xs text-gray-500 mt-1">faltam {formatCurrency(metaRemaining)} para a meta</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-gray-900">{funnelByTemp.hot.count}</p>
                <p className="text-xs text-gray-500">Quentes</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-gray-900">{funnelByTemp.closed.count}</p>
                <p className="text-xs text-gray-500">Fechadas</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-green-600">{formatCurrency(negotiating)}</p>
                <p className="text-xs text-gray-500">Pipeline</p>
              </div>
            </div>
          </div>
        </div>

        {/* Minhas Tarefas */}
        <TasksCardDashboard />
      </div>

      {/* Agenda */}
      <DashboardAgenda />

      {/* Grid 2 colunas: Urgências + Orçamentos */}
      <div className="grid grid-cols-2 gap-4">
        {/* Urgências */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-gray-900">Urgente — ação imediata</h3>
            {urgent > 0 && (
              <span className="ml-auto bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded-full">
                {urgent}
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            {urgentQuotes.length > 0 ? (
              urgentQuotes.map(q => {
                const daysAgo = Math.floor((Date.now() - new Date(q.deadline).getTime()) / 86400000)
                return (
                  <div key={q.id} className="flex items-center gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                    <p className="text-xs text-gray-500 font-medium">#{String(q.number).padStart(3, '0')}</p>
                    <p className="text-sm font-semibold text-gray-900 flex-1">{q.client_name}</p>
                    <span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                      ⚠ Vencido {daysAgo}d
                    </span>
                    <p className="text-sm font-semibold text-gray-900 w-20 text-right">{formatCurrency(q.quoted_value)}</p>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Nenhum orçamento urgente 🎉</p>
            )}
            {urgentQuotes.length > 0 && (
              <div className="pt-2 border-t border-gray-100 mt-2">
                <p className="text-xs text-gray-500 italic">
                  Orçamentos com prazo vencido e negociações quentes sem contato
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Orçamentos Recentes */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Meus orçamentos</h3>
            <a href="/quotes" className="text-xs text-blue-600 hover:text-blue-700">Ver todos →</a>
          </div>
          <div className="p-4 space-y-3">
            {recentQuotes.length > 0 ? (
              recentQuotes.map(q => {
                const tempC = q.temperature ? TEMPERATURE_COLOR[q.temperature as keyof typeof TEMPERATURE_COLOR] : null
                return (
                  <div key={q.id} className="flex items-center gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0 cursor-pointer hover:opacity-70 transition-opacity">
                    <p className="text-xs text-gray-500 font-medium w-8">#0{String(q.number).slice(-2)}</p>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{q.client_name}</p>
                      {q.architect_name && (
                        <p className="text-xs text-gray-500">{q.architect_name}</p>
                      )}
                    </div>
                    <span className={cn('text-xs font-bold px-2 py-1 rounded whitespace-nowrap', {
                      'bg-blue-50 text-blue-700': q.status === 'queue',
                      'bg-amber-50 text-amber-700': q.status === 'in_progress',
                      'bg-green-50 text-green-700': q.status === 'done',
                    })}>
                      {QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]}
                    </span>
                    {tempC && (
                      <span className={cn('text-xs font-bold px-2 py-1 rounded whitespace-nowrap', tempC.bg, tempC.text)}>
                        {TEMPERATURE_LABEL[q.temperature as keyof typeof TEMPERATURE_LABEL]}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-gray-900 w-20 text-right">{formatCurrency(q.quoted_value)}</p>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Nenhum orçamento ainda</p>
            )}
          </div>
        </div>
      </div>

      {/* Meu Funil */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Meu funil</h3>
          <a href="/negotiations" className="text-xs text-blue-600 hover:text-blue-700">Ver negociações →</a>
        </div>
        <div className="p-4 space-y-3">
          {[
            { label: 'Frio', data: funnelByTemp.cold, color: '#bfdbfe' },
            { label: 'Morno', data: funnelByTemp.warm, color: '#fcd34d' },
            { label: 'Quente', data: funnelByTemp.hot, color: '#fca5a5' },
            { label: 'Fechada', data: funnelByTemp.closed, color: '#6ee7b7' },
            { label: 'Perdida', data: funnelByTemp.lost, color: '#d1d5db' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
              <p className="text-xs font-medium text-gray-600 flex-1">{item.label}</p>
              <p className="text-xs font-bold text-gray-900">{item.data.count}</p>
              <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    backgroundColor: item.color,
                    width: `${maxFunnelCount > 0 ? (item.data.count / maxFunnelCount) * 100 : 0}%`
                  }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 w-12 text-right">{formatCurrency(item.data.total)}</p>
            </div>
          ))}
        </div>
      </div>
        </>
      )}

      {/* Aba: Geral */}
      {activeTab === 'geral' && (
        <div className="space-y-6">
          {/* KPI Cards da Loja */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-green-500"></div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Faturamento da loja</p>
              <p className="text-2xl font-bold text-green-600 mt-2">{formatCurrency(totalFaturamento)}</p>
              <p className="text-xs text-gray-500 mt-2">Todos os vendedores · {monthName}</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600"></div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pipeline total</p>
              <p className="text-2xl font-bold text-blue-600 mt-2">{formatCurrency(pipelineTotal)}</p>
              <p className="text-xs text-gray-500 mt-2">Todas as oportunidades</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-purple-600"></div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total de colaboradores</p>
              <p className="text-2xl font-bold text-purple-600 mt-2">{users?.length ?? 0}</p>
              <p className="text-xs text-gray-500 mt-2">Equipe ativa</p>
            </div>
          </div>

          {/* Ranking de Vendas — apenas posições, sem valores (privacidade) */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Ranking de Vendas</h3>
              <p className="text-xs text-gray-500">{monthName}</p>
            </div>
            <div className="p-4 space-y-2">
              {userPerformance.map((u, i) => (
                <div key={u.id} className={`flex items-center gap-3 py-2 ${u.id === currentUserId ? 'bg-blue-50 -mx-4 px-4 rounded' : ''}`}>
                  <div className="text-base font-bold text-gray-400 w-7 shrink-0 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                  </div>
                  <Avatar user={u} size={32} />
                  <p className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">
                    {u.name}{u.id === currentUserId && <span className="text-xs text-blue-600 font-normal ml-1">(você)</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
