import { formatCurrency, getInitials, cn } from '@/lib/utils'

export function UserPerformance({ users, sales, funnel, goals, storeGoal, noCard }: any) {
  return (
    <div className={noCard ? 'p-4' : 'card p-4 h-full'}>
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Desempenho por colaborador</h3>
      <div className="space-y-4">
        {users.map((user: any) => {
          const sold = sales
            .filter((s: any) => s.user_id === user.id)
            .reduce((sum: number, s: any) => sum + Number(s.total_sold ?? 0), 0)

          const openValue = (funnel ?? [])
            .filter((f: any) => f.user_id === user.id && !['closed','lost'].includes(f.temperature ?? ''))
            .reduce((sum: number, f: any) => sum + Number(f.total_quoted ?? 0), 0)

          const goal = goals?.find((g: any) => g.user_id === user.id)?.target ?? 70000
          const pct = goal > 0 ? sold / goal : 0

          return (
            <div key={user.id}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                  style={{ backgroundColor: user.avatar_color ?? '#185FA5' }}>
                  {getInitials(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{user.name}</span>
                    <span className="text-xs font-semibold text-gray-700 ml-2 shrink-0">
                      {formatCurrency(sold)}
                    </span>
                  </div>
                  {/* Barra de meta */}
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all',
                        pct >= 1 ? 'bg-green-500' : pct >= 0.5 ? 'bg-amber-500' : 'bg-brand-500'
                      )}
                      style={{ width: `${Math.min(pct * 100, 100)}%` }}
                    />
                  </div>
                  {/* Meta + oportunidades */}
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-gray-400">
                      {Math.round(pct * 100)}% de {formatCurrency(goal)}
                    </p>
                    {openValue > 0 && (
                      <p className="text-[10px] text-amber-600 font-medium">
                        {formatCurrency(openValue)} em aberto
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
