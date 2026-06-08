'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { TEMPERATURE_LABEL, TEMPERATURE_COLOR } from '@/types'
import { ArrowRight, Clock, Lightbulb, BarChart2, TrendingUp } from 'lucide-react'
import { UserPerformance } from './UserPerformance'

const TEMPS = ['cold', 'warm', 'hot', 'closed', 'lost'] as const

const SUGGESTIONS: Record<string, string> = {
  cold:   'Acompanhe com a equipe: qual vendedor pode fazer um follow-up com esses clientes?',
  warm:   'Orçamentos mornos precisam de um empurrão — revise propostas e agende contatos.',
  hot:    'Atenção máxima! Esses clientes estão prontos para fechar — priorize a equipe.',
  closed: 'Ótimo resultado! Peça avaliações e incentive indicações.',
  lost:   'Analise os motivos de perda para ajustar a estratégia da equipe.',
}

interface Props {
  funnel: any[]
  quotes: any[]
  users: any[]
  sales: any[]
  goals: any[]
  storeGoal: number
}

export function AdminDashboard({ funnel, quotes, users, sales, goals, storeGoal }: Props) {
  const [activeTab, setActiveTab] = useState<'performance' | 'funnel'>('performance')
  const [selectedTemp, setSelectedTemp] = useState<string | null>(null)

  // Calcula a partir dos quotes reais para evitar dupla contagem por múltiplos donos
  const byTemp = TEMPS.reduce((acc, t) => {
    const matching = quotes.filter((q: any) => (q.temperature ?? 'cold') === t)
    acc[t] = {
      count: matching.length,
      value: matching.reduce((s: number, q: any) => s + Number(q.quoted_value ?? 0), 0),
    }
    return acc
  }, {} as Record<string, { count: number; value: number }>)

  const total = TEMPS.reduce((s, t) => s + (byTemp[t]?.count ?? 0), 0)

  const filteredQuotes = selectedTemp
    ? quotes.filter(q => (q.temperature ?? 'cold') === selectedTemp)
    : []

  function handleTempClick(temp: string) {
    if (activeTab !== 'funnel') setActiveTab('funnel')
    setSelectedTemp(prev => prev === temp ? null : temp)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Funil */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Funil de negociação</h3>
        <div className="space-y-2">
          {TEMPS.map(temp => {
            const d = byTemp[temp] ?? { count: 0, value: 0 }
            const pct = total > 0 ? d.count / total : 0
            const c = TEMPERATURE_COLOR[temp]
            const isActive = selectedTemp === temp && activeTab === 'funnel'

            return (
              <button
                key={temp}
                onClick={() => handleTempClick(temp)}
                className={cn(
                  'w-full rounded-lg p-3 border text-left transition-all',
                  c.bg, c.border,
                  isActive ? 'ring-2 ring-offset-1' : 'hover:opacity-80',
                  isActive && temp === 'cold'   && 'ring-blue-400',
                  isActive && temp === 'warm'   && 'ring-amber-400',
                  isActive && temp === 'hot'    && 'ring-red-400',
                  isActive && temp === 'closed' && 'ring-green-400',
                  isActive && temp === 'lost'   && 'ring-gray-400',
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={cn('text-xs font-semibold', c.text)}>{TEMPERATURE_LABEL[temp]}</span>
                  <span className={cn('text-sm font-bold', c.text)}>{d.count}</span>
                </div>
                <div className="h-1 bg-black/10 rounded-full overflow-hidden">
                  <div className="h-full bg-current rounded-full transition-all" style={{ width: `${pct * 100}%` }} />
                </div>
                <p className="text-[10px] mt-1 opacity-60">{formatCurrency(d.value)}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel direito */}
      <div className="lg:col-span-2 card overflow-hidden flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-surface-border">
          <button
            onClick={() => setActiveTab('performance')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'performance'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <BarChart2 className="w-4 h-4" />
            Desempenho
          </button>
          <button
            onClick={() => setActiveTab('funnel')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'funnel'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <TrendingUp className="w-4 h-4" />
            Negociações
            {selectedTemp && (
              <span className="bg-brand-50 text-brand-600 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {TEMPERATURE_LABEL[selectedTemp as keyof typeof TEMPERATURE_LABEL]}
              </span>
            )}
          </button>
        </div>

        {/* Aba: Desempenho */}
        {activeTab === 'performance' && (
          <div className="flex-1 overflow-y-auto">
            <UserPerformance users={users} sales={sales} funnel={funnel} goals={goals} storeGoal={storeGoal} noCard />
          </div>
        )}

        {/* Aba: Negociações */}
        {activeTab === 'funnel' && (
          !selectedTemp ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <TrendingUp className="w-8 h-8 text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Selecione uma categoria no funil</p>
              <p className="text-xs text-gray-400 mt-1">Clique em Frio, Morno, Quente... para ver todos os orçamentos</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2 shrink-0">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">{SUGGESTIONS[selectedTemp]}</p>
              </div>
              {filteredQuotes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6">
                  <p className="text-sm text-gray-400">Nenhum orçamento nessa categoria</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-border overflow-y-auto flex-1">
                  {filteredQuotes.map(q => {
                    const daysAgo = q.created_at
                      ? Math.floor((Date.now() - new Date(q.created_at).getTime()) / 86400000)
                      : null
                    return (
                      <Link key={q.id} href={`/quotes/${q.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{q.client_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">#{String(q.number).padStart(3, '0')}</span>
                            {q.owners?.[0]?.name && (
                              <span className="text-xs text-gray-400">· {q.owners[0].name.split(' ')[0]}</span>
                            )}
                            {daysAgo !== null && (
                              <span className="flex items-center gap-0.5 text-xs text-gray-400">
                                <Clock className="w-3 h-3" />
                                {daysAgo === 0 ? 'hoje' : `${daysAgo}d`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-gray-700">
                            {formatCurrency(q.final_value ?? q.quoted_value)}
                          </p>
                          {q.deadline && <p className="text-xs text-gray-400">{formatDate(q.deadline)}</p>}
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}
