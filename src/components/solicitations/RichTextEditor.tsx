'use client'

// Editor de texto rico mínimo pra descrição do Projeto (pedido Letícia,
// rodada 2): contentEditable + toolbar custom, sem Tiptap/Slate/Quill
// (guardrail explícito contra dependências pesadas). Suporta negrito, lista
// com marcadores, lista de checkbox (clicável, risca o texto ao marcar) e
// grifo em 3-4 cores pastel. Persistido como HTML em design_projects.description
// (coluna já existente, reaproveitada — ver updateDesignProjectDescriptionForSolicitation).
// Sanitização do HTML na leitura fica em RichTextView (via isomorphic-dompurify).

import { useEffect, useRef, useState } from 'react'
import { Bold, List, ListChecks, Highlighter } from 'lucide-react'
import { cn } from '@/lib/utils'
import DOMPurify from 'isomorphic-dompurify'

const HIGHLIGHT_SWATCHES: { name: string; bg: string }[] = [
  { name: 'amarelo', bg: '#fef3b0' },
  { name: 'verde', bg: '#c8f0cf' },
  { name: 'rosa', bg: '#fbd5e6' },
  { name: 'azul', bg: '#cfe6fb' },
]

export const RICH_TEXT_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ['p', 'div', 'br', 'b', 'strong', 'ul', 'li', 'span', 'input'],
  ALLOWED_ATTR: ['style', 'class', 'type', 'checked', 'data-check-row'],
}

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html ?? '', RICH_TEXT_SANITIZE_OPTIONS)
}

// Alterna o estado "marcado" (risca o texto) de um item de checklist a
// partir do clique/change no <input type="checkbox"> inserido pelo editor —
// compartilhado entre RichTextView (leitura) e RichTextEditor (edição), já
// que nenhum dos dois pode depender de atributo inline `onclick` (removido
// pelo sanitizador por segurança).
function handleCheckToggle(e: React.SyntheticEvent) {
  const target = e.target as HTMLElement
  if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
    const row = target.closest('[data-check-row]')
    row?.classList.toggle('rt-checked', (target as HTMLInputElement).checked)
  }
}

// Visualização somente-leitura (fora de edição) — mesmo sanitizador. O
// checkbox continua clicável (muda o visual na hora), mas não persiste
// sozinho — quem quiser salvar a mudança reabre o editor.
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn('rich-text-view text-sm text-gray-700', className)}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
      onClick={handleCheckToggle}
    />
  )
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [swatchesOpen, setSwatchesOpen] = useState(false)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = sanitizeRichText(value || '')
    }
    // só na montagem / troca externa de value (ex: trocar de projeto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  function toggleBold() {
    exec('bold')
  }

  function insertBulletList() {
    exec('insertUnorderedList')
  }

  function insertChecklistItem() {
    ref.current?.focus()
    const html = '<div data-check-row="1" style="display:flex;align-items:flex-start;gap:6px;"><input type="checkbox" contenteditable="false" /><span>Novo item</span></div>'
    document.execCommand('insertHTML', false, html)
    emit()
  }

  function applyHighlight(color: string) {
    exec('hiliteColor', color)
    setSwatchesOpen(false)
  }

  return (
    <div className="rich-text-editor border border-surface-border rounded-card overflow-hidden">
      <div className="flex items-center gap-1 border-b border-surface-border bg-surface-secondary/60 px-2 py-1.5 relative">
        <button type="button" onClick={toggleBold} title="Negrito" className="p-1.5 rounded hover:bg-surface-secondary text-gray-600">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={insertBulletList} title="Lista com marcadores" className="p-1.5 rounded hover:bg-surface-secondary text-gray-600">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={insertChecklistItem} title="Item com checkbox" className="p-1.5 rounded hover:bg-surface-secondary text-gray-600">
          <ListChecks className="w-3.5 h-3.5" />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setSwatchesOpen((v: boolean) => !v)} title="Grifar" className="p-1.5 rounded hover:bg-surface-secondary text-gray-600">
            <Highlighter className="w-3.5 h-3.5" />
          </button>
          {swatchesOpen && (
            <div className="absolute top-full left-0 mt-1 flex gap-1 bg-white border border-surface-border rounded-card p-1.5 shadow-lg z-10">
              {HIGHLIGHT_SWATCHES.map(s => (
                <button
                  key={s.name}
                  type="button"
                  title={s.name}
                  onClick={() => applyHighlight(s.bg)}
                  className="w-5 h-5 rounded-full border border-black/10"
                  style={{ backgroundColor: s.bg }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onClick={(e) => { handleCheckToggle(e); emit() }}
        data-placeholder={placeholder}
        className="rich-text-editable min-h-[90px] px-3 py-2 text-sm text-gray-700 focus:outline-none"
      />
    </div>
  )
}
