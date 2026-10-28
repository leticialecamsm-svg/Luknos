'use client'

import { useState } from 'react'
import { Megaphone } from 'lucide-react'

// Dados do anúncio que trouxe a conversa (Click-to-WhatsApp), gravados pelo webhook em ad_context.
export interface AdContext {
  source: 'facebook' | 'instagram' | 'status'
  title: string | null
  body: string | null
  thumb: string | null
  url: string | null
  greeting: string | null
}

const SOURCE_LABEL: Record<AdContext['source'], string> = {
  facebook: 'Anúncio do Facebook',
  instagram: 'Anúncio do Instagram',
  status: 'Anúncio no Status',
}

// Cartão do anúncio no topo da primeira mensagem, como o WhatsApp Web mostra.
export function AdCard({ ad }: { ad: AdContext }) {
  const [open, setOpen] = useState(false)
  const label = SOURCE_LABEL[ad.source] ?? 'Anúncio'
  return (
    <div className="mb-1.5 -mx-0.5 rounded-lg overflow-hidden bg-black/5 min-w-[220px]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 p-2 text-left hover:bg-black/5 transition-colors">
        {ad.thumb ? (
          <img src={ad.thumb} alt="" className="w-14 h-14 shrink-0 rounded-md object-cover bg-gray-200" />
        ) : (
          <span className="w-14 h-14 shrink-0 rounded-md bg-orange-100 text-orange-600 flex items-center justify-center"><Megaphone className="w-6 h-6" /></span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">{label}</span>
          {ad.title && <span className="block text-xs text-gray-700 line-clamp-1">{ad.title}</span>}
          <span className="block text-[11px] text-gray-500">{open ? 'Ocultar detalhes' : 'Mostrar detalhes'}</span>
        </span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 space-y-1.5 text-xs text-gray-700">
          {ad.body && <p className="whitespace-pre-line">{ad.body}</p>}
          {ad.greeting && (
            <p className="rounded-md bg-white/70 px-2 py-1.5 text-gray-600">
              <span className="block text-[11px] font-semibold text-gray-500">Mensagem automática que o cliente recebeu</span>
              {ad.greeting}
            </p>
          )}
          {ad.url && <a href={ad.url} target="_blank" rel="noopener noreferrer" className="inline-block font-medium text-[#027eb5] hover:underline">Ver anúncio</a>}
        </div>
      )}
    </div>
  )
}
