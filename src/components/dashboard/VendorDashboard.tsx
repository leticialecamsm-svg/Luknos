'use client'

import { useState } from 'react'
import { formatCurrency, formatDate, getInitials, isOverdue, cn } from '@/lib/utils'
import { TEMPERATURE_COLOR, TEMPERATURE_LABEL, QUOTE_STATUS_LABEL } from '@/types'
import { TrendingUp, AlertCircle, Calendar } from 'lucide-react'
import { QuickLinksMenu } from './QuickLinksMenu'
import { TasksCard } from '../tasks/TasksCard'

export function VendorDashboard({
  myGoal, myQuotes, funnel, sales, userName, allQuotes, users, currentUserId
}: {
  myGoal: number
  myQuotes: any[]
  funnel: any[]
  sales: number
  userName: string
  allQuotes?: any[]
  users?: any[]
  currentUserId?: string
}) {
  const [activeTab, setActiveTab] = useState<'meu' | 'geral'>('meu')

  const now = new Date()
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const todayDate = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })

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

  // Cálculos para aba "Geral"
  const totalFaturamento = (allQuotes ?? [])
    .filter(q => q.status === 'done')
    .reduce((sum, q) => sum + (q.final_value ?? q.quoted_value ?? 0), 0)

  const pipelineTotal = (allQuotes ?? [])
    .filter(q => q.status !== 'done')
    .reduce((sum, q) => sum + (q.quoted_value ?? 0), 0)

  // Ranking de colaboradores
  const userPerformance = (users ?? []).map(u => {
    const userQuotes = (allQuotes ?? []).filter(q => q.owners?.some((o: any) => o.user_id === u.id) && q.status === 'done')
    const totalVendido = userQuotes.reduce((sum, q) => sum + (q.final_value ?? q.quoted_value ?? 0), 0)
    const userGoal = 70000
    const comissao = Math.round(totalVendido * 0.01) // 1% de comissão

    return {
      id: u.id,
      name: u.name,
      avatar_color: u.avatar_color,
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
          <QuickLinksMenu />
          <a href="/quotes/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            + Novo orçamento
          </a>
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
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-green-500"></div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Vendido no mês</p>
          <p className="text-2xl font-bold text-green-600 mt-2">{formatCurrency(sales)}</p>
          <p className="text-xs text-gray-500 mt-2">Meta: {formatCurrency(myGoal)}</p>
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
      </div>

      {/* Grid 3 colunas: Meta + Funil */}
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
      </div>

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
                        <p className="text-xs text-gray-500">Arq. {q.architect_name}</p>
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

      {/* Card de Tarefas */}
      <div className="grid grid-cols-2 gap-4">
        <TasksCard />
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
              <p className="text-xs text-gray-500 mt-2">Todos os vendedores</p>
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

          {/* Ranking de Vendas e Comissão */}
          <div className="grid grid-cols-2 gap-4">
            {/* Ranking de Vendas */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Ranking — Vendas</h3>
                <p className="text-xs text-gray-500">{monthName}</p>
              </div>
              <div className="p-4 space-y-3">
                {userPerformance.map((u, i) => (
                  <div key={u.id} className={`flex items-start gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0 ${u.id === currentUserId ? 'bg-blue-50 -mx-4 px-4 py-3 rounded' : ''}`}>
                    <div className="text-sm font-bold text-gray-400 w-6 shrink-0">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: u.avatar_color }}>
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-500">{Math.round(u.percentMeta)}% da meta</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-gray-900">{formatCurrency(u.vendido)}</p>
                      <p className="text-xs text-gray-500">de {formatCurrency(u.meta)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ranking de Comissão */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Ranking — Comissão</h3>
                <p className="text-xs text-gray-500 text-green-600 font-semibold">1% de cada venda</p>
              </div>
              <div className="p-4 space-y-3">
                {userPerformance.sort((a, b) => b.comissao - a.comissao).map((u, i) => (
                  <div key={u.id} className={`flex items-start gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0 ${u.id === currentUserId ? 'bg-green-50 -mx-4 px-4 py-3 rounded' : ''}`}>
                    <div className="text-sm font-bold text-gray-400 w-6 shrink-0">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: u.avatar_color }}>
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-500">Vendido: {formatCurrency(u.vendido)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-green-600">{formatCurrency(u.comissao)}</p>
                      <p className="text-xs text-gray-500">Comissão</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
