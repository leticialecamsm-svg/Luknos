'use client'

import { useState } from 'react'
import { applyFormat, type FormatKind } from '@/lib/wa-format'
import { EmojiPicker } from './EmojiPicker'
import { cn } from '@/lib/utils'
import { Bold, Italic, Strikethrough, Code, Terminal, List, ListOrdered, Quote, Smile } from 'lucide-react'

const BUTTONS: { kind: FormatKind; icon: any; label: string; hint: string }[] = [
  { kind: 'bold', icon: Bold, label: 'Negrito', hint: '*texto*' },
  { kind: 'italic', icon: Italic, label: 'Itálico', hint: '_texto_' },
  { kind: 'strike', icon: Strikethrough, label: 'Riscado', hint: '~texto~' },
  { kind: 'code', icon: Code, label: 'Código', hint: '`texto`' },
  { kind: 'mono', icon: Terminal, label: 'Monoespaçado', hint: '```texto```' },
  { kind: 'bullet', icon: List, label: 'Lista com marcadores', hint: '- item' },
  { kind: 'numbered', icon: ListOrdered, label: 'Lista numerada', hint: '1. item' },
  { kind: 'quote', icon: Quote, label: 'Citação', hint: '> texto' },
]

// Barra de formatação do WhatsApp + emojis, para o campo de mensagem.
export function FormatToolbar({
  textareaRef, value, setValue, disabled,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  value: string
  setValue: (v: string) => void
  disabled?: boolean
}) {
  const [emoji, setEmoji] = useState(false)

  function commit(edit: { value: string; start: number; end: number }) {
    setValue(edit.value)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(edit.start, edit.end)
    })
  }

  function format(kind: FormatKind) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    commit(applyFormat(value, start, end, kind))
  }

  function insertEmoji(e: string) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    commit({ value: value.slice(0, start) + e + value.slice(end), start: start + e.length, end: start + e.length })
  }

  return (
    <div className="relative flex items-center gap-0.5 px-1" role="toolbar" aria-label="Formatação da mensagem">
      {BUTTONS.map(({ kind, icon: Icon, label, hint }) => (
        <button
          key={kind}
          type="button"
          disabled={disabled}
          title={`${label} (${hint})`}
          aria-label={label}
          // mouseDown não tira o foco/seleção do campo de texto
          onMouseDown={(e) => { e.preventDefault(); format(kind) }}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40"
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
      <span className="w-px h-5 bg-gray-200 mx-1" />
      <button
        type="button"
        disabled={disabled}
        title="Emojis"
        aria-label="Emojis"
        aria-expanded={emoji}
        onMouseDown={(e) => { e.preventDefault(); setEmoji((v) => !v) }}
        className={cn('p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40', emoji ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900')}
      >
        <Smile className="w-4 h-4" />
      </button>
      {emoji && <EmojiPicker onPick={insertEmoji} onClose={() => setEmoji(false)} />}
    </div>
  )
}
