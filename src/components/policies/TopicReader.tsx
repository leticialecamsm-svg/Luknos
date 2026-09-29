'use client'

import { useRef, useState, useTransition } from 'react'
import { CheckCircle2, ChevronDown, Lock, PenLine } from 'lucide-react'
import { acknowledgeTopic } from '@/lib/policies/actions'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import type { PolicyTopicView } from '@/lib/policies/actions'

const fmtDateTime = (v: string) => new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Um tópico por vez: só libera "Li e concordo" depois que a pessoa rola o
// texto até o final (o clique não basta — precisamos que o conteúdo tenha
// passado pela tela). A assinatura é definitiva: sem botão de desfazer.
export function TopicReader({ topics, documentFullySigned }: { topics: PolicyTopicView[]; documentFullySigned: boolean }) {
  const [signed, setSigned] = useState<Record<string, string>>(
    Object.fromEntries(topics.filter(t => t.signed && t.signedAt).map(t => [t.id, t.signedAt as string]))
  )
  const firstPending = topics.find(t => !signed[t.id])
  const [openId, setOpenId] = useState<string | null>(firstPending?.id ?? topics[0]?.id ?? null)

  return (
    <div className="space-y-3">
      {topics.map((t, i) => {
        const isSigned = !!signed[t.id]
        const prevDone = i === 0 || !!signed[topics[i - 1].id]
        const locked = !isSigned && !prevDone
        const open = openId === t.id
        return (
          <div key={t.id} className={cn('card overflow-hidden', locked && 'opacity-60')}>
            <button
              type="button"
              disabled={locked}
              onClick={() => setOpenId(open ? null : t.id)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left disabled:cursor-not-allowed"
            >
              <span className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                isSigned ? 'bg-green-100 text-green-700' : locked ? 'bg-surface-secondary text-gray-400' : 'bg-brand-50 text-brand-700'
              )}>
                {isSigned ? <CheckCircle2 className="w-4 h-4" /> : locked ? <Lock className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold truncate', isSigned ? 'text-green-800' : 'text-gray-900')}>{t.title}</p>
                {isSigned && <p className="text-xs text-green-600 mt-0.5">Assinado em {fmtDateTime(signed[t.id])}</p>}
              </div>
              {!locked && <ChevronDown className={cn('w-4 h-4 text-gray-400 shrink-0 transition-transform', open && 'rotate-180')} />}
            </button>
            {open && !locked && (
              <TopicBody
                topic={t}
                signed={isSigned}
                onSigned={(iso) => {
                  setSigned(s => ({ ...s, [t.id]: iso }))
                  const next = topics[i + 1]
                  setOpenId(next ? next.id : null)
                }}
              />
            )}
          </div>
        )
      })}

      {documentFullySigned || topics.every(t => signed[t.id]) ? (
        <div className="rounded-card bg-gradient-navy text-white p-5 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-brand-400 shrink-0" />
          <div>
            <p className="font-semibold">Política lida e assinada</p>
            <p className="text-sm text-white/70 mt-0.5">Você confirmou ciência de todos os tópicos.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TopicBody({ topic, signed, onSigned }: { topic: PolicyTopicView; signed: boolean; onSigned: (iso: string) => void }) {
  const toast = useToast()
  const [pending, start] = useTransition()
  const [reachedEnd, setReachedEnd] = useState(signed)
  const boxRef = useRef<HTMLDivElement | null>(null)

  function onScroll() {
    const el = boxRef.current
    if (!el || reachedEnd) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) setReachedEnd(true)
  }

  // Texto curto que já cabe sem rolagem: libera assim que montar.
  function onBoxRef(el: HTMLDivElement | null) {
    boxRef.current = el
    if (el && !reachedEnd && el.scrollHeight <= el.clientHeight + 4) setReachedEnd(true)
  }

  function confirm() {
    start(async () => {
      const res = await acknowledgeTopic(topic.id)
      if (res.error) return toast.error('Não foi possível registrar', res.error)
      onSigned(new Date().toISOString())
    })
  }

  return (
    <div className="px-5 pb-5">
      <div
        ref={onBoxRef}
        onScroll={onScroll}
        className="max-h-72 overflow-y-auto rounded-xl bg-surface-secondary border border-surface-border p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
      >
        {topic.body}
      </div>
      {!signed && (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={confirm}
            disabled={!reachedEnd || pending}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PenLine className="w-4 h-4" /> Li e concordo com este tópico
          </button>
          {!reachedEnd && <p className="text-xs text-gray-400">Role o texto até o final para liberar</p>}
        </div>
      )}
    </div>
  )
}
