'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brl } from '@/lib/pricing/engine'
import { compareProducts, type CompareRow } from '@/lib/pricing/actions'
import { supplierBrand } from '@/lib/pricing/supplier-brand'

const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem data')

export function CompararClient() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<CompareRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<'custo' | 'venda' | 'data'>('custo')

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setRows(null); setError(''); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      compareProducts(q).then(r => {
        if (cancelled) return
        if ('error' in r && r.error) { setError(r.error); setRows(null) } else { setError(''); setRows(r.rows ?? []) }
        setLoading(false)
      })
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  const sorted = useMemo(() => {
    if (!rows) return null
    const key = (r: CompareRow) => sort === 'custo' ? r.custo : sort === 'venda' ? r.venda : null
    return [...rows].sort((a, b) => {
      if (sort === 'data') return (b.date ?? '').localeCompare(a.date ?? '')
      return (key(a) ?? Infinity) - (key(b) ?? Infinity)
    })
  }, [rows, sort])

  const cheapest = useMemo(() => (rows ?? []).reduce<number | null>((m, r) => (r.custo != null && (m == null || r.custo < m) ? r.custo : m), null), [rows])
  const suppliers = new Set((rows ?? []).map(r => r.supplier_id)).size

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
            placeholder="Digite o produto e a especificação — ex.: fonte 36w, fita 24v, perfil embutir"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-surface-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Todas as palavras precisam aparecer na descrição. “Fonte”, “driver” e “drive” são tratados como a mesma coisa.
          Vale a última compra de cada produto em cada fornecedor; notas seguradas ficam de fora.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Buscando…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {sorted && !loading && (
        sorted.length === 0 ? (
          <div className="card p-10 text-center text-sm text-gray-500">Nenhum produto encontrado para “{query}”.</div>
        ) : (
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-surface-border">
              <span className="text-sm text-gray-600">{sorted.length} produto(s) em {suppliers} fornecedor(es)</span>
              <div className="flex bg-surface-secondary rounded-lg p-1 ml-auto">
                {([['custo', 'Menor custo'], ['venda', 'Menor venda'], ['data', 'Mais recente']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setSort(k)}
                    className={cn('px-3 py-1.5 text-xs font-medium rounded-md', sort === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}>{l}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-3 py-2.5">Fornecedor</th><th className="px-3 py-2.5">Produto</th><th className="px-3 py-2.5">NCM</th>
                    <th className="px-3 py-2.5">Última compra</th><th className="px-3 py-2.5 text-right">Custo un.</th><th className="px-3 py-2.5 text-right">Venda (crédito)</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const b = supplierBrand(r.supplier)
                    const best = cheapest != null && r.custo === cheapest
                    return (
                      <tr key={i} className={cn('border-t border-surface-border', best && 'bg-green-50/60')}>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2 font-semibold text-gray-800">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} />{r.supplier}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-800">{r.descricao}{r.compras > 1 && <span className="text-xs text-gray-400"> · comprado {r.compras}×</span>}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.ncm}</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(r.date)}{r.nota ? ` · nota ${r.nota}` : ''}</td>
                        <td className={cn('px-3 py-2.5 text-right tabular-nums', best && 'font-semibold text-green-700')}>{r.custo != null ? brl(r.custo) : '—'}{best && ' ★'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-green-700">{r.venda != null ? brl(r.venda) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
