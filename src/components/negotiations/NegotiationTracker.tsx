'use client'
import { useEffect, useState } from 'react'
import { getNegotiationHistory, getNegotiationTemperatureInfo } from '@/lib/actions'
import { TEMP_DEMOTION_DAYS } from '@/types'
import { cn } from '@/lib/utils'
import { TrendingDown, TrendingUp } from 'lucide-react'

const tempLabel: Record<string, string> = {
  no_forecast: 'Sem previsão',
  cold: 'Frio',
  warm: 'Morno',
  hot: 'Quente',
  closed: 'Venda fechada',
  lost: 'Perdida',
}

const tempColor: Record<string, string> = {
  no_forecast: 'text-slate-500',
  cold: 'text-blue-600',
  warm: 'text-amber-600',
  hot: 'text-red-600',
}

export function NegotiationTracker({ quoteId, temperature }: { quoteId: string; temperature?: string }) {
  const [history, setHistory] = useState<any[]>([])
  const [tempInfo, setTempInfo] = useState<any>(null)

  useEffect(() => {
    Promise.all([
      getNegotiationHistory(quoteId),
      getNegotiationTemperatureInfo(quoteId),
    ]).then(([h, t]) => {
      setHistory(h)
      setTempInfo(t)
    })
  }, [quoteId])

  if (!temperature || ['closed', 'lost'].includes(temperature)) return null

  const daysInTemp = tempInfo?.temperature_updated_at
    ? Math.floor((Date.now() - new Date(tempInfo.temperature_updated_at).getTime()) / 86400000)
    : null
  const limit = TEMP_DEMOTION_DAYS[temperature as keyof typeof TEMP_DEMOTION_DAYS]
  const urgencyPct = limit && daysInTemp !== null ? Math.min(daysInTemp / limit, 1) : 0

  return (
    <div className="card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        🌡️ Temperatura da negociação
      </h2>

      {/* Status atual + contador */}
      <div className="flex items-center justify-between">
        <span className={cn('text-sm font-semibold', tempColor[temperature] ?? 'text-gray-700')}>
          {tempLabel[temperature] ?? temperature}
        </span>
        {daysInTemp !== null && (
          <span className="text-xs text-gray-400">{daysInTemp} dia{daysInTemp !== 1 ? 's' : ''} neste status</span>
        )}
      </div>

      {/* Barra de progresso */}
      {limit !== undefined && daysInTemp !== null && (
        <div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all',
                urgencyPct >= 1 ? 'bg-red-500' : urgencyPct >= 0.7 ? 'bg-orange-400' : 'bg-green-400'
              )}
              style={{ width: `${urgencyPct * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">0d</span>
            <span className={cn('text-[10px] font-medium', urgencyPct >= 1 ? 'text-red-500' : 'text-gray-400')}>
              {urgencyPct >= 1 ? '⚠️ Limite excedido' : `${limit - daysInTemp}d restantes`}
            </span>
            <span className="text-[10px] text-gray-400">{limit}d</span>
          </div>
        </div>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-surface-border">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Histórico</p>
          {history.slice(0, 5).map((h: any) => {
            const tempOrder: Record<string, number> = { no_forecast: 0, cold: 1, warm: 2, hot: 3, closed: 4 }
            const isUp = (tempOrder[h.to_temp] ?? 0) > (tempOrder[h.from_temp] ?? 0)
            return (
              <div key={h.id} className="flex items-start gap-2 text-xs">
                <div className="mt-0.5">
                  {isUp
                    ? <TrendingUp className="w-3 h-3 text-green-500" />
                    : <TrendingDown className="w-3 h-3 text-red-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600">
                    {tempLabel[h.from_temp] ?? h.from_temp} → {tempLabel[h.to_temp] ?? h.to_temp}
                  </span>
                  {h.auto_demoted && (
                    <span className="ml-1 text-[10px] text-orange-500 font-medium">(automático)</span>
                  )}
                  {h.reason_text && <p className="text-gray-400 truncate">{h.reason_text}</p>}
                </div>
                <span className="text-gray-300 shrink-0">
                  {new Date(h.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
