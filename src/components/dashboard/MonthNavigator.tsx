'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useDashboardPending } from './ValuesMask'

const label = (y: number, m: number) => {
  const t = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Passador de mês: troca o rótulo na hora, mostra spinner e escurece o painel
// enquanto os dados do novo mês carregam.
export function MonthNavigator({ year, month }: { year: number; month: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [target, setTarget] = useState({ year, month })
  const setPending = useDashboardPending()

  useEffect(() => { setTarget({ year, month }) }, [year, month])
  useEffect(() => { setPending?.(isPending) }, [isPending, setPending])

  function go(delta: number) {
    const d = new Date(target.year, target.month - 1 + delta, 1)
    const next = { year: d.getFullYear(), month: d.getMonth() + 1 }
    setTarget(next)
    startTransition(() => router.push(`/dashboard?year=${next.year}&month=${next.month}`))
  }

  const btn = 'w-8 h-full flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-surface-secondary transition-colors'
  return (
    <div className="h-9 flex items-stretch bg-white border border-surface-border rounded-lg overflow-hidden text-sm font-medium text-gray-700" aria-live="polite">
      <button type="button" onClick={() => go(-1)} className={btn} aria-label="Mês anterior"><ChevronLeft className="w-4 h-4" /></button>
      <span className="min-w-[9.5rem] px-2 flex items-center justify-center gap-1.5 whitespace-nowrap border-x border-surface-border">
        {label(target.year, target.month)}
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />}
      </span>
      <button type="button" onClick={() => go(1)} className={btn} aria-label="Próximo mês"><ChevronRight className="w-4 h-4" /></button>
    </div>
  )
}
