'use client'

import { useEffect, useState, useTransition } from 'react'
import { updateSalePayment, getPaymentRates } from '@/lib/actions'
import { DEFAULT_PAYMENT_RATES, PaymentRate, PaymentSplit, calcWeightedMaxDiscount, formatPct, todayISO, round2 } from '@/lib/payment-rates'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PaymentMethodPicker } from './PaymentMethodPicker'

interface Props {
  quoteId: string
  currentFinalValue: number
  currentSplits: PaymentSplit[]
  currentClosedDate?: string | null
  onSaved: (finalValue: number, splits: PaymentSplit[]) => void
  onCancel: () => void
}

export function EditPaymentForm({ quoteId, currentFinalValue, currentSplits, currentClosedDate, onSaved, onCancel }: Props) {
  const [rates, setRates] = useState<PaymentRate[]>(DEFAULT_PAYMENT_RATES)
  const [finalValue, setFinalValue] = useState(String(currentFinalValue))
  const [closedDate, setClosedDate] = useState(currentClosedDate ? currentClosedDate.slice(0, 10) : todayISO())
  const [splits, setSplits] = useState<PaymentSplit[]>(
    currentSplits.length > 0
      ? currentSplits.map(s => ({ ...s, status: s.status ?? 'paid', date: s.date ?? todayISO() }))
      : [{ method_key: 'pix', amount: currentFinalValue, status: 'paid', date: todayISO() }]
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    getPaymentRates().then(r => { if (r.length) setRates(r as PaymentRate[]) })
  }, [])

  useEffect(() => {
    const val = round2(parseFloat(finalValue) || 0)
    if (splits.length === 1) setSplits([{ ...splits[0], amount: val }])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalValue])

  const fv = round2(parseFloat(finalValue) || 0)
  const totalSplits = round2(splits.reduce((s, p) => s + (p.amount || 0), 0))
  const splitsValid = splits.length === 1 || Math.abs(totalSplits - fv) < 0.01
  const maxDisc = calcWeightedMaxDiscount(splits.filter(s => s.amount > 0), rates)
  const minPrice = fv > 0 ? fv * (1 - maxDisc / 100) : null

  const addSplit = () => {
    const remaining = round2(Math.max(0, fv - totalSplits))
    setSplits(prev => [...prev, { method_key: 'pix', amount: remaining, status: 'paid', date: todayISO() }])
  }
  const removeSplit = (i: number) => setSplits(prev => {
    const next = prev.filter((_, idx) => idx !== i)
    // Se sobrar só um método, ele volta a valer o total — evita soma divergente do valor final
    if (next.length === 1) return [{ ...next[0], amount: fv }]
    return next
  })
  const updateSplit = (i: number, field: keyof PaymentSplit, value: string | number) =>
    setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  const handleSave = () => {
    if (!fv) { setError('Informe o valor final'); return }
    if (!splitsValid) { setError('A soma deve ser igual ao valor final'); return }
    setError(null)
    startTransition(async () => {
      try {
        await updateSalePayment(quoteId, { final_value: fv, payment_splits: splits, closed_date: closedDate })
        toast.success('TUDO CERTO!', 'Pagamento atualizado.')
        onSaved(fv, splits)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-4 mt-3">
      <h3 className="text-sm font-semibold text-blue-800">Editar pagamento</h3>

      <div>
        <label className="label">Data de fechamento *</label>
        <input
          type="date"
          value={closedDate}
          onChange={e => setClosedDate(e.target.value)}
          className="input mt-1"
        />
        <p className="text-xs text-gray-400 mt-1">Controla o mês em que a venda entra no faturamento e no ranking.</p>
      </div>

      <div>
        <label className="label">Valor final (R$) *</label>
        <input type="number" step="0.01" min="0" value={finalValue}
          onChange={e => setFinalValue(e.target.value)} className="input mt-1" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="label">Formas de pagamento</label>
          {splits.length < 4 && (
            <button type="button" onClick={addSplit}
              className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium">
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
          )}
        </div>

        {splits.map((split, i) => (
          <div key={i} className="rounded-lg border border-blue-100 bg-white p-2 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <PaymentMethodPicker
                  value={split.method_key}
                  onChange={v => updateSplit(i, 'method_key', v)}
                />
              </div>
              <input type="number" step="0.01" min="0"
                value={split.amount || ''}
                onChange={e => updateSplit(i, 'amount', round2(parseFloat(e.target.value) || 0))}
                className="input w-32 shrink-0"
                placeholder="R$ 0,00"
              />
              {splits.length > 1 && (
                <button type="button" onClick={() => removeSplit(i)} className="text-gray-400 hover:text-red-500 shrink-0 p-1.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={split.status ?? 'paid'}
                onChange={e => updateSplit(i, 'status', e.target.value)}
                className={cn('select text-sm flex-1', (split.status ?? 'paid') === 'open' ? 'text-amber-700' : 'text-green-700')}
              >
                <option value="paid">Pago</option>
                <option value="open">Em aberto</option>
              </select>
              <input type="date"
                value={split.date ?? todayISO()}
                onChange={e => updateSplit(i, 'date', e.target.value)}
                className="input text-sm flex-1"
              />
            </div>
          </div>
        ))}

        {splits.length > 1 && (
          <p className={cn('text-xs font-medium text-right', splitsValid ? 'text-green-700' : 'text-amber-600')}>
            {splitsValid ? '✓ Soma correta' : `Faltam R$ ${(fv - totalSplits).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          </p>
        )}
      </div>

      {fv > 0 && (
        <div className="bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-gray-600">
          Desconto máximo: <strong>{formatPct(maxDisc)}</strong>
          {minPrice !== null && <> · Preço mínimo: <strong>R$ {minPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></>}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button disabled={pending || !splitsValid} onClick={handleSave} className="btn-primary text-xs py-1.5">
          {pending && <Loader2 className="w-3 h-3 animate-spin" />} Salvar
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs py-1.5">Cancelar</button>
      </div>
    </div>
  )
}
