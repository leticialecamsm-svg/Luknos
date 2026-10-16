'use client'

import { useCallback, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { useFocusTrap } from '@/components/ui/useFocusTrap'

export interface LightboxItem { id: string; url: string; kind: 'image' | 'video'; name: string | null }

// Visualizador de imagens e vídeos da conversa (←/→ navegam, Esc fecha).
export function MediaLightbox({ items, index, onIndex, onClose }: { items: LightboxItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, onClose)
  const item = items[index]
  const go = useCallback((d: number) => onIndex((index + d + items.length) % items.length), [index, items.length, onIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go])

  if (!item) return null
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Visualizador de mídia" className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute top-3 right-3 flex gap-2">
        <a href={item.url} download={item.name ?? undefined} target="_blank" rel="noopener noreferrer" aria-label="Baixar" className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><Download className="w-5 h-5" /></a>
        <button onClick={onClose} aria-label="Fechar" className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="w-5 h-5" /></button>
      </div>
      {items.length > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="Anterior" className="absolute left-3 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft className="w-6 h-6" /></button>
          <button onClick={() => go(1)} aria-label="Próxima" className="absolute right-3 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight className="w-6 h-6" /></button>
        </>
      )}
      <div className="max-w-[92vw] max-h-[88vh] flex flex-col items-center">
        {item.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.name ?? 'Imagem'} className="max-w-[92vw] max-h-[84vh] object-contain rounded" />
        ) : (
          <video key={item.id} src={item.url} controls autoPlay className="max-w-[92vw] max-h-[84vh] rounded bg-black" />
        )}
        <p className="mt-2 text-xs text-white/70">{index + 1} / {items.length}{item.name ? ` · ${item.name}` : ''}</p>
      </div>
    </div>
  )
}
