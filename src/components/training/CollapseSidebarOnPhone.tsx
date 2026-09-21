'use client'

import { useLayoutEffect } from 'react'

// O menu lateral não tem modo celular: aberto, ocupa ~224px e sobram uns 150px
// para a aula. Em telas estreitas, e só se a pessoa nunca escolheu, começa
// recolhido. Roda antes do Sidebar montar (irmão anterior no layout).
export function CollapseSidebarOnPhone() {
  useLayoutEffect(() => {
    try {
      if (window.innerWidth < 768 && localStorage.getItem('sidebar-collapsed') === null) {
        localStorage.setItem('sidebar-collapsed', 'true')
      }
    } catch { /* localStorage indisponível: segue com o padrão */ }
  }, [])
  return null
}
