'use client'

import { useState } from 'react'
import { NewQuoteModal } from './NewQuoteModal'

// Botão que abre a criação de orçamento em modal (reutilizável em qualquer tela)
export function NewQuoteButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{children}</button>
      {open && <NewQuoteModal onClose={() => setOpen(false)} />}
    </>
  )
}
