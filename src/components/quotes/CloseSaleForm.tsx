'use client'

import { useEffect, useState, useTransition } from 'react'
import { closeSale, getPaymentRates } from '@/lib/actions'
import { DEFAULT_PAYMENT_RATES, PaymentRate, PaymentSplit, calcWeightedMaxDiscount, formatPct } from '@/lib/payment-rates'
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  quoteId: string
  quotedValue: number | null
  onConfirm: () => void
  onCancel: () => void
}

export function CloseSaleForm({ quoteId, quotedValue, onConfirm, onCancel }: Props) {
  const [rates, setRates] = useState<PaymentRate[]>(DEFAULT_PAYMENT_RATES)
  const [finalValue, setFinalValue] = useState(quotedValue ? String(quotedValue) : '')
  const [splits, setSplits] = useState<PaymentSplit[]>([{ method_key: 'pix', amount: 0 }])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPaymentRates().then(r => { if (r.length) setRates(r as PaymentRate[]) })
  }, [])

  // Keep first split amount in sync with finalValue when only 1 split
  useEffect(() => {
    const val = parseFloat(finalValue) || 0
    if (splits.length === 1) {
      setSplits([{ ...splits[0], amount: val }])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalValue])

  const totalSplits = splits.reduce((s, p) => s + (p.amount || 0), 0)
  const fv = parseFloat(finalValue) || 0
  const splitsValid = splits.length === 1 || Math.abs(totalSplits - fv) < 0.01
  const maxDisc = calcWeightedMaxDiscount(splits.filter(s => s.amount > 0), rates)
  const minPrice = fv > 0 ? fv * (1 - maxDisc / 100) : null
  const actualDiscount = quotedValue && fv > 0 ? ((quotedValue - fv) / quotedValue) * 100 : null
  const overDiscount = actualDiscount !== null && actualDiscount > maxDisc + 0.001

  const addSplit = () => {
    const remaining = Math.max(0, fv - totalSplits)
    setSplits(prev => [...prev, { method_key: 'pix', amount: remaining }])
  }

  const removeSplit = (i: number) => setSplits(prev => prev.filter((_, idx) => idx !== i))

  const updateSplit = (i: number, field: 'method_key' | 'amount', value: string | number) => {
    setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  const handleConfirm = () => {
    if (!finalValue || fv <= 0) { setError('Informe o valor final'); return }
    if (!splitsValid) { setError('A soma das formas de pagamento deve ser igual ao valor final'); return }
    setError(null)
    const primaryMethod = splits[0]?.method_key ?? 'pix'
    startTransition(async () => {
      const result = await closeSale(quoteId, {
        final_value: fv,
        payment_method: primaryMethod,
        payment_splits: splits,
      })
      if (result?.error) { setError(result.error); return }
      onConfirm()
    })
  }

  return (
    <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-semibold text-green-800">Fechar venda</h3>

      {/* Valor final */}
      <div>
        <label className="label">Valor final (R$) *</label>
        <input
          type="number" step="0.01" min="0"
          value={finalValue}
          onChange={e => setFinalValue(e.target.value)}
          className="input mt-1"
          placeholder="0,00"
        />
        {quotedValue && fv > 0 && (
          <p className={cn('text-xs mt-1', overDiscount ? 'text-red-600 font-semibold' : 'text-gray-400')}>
            {actualDiscount !== null && actualDiscount > 0
              ? `${formatPct(actualDiscount)} de desconto sobre o orçado`
              : actualDiscount !== null && actualDiscount < 0
              ? `${formatPct(Math.abs(actualDiscount))} acima do orçado`
              : 'Sem desconto'}
            {overDiscount && ' · ⚠️ acima do máximo permitido'}
          </p>
        )}
      </div>

      {/* Formas de pagamento */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="label">Forma de pagamento</label>
          {splits.length < 4 && (
            <button type="button" onClick={addSplit}
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
              <Plus className="w-3.5 h-3.5" /> Adicionar método
            </button>
          )}
        </div>

        {splits.map((split, i) => {
          const rate = rates.find(r => r.method_key === split.method_key)
          return (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-[1fr_120px] gap-2">
                <select
                  value={split.method_key}
                  onChange={e => updateSplit(i, 'method_key', e.target.value)}
                  className="select"
                >
                  {rates.map(r => (
                    <option key={r.method_key} value={r.method_key}>{r.label}</option>
                  ))}
                </select>
                <input
                  type="number" step="0.01" min="0"
                  value={split.amount || ''}
                  onChange={e => updateSplit(i, 'amount', parseFloat(e.target.value) || 0)}
                  className={cn('input', splits.length === 1 && 'bg-gray-50 text-gray-500')}
                  placeholder="R$ 0,00"
                  readOnly={splits.length === 1}
                />
              </div>
              {splits.length > 1 && (
                <button type="button" onClick={() => removeSplit(i)}
                  className="mt-1 p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )
        })}

        {splits.length > 1 && (
          <div className={cn('text-xs font-medium flex items-center justify-end gap-1',
            splitsValid ? 'text-green-700' : 'text-amber-600')}>
            {splitsValid ? '✓ Soma correta' : `Soma: R$ ${totalSplits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · faltam R$ ${(fv - totalSplits).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          </div>
        )}
      </div>

      {/* Desconto máximo permitido */}
      {fv > 0 && splits.some(s => s.amount > 0) && (
        <div className={cn('rounded-lg px-3 py-2.5 flex items-start gap-2',
          overDiscount ? 'bg-red-50 border border-red-200' : 'bg-white border border-green-200')}>
          {overDiscount && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
          <div className="text-xs space-y-0.5">
            {quotedValue && (
              <p className="text-gray-500">
                Preço sugerido: <strong>R$ {quotedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
              </p>
            )}
            <p className={overDiscount ? 'text-red-700 font-semibold' : 'text-gray-700'}>
              Desconto máximo permitido: <strong>{formatPct(maxDisc)}</strong>
            </p>
            {minPrice !== null && (
              <p className="text-gray-500">
                Preço mínimo aceitável: <strong>R$ {minPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
              </p>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          disabled={pending || !finalValue || !splitsValid}
          onClick={handleConfirm}
          className="btn-primary text-xs py-1.5"
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin" />}
          Confirmar
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs py-1.5">Cancelar</button>
      </div>
    </div>
  )
}
