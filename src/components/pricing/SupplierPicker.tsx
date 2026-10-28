'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supplierBrand } from '@/lib/pricing/supplier-brand'
import { SupplierLogo } from './SupplierLogo'
import type { SupplierOverview } from '@/lib/pricing/actions'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Seletor de fornecedor com busca: o botão mostra logo + nome na cor da marca;
// ao abrir, digitar já filtra a lista (sem acento, em qualquer parte do nome).
export function SupplierPicker({ suppliers, value, onChange }: { suppliers: SupplierOverview[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const current = suppliers.find(s => s.id === value)

  const list = useMemo(() => {
    const n = norm(q.trim())
    return n ? suppliers.filter(s => norm(s.name).includes(n)) : suppliers
  }, [suppliers, q])

  useEffect(() => { setHi(0) }, [q, open])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function pick(id: string) { onChange(id); setOpen(false); setQ('') }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[hi]) pick(list[hi].id) }
    else if (e.key === 'Escape') { setOpen(false); setQ('') }
  }

  const color = current ? supplierBrand(current.name).color : undefined

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex items-center gap-3 rounded-xl border-2 bg-white pl-3 pr-3 py-2 min-w-[220px] text-left hover:shadow-sm transition-shadow"
        style={{ borderColor: color ?? '#e5e7eb' }}>
        {current ? <SupplierLogo name={current.name} size={44} /> : <span className="w-11 h-11 rounded-md bg-gray-100" />}
        <span className="flex-1 text-sm font-semibold text-gray-900">{current?.name ?? 'Escolha o fornecedor'}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-surface-border bg-white shadow-lg overflow-hidden">
          <div className="relative border-b border-surface-border">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Digite para buscar o fornecedor…"
              className="w-full pl-9 pr-3 py-2.5 text-sm focus:outline-none" />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {list.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Nenhum fornecedor com esse nome.</li>}
            {list.map((s, i) => {
              const b = supplierBrand(s.name)
              return (
                <li key={s.id} role="option" aria-selected={s.id === value}>
                  <button type="button" onClick={() => pick(s.id)} onMouseEnter={() => setHi(i)}
                    className={cn('w-full flex items-center gap-3 px-3 py-2 text-left', i === hi && 'bg-surface-secondary')}>
                    <span className="w-1 self-stretch rounded-full" style={{ background: b.color }} />
                    <SupplierLogo name={s.name} size={28} />
                    <span className="flex-1 text-sm font-medium text-gray-800">{s.name}</span>
                    {s.id === value && <Check className="w-4 h-4 text-gray-500" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
