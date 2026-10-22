'use client'

import { useEffect, useState } from 'react'
import { getPaymentRates } from '@/lib/actions'
import { DEFAULT_PAYMENT_RATES, PaymentRate, formatPct } from '@/lib/payment-rates'
import { cn } from '@/lib/utils'

interface Props {
  quotedValue: number | null
}

export function DiscountTable({ quotedValue }: Props) {
  const [rates, setRates] = useState<PaymentRate[]>(DEFAULT_PAYMENT_RATES)

  useEffect(() => {
    getPaymentRates().then(r => { if (r.length) setRates(r as PaymentRate[]) })
  }, [])

  return (
    <div className="overflow-x-auto">
      {!quotedValue && (
        <p className="text-xs text-gray-400 italic mb-2">Defina o valor orçado para ver os preços calculados.</p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border">
            <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-500">Forma</th>
            <th className="py-2 pr-4 text-right text-xs font-semibold text-gray-500">Taxa maq.</th>
            <th className="py-2 pr-4 text-right text-xs font-semibold text-gray-500">Preço justo</th>
            <th className="py-2 text-right text-xs font-semibold text-gray-500">Desc. máx.</th>
          </tr>
        </thead>
        <tbody>
          {rates.map(r => {
            const fairPrice = quotedValue ? quotedValue * (1 - r.max_discount_pct / 100) : null
            const isZero = r.max_discount_pct === 0
            return (
              <tr key={r.method_key} className="border-b border-surface-border last:border-0">
                <td className="py-2 pr-4 text-gray-800 font-medium">{r.label}</td>
                <td className="py-2 pr-4 text-right text-gray-500">{formatPct(r.machine_fee_pct)}</td>
                <td className="py-2 pr-4 text-right text-gray-700">
                  {fairPrice != null
                    ? `R$ ${fairPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className={cn('py-2 text-right font-semibold', isZero ? 'text-amber-600' : 'text-gray-900')}>
                  {isZero ? '0% ⚠️' : formatPct(r.max_discount_pct)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
