import { TEMPERATURE_LABEL, TEMPERATURE_COLOR } from '@/types'
import { formatCurrency, cn } from '@/lib/utils'

interface FunnelChartProps {
  funnel: any[]
  userId?: string
}

const TEMPS = ['cold', 'warm', 'hot', 'closed', 'lost'] as const

export function FunnelChart({ funnel, userId }: FunnelChartProps) {
  // Agrega por temperatura
  const byTemp = TEMPS.reduce((acc, t) => {
    const rows = funnel.filter((f: any) =>
      f.temperature === t && (!userId || f.user_id === userId)
    )
    acc[t] = {
      count: rows.reduce((s: number, r: any) => s + Number(r.count), 0),
      value: rows.reduce((s: number, r: any) => s + Number(r.total_quoted ?? 0), 0),
    }
    return acc
  }, {} as Record<string, { count: number; value: number }>)

  const total = TEMPS.reduce((s, t) => s + (byTemp[t]?.count ?? 0), 0)

  return (
    <div className="card p-4 h-full">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Funil de negociação</h3>
      <div className="space-y-2">
        {TEMPS.map(temp => {
          const d = byTemp[temp] ?? { count: 0, value: 0 }
          const pct = total > 0 ? d.count / total : 0
          const c = TEMPERATURE_COLOR[temp]
          return (
            <div key={temp} className={cn('rounded-lg p-3 border', c.bg, c.border)}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn('text-xs font-semibold', c.text)}>
                  {TEMPERATURE_LABEL[temp]}
                </span>
                <span className={cn('text-sm font-bold', c.text)}>{d.count}</span>
              </div>
              {/* Barra */}
              <div className="h-1 bg-black/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-current rounded-full transition-all"
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <p className="text-[10px] mt-1 opacity-60">
                {formatCurrency(d.value)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
