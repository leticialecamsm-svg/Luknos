'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Renderiza os filhos direto no <body>, escapando de qualquer containing block
// (transform/overflow) que quebre o posicionamento de elementos fixed (ex.: overlay/blur do modal).
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
