'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  getCrmConversations,
  getCrmScopeCounts,
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
import { getAvatarColor } from '@/lib/crm-ui'
import { formatCents, sumCents } from '@/lib/crm-money'
import { InstanceFilter, useInstanceFilter } from './InstanceFilter'
import { WhatsappIcon } from './WhatsappIcon'
import { DealValue } from './DealValue'
import { ConvTags } from './ConvTags'
import { DUE_STYLE } from './FollowupPopover'
import { dueState, formatDue } from '@/lib/crm-followup'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Loader2, Search, MoreHorizontal, X, AlertTriangle, ArrowRightLeft, CheckCheck, ArrowDownLeft, CalendarClock } from 'lucide-react'

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d} d` : new Date(iso).toLocaleDateString('pt-BR')
}

export function CrmBoardPage({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [stages, setStages] = useState<CrmStage[]>([])
  const [cards, setCards] = useState<ConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('mine')
  const [query, setQuery] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ stage: CrmStage | null } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [moveFor, setMoveFor] = useState<string | null>(null)
  const [counts, setCounts] = useState({ mine: 0, unassigned: 0, all: 0 })
  const filter = useInstanceFilter()
  const selectedKey = filter.selected.join(',')
  const busy = useRef(0) // operações de escrita em andamento: pausa o polling

  const load = useCallback(async (silent = false) => {
    if (!filter.loaded) return // espera saber quais WhatsApps a pessoa enxerga
    if (!silent) setLoading(true)
    const ids = selectedKey ? selectedKey.split(',') : undefined
    const [st, conv, cnt] = await Promise.all([getCrmStages(), getCrmConversations(scope, BOARD_LIMIT, ids), getCrmScopeCounts(ids)])
    setCounts(cnt)
    if (busy.current > 0) return // chegou no meio de uma escrita: descarta p/ não "piscar" estado antigo
    if (conv.error) setLoadError(conv.error)
    else { setLoadError(null); setCards(conv.items ?? []) }
    setStages(st)
    if (!silent) setLoading(false)
  }, [scope, selectedKey, filter.loaded])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden && !dragId) load(true) }, 10000)
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
    <div className="flex flex-col h-[calc(100vh-10.5rem)] min-h-[420px]">
      {/* barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <InstanceFilter options={filter.options} selected={filter.selected} onChange={filter.setSelected} className="max-w-[16rem]" />
        <div className="flex gap-2">
          {(['mine', 'unassigned', 'all'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
                scope === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
            >
              {k === 'mine' ? 'Minhas' : k === 'unassigned' ? 'Pendentes' : 'Todas'}
              {counts[k] > 0 && (
                <span className={cn('ml-1.5 text-xs rounded-full px-1.5 py-0.5', scope === k ? 'bg-white/20' : k === 'unassigned' ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-600')}>{counts[k]}</span>
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
            className="pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-full w-64 focus:outline-none focus:ring-2 focus:ring-gray-300"
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
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full bg-gray-900 text-white hover:bg-gray-700"
          >
            <Plus className="w-4 h-4" /> Nova coluna
          </button>
        )}
      </div>

      {!loading && scope === 'mine' && counts.mine === 0 && counts.unassigned > 0 && (
        <div className="mb-2 flex items-center gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Você não tem conversas atribuídas, mas há <b>{counts.unassigned}</b> sem responsável.
          <button className="underline font-medium" onClick={() => setScope('unassigned')}>Ver pendentes</button>
        </div>
      )}
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
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : orderedStages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500 text-sm">
          Nenhuma coluna configurada.
          {isAdmin && <button onClick={() => setEditing({ stage: null })} className="px-3 py-1.5 rounded-full bg-gray-900 text-white">Criar primeira coluna</button>}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-2">
          {orderedStages.map((s, i) => {
            const items = grouped.get(s.id) ?? []
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
                  'w-72 shrink-0 flex flex-col rounded-xl bg-gray-50 border transition-colors',
                  overStage === s.id ? 'border-gray-900 bg-gray-100' : 'border-gray-200',
                )}
              >
                <header className="px-3 py-2.5 border-b border-gray-200" style={{ borderTop: `3px solid ${s.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                  <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900 truncate" title={s.name}>{s.name}</span>
                  <span className="text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-2">{items.length}</span>
                  {isAdmin && (
                    <div className="ml-auto relative">
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
                  <p className="mt-0.5 text-xs text-gray-500" title="Soma dos valores das conversas desta coluna">{formatCents(sumCents(items.map((c) => c.deal_cents)))}</p>
                </header>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {items.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Nenhuma conversa</p>}
                  {items.map((c) => (
                    <article
                      key={c.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setDragId(c.id) }}
                      onDragEnd={() => { setDragId(null); setOverStage(null) }}
                      className={cn('bg-white border border-gray-200 border-l-4 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing', filter.colorOf(c.instance_id).bar, dragId === c.id && 'opacity-40')}
                    >
                      <div className="flex items-start gap-3">
                        {c.contact_photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.contact_photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        ) : (
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(c.id)} text-white text-sm font-bold flex items-center justify-center shrink-0`}>
                            {(c.contact_name ?? c.remote_jid.split('@')[0]).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link href={`/crm/conversas?c=${c.id}`} className="block font-semibold text-gray-900 truncate hover:underline" title={c.contact_name ?? phoneFromJid(c.remote_jid)}>
                            {c.contact_name ?? phoneFromJid(c.remote_jid)}
                          </Link>
                          <p className="mt-0.5">
                            <span title={`WhatsApp: ${c.instance_label}`} className={cn('inline-flex max-w-full items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border', filter.colorOf(c.instance_id).chip)}>
                              <WhatsappIcon className="w-3 h-3 shrink-0" />
                              <span className="truncate">{c.instance_label}</span>
                            </span>
                          </p>
                          <ConvTags type={c.contact_type} labels={c.labels} className="mt-1" />
                          {c.next_followup && (
                            <p className={cn('inline-flex items-center gap-1 text-[11px] font-medium mt-1 px-1.5 py-0.5 rounded border', DUE_STYLE[dueState(c.next_followup.due_at)])} title={c.next_followup.note ?? 'Follow-up agendado'}>
                              <CalendarClock className="w-3 h-3" /> {formatDue(c.next_followup.due_at)}
                            </p>
                          )}
                          <p className={cn('flex items-center gap-1 text-xs mt-1', c.last_direction === 'inbound' ? 'text-gray-700 font-medium' : 'text-gray-400')}>
                            {c.last_direction === 'outbound' && <CheckCheck className="w-3.5 h-3.5 shrink-0 text-sky-500" aria-label="Última mensagem enviada por nós" />}
                            {c.last_direction === 'inbound' && <ArrowDownLeft className="w-3.5 h-3.5 shrink-0 text-emerald-600" aria-label="Última mensagem do contato (aguardando resposta)" />}
                            <span className="line-clamp-1">{c.last_body || 'Sem mensagens'}</span>
                          </p>
                        </div>
                        <div className="relative shrink-0 flex flex-col items-end gap-1">
                          <span className="text-xs text-gray-400">{timeAgo(c.last_message_at)}</span>
                          <button
                            type="button"
                            aria-label={`Mover ${c.contact_name ?? phoneFromJid(c.remote_jid)} para outra coluna`}
                            aria-haspopup="menu"
                            title="Mover para outra coluna"
                            onClick={(e) => { e.stopPropagation(); setMoveFor(moveFor === c.id ? null : c.id) }}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                          {moveFor === c.id && (
                            <div role="menu" onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                              <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-gray-400">Mover para</p>
                              {orderedStages.filter((o) => o.id !== s.id).map((o) => (
                                <button key={o.id} role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left" onClick={() => { setMoveFor(null); moveCard(c.id, o.id) }}>
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />{o.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <DealValue cents={c.deal_cents} onSave={(v) => saveValue(c.id, v)} />
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
                      </div>
                    </article>
                  ))}
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
