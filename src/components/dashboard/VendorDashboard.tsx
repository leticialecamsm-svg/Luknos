'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate, getInitials, isOverdue, cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { TEMPERATURE_COLOR, TEMPERATURE_LABEL, QUOTE_STATUS_LABEL } from '@/types'
import { TrendingUp, AlertCircle, Calendar, Maximize2, X } from 'lucide-react'
import { QuickLinksMenu } from './QuickLinksMenu'
import { TasksCardDashboard } from '../tasks/TasksCardDashboard'
import { WorkingDaysCard } from './WorkingDaysCard'
import { DashboardAgenda } from './DashboardAgenda'
import { NewQuoteButton } from '@/components/quotes/NewQuoteButton'

export function VendorDashboard({
  myGoal, dailyGoal = 0, weeklyGoal = 0, todaySold = 0, weekSold = 0, myQuotes, funnel, sales, userName, allQuotes, users, currentUserId, prospectionsThisMonth, salesByUser, goalsByUser, myEarnings, selectedYear, selectedMonth, goalsFallbackLabel, collaboratorRoles = ['admin', 'seller']
}: {
  myGoal: number
  dailyGoal?: number
  weeklyGoal?: number
  todaySold?: number
  weekSold?: number
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
  const [showEarningsModal, setShowEarningsModal] = useState(false)

  const now = new Date()
  const currentMonth = new Date(selectedYear ?? now.getFullYear(), (selectedMonth ?? now.getMonth() + 1) - 1, 1)
  const monthName = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const todayDate = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })

  function navigateMonth(delta: number) {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1)
    router.push(`/dashboard?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
  }

  // KPIs — abertura/fechamento de negociação é definido pela TEMPERATURA
  // (cold/warm/hot/no_forecast = aberto, closed/lost = encerrado), não pelo
  // status do orçamento (que só indica se a proposta em si já foi enviada —
  // quase todo orçamento aberto já está com status "done" nesse sentido).
  const negotiating = myQuotes
    .filter(q => q.temperature && ['warm', 'hot'].includes(q.temperature))
    .reduce((sum, q) => sum + (q.quoted_value ?? 0), 0)

  const opportunities = myQuotes.filter(q => !['closed', 'lost'].includes(q.temperature ?? 'cold')).length
  const urgent = myQuotes.filter(q => isOverdue(q.deadline) && !['closed', 'lost'].includes(q.temperature ?? 'cold')).length

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
    .filter(q => isOverdue(q.deadline) && !['closed', 'lost'].includes(q.temperature ?? 'cold'))
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
    .filter(q => !['closed', 'lost'].includes(q.temperature ?? 'cold'))
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
      {/* Dias úteis + acesso à comissão detalhada, lado a lado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <WorkingDaysCard />
        {myEarnings && (
          <button
            onClick={() => setShowEarningsModal(true)}
            className="flex items-center gap-3 px-3 py-2 rounded-xl border h-full bg-white border-surface-border hover:bg-emerald-50/50 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50">
              <Maximize2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">Minha comissão do mês</p>
              <p className="text-base font-bold leading-none text-emerald-700 mt-0.5">{formatCurrency(myEarnings.total)}</p>
            </div>
          </button>
        )}
      </div>

      {/* Metas de dia / semana / mês */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GoalCard color="amber" label="Meta do dia" achieved={todaySold} target={dailyGoal} />
        <GoalCard color="orange" label="Meta da semana" achieved={weekSold} target={weeklyGoal} />
        <GoalCard color="violet" label="Meta do mês" achieved={sales} target={myGoal} />
      </div>

      {showEarningsModal && myEarnings && (
        <EarningsModal myEarnings={myEarnings} onClose={() => setShowEarningsModal(false)} />
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

const GOAL_CARD_COLORS = {
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  bar: 'bg-amber-400',  barBg: 'bg-amber-100' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', bar: 'bg-orange-400', barBg: 'bg-orange-100' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', bar: 'bg-violet-400', barBg: 'bg-violet-100' },
}

function GoalCard({ color, label, achieved, target }: {
  color: keyof typeof GOAL_CARD_COLORS
  label: string
  achieved: number
  target: number
}) {
  const c = GOAL_CARD_COLORS[color]
  const pct = target > 0 ? Math.round((achieved / target) * 100) : 0
  const remaining = Math.max(0, target - achieved)

  return (
    <div className={cn('rounded-2xl border p-4', c.bg, c.border)}>
      <p className={cn('text-xs font-semibold uppercase tracking-wide', c.text)}>{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(achieved)}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        Meta: {target > 0 ? formatCurrency(target) : <span className="text-amber-500">não cadastrada</span>}
      </p>
      {target > 0 && (
        <>
          <div className={cn('h-1.5 rounded-full mt-2 overflow-hidden', c.barBg)}>
            <div className={cn('h-full rounded-full', c.bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            <strong className={c.text}>{pct}%</strong> atingido
            {remaining > 0 && <> · falta <strong className="text-gray-700">{formatCurrency(remaining)}</strong></>}
          </p>
        </>
      )}
    </div>
  )
}

function EarningsModal({ myEarnings, onClose }: { myEarnings: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Minha comissão do mês</h2>
            <p className="text-2xl font-bold text-emerald-700 mt-0.5">{formatCurrency(myEarnings.total)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase">1% das minhas vendas</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(myEarnings.sellerComm)}</p>
            </div>
            {myEarnings.projetistaComm > 0 && (
              <div className="bg-violet-50 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-violet-600 uppercase">Como projetista</p>
                <p className="text-lg font-bold text-violet-700 mt-0.5">{formatCurrency(myEarnings.projetistaComm)}</p>
              </div>
            )}
          </div>

          {myEarnings.sellerDetails?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Minhas vendas do mês</p>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                {myEarnings.sellerDetails.map((s: any) => (
                  <div key={s.number} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-semibold text-brand-600">#{s.number}</span>{' '}
                      <span className="text-gray-700 truncate">{s.client_name}</span>
                      {s.num_owners > 1 && <span className="text-gray-400"> · 1/{s.num_owners}</span>}
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-gray-900 font-medium">{formatCurrency(s.value)}</p>
                      <p className="text-[11px] text-emerald-600">{formatCurrency(s.comm)} comissão</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myEarnings.projetistaSales?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-2">Vendas como projetista</p>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                {myEarnings.projetistaSales.map((p: any) => (
                  <div key={p.number} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span><span className="font-semibold text-brand-600">#{p.number}</span> <span className="text-gray-700">{p.client_name}</span> <span className="text-gray-400">({p.rate}%)</span></span>
                    <span className="font-medium text-violet-700">{formatCurrency(p.comm)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!myEarnings.sellerDetails?.length && !myEarnings.projetistaSales?.length && (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma venda fechada este mês ainda.</p>
          )}
        </div>
      </div>
    </div>
  )
}
