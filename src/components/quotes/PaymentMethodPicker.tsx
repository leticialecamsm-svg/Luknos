'use client'

import {
  PRIMARY_METHODS, PRIMARY_METHOD_LABEL, CREDIT_INSTALLMENTS,
  methodKeyToPrimary, primaryToDefaultKey, PrimaryMethod,
} from '@/lib/payment-rates'

interface Props {
  value: string        // method_key: 'pix' | 'cash' | 'debit' | 'credit_3x' ...
  onChange: (key: string) => void
}

export function PaymentMethodPicker({ value, onChange }: Props) {
  const primary = methodKeyToPrimary(value)
  const isCredit = primary === 'credit'

  const handlePrimaryChange = (p: PrimaryMethod) => {
    onChange(primaryToDefaultKey(p))
  }

  return (
    <div className="flex gap-2">
      {/* Primary selector */}
      <select
        value={primary}
        onChange={e => handlePrimaryChange(e.target.value as PrimaryMethod)}
        className="select flex-1"
      >
        {PRIMARY_METHODS.map(m => (
          <option key={m} value={m}>{PRIMARY_METHOD_LABEL[m]}</option>
        ))}
      </select>

      {/* Installments selector — only when credit */}
      {isCredit && (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="select w-36"
        >
          {CREDIT_INSTALLMENTS.map(inst => (
            <option key={inst.value} value={inst.value}>{inst.label}</option>
          ))}
        </select>
      )}
    </div>
  )
}
