'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'
import { nav, contact } from './content'
import { whatsappHref } from './utils'

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Trava o scroll do body com o menu mobile aberto
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-50 transition-all duration-500',
        scrolled
          ? 'bg-ink/85 backdrop-blur-md border-b border-white/10 py-3'
          : 'bg-transparent py-5',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-10">
        <a href="#top" className="relative block h-8 w-[128px]">
          <Image
            src="/logo-white.svg"
            alt="Luknos Iluminação"
            fill
            priority
            className="object-contain object-left"
          />
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {nav.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium tracking-wide text-white/75 transition-colors hover:text-champagne"
            >
              {l.label}
            </a>
          ))}
          <a
            href={whatsappHref(contact.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-champagne/60 px-5 py-2 text-sm font-medium text-champagne transition-colors hover:bg-champagne hover:text-ink"
          >
            Fale conosco
          </a>
        </nav>

        <button
          type="button"
          aria-label="Abrir menu"
          onClick={() => setOpen((v) => !v)}
          className="text-white lg:hidden"
        >
          {open ? <X size={26} /> : <Menu size={26} />}
        </button>
      </div>

      {/* Menu mobile */}
      {open && (
        <div className="fixed inset-0 top-[60px] z-40 bg-ink/97 backdrop-blur-lg lg:hidden">
          <nav className="flex flex-col gap-1 px-6 py-8">
            {nav.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/10 py-4 text-lg text-white/85"
              >
                {l.label}
              </a>
            ))}
            <a
              href={whatsappHref(contact.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-6 rounded-full bg-champagne px-6 py-4 text-center font-medium text-ink"
            >
              Fale conosco
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
