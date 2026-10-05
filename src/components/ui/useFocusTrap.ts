'use client'

import { useEffect, type RefObject } from 'react'

// Prende o Tab dentro do diálogo, fecha com Esc e devolve o foco a quem abriu.
export function useFocusTrap(ref: RefObject<HTMLElement>, onClose: () => void, canClose = true) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const node = ref.current
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((el) => !el.hasAttribute('disabled'))
    if (node && !node.contains(document.activeElement)) focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose) { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (f.length === 0) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [ref, onClose, canClose])
}
