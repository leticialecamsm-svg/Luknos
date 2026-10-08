'use client'

import { useEffect, useRef, useState } from 'react'
import { formatCents, parseBRLToCents } from '@/lib/crm-money'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'

// Valor em negociação da conversa. Clique para editar; Enter/sair salva; Esc cancela;
// campo vazio remove o valor.
export function DealValue({
  cents, onSave, size = 'sm', className,
}: {
  cents: number | null
  onSave: (next: number | null) => Promise<string | null> // devolve mensagem de erro ou null
  size?: 'sm' | 'md'
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const skipBlur = useRef(false)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  function start(e: React.MouseEvent) {
    e.stopPropagation()
    setText(cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','))
    setError(null)
    setEditing(true)
  }

  async function commit() {
    if (saving) return
    const parsed = parseBRLToCents(text)
    if (parsed !== null && typeof parsed === 'object') { setError(parsed.error); return }
    if (parsed === cents) { setEditing(false); return }
    setSaving(true)
    const err = await onSave(parsed)
    setSaving(false)
    if (err) { setError(err); return }
    setEditing(false)
  }

  const text_ = size === 'md' ? 'text-sm' : 'text-xs'

  if (editing) {
    return (
      <div className={cn('flex flex-col', className)} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={text}
          disabled={saving}
          inputMode="decimal"
          aria-label="Valor da negociação em reais"
          placeholder="0,00"
          onChange={(e) => { setText(e.target.value); setError(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); skipBlur.current = true; commit() }
            if (e.key === 'Escape') { e.preventDefault(); skipBlur.current = true; setEditing(false) }
          }}
          onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return } commit() }}
          className={cn('w-28 border rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-gray-300', text_, error ? 'border-red-400' : 'border-gray-300')}
        />
        {error && <span role="alert" className="text-[11px] text-red-600 mt-0.5">{error}</span>}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Editar valor da negociação"
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100',
        text_, cents === null ? 'text-gray-400' : 'text-gray-800 font-semibold', className,
      )}
    >
      {cents === null ? <><Plus className="w-3 h-3" /> Valor</> : formatCents(cents)}
    </button>
  )
}
