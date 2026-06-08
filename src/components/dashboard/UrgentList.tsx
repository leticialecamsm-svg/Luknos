import Link from 'next/link'
import { AlertCircle, Flame } from 'lucide-react'
import { formatDate, isOverdue, cn } from '@/lib/utils'
import { TEMPERATURE_COLOR } from '@/types'

export function UrgentList({ quotes }: { quotes: any[] }) {
  if (quotes.length === 0) {
    return (
      <div className="card p-6 flex flex-col items-center justify-center text-center h-full min-h-[200px]">
        <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
          <span className="text-lg">✅</span>
        </div>
        <p className="text-sm font-medium text-gray-700">Nenhuma urgência</p>
        <p className="text-xs text-gray-400 mt-1">Sem prazos vencidos ou negociações quentes paradas</p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-surface-border bg-red-50 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-600" />
        <h3 className="text-sm font-semibold text-red-700">Urgente — ação imediata</h3>
        <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
          {quotes.length}
        </span>
      </div>
      <div className="divide-y divide-surface-border">
        {quotes.map(q => {
          const overdue = isOverdue(q.deadline) && q.status !== 'done'
          const temp = q.temperature
          const tempColor = temp ? TEMPERATURE_COLOR[temp as keyof typeof TEMPERATURE_COLOR] : null

          return (
            <Link
              key={q.id}
              href={`/quotes/${q.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{q.client_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Orç. #{String(q.number).padStart(3,'0')}
                  {q.architect_name ? ` · ${q.architect_name}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {overdue && (
                  <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                    Vencido {formatDate(q.deadline)}
                  </span>
                )}
                {temp === 'hot' && (
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium border flex items-center gap-1',
                    tempColor?.bg, tempColor?.text, tempColor?.border
                  )}>
                    <Flame className="w-3 h-3" />
                    Quente
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
