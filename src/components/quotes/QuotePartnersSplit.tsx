'use client'

import { useEffect, useState } from 'react'
import { getQuotePartners, splitQuoteCommission, updateQuotePartnerRate, removeQuotePartner } from '@/lib/actions'
import { ContactSearch } from './EditQuoteForm'
import { Loader2, Split, Trash2, X } from 'lucide-react'

interface Partner {
  id: string
  contact_id: string
  rate: number
  contact: { name: string; commission_rate: number } | null
}

// Quando mais de uma pessoa merece comissão na mesma venda (ex: projetista +
// arquiteta que entrou depois), divide a taxa entre elas em vez do parceiro
// único de sempre. Some registro é gravado em quote_partners; a comissão real
// só é criada quando a venda fecha (closeSale já sabe olhar pra essa tabela).
export function QuotePartnersSplit({
  quoteId, architectId, architectName, defaultRate,
}: {
  quoteId: string
  architectId: string | null
  architectName: string | null
  defaultRate: number
}) {
  const [partners, setPartners] = useState<Partner[] | null>(null)
  const [splitting, setSplitting] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    const data = await getQuotePartners(quoteId)
    setPartners(data as any)
  }
  useEffect(() => { load() }, [quoteId])

  async function startSplit(newContact: any) {
    if (!architectId || !newContact) return
    setSaving(true)
    const half = defaultRate > 0 ? defaultRate / 2 : 5
    await splitQuoteCommission(quoteId, [
      { contactId: architectId, rate: half },
      { contactId: newContact.id, rate: half },
    ])
    await load()
    setSaving(false)
    setSplitting(false)
  }

  async function changeRate(id: string, rate: number) {
    setPartners(prev => prev?.map(p => p.id === id ? { ...p, rate } : p) ?? null)
  }

  async function commitRate(id: string, rate: number) {
    await updateQuotePartnerRate(id, rate)
  }

  async function remove(id: string) {
    setSaving(true)
    await removeQuotePartner(id, quoteId)
    await load()
    setSaving(false)
  }

  if (!architectName) return null // sem parceiro principal, não faz sentido dividir

  if (partners === null) {
    return <p className="text-xs text-gray-400 mt-1">Carregando comissão...</p>
  }

  // Divisão ativa — mostra cada parceiro com taxa editável
  if (partners.length > 0) {
    const total = partners.reduce((s, p) => s + Number(p.rate ?? 0), 0)
    return (
      <div className="mt-2 bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Comissão dividida entre parceiros</p>
        {partners.map(p => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="text-sm text-gray-700 flex-1 truncate">{p.contact?.name ?? '—'}</span>
            <div className="flex items-center gap-1">
              <input
                type="number" step="0.1" min="0" max="100"
                value={p.rate}
                onChange={e => changeRate(p.id, Number(e.target.value))}
                onBlur={e => commitRate(p.id, Number(e.target.value))}
                className="w-16 text-sm text-right border border-gray-200 rounded-md px-1.5 py-0.5"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
            <button onClick={() => remove(p.id)} disabled={saving} className="text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <p className={`text-[11px] ${total === 100 ? 'text-gray-400' : 'text-amber-600'}`}>
          Total: {total}% {total !== 100 && '(não precisa somar 100%, ajuste como fizer sentido pra essa venda)'}
        </p>
      </div>
    )
  }

  // Sem divisão — mostra parceiro único de sempre + opção de dividir
  return (
    <div className="mt-1">
      {!splitting ? (
        <button
          onClick={() => setSplitting(true)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-violet-600 transition-colors"
        >
          <Split className="w-3 h-3" /> Dividir comissão com outro parceiro
        </button>
      ) : (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mt-1 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Dividir comissão</p>
            <button onClick={() => setSplitting(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
          </div>
          <p className="text-xs text-gray-500">{architectName} vai dividir a taxa de {defaultRate}% com quem você escolher (dá pra ajustar depois).</p>
          {saving ? (
            <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</div>
          ) : (
            <ContactSearch
              label="Segundo parceiro"
              placeholder="Buscar arquiteto, engenheiro..."
              type="architect"
              excludeType="client"
              onSelect={startSplit}
            />
          )}
        </div>
      )}
    </div>
  )
}
