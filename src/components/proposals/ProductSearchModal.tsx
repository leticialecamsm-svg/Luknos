'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ImageOff, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Portal } from '@/components/ui/Portal'
import { SupplierLogo } from '@/components/pricing/SupplierLogo'
import { searchCatalog, type CatalogHit } from '@/lib/proposals/actions'
import { SOURCE_LABEL, sourceLabel, type ProposalItem } from '@/lib/proposals/calc'

// Busca no catálogo dos fornecedores e adiciona ao ambiente. Fica aberto para adicionar vários.
export function ProductSearchModal({ roomName, onAdd, onClose }: {
  roomName: string; onAdd: (item: Omit<ProposalItem, 'id'>) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [hits, setHits] = useState<CatalogHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [added, setAdded] = useState<Record<string, number>>({})
  const seq = useRef(0)

  useEffect(() => {
    const n = ++seq.current
    if (q.trim().length < 2 && !source) { setHits(null); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      const r = await searchCatalog(q, source || null)
      if (n !== seq.current) return
      setLoading(false)
      if ('error' in r) { setErr(r.error); setHits([]) } else { setErr(null); setHits(r.hits) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, source])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  function add(h: CatalogHit, finish?: CatalogHit['finishes'][number]) {
    onAdd({
      catalog_id: h.id, source: h.source, ref: h.ref,
      name: h.name + (h.variant && !h.name.includes(h.variant) ? ` ${h.variant}` : ''),
      image_url: finish?.url || h.image_url, qty: 1, unit_price: 0,
      note: finish ? `Acabamento ${finish.name}` : null,
    })
    setAdded(a => ({ ...a, [h.id]: (a[h.id] ?? 0) + 1 }))
  }

  const total = Object.values(added).reduce((s, n) => s + n, 0)

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/30 flex items-start sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
        <div className="bg-white w-full max-w-4xl h-full sm:h-[85vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-surface-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Adicionar produto</h2>
                <p className="text-xs text-gray-500">em {roomName}{total > 0 && ` · ${total} adicionado${total > 1 ? 's' : ''}`}</p>
              </div>
              <button onClick={onClose} className={cn(total ? 'btn-primary' : 'p-2 rounded-full hover:bg-gray-100 text-gray-500')}>
                {total ? 'Concluir' : <X className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input autoFocus className="input pl-9" placeholder="Nome, código ou linha (ex.: pendente cone, 1145, trilho)" value={q} onChange={e => setQ(e.target.value)} />
                {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />}
              </div>
              <select className="select sm:w-52" value={source} onChange={e => setSource(e.target.value)}>
                <option value="">Todos os fornecedores</option>
                {Object.entries(SOURCE_LABEL).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {err && <p className="text-sm text-red-600">{err}</p>}
            {hits === null && <p className="text-sm text-gray-400 text-center py-16">Digite para buscar nos catálogos dos fornecedores.</p>}
            {hits?.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-16">Nada encontrado. Tente outra palavra ou use “Item avulso”.</p>}
            {hits && hits.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {hits.map(h => {
                  const brand = sourceLabel(h.source)
                  return (
                    <div key={h.id} className={cn('rounded-xl border bg-white p-2.5 flex flex-col', added[h.id] ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-surface-border')}>
                      <button type="button" onClick={() => add(h)} className="relative aspect-square w-full rounded-lg bg-white flex items-center justify-center overflow-hidden hover:opacity-90">
                        {h.image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={h.image_url} alt="" loading="lazy" className="max-w-full max-h-full object-contain" />
                          : <ImageOff className="w-6 h-6 text-gray-300" />}
                        {added[h.id] && <span className="absolute top-1 right-1 bg-emerald-500 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 flex items-center gap-0.5"><Check className="w-3 h-3" />{added[h.id]}</span>}
                      </button>
                      <p className="mt-2 text-xs font-medium text-gray-900 leading-snug line-clamp-2">{h.name}{h.variant && !h.name.includes(h.variant) ? ` ${h.variant}` : ''}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">Ref. {h.ref}{h.dims && ` · ${h.dims}`}</p>
                      <div className="mt-auto pt-2 flex items-center gap-1.5">
                        {brand && <SupplierLogo name={brand} size={18} />}
                        <span className="text-[11px] text-gray-500 truncate flex-1">{brand ?? '—'}</span>
                        <button type="button" onClick={() => add(h)} className="text-xs font-medium text-brand-600 hover:text-brand-700 px-1.5">+ Adicionar</button>
                      </div>
                      {h.finishes.length > 1 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {h.finishes.slice(0, 8).map(f => (
                            <button key={f.code} type="button" title={`Adicionar no acabamento ${f.name}`} onClick={() => add(h, f)}
                              className="w-7 h-7 rounded border border-surface-border overflow-hidden bg-white hover:border-brand-500">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={f.url} alt={f.name} className="w-full h-full object-contain" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {hits && hits.length >= 80 && <p className="text-xs text-gray-400 text-center mt-4">Mostrando os 80 primeiros — refine a busca para achar mais.</p>}
          </div>
        </div>
      </div>
    </Portal>
  )
}
