'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { LuknosMark } from './PageLoader'

// Peças de carregamento da Luknos para dentro das telas (a estrela da marca + esqueletos com o
// mesmo brilho do ContentLoader). As animações vêm de globals.css (.luk-mark / .luk-shimmer) e
// param com "reduzir movimento" do sistema.

// Só aparece se a espera passar de `delay` ms: operação rápida não pisca nada na tela.
function useDelayed(delay: number) {
  const [show, setShow] = useState(delay <= 0)
  useEffect(() => {
    if (delay <= 0) return
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return show
}

/** A estrela da Luknos "respirando", com um texto curto. Para esperas que bloqueiam uma área. */
export function LuknosSpinner({ label = 'Carregando…', size = 'md', delay = 250, className = '' }: {
  label?: string | null
  size?: 'sm' | 'md'
  delay?: number
  className?: string
}) {
  const show = useDelayed(delay)
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <span className="sr-only">{label ?? 'Carregando…'}</span>
      {show && (
        <>
          <span className={`luk-mark rounded-xl bg-white/90 ring-1 ring-black/[0.04] ${size === 'sm' ? 'p-1.5' : 'p-2.5'}`} aria-hidden>
            <LuknosMark className={size === 'sm' ? 'h-4 w-4' : 'h-7 w-7'} />
          </span>
          {label && <span className="text-xs font-medium tracking-wide text-gray-400" aria-hidden>{label}</span>}
        </>
      )}
    </div>
  )
}

function Bar({ className = '' }: { className?: string }) {
  return <div className={`luk-shimmer rounded-md ${className}`} />
}

/** Esqueleto da lista de conversas (enquanto não há nada guardado para mostrar). */
export function ConversationListSkeleton({ rows = 8 }: { rows?: number }) {
  const show = useDelayed(120)
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando conversas…</span>
      {show && Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 pl-3.5 pr-3 py-2.5 border-b border-gray-100" aria-hidden>
          <div className="luk-shimmer w-12 h-12 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Bar className={`h-3.5 ${i % 3 === 0 ? 'w-2/3' : i % 3 === 1 ? 'w-1/2' : 'w-3/5'}`} />
            <Bar className={`h-3 ${i % 2 ? 'w-4/5' : 'w-11/12'}`} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Esqueleto da conversa aberta: balões dos dois lados + a estrela no meio. */
export function ThreadSkeleton() {
  const show = useDelayed(120)
  const rows: [boolean, string][] = [[false, 'w-52'], [false, 'w-72'], [true, 'w-60'], [false, 'w-40'], [true, 'w-80'], [true, 'w-48']]
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="relative py-2">
      <span className="sr-only">Carregando mensagens…</span>
      {show && (
        <>
          <div className="space-y-2 opacity-80" aria-hidden>
            {rows.map(([out, w], i) => (
              <div key={i} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                <div className={`luk-shimmer h-9 rounded-lg ${w} max-w-[65%]`} />
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="luk-mark rounded-xl bg-white/90 p-2.5 ring-1 ring-black/[0.04]"><LuknosMark className="h-7 w-7" /></span>
          </div>
        </>
      )}
    </div>
  )
}

/** Falha ao carregar: diz o que houve e oferece tentar de novo (nunca fica girando para sempre). */
export function LoadError({ message, onRetry, className = '' }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex flex-col items-center gap-2 p-6 text-center ${className}`}>
      <p className="text-sm text-gray-600">{message}</p>
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
        <RefreshCw className="w-4 h-4" /> Tentar de novo
      </button>
    </div>
  )
}
