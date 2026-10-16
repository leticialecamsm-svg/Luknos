'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IncomingNotice } from '@/lib/crm-actions'
import { getAvatarColor, instanceColor } from '@/lib/crm-ui'
import { WhatsappIcon } from './WhatsappIcon'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export interface NoticeItem extends IncomingNotice { key: string; kind?: 'ask' }

const SHOW_MS = 9000

function hhmm(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(d)
}

function AskCard({ n, onAnswer }: { n: NoticeItem; onAnswer: (accept: boolean) => void }) {
  return (
    <div role="dialog" aria-label={n.title} className="w-full rounded-xl border border-[#BFDDF5] bg-[#F0F7FE] shadow-xl p-4">
      <p className="font-semibold text-[#1F5C8A]">{n.title}</p>
      <p className="mt-1 text-sm text-gray-800">{n.body}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onAnswer(true)} className="flex-1 px-3 py-1.5 rounded-full bg-[#1F5C8A] text-white text-sm font-medium hover:opacity-90">Ativar avisos</button>
        <button onClick={() => onAnswer(false)} className="px-3 py-1.5 rounded-full bg-white border border-[#BFDDF5] text-[#1F5C8A] text-sm hover:bg-[#E6F1FB]">Agora não</button>
      </div>
    </div>
  )
}

function Card({ n, onOpen, onClose }: { n: NoticeItem; onOpen: () => void; onClose: () => void }) {
  const [hover, setHover] = useState(false)
  // some sozinho depois de alguns segundos (pausa enquanto o mouse está em cima)
  useEffect(() => {
    if (hover) return
    const t = setTimeout(onClose, SHOW_MS)
    return () => clearTimeout(t)
  }, [hover, onClose])
  const color = instanceColor(n.color_index)
  return (
    <div
      role="status"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative w-full rounded-xl border border-[#BFDDF5] bg-[#F0F7FE] shadow-xl p-3 pr-8 flex gap-3 animate-in fade-in slide-in-from-right-4 duration-200"
    >
      <button onClick={onOpen} className="flex gap-3 text-left min-w-0 flex-1" aria-label={`Abrir conversa com ${n.title}`}>
        {n.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={n.photo} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
        ) : (
          <span className={`w-11 h-11 rounded-full bg-gradient-to-br ${getAvatarColor(n.conversation_id)} text-white font-bold flex items-center justify-center shrink-0`}>
            {n.title.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[#1F5C8A] truncate">{n.title}</span>
            <span className="text-xs text-[#2B6A9C] shrink-0">{hhmm(n.at)}</span>
          </span>
          <span className={cn('mt-0.5 inline-flex max-w-full items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border', color.chip)}>
            <WhatsappIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">{n.instance_label}</span>
          </span>
          <span className="block mt-1 text-sm text-gray-800 line-clamp-2 break-words">{n.body}</span>
        </span>
      </button>
      <button onClick={onClose} aria-label="Fechar aviso" className="absolute top-2 right-2 text-[#2B6A9C]/60 hover:text-[#2B6A9C]">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// Avisos de mensagem nova no canto superior direito, em qualquer página (clarinhos, com avatar,
// WhatsApp de origem, mensagem e horário). Vão para o <body> para não ficarem presos no cabeçalho.
export function CrmNoticeStack({ notices, onOpen, onClose, onAnswerAsk }: { notices: NoticeItem[]; onOpen: (n: NoticeItem) => void; onClose: (key: string) => void; onAnswerAsk: (accept: boolean) => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || notices.length === 0) return null
  return createPortal(
    <div className="fixed top-16 right-4 z-[70] flex flex-col gap-2 w-[22rem] max-w-[92vw]" aria-live="polite">
      {notices.map((n) => n.kind === 'ask'
        ? <AskCard key={n.key} n={n} onAnswer={onAnswerAsk} />
        : <Card key={n.key} n={n} onOpen={() => onOpen(n)} onClose={() => onClose(n.key)} />)}
    </div>,
    document.body,
  )
}
