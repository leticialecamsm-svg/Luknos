import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  progress?: number  // 0..1
  color?: 'green' | 'blue' | 'amber' | 'red' | 'gray'
}

const COLOR = {
  green: { text: 'text-green-700', bar: 'bg-green-500' },
  blue:  { text: 'text-brand-500', bar: 'bg-brand-500' },
  amber: { text: 'text-amber-700', bar: 'bg-amber-500' },
  red:   { text: 'text-red-600',   bar: 'bg-red-500'   },
  gray:  { text: 'text-gray-700',  bar: 'bg-gray-400'  },
}

export function KpiCard({ label, value, sub, progress, color = 'blue' }: KpiCardProps) {
  const c = COLOR[color]
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      <p className={cn('text-2xl font-bold', c.text)}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', c.bar)}
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            {Math.round(progress * 100)}% da meta
          </p>
        </div>
      )}
    </div>
  )
}
