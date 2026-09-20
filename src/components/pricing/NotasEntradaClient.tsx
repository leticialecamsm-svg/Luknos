'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Link2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { brl } from '@/lib/pricing/engine'
import { listPendingNfe, linkNfeInvoices, getPricingBootstrap, type PendingNfe, type PricingSupplier } from '@/lib/pricing/actions'
import { normText } from '@/lib/pricing/synonyms'

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem data')

// Sugere o fornecedor da planilha pelo nome que veio na nota ("Blumenau - Matriz" → BLUMENAU)
function guess(name: string | null, suppliers: PricingSupplier[]) {
  const n = normText(name ?? '')
  return suppliers.find(s => n.includes(normText(s.name)))?.id ?? ''
}

export function NotasEntradaClient() {
  const toast = useToast()
  const [notes, setNotes] = useState<PendingNfe[] | null>(null)
  const [suppliers, setSuppliers] = useState<PricingSupplier[]>([])
  const [choice, setChoice] = useState<Record<string, { supplier: string; newName: string; uf: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    const [n, b] = await Promise.all([listPendingNfe(), getPricingBootstrap()])
    if ('error' in n && n.error) { toast.error(n.error); setNotes([]); return }
    const sup = 'suppliers' in b ? (b.suppliers as PricingSupplier[]) : []
    setSuppliers(sup)
    setNotes(n.notes ?? [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // uma linha por fornecedor da nota (CNPJ), com todas as notas dele
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; name: string; notes: PendingNfe[] }>()
    for (const n of notes ?? []) {
      const key = n.fornecedor_cnpj ?? n.fornecedor_nome ?? '?'
      const g = m.get(key) ?? { key, name: n.fornecedor_nome ?? 'Sem nome', notes: [] }
      g.notes.push(n); m.set(key, g)
    }
    return Array.from(m.values())
  }, [notes])

  const get = (g: { key: string; name: string }) => {
    const c = choice[g.key]
    if (c) return c
    const sid = guess(g.name, suppliers)
    return { supplier: sid, newName: '', uf: suppliers.find(s => s.id === sid)?.default_uf ?? '' }
  }
  const set = (key: string, patch: Partial<{ supplier: string; newName: string; uf: string }>, g: { key: string; name: string }) =>
    setChoice(prev => ({ ...prev, [key]: { ...get(g), ...patch } }))

  const link = async (g: { key: string; name: string; notes: PendingNfe[] }) => {
    const c = get(g)
    setBusy(g.key)
    const res = await linkNfeInvoices({
      invoiceIds: g.notes.map(n => n.id), supplierId: c.supplier && c.supplier !== 'new' ? c.supplier : undefined,
      newSupplierName: c.supplier === 'new' ? c.newName : undefined, uf: c.uf || null,
    })
    setBusy(null)
    if ('error' in res && res.error) { toast.error(res.error); return }
    toast.success('Notas vinculadas', `${res.linked} nota(s)${res.held ? ` · ${res.held} segurada(s) por falta de imposto` : ''}.`)
    load()
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Notas de Entrada novas</h2>
      <p className="text-sm text-gray-500 mb-4 max-w-3xl">
        Notas que chegaram por Notas de Entrada e ainda não estão em nenhum fornecedor. Escolha o fornecedor (o sistema sugere pelo nome) e o estado de origem:
        os itens entram na aba dele e passam a valer como referência de imposto e preço. Nota com item sem imposto fica segurada até ser completada.
      </p>
      {notes === null ? (
        <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
      ) : groups.length === 0 ? (
        <div className="card p-6 text-sm text-gray-500 text-center">Nenhuma nota nova para vincular.</div>
      ) : (
        <div className="card divide-y divide-surface-border">
          {groups.map(g => {
            const c = get(g)
            return (
              <div key={g.key} className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1">
                  <p className="font-medium text-gray-900">{g.name}</p>
                  <p className="text-xs text-gray-500">
                    {g.notes.map(n => `nota ${n.numero_nota} (${fmtDate(n.data_emissao)}, ${n.itens} itens, ${brl(n.total)}${n.sem_imposto ? `, ${n.sem_imposto} sem imposto` : ''})`).join(' · ')}
                  </p>
                </div>
                <select value={c.supplier} onChange={e => set(g.key, { supplier: e.target.value, uf: suppliers.find(s => s.id === e.target.value)?.default_uf ?? c.uf }, g)}
                  className="px-3 py-2 bg-white border border-surface-border rounded-lg text-sm">
                  <option value="">Fornecedor…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="new">+ Novo fornecedor</option>
                </select>
                {c.supplier === 'new' && (
                  <input value={c.newName} onChange={e => set(g.key, { newName: e.target.value }, g)} placeholder="Nome do fornecedor"
                    className="px-3 py-2 bg-white border border-surface-border rounded-lg text-sm w-48" />
                )}
                <select value={c.uf} onChange={e => set(g.key, { uf: e.target.value }, g)} className="px-3 py-2 bg-white border border-surface-border rounded-lg text-sm">
                  <option value="">UF origem…</option>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <button onClick={() => link(g)} disabled={busy === g.key || !c.uf || !c.supplier || (c.supplier === 'new' && !c.newName.trim())}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50">
                  {busy === g.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Vincular
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
