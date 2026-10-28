'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Eye, Loader2, MessageCircle, Pencil, Sparkles, Clock } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { ActivityItem, ActivityKind, PersonDay, Wait } from '@/lib/team-activity'

const TZ = 'America/Maceio'

function hm(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}
function hourOf(iso: string) {
  return Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }))
}
function dur(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h}h${String(min % 60).padStart(2, '0')}`
}
function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

const KIND: Record<ActivityKind, { label: string; icon: typeof MessageCircle; dot: string; bar: string }> = {
  message: { label: 'Mensagens', icon: MessageCircle, dot: 'bg-emerald-500', bar: 'bg-emerald-400' },
  open: { label: 'Abriu conversa', icon: Eye, dot: 'bg-sky-500', bar: 'bg-sky-300' },
  edit: { label: 'Edições', icon: Pencil, dot: 'bg-amber-500', bar: 'bg-amber-400' },
  event: { label: 'Solicitações / orçamentos', icon: Sparkles, dot: 'bg-violet-500', bar: 'bg-violet-400' },
}

export function TeamActivity({ day, today, userId, team, items, waits }: {
  day: string
  today: string
  userId: string | null
  team: PersonDay[]
  items: ActivityItem[]
  waits: Wait[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [focus, setFocus] = useState<Wait | null>(null)
  const [hidden, setHidden] = useState<Set<ActivityKind>>(new Set())
  const [open, setOpen] = useState<number | null>(null)

  const go = (d: string, u: string | null) => {
    setFocus(null)
    setOpen(null)
    startTransition(() => router.push(`/admin/atividade?d=${d}${u ? `&u=${u}` : ''}`))
  }

  const person = team.find((p) => p.id === userId)

  // atividade por hora (mensagens contam pela quantidade enviada)
  const hours = useMemo(() => {
    const by = new Map<number, Record<ActivityKind, number>>()
    for (const it of items) {
      const h = hourOf(it.at)
      if (!by.has(h)) by.set(h, { message: 0, open: 0, edit: 0, event: 0 })
      by.get(h)![it.kind] += it.kind === 'message' ? it.count ?? 1 : 1
    }
    const keys = Array.from(by.keys())
    const lo = Math.min(7, ...keys)
    const hi = Math.max(19, ...keys)
    const out: { h: number; v: Record<ActivityKind, number>; total: number }[] = []
    for (let h = lo; h <= hi; h++) {
      const v = by.get(h) ?? { message: 0, open: 0, edit: 0, event: 0 }
      out.push({ h, v, total: v.message + v.open + v.edit + v.event })
    }
    return out
  }, [items])
  const maxHour = Math.max(1, ...hours.map((x) => (Object.keys(KIND) as ActivityKind[]).reduce((n, k) => n + (hidden.has(k) ? 0 : x.v[k]), 0)))

  const inFocus = (it: ActivityItem) => {
    if (!focus) return false
    const end = focus.until ?? new Date().toISOString()
    return it.at >= focus.from && it.at <= end
  }
  const visible = items.filter((it) => !hidden.has(it.kind) && (!focus || inFocus(it)))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Atividade da equipe</h1>
          <p className="text-sm text-gray-500">Tudo o que cada pessoa fez no sistema, minuto a minuto. Só administradores veem esta tela.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {pending && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <button type="button" onClick={() => go(shiftDay(day, -1), userId)} className="btn-ghost p-2" aria-label="Dia anterior"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && go(e.target.value, userId)} className="input w-auto py-1.5" />
          <button type="button" onClick={() => go(shiftDay(day, 1), userId)} disabled={day >= today} className="btn-ghost p-2 disabled:opacity-30" aria-label="Próximo dia"><ChevronRight className="w-4 h-4" /></button>
          {day !== today && <button type="button" onClick={() => go(today, userId)} className="btn-secondary text-sm py-1.5 px-3">Hoje</button>}
        </div>
      </div>

      {/* resumo da equipe no dia */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {team.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => go(day, p.id)}
            className={cn('card p-3 text-left transition hover:shadow-md', p.id === userId && 'ring-2 ring-gray-900')}
          >
            <div className="flex items-center gap-2 mb-2">
              <Avatar user={p} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-[11px] text-gray-500">{p.first ? `${hm(p.first)} – ${hm(p.last!)}` : 'sem atividade'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div><p className="text-base font-semibold text-gray-900">{p.messages}</p><p className="text-[10px] text-gray-500">mensagens</p></div>
              <div><p className="text-base font-semibold text-gray-900">{p.conversations}</p><p className="text-[10px] text-gray-500">conversas</p></div>
              <div><p className="text-base font-semibold text-gray-900">{p.edits}</p><p className="text-[10px] text-gray-500">edições</p></div>
            </div>
          </button>
        ))}
      </div>

      {!person ? (
        <div className="card p-8 text-center text-sm text-gray-500">Ninguém registrou atividade neste dia.</div>
      ) : (
        <>
          {/* gráfico por hora */}
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm font-medium text-gray-900">{person.name} · atividade por hora</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(KIND) as ActivityKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setHidden((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })}
                    className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border', hidden.has(k) ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700')}
                  >
                    <span className={cn('w-2 h-2 rounded-full', hidden.has(k) ? 'bg-gray-300' : KIND[k].dot)} />{KIND[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-1 h-32">
              {hours.map(({ h, v }) => (
                <div key={h} className="flex-1 min-w-0 h-full flex flex-col items-center gap-1" title={`${h}h: ${v.message} mensagens, ${v.open} aberturas, ${v.edit} edições, ${v.event} eventos`}>
                  <div className="w-full flex-1 min-h-0 flex flex-col justify-end">
                    {(Object.keys(KIND) as ActivityKind[]).filter((k) => !hidden.has(k)).reverse().map((k) => (
                      <div key={k} className={cn(KIND[k].bar, 'w-full first:rounded-t')} style={{ height: `${(v[k] / maxHour) * 100}%` }} />
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-400">{h}h</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
            {/* linha do tempo */}
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">Linha do tempo</p>
                {focus && (
                  <button type="button" onClick={() => setFocus(null)} className="text-xs text-sky-700 hover:underline">
                    Mostrando {hm(focus.from)}–{focus.until ? hm(focus.until) : 'agora'} · ver o dia todo
                  </button>
                )}
              </div>
              {visible.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">{focus ? 'Nenhuma atividade registrada nesse intervalo.' : 'Nada neste dia.'}</p>
              ) : (
                <ol className="divide-y divide-gray-50">
                  {visible.map((it, i) => {
                    const K = KIND[it.kind]
                    const Icon = K.icon
                    const expandable = !!it.changes?.length
                    return (
                      <li key={i} className="px-4 py-2.5">
                        <div className="flex items-start gap-3">
                          <span className="w-20 shrink-0 text-xs tabular-nums text-gray-500 pt-0.5">
                            {hm(it.at)}{it.end && hm(it.end) !== hm(it.at) ? `–${hm(it.end)}` : ''}
                          </span>
                          <span className={cn('mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-white', K.dot)}><Icon className="w-3 h-3" /></span>
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="text-gray-900">
                              {it.kind === 'message' && <>{it.count === 1 ? '1 mensagem' : `${it.count} mensagens`} para </>}
                              {it.kind === 'open' && <>Abriu a conversa de </>}
                              {it.href && it.kind !== 'edit' && it.kind !== 'event'
                                ? <Link href={it.href} className="font-medium hover:underline">{it.title}</Link>
                                : <span className="font-medium">{it.title}</span>}
                              {it.detail && (
                                <span className="text-gray-600"> · {it.href && (it.kind === 'edit' || it.kind === 'event') ? <Link href={it.href} className="hover:underline">{it.detail}</Link> : it.detail}</span>
                              )}
                            </p>
                            {expandable && (
                              <button type="button" onClick={() => setOpen(open === i ? null : i)} className="text-xs text-gray-500 hover:text-gray-800">
                                {open === i ? 'ocultar detalhes' : `${it.changes!.length} ${it.changes!.length === 1 ? 'campo' : 'campos'}: ${it.changes!.slice(0, 3).map((c) => c.field).join(', ')}${it.changes!.length > 3 ? '…' : ''}`}
                              </button>
                            )}
                            {open === i && (
                              <dl className="mt-1.5 space-y-1 text-xs bg-gray-50 rounded-lg p-2">
                                {it.changes!.map((c, j) => (
                                  <div key={j} className="flex gap-2">
                                    <dt className="w-32 shrink-0 text-gray-500">{c.field}</dt>
                                    <dd className="min-w-0 break-words text-gray-800">
                                      {c.from !== undefined && <><span className="line-through text-gray-400">{c.from}</span> → </>}{c.to}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>

            {/* conversas que esperaram */}
            <div className="card p-0 overflow-hidden lg:sticky lg:top-4">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">Conversas de {person.name.split(' ')[0]} que esperaram</p>
                <p className="text-xs text-gray-500">Clientes que ficaram 15 min ou mais sem resposta. Toque para ver o que {person.name.split(' ')[0]} fazia enquanto isso.</p>
              </div>
              {waits.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">Nenhuma espera longa neste dia. 👏</p>
              ) : (
                <ul className="divide-y divide-gray-50 max-h-[32rem] overflow-y-auto">
                  {waits.map((w, i) => (
                    <li key={i} className={cn('px-4 py-2.5 hover:bg-gray-50', focus === w && 'bg-sky-50')}>
                      <button type="button" onClick={() => setFocus(focus === w ? null : w)} className="w-full text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">{w.name}</span>
                          <span className={cn('shrink-0 inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5', w.until ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700')}>
                            <Clock className="w-3 h-3" />{dur(w.minutes)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Escreveu às {hm(w.from)} · {w.until ? `respondido às ${hm(w.until)}${w.replied_by ? ` por ${w.replied_by}` : ''}` : 'ainda sem resposta'}
                        </p>
                      </button>
                      <Link href={`/crm/conversas?c=${w.conversation_id}`} className="text-xs text-sky-700 hover:underline">abrir conversa</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-gray-400">
        Mensagens enviadas existem desde o início do CRM. Edições no sistema e aberturas de conversa passaram a ser registradas em 28/10/2026.
        Mensagens mandadas direto pelo celular contam para a pessoa dona daquele número. O que acontece fora do sistema (atendimento na loja, ligações) não aparece aqui.
      </p>
    </div>
  )
}
