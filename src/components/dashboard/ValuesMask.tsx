'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const MASK_CLASS = 'values-masked'
const MONEY = /R\$/

// Esconde (borra) todo valor em R$ do dashboard. Começa sempre escondido e
// volta a esconder a cada entrada na página (o componente só existe em
// /dashboard, então sair e voltar o remonta) — o estado não é salvo.
// Marca os elementos pelo texto em vez de mexer em cada card, pra valer
// automaticamente pros painéis de admin, vendedor e logística.
export function ValuesMask({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(true)
  const [ready, setReady] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Layout effect: marca antes do navegador pintar, e o conteúdo só aparece
  // depois da primeira marcação — senão os valores piscam visíveis no carregamento.
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return

    const apply = () => {
      root.querySelectorAll(`.${MASK_CLASS}`).forEach(el => el.classList.remove(MASK_CLASS))
      if (!hidden) return
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (MONEY.test(n.textContent ?? '')) n.parentElement?.classList.add(MASK_CLASS)
      }
    }

    apply()
    setReady(true)
    const observer = new MutationObserver(() => {
      observer.disconnect()
      apply()
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [hidden])

  return (
    <div ref={ref}>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setHidden(h => !h)}
          title={hidden ? 'Mostrar valores' : 'Esconder valores'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium border border-surface-border bg-white text-gray-600 hover:text-gray-900 hover:border-gray-300 shadow-card transition-colors"
        >
          {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {hidden ? 'Mostrar valores' : 'Esconder valores'}
        </button>
      </div>
      <div style={ready ? undefined : { visibility: 'hidden' }}>{children}</div>
    </div>
  )
}
