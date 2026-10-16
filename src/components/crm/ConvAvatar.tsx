'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import { getAvatarColor } from '@/lib/crm-ui'

// Foto de perfil do WhatsApp da conversa; sem foto (ou se ela não carregar), a inicial
// colorida — ou o ícone de grupo.
export function ConvAvatar({ id, name, photo, isGroup = false, size = 48, className = '' }: {
  id: string
  name: string
  photo: string | null | undefined
  isGroup?: boolean
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const style = { width: size, height: size }
  if (photo && failed !== photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt="" style={style} loading="lazy" onError={() => setFailed(photo)} className={`block rounded-full object-cover shrink-0 bg-gray-200 ${className}`} />
    )
  }
  if (isGroup) {
    return (
      <span style={style} className={`rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-white flex items-center justify-center shrink-0 ${className}`} title="Grupo">
        <Users style={{ width: size * 0.45, height: size * 0.45 }} />
      </span>
    )
  }
  return (
    <span style={{ ...style, fontSize: Math.round(size * 0.38) }} className={`rounded-full bg-gradient-to-br ${getAvatarColor(id)} text-white font-bold flex items-center justify-center shrink-0 ${className}`}>
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  )
}
