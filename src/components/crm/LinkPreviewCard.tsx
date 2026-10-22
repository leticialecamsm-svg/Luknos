'use client'

import { useEffect, useState } from 'react'
import type { LinkPreview } from '@/lib/link-preview'

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i

export function firstUrl(text: string | null | undefined): string | null {
  const m = text ? URL_RE.exec(text) : null
  return m ? m[0].replace(/[.,;:!?*_~]+$/, '') : null
}

const memo = new Map<string, Promise<LinkPreview | null>>()

function load(url: string) {
  let p = memo.get(url)
  if (!p) {
    p = fetch(`/api/crm/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? (r.json() as Promise<LinkPreview | null>) : null))
      .catch(() => null)
    memo.set(url, p)
  }
  return p
}

// Cartão de prévia do link (imagem, título, descrição), como o WhatsApp mostra.
export function LinkPreviewCard({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreview | null>(null)
  const [imgOk, setImgOk] = useState(true)
  useEffect(() => {
    let alive = true
    load(url).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [url])
  if (!data) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mb-1.5 -mx-0.5 rounded-lg overflow-hidden bg-black/5 hover:bg-black/10 transition-colors">
      {data.image && imgOk && (
        <img src={data.image} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setImgOk(false)} className="block w-full max-h-64 object-cover" />
      )}
      <div className="px-2.5 py-2">
        {data.title && <p className="text-sm font-semibold text-gray-900 line-clamp-2">{data.title}</p>}
        {data.description && <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{data.description}</p>}
        {data.site && data.site !== data.title && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{data.site}</p>}
      </div>
    </a>
  )
}
