'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Barra dourada no topo que começa NO CLIQUE e termina quando a página nova
// chega. O App Router não avisa quando uma navegação começa, então escutamos
// os cliques em links internos e fechamos a barra quando a URL muda.
export function NavigationProgress() {
  const pathname = usePathname()
  const search = useSearchParams()
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  function start() {
    if (timer.current) clearInterval(timer.current)
    setVisible(true)
    setWidth(12)
    // avança rápido no começo e desacelera perto de 90% (nunca "termina" sozinha)
    timer.current = setInterval(() => setWidth(w => (w < 90 ? w + (90 - w) * 0.12 : w)), 180)
  }

  function done() {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    setWidth(100)
    setTimeout(() => { setVisible(false); setWidth(0) }, 280)
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      start()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // URL mudou = a navegação chegou
  useEffect(() => { if (visible) done() }, [pathname, search]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null
  return <div className="luk-progress" style={{ width: `${width}%`, opacity: width >= 100 ? 0 : 1 }} />
}
