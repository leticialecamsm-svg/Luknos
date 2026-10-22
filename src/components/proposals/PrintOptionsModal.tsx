'use client'

import { useState } from 'react'
import { Loader2, Printer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Portal } from '@/components/ui/Portal'
import { PRINT_LABELS, type PrintOptions } from '@/lib/proposals/calc'

// Presets rápidos + ajuste fino do que sai no PDF.
const PRESETS: { label: string; options: Partial<PrintOptions> }[] = [
  { label: 'Completo', options: { images: true, prices: true, roomTotals: true, total: true, discount: true } },
  { label: 'Sem preços', options: { prices: false, roomTotals: false, total: false } },
  { label: 'Sem fotos', options: { images: false } },
  { label: 'Sem desconto', options: { discount: false } },
]

export function PrintOptionsModal({ options, onPrint, onClose }: {
  options: PrintOptions; onPrint: (o: PrintOptions) => Promise<void>; onClose: () => void
}) {
  const [o, setO] = useState(options)
  const [busy, setBusy] = useState(false)
  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-gray-900">Imprimir orçamento</h2>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Escolha o que aparece no PDF. A escolha fica salva neste orçamento.</p>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => setO(cur => ({ ...cur, ...p.options }))}
                className="text-xs px-2.5 py-1 rounded-full border border-surface-border text-gray-600 hover:bg-surface-secondary">{p.label}</button>
            ))}
          </div>

          <div className="space-y-1">
            {PRINT_LABELS.map(({ key, label, hint }) => {
              const disabled = key === 'discount' && !o.total
              return (
                <label key={key} className={cn('flex items-start gap-3 rounded-xl px-3 py-2 cursor-pointer hover:bg-surface-secondary', disabled && 'opacity-40 pointer-events-none')}>
                  <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#0A1F3B]" checked={o[key]} onChange={e => setO(cur => ({ ...cur, [key]: e.target.checked }))} />
                  <span>
                    <span className="block text-sm text-gray-800">{label}</span>
                    {hint && <span className="block text-xs text-gray-400">{hint}</span>}
                  </span>
                </label>
              )
            })}
          </div>

          <button className="btn-primary w-full justify-center mt-5" disabled={busy}
            onClick={async () => { setBusy(true); await onPrint(o); setBusy(false) }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Gerar PDF
          </button>
        </div>
      </div>
    </Portal>
  )
}
