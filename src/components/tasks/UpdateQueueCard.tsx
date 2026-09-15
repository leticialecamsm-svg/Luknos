'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Loader2, MessageSquareText, Check, X, ExternalLink, Plus } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { getMyUpdateQueue, pullMoreUpdates, submitNegotiationUpdate, type QueueItem } from '@/lib/negotiation-updates'
import { TEMP_LABEL, type Temp } from '@/lib/negotiation-rules'

const TEMP_STYLE: Record<string, string> = {
  hot: 'bg-red-50 text-red-600 border-red-200',
  warm: 'bg-amber-50 text-amber-700 border-amber-200',
  cold: 'bg-sky-50 text-sky-700 border-sky-200',
  no_forecast: 'bg-surface-secondary text-gray-500 border-surface-border',
  lost: 'bg-gray-100 text-gray-600 border-gray-300',
}

const LOSS_REASONS: [string, string][] = [
  ['price', 'Preço'], ['competition', 'Fechou com concorrente'], ['no_reply', 'Parou de responder'],
  ['gave_up', 'Desistiu da compra'], ['other', 'Outro'],
]

type Queue = Awaited<ReturnType<typeof getMyUpdateQueue>>

export function UpdateQueueCard() {
  const toast = useToast()
  const [queue, setQueue] = useState<Queue>(null)
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState<QueueItem | null>(null)
  const [pulling, setPulling] = useState(false)

  async function load() { setQueue(await getMyUpdateQueue()) }
  useEffect(() => { load() }, [])

  if (!queue || (queue.today.length === 0 && queue.backlog === 0)) return null

  const total = queue.today.length
  const done = queue.doneCount
  const allDone = total > 0 && done === total

  async function pullMore() {
    setPulling(true)
    const r = await pullMoreUpdates()
    setPulling(false)
    if ('error' in r && r.error) { toast.error('OCORREU UM ERRO', r.error); return }
    load()
  }

  return (
    <>
      <div className={cn('rounded-2xl border bg-white overflow-hidden', allDone ? 'border-emerald-200' : 'border-brand-100')}>
        <button onClick={() => setOpen(o => !o)}
          className={cn('w-full flex items-center gap-3 px-4 py-3 text-left', allDone ? 'bg-emerald-50/60' : 'bg-brand-50/50')}>
          <MessageSquareText className={cn('w-4 h-4 shrink-0', allDone ? 'text-emerald-600' : 'text-brand-600')} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">
              {allDone ? 'Negociações do dia atualizadas' : 'Atualizar negociações hoje'}
            </p>
            <p className="text-xs text-gray-500">
              {total > 0
                ? <>Conte o que aconteceu no WhatsApp com {total === 1 ? 'esse orçamento' : `esses ${total} orçamentos`} — leva 1 minuto cada</>
                : 'Nada separado pra hoje'}
              {queue.backlog > 0 && <> · {queue.backlog} ainda atrasadas na fila</>}
            </p>
          </div>
          {total > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', allDone ? 'bg-emerald-500' : 'bg-brand-500')}
                  style={{ width: `${(done / total) * 100}%` }} />
              </div>
              <span className="text-xs font-bold text-gray-700 tabular-nums">{done}/{total}</span>
            </div>
          )}
          <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', !open && '-rotate-90')} />
        </button>

        {open && (
          <div className="divide-y divide-gray-50">
            {queue.today.map(item => (
              <div key={item.quoteId} className={cn('flex items-center gap-3 px-4 py-2.5', item.done && 'opacity-50')}>
                <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                  item.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300')}>
                  {item.done && <Check className="w-3 h-3 text-white" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm text-gray-800 truncate', item.done && 'line-through')}>
                    <span className="font-semibold text-brand-600">#{item.number}</span> {item.client}
                    {item.partner && <span className="text-gray-400"> · {item.partner}</span>}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    <span className={cn('inline-block px-1.5 rounded border text-[10px] font-semibold mr-1.5', TEMP_STYLE[item.temperature])}>
                      {TEMP_LABEL[item.temperature]}
                    </span>
                    {item.daysSilent >= 999 ? 'nunca atualizado' : `sem notícia há ${item.daysSilent} dias`}
                    {item.value > 0 && <> · {formatCurrency(item.value)}</>}
                  </p>
                </div>
                {!item.done && (
                  <button onClick={() => setEditing(item)}
                    className="shrink-0 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 px-3 py-1.5 rounded-lg">
                    Atualizar
                  </button>
                )}
              </div>
            ))}
            {allDone && queue.backlog > 0 && (
              <div className="px-4 py-3 flex items-center justify-between gap-3 bg-surface-secondary/50">
                <p className="text-xs text-gray-500">Terminou a lista do dia. Quer adiantar mais algumas da fila?</p>
                <button onClick={pullMore} disabled={pulling}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  {pulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Pegar mais
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <QuickUpdateModal item={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); toast.success('TUDO CERTO!', 'Negociação atualizada.'); load() }} />
      )}
    </>
  )
}

function QuickUpdateModal({ item, onClose, onSaved }: { item: QueueItem; onClose: () => void; onSaved: () => void }) {
  const [temp, setTemp] = useState<Temp | 'lost'>(item.temperature)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null)
    const r = await submitNegotiationUpdate(item.quoteId, { temperature: temp, note, lossReason: reason || undefined })
    setSaving(false)
    if (r.error) { setError(r.error); return }
    onSaved()
  }

  const options: (Temp | 'lost')[] = ['hot', 'warm', 'cold', 'no_forecast', 'lost']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">
              Orçamento <span className="font-semibold text-brand-600">#{item.number}</span>
              {item.partner && <> · {item.partner}</>}
            </p>
            <h2 className="text-lg font-bold text-gray-900 truncate">{item.client}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <div>
            <p className="label">Como está essa negociação agora?</p>
            <div className="flex flex-wrap gap-1.5">
              {options.map(t => (
                <button key={t} onClick={() => setTemp(t)}
                  className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                    temp === t ? TEMP_STYLE[t] + ' ring-2 ring-offset-1 ring-brand-500/30' : 'bg-white text-gray-500 border-surface-border hover:border-gray-300')}>
                  {TEMP_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {temp === 'lost' && (
            <div>
              <p className="label">Por que perdemos?</p>
              <select value={reason} onChange={e => setReason(e.target.value)} className="select">
                <option value="">Escolha o motivo…</option>
                {LOSS_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          )}

          <div>
            <p className="label">O que aconteceu?</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus
              placeholder="Ex: cliente pediu pra rever o valor dos perfis, volta a falar na segunda"
              className="input resize-none" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Link href={`/quotes/${item.quoteId}`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600">
              Fechou a venda? Abrir orçamento <ExternalLink className="w-3 h-3" />
            </Link>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
