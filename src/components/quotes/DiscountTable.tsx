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

  if (!quotedValue) {
    return (
      <div className="text-sm text-gray-400 italic py-2">
        Defina o valor orçado para visualizar os descontos.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
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
            const fairPrice = quotedValue * (1 - r.max_discount_pct / 100)
            const isZero = r.max_discount_pct === 0
            return (
              <tr key={r.method_key} className="border-b border-surface-border last:border-0">
                <td className="py-2 pr-4 text-gray-800 font-medium">{r.label}</td>
                <td className="py-2 pr-4 text-right text-gray-500">{formatPct(r.machine_fee_pct)}</td>
                <td className="py-2 pr-4 text-right text-gray-700">
                  R$ {fairPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
