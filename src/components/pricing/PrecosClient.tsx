'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brl, pct } from '@/lib/pricing/engine'
import {
  getSupplierSheet, getSupplierQuotes,
  type SupplierOverview, type SheetInvoice, type SavedQuote,
} from '@/lib/pricing/actions'

const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem data')
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function PrecosClient({ suppliers }: { suppliers: SupplierOverview[] }) {
  // abre no fornecedor com compra mais recente
  const initial = useMemo(() => [...suppliers].sort((a, b) => (b.last_date ?? '').localeCompare(a.last_date ?? ''))[0]?.id ?? '', [suppliers])
  const [supplierId, setSupplierId] = useState(initial)
  const [view, setView] = useState<'produtos' | 'cotacoes'>('produtos')
  const [invoices, setInvoices] = useState<SheetInvoice[] | null>(null)
  const [quotes, setQuotes] = useState<SavedQuote[] | null>(null)
  const [search, setSearch] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const supplier = suppliers.find(s => s.id === supplierId)

  useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    setInvoices(null); setQuotes(null); setSearch(''); setClosed(new Set())
    getSupplierSheet(supplierId).then(r => { if (!cancelled && !('error' in r)) setInvoices(r.invoices) })
    getSupplierQuotes(supplierId, 100).then(r => { if (!cancelled && !('error' in r)) setQuotes(r.quotes) })
    return () => { cancelled = true }
  }, [supplierId])

  const filtered = useMemo(() => {
    if (!invoices) return null
    const q = norm(search.trim())
    if (!q) return invoices
    return invoices
      .map(inv => ({ ...inv, items: inv.items.filter(i => norm(i.descricao).includes(q) || (i.ncm ?? '').includes(q) || (inv.numero_nota ?? '').includes(q)) }))
      .filter(inv => inv.items.length > 0)
  }, [invoices, search])

  const toggle = (id: string) => setClosed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (suppliers.length === 0) {
    return <div className="card p-10 text-center text-sm text-gray-500">Nenhum fornecedor ainda. Use <b>Importar planilha</b> para trazer as notas.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {suppliers.map(s => (
          <button key={s.id} onClick={() => setSupplierId(s.id)}
            className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              s.id === supplierId ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-surface-border hover:border-gray-400')}>
            {s.name}
          </button>
        ))}
      </div>

      {supplier && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-surface-secondary rounded-lg p-1">
            {(['produtos', 'cotacoes'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-all', view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                {v === 'produtos' ? `Notas e produtos (${supplier.itens})` : `Cotações${quotes ? ` (${quotes.length})` : ''}`}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">
            {supplier.notas} nota(s){supplier.default_uf ? ` · origem ${supplier.default_uf}` : ''}{supplier.last_date ? ` · última compra ${fmtDate(supplier.last_date)}` : ''}
          </span>
          {view === 'produtos' && (
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto, NCM ou nº da nota…"
                className="w-full pl-9 pr-3 py-2 bg-white border border-surface-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            </div>
          )}
        </div>
      )}

      {view === 'produtos' && (
        <div className="card overflow-hidden">
          {filtered === null ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">{search ? 'Nada encontrado com essa busca.' : 'Sem notas para este fornecedor.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-3 py-2.5 text-right">Qtd</th><th className="px-3 py-2.5">Produto</th><th className="px-3 py-2.5">NCM</th>
                    <th className="px-3 py-2.5 text-right">Valor total</th><th className="px-3 py-2.5">ICMS</th><th className="px-3 py-2.5 text-right">IPI</th>
                    <th className="px-3 py-2.5 text-right">% ICMS</th><th className="px-3 py-2.5 text-right">% FECOEP</th>
                    <th className="px-3 py-2.5 text-right">Custo un.</th><th className="px-3 py-2.5 text-right">Venda (crédito)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => {
                    const open = !closed.has(inv.id)
                    const total = inv.items.reduce((s, i) => s + i.valor_total, 0)
                    return (
                      <FragmentRows key={inv.id}>
                        <tr onClick={() => toggle(inv.id)} className="bg-brand-50/50 border-t border-surface-border cursor-pointer select-none">
                          <td colSpan={10} className="px-3 py-2">
                            <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              {fmtDate(inv.data_emissao)}
                              <span className="font-normal text-gray-500">· Nota {inv.numero_nota ?? '—'}{inv.uf_origem ? ` (${inv.uf_origem})` : ''}</span>
                              <span className="font-normal text-gray-400">· {inv.items.length} {inv.items.length === 1 ? 'item' : 'itens'} · {brl(total)}</span>
                            </span>
                          </td>
                        </tr>
                        {open && inv.items.map(i => (
                          <tr key={i.id} className="border-t border-surface-border hover:bg-surface-secondary/50">
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{i.quantidade}</td>
                            <td className="px-3 py-2 text-gray-800 min-w-[280px]">{i.descricao}</td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-500">{i.ncm}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{brl(i.valor_total)}</td>
                            <td className="px-3 py-2"><span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded', i.tipo_icms?.toUpperCase() === 'ANT' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>{i.tipo_icms ?? '—'}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(i.ipi_percent, 2)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(i.valor_icms / i.valor_total, 2)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(i.valor_fecoep / i.valor_total, 2)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{brl(i.custo_unitario)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{brl(i.preco_credito)}</td>
                          </tr>
                        ))}
                      </FragmentRows>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'cotacoes' && (
        <div className="card overflow-hidden">
          {quotes === null ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
          ) : quotes.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">Nenhuma cotação registrada para {supplier?.name}. Faça uma na aba Cotar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-secondary text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Nº</th><th className="px-4 py-2.5">Data</th><th className="px-4 py-2.5">Produto</th><th className="px-4 py-2.5">NCM</th>
                  <th className="px-4 py-2.5 text-right">Compra</th><th className="px-4 py-2.5 text-right">Custo</th><th className="px-4 py-2.5 text-right">Venda</th><th className="px-4 py-2.5 text-right">À vista</th>
                </tr></thead>
                <tbody>
                  {quotes.map(q => (
                    <tr key={q.id} className="border-t border-surface-border">
                      <td className="px-4 py-2.5 text-gray-500">#{q.number}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{new Date(q.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-2.5 text-gray-800">{q.product_ref || q.product_type || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{q.ncm}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{brl(q.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{brl(q.cost_unit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{brl(q.price_credit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{brl(q.price_cash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// <tbody> aceita vários <tr>; um Fragment agrupa o cabeçalho da nota com seus itens.
function FragmentRows({ children }: { children: React.ReactNode }) { return <>{children}</> }
