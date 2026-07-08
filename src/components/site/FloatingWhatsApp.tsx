'use client'

import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { contact } from './content'
import { whatsappHref } from './utils'

/** Botão flutuante de WhatsApp — aparece após rolar um pouco a página. */
export function FloatingWhatsApp() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <a
      href={whatsappHref(contact.whatsapp)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className={[
        'fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-champagne px-5 py-4 font-medium text-ink shadow-lg shadow-black/25 transition-all duration-500 hover:bg-champagne-light',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0',
      ].join(' ')}
    >
      <MessageCircle size={22} />
      <span className="hidden sm:inline">Fale conosco</span>
    </a>
  )
}
