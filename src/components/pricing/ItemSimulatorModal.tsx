'use client'

import { useMemo, useState } from 'react'
import { X, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brl, computeQuote } from '@/lib/pricing/engine'
import { updateSheetItem, type SheetItem } from '@/lib/pricing/actions'

// aceita vírgula ou ponto; vazio vale 0
const parse = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const fmt = (n: number, d = 2) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, useGrouping: false })

type Form = Record<'qtd' | 'total' | 'ipi' | 'icms' | 'fecoep' | 'maq' | 'imp' | 'com' | 'luc', string> & { tipo: string }

const toForm = (i: SheetItem): Form => ({
  qtd: fmt(i.quantidade, 4), total: fmt(i.valor_total), tipo: i.tipo_icms ?? '',
  ipi: fmt(i.ipi_percent * 100, 4), icms: fmt(i.valor_icms), fecoep: fmt(i.valor_fecoep),
  maq: fmt(i.maquininha * 100, 4), imp: fmt((i.imposto_ant_percent ?? 0) * 100, 4), com: fmt(i.comissao * 100, 4), luc: fmt(i.lucro * 100, 4),
})

export function ItemSimulatorModal({ item, onClose, onSaved }: { item: SheetItem; onClose: () => void; onSaved: (i: SheetItem) => void }) {
  const [f, setF] = useState<Form>(() => toForm(item))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }))

  const v = useMemo(() => ({
    qtd: parse(f.qtd), total: parse(f.total), ipi: parse(f.ipi) / 100, icms: parse(f.icms), fecoep: parse(f.fecoep),
    maq: parse(f.maq) / 100, imp: parse(f.imp) / 100, com: parse(f.com) / 100, luc: parse(f.luc) / 100,
  }), [f])

  const res = useMemo(() => {
    if (v.qtd <= 0 || v.total <= 0) return null
    const m = (key: string, value: number) => ({ key, label: key, kind: 'price_percent' as const, value })
    return computeQuote({
      unitPrice: v.total / v.qtd, quantity: v.qtd, ipiPct: v.ipi, icmsPct: v.icms / v.total, fecoepPct: v.fecoep / v.total,
      tipoIcms: f.tipo, metrics: [m('m', v.maq), m('i', v.imp), m('c', v.com), m('l', v.luc)],
    })
  }, [v, f.tipo])

  const dirty = JSON.stringify(f) !== JSON.stringify(toForm(item))

  async function save() {
    if (!res || res.priceCredit == null) return
    setSaving(true); setErr('')
    const payload = {
      quantidade: v.qtd, valor_total: v.total, tipo_icms: f.tipo || null, ipi_percent: v.ipi, valor_icms: v.icms, valor_fecoep: v.fecoep,
      imposto_ant_percent: v.imp, maquininha: v.maq, comissao: v.com, lucro: v.luc,
      custo_unitario: Math.round(res.costUnit * 100) / 100, preco_credito: Math.round(res.priceCredit * 100) / 100,
    }
    const r = await updateSheetItem(item.id, payload)
    setSaving(false)
    if ('error' in r) { setErr(r.error ?? 'Erro ao salvar'); return }
    onSaved({ ...item, ...payload })
  }

  const field = (k: keyof Form, label: string, suffix?: string) => (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      <div className="relative mt-0.5">
        <input value={f[k]} onChange={set(k)} inputMode="decimal"
          className="w-full px-2.5 py-1.5 pr-7 bg-white border border-surface-border rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        {suffix && <span className="absolute right-2.5 top-1.5 text-xs text-gray-400">{suffix}</span>}
      </div>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-surface-border">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Simular preço · NCM {item.ncm}</p>
            <h2 className="text-sm font-semibold text-gray-900 mt-0.5">{item.descricao}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-secondary text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {field('qtd', 'Qtd')}
            {field('total', 'Valor total', 'R$')}
            <label className="block">
              <span className="text-[11px] font-medium text-gray-500">Tipo ICMS</span>
              <select value={f.tipo} onChange={e => setF(p => ({ ...p, tipo: e.target.value }))}
                className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-surface-border rounded-lg text-sm">
                <option value="">—</option><option value="ANT">ANT</option><option value="ST">ST</option>
              </select>
            </label>
            {field('ipi', 'IPI', '%')}
            {field('icms', 'Valor ICMS', 'R$')}
            {field('fecoep', 'Valor FECOEP', 'R$')}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Margens (% do preço de venda)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {field('maq', 'Maquininha', '%')}
              {field('imp', `Imposto ${f.tipo || 'ANT/ST'}`, '%')}
              {field('com', 'Comissão', '%')}
              {field('luc', 'Lucro', '%')}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([['Custo un.', item.custo_unitario, res?.costUnit], ['Venda (crédito)', item.preco_credito, res?.priceCredit]] as const).map(([l, orig, now]) => (
              <div key={l} className="rounded-xl bg-surface-secondary px-4 py-3">
                <p className="text-[11px] text-gray-500">{l}</p>
                <p className={cn('text-lg font-semibold tabular-nums', l !== 'Custo un.' && 'text-emerald-700')}>{brl(now ?? null)}</p>
                <p className="text-[11px] text-gray-400">salvo: {brl(orig)}</p>
              </div>
            ))}
          </div>
          {res?.error && <p className="text-xs text-red-600">{res.error}</p>}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-surface-border">
          <button onClick={() => setF(toForm(item))} disabled={!dirty} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">
            <RotateCcw className="w-3.5 h-3.5" /> Restaurar valores
          </button>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-surface-border text-gray-600 hover:bg-surface-secondary">Descartar</button>
            <button onClick={save} disabled={!dirty || saving || !res || res.priceCredit == null}
              className="px-4 py-2 text-sm rounded-lg bg-navy text-white font-medium disabled:opacity-40 flex items-center gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
