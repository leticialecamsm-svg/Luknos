'use client'

import { usePathname } from 'next/navigation'

// A maioria das páginas quer o conteúdo centralizado com largura máxima
// (max-w-7xl) — é o comportamento de sempre. Mas telas de "workspace" full
// (como a Leitura de Projeto, com o viewer de PDF) precisam usar o espaço
// inteiro que a sidebar libera quando é recolhida, sem limite de largura.
// Um componente client isolado (em vez de mexer no AppLayout global) porque
// só ele precisa saber a rota atual — o resto do app continua exatamente
// como estava.
const FULL_WIDTH_PREFIXES = ['/dashboard/project-reading']

export function ContentContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullWidth = FULL_WIDTH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (isFullWidth) {
    return <div className="h-[calc(100vh-3rem)] p-6">{children}</div>
  }
  return <div className="max-w-7xl mx-auto p-6">{children}</div>
}
