'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  setConversationValue,
  getCrmStages,
  createCrmStage,
  updateCrmStage,
  deleteCrmStage,
  reorderCrmStages,
  moveConversationToStage,
  type ConversationRow,
} from '@/lib/crm-actions'
import { groupByStage, STAGE_COLORS, STAGE_NAME_MAX, type CrmStage } from '@/lib/crm-stages'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { useFocusTrap } from '@/components/ui/useFocusTrap'
import { formatListTime } from '@/lib/crm-time'
import { ConvAvatar } from './ConvAvatar'
import { formatCents, sumCents } from '@/lib/crm-money'
import { InstanceFilter, useInstanceFilter, readSavedInstanceSelection } from './InstanceFilter'
import { DealValue } from './DealValue'
import { ConvTags } from './ConvTags'
import { DUE_STYLE } from './FollowupPopover'
import { dueState, formatDue } from '@/lib/crm-followup'
import { Avatar } from '@/components/ui/Avatar'
import { fetchCrmSnapshot } from '@/lib/crm-fetch'
import { LuknosSpinner } from '@/components/ui/LuknosLoader'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Loader2, Search, MoreHorizontal, X, AlertTriangle, ArrowRightLeft, CheckCheck, CalendarClock } from 'lucide-react'

const BOARD_LIMIT = 500
type Scope = 'mine' | 'unassigned' | 'all'

function phoneFromJid(jid: string) {
  const d = jid.split('@')[0].replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) {
    const ddd = d.slice(2, 4); const rest = d.slice(4)
    return `+55 ${ddd} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`
  }
  return d ? `+${d}` : jid
}

const unreadNow = (c: { unread_count: number; marked_unread: boolean }) => c.unread_count > 0 || c.marked_unread

export function CrmBoardPage({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [stages, setStages] = useState<CrmStage[]>([])
  const [cards, setCards] = useState<ConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('all')
  const [query, setQuery] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ stage: CrmStage | null } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [moveFor, setMoveFor] = useState<string | null>(null)
  const [counts, setCounts] = useState({ mine: 0, unassigned: 0, all: 0 })
  const filter = useInstanceFilter()
  // com um WhatsApp só na tela, a etiqueta dele em cada cartão é repetição (a borda colorida já diz)
  const showInstanceChip = filter.options.length > 1 && filter.selected.length !== 1
  const selectedKey = filter.selected.join(',')
  const busy = useRef(0) // operações de escrita em andamento: pausa o polling

  // Leitura por GET (fora da fila das ações: mover um cartão não espera a atualização terminar).
  // Cada aba/filtro fica guardado: trocar mostra na hora o que já tinha e atualiza por trás —
  // o quadro só dá lugar ao carregamento quando ainda não há nada para mostrar.
  const cache = useRef(new Map<string, { items: ConversationRow[]; stages: CrmStage[]; counts: typeof counts }>())
  const keyRef = useRef('')
  // antes de o filtro "carregar", usa a escolha salva direto (a primeira busca não espera re-renderizar)
  const sel = filter.loaded ? selectedKey : readSavedInstanceSelection().join(',')
  keyRef.current = `${scope}|${sel}`
  const load = useCallback(async (silent = false) => {
    void silent
    const key = `${scope}|${sel}`
    const ids = sel ? sel.split(',') : undefined
    try {
      const snap = await fetchCrmSnapshot(scope, BOARD_LIMIT, ids, true)
      if (keyRef.current !== key) return // trocou de aba no meio do caminho
      setCounts(snap.counts)
      if (snap.error) { setLoadError(snap.error); return }
      cache.current.set(key, { items: snap.items ?? [], stages: snap.stages ?? [], counts: snap.counts })
      if (busy.current > 0) return // chegou no meio de uma escrita: descarta p/ não "piscar" estado antigo
      setLoadError(null)
      setCards(snap.items ?? [])
      setStages(snap.stages ?? [])
    } catch (e) {
      if (keyRef.current === key) setLoadError((e as Error).message || 'Sem conexão com o servidor')
    } finally {
      if (keyRef.current === key) setLoading(false)
    }
  }, [scope, sel])
  useEffect(() => {
    const c = cache.current.get(`${scope}|${sel}`)
    if (c) { setCards(c.items); setStages(c.stages); setCounts(c.counts) }
    setLoading(!c)
  }, [scope, sel])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden && !dragId) load(true) }, 30000)
    return () => clearInterval(t)
  }, [load, dragId])
  useEffect(() => {
    if (!menuFor && !moveFor) return
    const close = () => { setMenuFor(null); setMoveFor(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey) }
  }, [menuFor, moveFor])

  const visibleCards = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    if (!q) return cards
    const qDigits = q.replace(/\D/g, '')
    return cards.filter((c) =>
      (c.contact_name ?? '').toLocaleLowerCase('pt-BR').includes(q) ||
      (qDigits.length >= 3 && c.remote_jid.includes(qDigits)),
    )
  }, [cards, query])

  // só dígitos e menos de 3: não dá para buscar por telefone ainda
  const shortDigits = /^[\d\s()+-]+$/.test(query.trim()) && query.replace(/\D/g, '').length > 0 && query.replace(/\D/g, '').length < 3

  const grouped = useMemo(() => groupByStage(stages, visibleCards), [stages, visibleCards])
  const orderedStages = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages])

  async function moveCard(cardId: string, stageId: string) {
    const card = cards.find((c) => c.id === cardId)
    if (!card) return
    const currentKey = card.stage_id && stages.some((s) => s.id === card.stage_id) ? card.stage_id : orderedStages[0]?.id
    if (currentKey === stageId) return
    const prev = cards
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, stage_id: stageId } : c)))
    busy.current++
    const r = await moveConversationToStage(cardId, stageId)
    busy.current--
    if ('error' in r && r.error) {
      setCards(prev)
      toast.error('NÃO FOI POSSÍVEL MOVER', r.error)
      load(true)
    }
  }

  // Salva o valor da negociação (otimista; volta ao anterior se o servidor recusar).
  async function saveValue(cardId: string, cents: number | null): Promise<string | null> {
    const prev = cards.find((c) => c.id === cardId)?.deal_cents ?? null
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, deal_cents: cents } : c)))
    busy.current++
    const r = await setConversationValue(cardId, cents)
    busy.current--
    if ('error' in r && r.error) {
      setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, deal_cents: prev } : c)))
      return r.error
    }
    return null
  }

  async function moveStage(id: string, dir: -1 | 1) {
    const idx = orderedStages.findIndex((s) => s.id === id)
    const to = idx + dir
    if (idx < 0 || to < 0 || to >= orderedStages.length) return
    const next = [...orderedStages]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    const prev = stages
    setStages(next.map((s, i) => ({ ...s, position: i })))
    busy.current++
    const r = await reorderCrmStages(next.map((s) => s.id))
    busy.current--
    if ('error' in r && r.error) { setStages(prev); toast.error('ERRO', r.error); load(true) }
  }

  async function removeStage(s: CrmStage) {
    const n = grouped.get(s.id)?.length ?? 0
    const ok = await confirm(
      n > 0
        ? `Excluir a coluna "${s.name}"? As ${n} conversa(s) dela voltam para a primeira coluna — nada é apagado.`
        : `Excluir a coluna "${s.name}"?`,
      'Excluir',
    )
    if (!ok) return
    busy.current++
    const r = await deleteCrmStage(s.id)
    busy.current--
    if ('error' in r && r.error) toast.error('ERRO', r.error)
    else toast.success('COLUNA EXCLUÍDA')
    load(true)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[420px]">
      {/* barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <InstanceFilter options={filter.options} selected={filter.selected} onChange={filter.setSelected} className="max-w-[16rem]" />
        <div className="flex gap-2">
          {(['all', 'mine'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={cn(
                'px-2.5 py-1 text-[13px] font-medium rounded-full transition-colors',
                scope === k ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {k === 'mine' ? 'Minhas' : 'Todas'}
              {counts[k] > 0 && (
                <span className="ml-1 text-[11px] opacity-70">{counts[k]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nome ou telefone"
            aria-label="Buscar conversa"
            className="pl-8 pr-8 py-1 text-sm bg-gray-100 border-0 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <span className="text-xs text-gray-500">{visibleCards.length} conversa(s)</span>
        {shortDigits && <span role="status" className="text-xs text-amber-700">Digite ao menos 3 números para buscar por telefone</span>}
        {isAdmin && (
          <button
            onClick={() => setEditing({ stage: null })}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            <Plus className="w-4 h-4" /> Nova coluna
          </button>
        )}
      </div>

      {cards.length >= BOARD_LIMIT && (
        <div className="mb-2 flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Mostrando só as {BOARD_LIMIT} conversas mais recentes. Use os filtros para ver as demais.
        </div>
      )}
      {loadError && (
        <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Não foi possível carregar as conversas: {loadError}{' '}
          <button className="underline" onClick={() => load()}>tentar de novo</button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><LuknosSpinner label="Carregando o quadro…" /></div>
      ) : orderedStages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500 text-sm">
          Nenhuma coluna configurada.
          {isAdmin && <button onClick={() => setEditing({ stage: null })} className="px-3 py-1.5 rounded-full bg-gray-900 text-white">Criar primeira coluna</button>}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex gap-2 overflow-x-auto pb-2">
          {orderedStages.map((s, i) => {
            const items = grouped.get(s.id) ?? []
            // coluna vazia fica recolhida (só a faixa com o nome); abre enquanto alguém arrasta um cartão
            if (items.length === 0 && !dragId && !query.trim()) {
              return (
                <section
                  key={s.id}
                  aria-label={`Coluna ${s.name} (vazia)`}
                  title={`${s.name} — nenhuma conversa`}
                  className="w-10 shrink-0 flex flex-col items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 py-3"
                  style={{ borderTop: `3px solid ${s.color}` }}
                >
                  <span className="text-[11px] text-gray-400">0</span>
                  <span className="text-xs font-medium text-gray-500 whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{s.name}</span>
                </section>
              )
            }
            return (
              <section
                key={s.id}
                aria-label={`Coluna ${s.name}`}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStage(s.id) } }}
                onDragLeave={() => setOverStage((o) => (o === s.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain') || dragId
                  setOverStage(null); setDragId(null)
                  if (id) moveCard(id, s.id)
                }}
                className={cn(
                  'w-64 shrink-0 flex flex-col rounded-xl bg-gray-50 border transition-colors',
                  overStage === s.id ? 'border-gray-900 bg-gray-100' : 'border-gray-200',
                )}
              >
                <header className="px-3 py-2 border-b border-gray-200" style={{ borderTop: `3px solid ${s.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                  <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900 truncate" title={s.name}>{s.name}</span>
                  <span className="text-xs text-gray-500">{items.length}</span>
                  <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap" title="Soma dos valores das conversas desta coluna">{formatCents(sumCents(items.map((c) => c.deal_cents)))}</span>
                  {isAdmin && (
                    <div className="relative">
                      <button
                        aria-label={`Opções da coluna ${s.name}`}
                        aria-haspopup="menu"
                        onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === s.id ? null : s.id) }}
                        className="p-1 rounded hover:bg-gray-200 text-gray-500"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuFor === s.id && (
                        <div role="menu" onClick={(e) => e.stopPropagation()} className="absolute right-0 top-7 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                          <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50" onClick={() => { setMenuFor(null); setEditing({ stage: s }) }}><Pencil className="w-3.5 h-3.5" /> Renomear / cor</button>
                          <button role="menuitem" disabled={i === 0} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40" onClick={() => { setMenuFor(null); moveStage(s.id, -1) }}><ChevronLeft className="w-3.5 h-3.5" /> Mover p/ esquerda</button>
                          <button role="menuitem" disabled={i === orderedStages.length - 1} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40" onClick={() => { setMenuFor(null); moveStage(s.id, 1) }}><ChevronRight className="w-3.5 h-3.5" /> Mover p/ direita</button>
                          <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-red-600" onClick={() => { setMenuFor(null); removeStage(s) }}><Trash2 className="w-3.5 h-3.5" /> Excluir</button>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                </header>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {items.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Nenhuma conversa</p>}
                  {items.map((c) => {
                    const name = c.contact_name ?? phoneFromJid(c.remote_jid)
                    const unread = unreadNow(c)
                    return (
                    <article
                      key={c.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setDragId(c.id) }}
                      onDragEnd={() => { setDragId(null); setOverStage(null) }}
                      className={cn('group relative bg-white border-l-4 rounded-lg px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:shadow-md cursor-grab active:cursor-grabbing focus-within:shadow-md', filter.colorOf(c.instance_id).bar, dragId === c.id && 'opacity-40')}
                    >
                      <div className="flex items-center gap-2.5">
                        <ConvAvatar id={c.id} name={name} photo={c.contact_photo_url} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <Link href={`/crm/conversas?c=${c.id}`} className={cn('flex-1 min-w-0 truncate text-sm hover:underline', unread ? 'font-semibold text-gray-950' : 'text-gray-900')} title={name}>
                              {name}
                            </Link>
                            <span className={cn('shrink-0 text-[11px]', unread ? 'font-semibold text-emerald-600' : 'text-gray-400')} title={new Date(c.last_message_at).toLocaleString('pt-BR')}>{formatListTime(c.last_at ?? c.last_message_at)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <p className={cn('flex-1 min-w-0 flex items-center gap-1 text-xs', unread ? 'text-gray-900 font-medium' : 'text-gray-500')}>
                              {c.last_direction === 'outbound' && <CheckCheck className="w-3.5 h-3.5 shrink-0 text-sky-500" aria-label="Última mensagem enviada por nós" />}
                              <span className="truncate">{c.last_body || 'Sem mensagens'}</span>
                            </p>
                            {!unread && c.stale_count > 0 && (
                              <span
                                className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] bg-red-500 text-white font-bold flex items-center justify-center"
                                title={`${c.stale_count} mensagem(ns) do contato aberta(s) e sem resposta há mais de 1 dia`}
                                aria-label={`${c.stale_count} mensagens sem resposta há mais de 1 dia`}
                              >
                                {c.stale_count > 99 ? '99+' : c.stale_count}
                              </span>
                            )}
                            {unread && (
                              <span
                                className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center"
                                title={c.unread_count > 0 ? `${c.unread_count} mensagem(ns) não lida(s)` : 'Marcada como não lida'}
                              >
                                {c.unread_count > 0 ? (c.unread_count > 99 ? '99+' : c.unread_count) : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* só o que pede atenção fica sempre à vista: follow-up e valor já preenchido */}
                      {(c.next_followup || c.deal_cents) && (
                        <div className="mt-1.5 flex items-center gap-1.5 pl-[46px] group-hover:hidden group-focus-within:hidden">
                          {c.next_followup && (
                            <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded border', DUE_STYLE[dueState(c.next_followup.due_at)])} title={c.next_followup.note ?? 'Follow-up agendado'}>
                              <CalendarClock className="w-3 h-3" /> {formatDue(c.next_followup.due_at)}
                            </span>
                          )}
                          {!!c.deal_cents && <span className="ml-auto text-[11px] font-medium text-gray-600">{formatCents(c.deal_cents)}</span>}
                        </div>
                      )}

                      {/* detalhes ao passar o mouse (ou com o foco no cartão) */}
                      <div className="hidden group-hover:block group-focus-within:block mt-1.5 pl-[46px] space-y-1.5">
                        {(showInstanceChip || c.contact_type || c.labels.length > 0) && (
                          <div className="flex flex-wrap items-center gap-1">
                            {showInstanceChip && (
                              <span className={cn('inline-flex max-w-full items-center text-[10px] font-medium px-1.5 rounded-full border', filter.colorOf(c.instance_id).chip)} title={`WhatsApp: ${c.instance_label}`}>
                                <span className="truncate">{c.instance_label}</span>
                              </span>
                            )}
                            <ConvTags type={c.contact_type} labels={c.labels} />
                          </div>
                        )}
                        {c.next_followup && (
                          <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded border', DUE_STYLE[dueState(c.next_followup.due_at)])} title={c.next_followup.note ?? 'Follow-up agendado'}>
                            <CalendarClock className="w-3 h-3" /> {formatDue(c.next_followup.due_at)}
                          </span>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <DealValue cents={c.deal_cents} onSave={(v) => saveValue(c.id, v)} />
                          <div className="flex items-center gap-1">
                            <div className="flex items-center -space-x-1.5">
                              {c.assigned_user_avatar ? (
                                <Avatar user={c.assigned_user_avatar} size="xs" className="ring-2 ring-white" title={`Responsável: ${c.assigned_user_avatar.name}`} />
                              ) : (
                                <span title="Sem responsável" className="w-5 h-5 rounded-full border border-dashed border-gray-300 text-[10px] text-gray-400 flex items-center justify-center bg-white">?</span>
                              )}
                              {c.last_reply_user && c.last_reply_user.id !== c.assigned_user_id && (
                                <Avatar user={c.last_reply_user} size="xs" className="ring-2 ring-white" title={`Última resposta: ${c.last_reply_user.name}`} />
                              )}
                            </div>
                            <button
                              type="button"
                              aria-label={`Mover ${name} para outra coluna`}
                              aria-haspopup="menu"
                              title="Mover para outra coluna"
                              onClick={(e) => { e.stopPropagation(); setMoveFor(moveFor === c.id ? null : c.id) }}
                              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {moveFor === c.id && (
                        <div role="menu" onClick={(e) => e.stopPropagation()} className="absolute right-2 top-full -mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                          <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-gray-400">Mover para</p>
                          {orderedStages.filter((o) => o.id !== s.id).map((o) => (
                            <button key={o.id} role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left" onClick={() => { setMoveFor(null); moveCard(c.id, o.id) }}>
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />{o.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {editing && (
        <StageModal
          stage={editing.stage}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(true) }}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

function StageModal({ stage, onClose, onSaved }: { stage: CrmStage | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(stage?.name ?? '')
  const [color, setColor] = useState(stage?.color ?? STAGE_COLORS[0])
  const [restart, setRestart] = useState(stage?.restart_on_inbound ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const formRef = useRef<HTMLFormElement>(null)
  // useFocusTrap já foca o primeiro campo (nome) e devolve o foco ao botão que abriu
  useFocusTrap(formRef, onClose, !saving)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError(null)
    const r = stage ? await updateCrmStage(stage.id, { name, color, restart_on_inbound: restart }) : await createCrmStage({ name, color, restart_on_inbound: restart })
    setSaving(false)
    if ('error' in r && r.error) { setError(r.error); return }
    toast.success(stage ? 'COLUNA ATUALIZADA' : 'COLUNA CRIADA')
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <form ref={formRef} onSubmit={submit} role="dialog" aria-modal="true" aria-label={stage ? 'Editar coluna' : 'Nova coluna'} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">{stage ? 'Editar coluna' : 'Nova coluna'}</h3>
        <div>
          <label htmlFor="stage-name" className="block text-sm text-gray-700 mb-1">Nome</label>
          <input
            id="stage-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={STAGE_NAME_MAX}
            placeholder="Ex.: Aguardando pagamento"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        <div>
          <span className="block text-sm text-gray-700 mb-1">Cor</span>
          <div className="flex gap-2 flex-wrap">
            {STAGE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
                className={cn('w-7 h-7 rounded-full border-2', color === c ? 'border-gray-900' : 'border-transparent')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={restart} onChange={(e) => setRestart(e.target.checked)} className="mt-0.5" />
          <span>Voltar para a primeira coluna quando o cliente escrever de novo <span className="text-gray-400">(use em “Perdido”)</span></span>
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200">Cancelar</button>
          <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-60 inline-flex items-center gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
