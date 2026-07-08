'use client'

import { useEffect } from 'react'
import { Instagram, ArrowUpRight } from 'lucide-react'
import { instagram } from './content'

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } }
  }
}

/**
 * Renderiza os reels do Instagram usando o embed oficial.
 * Os links ficam em content.ts → instagram.reels.
 * Se a lista estiver vazia, mostra apenas o convite para seguir o perfil.
 */
export function InstagramFeed() {
  const reels = instagram.reels

  useEffect(() => {
    if (reels.length === 0) return

    // Se o script já estiver carregado, só reprocessa os embeds.
    if (window.instgrm) {
      window.instgrm.Embeds.process()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://www.instagram.com/embed.js'
    script.async = true
    script.onload = () => window.instgrm?.Embeds.process()
    document.body.appendChild(script)

    return () => {
      script.remove()
    }
  }, [reels.length])

  if (reels.length === 0) {
    return (
      <a
        href={instagram.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-8 py-20 text-center transition-colors hover:border-champagne/40"
      >
        <Instagram className="text-champagne" size={36} />
        <div>
          <div className="font-display text-2xl font-light">{instagram.handle}</div>
          <p className="mt-2 text-sm text-white/50">
            Acompanhe nossos projetos e bastidores no Instagram
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-champagne">
          Seguir perfil
          <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </a>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {reels.map((url) => (
        <div key={url} className="overflow-hidden rounded-2xl bg-white">
          <blockquote
            className="instagram-media"
            data-instgrm-permalink={url}
            data-instgrm-version="14"
            style={{ margin: 0, width: '100%', minWidth: 'unset' }}
          />
        </div>
      ))}
    </div>
  )
}
