'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { QUOTE_STATUS_LABEL, TEMPERATURE_LABEL } from '@/types'
import { cn } from '@/lib/utils'

export function QuoteFilters({ isAdmin }: { isAdmin: boolean }) {
  const router = useSearchParams()
  const params = useSearchParams()

  function setFilter(key: string, value: string) {
    const p = new URLSearchParams(params.toString())
    if (p.get(key) === value) p.delete(key)
    else p.set(key, value)
    window.history.pushState(null, '', `?${p.toString()}`)
    window.location.reload()
  }

  const activeStatus = params.get('status')
  const activeTemp   = params.get('temp')

  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-xs text-gray-400 self-center">Status:</span>
      {Object.entries(QUOTE_STATUS_LABEL).map(([k, label]) => (
        <button
          key={k}
          onClick={() => setFilter('status', k)}
          className={cn(
            'badge cursor-pointer transition-all',
            activeStatus === k
              ? 'bg-brand-500 text-white'
              : 'bg-surface-secondary text-gray-600 hover:bg-surface-border'
          )}
        >
          {label}
        </button>
      ))}

      <span className="text-xs text-gray-400 self-center ml-2">Negociação:</span>
      {Object.entries(TEMPERATURE_LABEL).map(([k, label]) => (
        <button
          key={k}
          onClick={() => setFilter('temp', k)}
          className={cn(
            'badge cursor-pointer transition-all',
            activeTemp === k
              ? 'bg-brand-500 text-white'
              : 'bg-surface-secondary text-gray-600 hover:bg-surface-border'
          )}
        >
          {label}
        </button>
      ))}

      {(activeStatus || activeTemp) && (
        <button
          onClick={() => window.location.href = '/quotes'}
          className="text-xs text-gray-400 hover:text-gray-600 ml-1"
        >
          × Limpar filtros
        </button>
      )}
    </div>
  )
}
