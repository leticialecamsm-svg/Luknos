'use client'

import { formatCurrency, cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Flame, Circle } from 'lucide-react'

export function GoalPreviewDashboard({ data, userName }: { data: any; userName: string }) {
  const {
    myGoal, sales, remaining, requiredPace, paceBehindPct, projection, onPace,
    businessDaysRemaining, dailyGoal, todaySold, todayRemaining, closingsNeededToday, avgTicket,
    pipeline,
  } = data

  const metaPercent = myGoal > 0 ? Math.round((sales / myGoal) * 100) : 0
  const coverageLabel = pipeline.coverage === Infinity ? '—' : `${pipeline.coverage.toFixed(2)}x`
  const coverageOk = pipeline.coverage === Infinity || pipeline.coverage >= 1.5

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Visão de <strong className="text-gray-900">{userName}</strong> — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      {/* 1. Status da meta */}
      <div className={cn('rounded-2xl border-2 p-5', onPace ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40')}>
        <div className="flex items-start gap-3 mb-4">
          <span className={cn('shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center', onPace ? 'bg-emerald-500' : 'bg-red-500')}>1</span>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Status da meta</p>
            <div className={cn('flex items-center gap-1.5 font-bold mt-1', onPace ? 'text-emerald-700' : 'text-red-600')}>
              {onPace ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {onPace ? 'NO RITMO' : 'FORA DO RITMO'}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {onPace
                ? 'Você está no ritmo certo para atingir sua meta mensal.'
                : `Você está ${Math.abs(paceBehindPct)}% abaixo do ritmo necessário para atingir sua meta mensal.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Meta mensal" value={formatCurrency(myGoal)} />
          <Stat label="Vendido no mês" value={formatCurrency(sales)} sub={`${metaPercent}% da meta`} color="text-emerald-600" />
          <Stat label="Falta atingir" value={formatCurrency(remaining)} />
          <Stat label="Ritmo necessário" value={`${formatCurrency(requiredPace)}/dia`} sub={`nos próximos ${businessDaysRemaining} dias úteis`} />
          <Stat
            label="Projeção do mês"
            value={formatCurrency(projection)}
            color={projection >= myGoal ? 'text-emerald-600' : 'text-red-600'}
            sub={projection >= myGoal ? 'Deve bater a meta' : `Provavelmente não atingirá. Falta ${formatCurrency(Math.max(0, myGoal - projection))}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 2. Meta de hoje */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">2</span>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Meta de hoje</p>
          </div>

          <div className="space-y-2.5">
            <Row label={`Meta de hoje (${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`} value={formatCurrency(dailyGoal)} />
            <Row label="Vendido hoje" value={formatCurrency(todaySold)} valueColor={todaySold > 0 ? 'text-emerald-600' : 'text-gray-900'} />
            <Row label="Falta para hoje" value={formatCurrency(todayRemaining)} />
          </div>

          {todayRemaining > 0 && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs uppercase">
                <AlertTriangle className="w-3.5 h-3.5" />
                {closingsNeededToday} fechamento{closingsNeededToday !== 1 ? 's' : ''} necessário{closingsNeededToday !== 1 ? 's' : ''}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Você precisa fechar aproximadamente {closingsNeededToday} venda{closingsNeededToday !== 1 ? 's' : ''} de {formatCurrency(avgTicket)} hoje.
              </p>
            </div>
          )}
          {todayRemaining === 0 && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Meta de hoje batida! 🎉
            </div>
          )}
        </div>

        {/* 4. Pipeline em jogo */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">4</span>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pipeline em jogo</p>
          </div>

          <p className="text-xs text-gray-500">Valor total em jogo</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatCurrency(pipeline.total)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{pipeline.count} oportunidades ativas</p>

          <div className="space-y-2 mt-4">
            <PipelineBar icon={<Flame className="w-3 h-3 text-red-500" />} label="Quentes" count={pipeline.hot.count} total={pipeline.hot.total} max={pipeline.total} color="bg-red-400" />
            <PipelineBar icon={<Circle className="w-3 h-3 text-amber-500 fill-amber-500" />} label="Mornas" count={pipeline.warm.count} total={pipeline.warm.total} max={pipeline.total} color="bg-amber-400" />
            <PipelineBar icon={<Circle className="w-3 h-3 text-blue-500 fill-blue-500" />} label="Frias" count={pipeline.cold.count} total={pipeline.cold.total} max={pipeline.total} color="bg-blue-400" />
          </div>

          <div className={cn('mt-4 rounded-xl p-3 border', coverageOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200')}>
            <p className="text-xs text-gray-600">
              Cobertura da meta: <strong className={coverageOk ? 'text-emerald-700' : 'text-amber-700'}>{coverageLabel}</strong>
            </p>
            {!coverageOk && <p className="text-xs text-amber-700 mt-0.5">⚠ Pipeline abaixo do ideal</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={cn('text-base font-bold mt-1', color ?? 'text-gray-900')}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn('text-lg font-bold', valueColor ?? 'text-gray-900')}>{value}</p>
    </div>
  )
}

function PipelineBar({ icon, label, count, total, max, color }: { icon: React.ReactNode; label: string; count: number; total: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (total / max) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 font-medium text-gray-700">{icon} {label}</span>
        <span className="text-gray-500">{formatCurrency(total)} ({count})</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
