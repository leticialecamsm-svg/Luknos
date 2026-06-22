'use client'

import Link from 'next/link'
import { Flame, Clock, AlertTriangle, Inbox, Snowflake, Wallet, Handshake, Lightbulb, ChevronRight } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface Suggestion {
  key: string
  icon: any
  tone: 'red' | 'orange' | 'amber' | 'blue' | 'emerald' | 'violet'
  title: string
  detail: string
  href: string
}

const TONE: Record<string, { bg: string; text: string; ring: string }> = {
  red:     { bg: 'bg-red-50',     text: 'text-red-600',     ring: 'ring-red-100' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-600',  ring: 'ring-orange-100' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   ring: 'ring-amber-100' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    ring: 'ring-blue-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  ring: 'ring-violet-100' },
}

function daysSince(dateStr?: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr).getTime()
  if (isNaN(d)) return null
  return Math.floor((Date.now() - d) / 86400000)
}

function buildSuggestions(quotes: any[]): Suggestion[] {
  const todayISO = new Date().toISOString().split('T')[0]
  const out: Suggestion[] = []
  const open = quotes.filter(q => q.status !== 'done' && !['closed', 'lost'].includes(q.temperature ?? ''))

  // 1. Quentes para fechar
  const hot = open.filter(q => q.temperature === 'hot')
  if (hot.length) {
    const val = hot.reduce((s, q) => s + Number(q.quoted_value ?? 0), 0)
    const names = hot.slice(0, 3).map(q => q.client_name).filter(Boolean).join(', ')
    out.push({ key: 'hot', icon: Flame, tone: 'red', title: `Feche ${hot.length} orçamento(s) quente(s) — ${formatCurrency(val)}`,
      detail: `Estão prontos para fechar. Priorize: ${names}${hot.length > 3 ? '…' : ''}.`, href: '/negotiations' })
  }

  // 2. Prazo vencido
  const overdue = open.filter(q => q.deadline && q.deadline < todayISO)
  if (overdue.length) {
    out.push({ key: 'overdue', icon: AlertTriangle, tone: 'orange', title: `${overdue.length} orçamento(s) com prazo vencido`,
      detail: `Retome o contato hoje para não perder a oportunidade.`, href: '/quotes' })
  }

  // 3. Mornos para aquecer
  const warm = open.filter(q => q.temperature === 'warm')
  if (warm.length) {
    const val = warm.reduce((s, q) => s + Number(q.quoted_value ?? 0), 0)
    out.push({ key: 'warm', icon: Clock, tone: 'amber', title: `Aqueça ${warm.length} negociação(ões) morna(s) — ${formatCurrency(val)}`,
      detail: `Ofereça uma condição ou agende uma visita para avançar.`, href: '/negotiations' })
  }

  // 4. Na fila sem atendimento
  const queue = open.filter(q => q.status === 'queue')
  if (queue.length) {
    out.push({ key: 'queue', icon: Inbox, tone: 'blue', title: `${queue.length} orçamento(s) novo(s) na fila`,
      detail: `Distribua e inicie o atendimento antes que esfriem.`, href: '/quotes' })
  }

  // 5. Frios parados há muito tempo
  const coldStale = open.filter(q => (q.temperature === 'cold' || !q.temperature) && (daysSince(q.created_at) ?? 0) >= 14)
  if (coldStale.length) {
    out.push({ key: 'cold', icon: Snowflake, tone: 'violet', title: `Reative ${coldStale.length} orçamento(s) frio(s)`,
      detail: `Parados há 2+ semanas. Um follow-up pode reabrir a conversa.`, href: '/quotes' })
  }

  // 6. Pagamentos pendentes (vendas fechadas com método em aberto)
  const pendingPay = quotes.filter(q => Array.isArray(q.payment_splits) && q.payment_splits.some((s: any) => s.status === 'open'))
  if (pendingPay.length) {
    const val = pendingPay.reduce((s, q) =>
      s + q.payment_splits.filter((p: any) => p.status === 'open').reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0), 0)
    out.push({ key: 'pay', icon: Wallet, tone: 'emerald', title: `Cobre ${formatCurrency(val)} em pagamentos pendentes`,
      detail: `${pendingPay.length} venda(s) fechada(s) com pagamento em aberto.`, href: '/quotes' })
  }

  // 7. Parceiro com maior valor em negociação
  const byPartner: Record<string, number> = {}
  for (const q of open) {
    if (q.architect_name) byPartner[q.architect_name] = (byPartner[q.architect_name] ?? 0) + Number(q.quoted_value ?? 0)
  }
  const topPartner = Object.entries(byPartner).sort((a, b) => b[1] - a[1])[0]
  if (topPartner && topPartner[1] > 0) {
    out.push({ key: 'partner', icon: Handshake, tone: 'blue', title: `Acione o parceiro ${topPartner[0]}`,
      detail: `Tem ${formatCurrency(topPartner[1])} em orçamentos em negociação. Um contato pode destravar vendas.`, href: '/partners' })
  }

  // ordena por prioridade (tom vermelho/laranja primeiro)
  const order = ['red', 'orange', 'amber', 'emerald', 'blue', 'violet']
  return out.sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone)).slice(0, 6)
}

export function SalesSuggestions({ quotes }: { quotes: any[] }) {
  const suggestions = buildSuggestions(quotes)

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Sugestões do dia</h3>
          <p className="text-xs text-gray-500">O que fazer hoje para vender mais</p>
        </div>
      </div>

      {suggestions.length === 0 ? (
        <p className="text-sm text-gray-400 py-3 text-center">Tudo em dia! Nenhuma ação urgente no momento. 🎉</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {suggestions.map(s => {
            const t = TONE[s.tone]
            return (
              <Link key={s.key} href={s.href}
                className={cn('group flex items-start gap-3 rounded-lg bg-white border border-surface-border p-3 hover:shadow-sm transition-all')}>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-4', t.bg, t.ring)}>
                  <s.icon className={cn('w-4 h-4', t.text)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
