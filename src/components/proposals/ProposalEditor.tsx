'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, Copy, ImageOff, Loader2, Minus, PenLine, Plus, Printer, Trash2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { searchContacts } from '@/lib/actions'
import { duplicateProposal, saveProposal, type Proposal, type ProposalInput } from '@/lib/proposals/actions'
import {
  brl, genericName, itemTotal, proposalCode, proposalTotals, roomTotal, sourceLabel,
  type ProposalItem, type ProposalRoom,
} from '@/lib/proposals/calc'
import { ProductSearchModal } from './ProductSearchModal'
import { PrintOptionsModal } from './PrintOptionsModal'

const ROOM_SUGGESTIONS = ['Sala de estar', 'Sala de jantar', 'Cozinha', 'Quarto', 'Suíte', 'Banheiro', 'Varanda', 'Área gourmet', 'Área externa', 'Hall', 'Escritório', 'Lavabo']
const PAYMENT_SUGGESTIONS = ['À vista no PIX', 'Cartão de crédito em até 10x sem juros', '50% de entrada e 50% na entrega', 'Boleto 30/60/90 dias']

const uid = () => crypto.randomUUID()

// "1.234,56" / "1234.56" / "R$ 10" → número
function parseMoney(s: string): number {
  const t = s.replace(/[^\d,.-]/g, '')
  if (!t) return 0
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
const fmtNum = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Campo de valor: deixa digitar livre e formata ao sair.
function MoneyInput({ value, onChange, className, placeholder }: { value: number; onChange: (n: number) => void; className?: string; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input inputMode="decimal" className={className} placeholder={placeholder}
      value={text ?? (value ? fmtNum(value) : '')}
      onFocus={e => { setText(value ? fmtNum(value) : ''); requestAnimationFrame(() => e.target.select()) }}
      onChange={e => { setText(e.target.value); onChange(parseMoney(e.target.value)) }}
      onBlur={() => setText(null)} />
  )
}

type ContactHit = { id: string; name: string; type: string | null; company: string | null }

// Nome livre com sugestões dos contatos cadastrados (cliente ou arquiteto).
function ContactField({ label, value, onChange, type, excludeType, placeholder }: {
  label: string; value: string; onChange: (name: string, id: string | null) => void
  type?: string; excludeType?: string; placeholder?: string
}) {
  const [hits, setHits] = useState<ContactHit[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  function search(q: string) {
    clearTimeout(timer.current)
    if (q.trim().length < 2) { setHits([]); return }
    timer.current = setTimeout(async () => setHits((await searchContacts(q.trim(), type, excludeType)) as ContactHit[]), 250)
  }
  return (
    <div className="relative">
      <label className="label">{label}</label>
      <input className="input" value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value, null); search(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-surface-border bg-white shadow-lg py-1 max-h-60 overflow-y-auto">
          {hits.map(h => (
            <button key={h.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-secondary"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(h.name, h.id); setOpen(false); setHits([]) }}>
              {h.name}{h.company && <span className="text-gray-400"> · {h.company}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, first, last, onChange, onRemove, onMove }: {
  item: ProposalItem; first: boolean; last: boolean
  onChange: (patch: Partial<ProposalItem>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void
}) {
  const brand = sourceLabel(item.source)
  const manual = !item.catalog_id
  return (
    <div className="group flex flex-wrap sm:flex-nowrap items-center gap-3 py-3 border-b border-surface-border last:border-0">
      <div className="w-16 h-16 shrink-0 rounded-lg border border-surface-border bg-white flex items-center justify-center overflow-hidden">
        {item.image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.image_url} alt="" className="max-w-full max-h-full object-contain" loading="lazy" />
          : <ImageOff className="w-5 h-5 text-gray-300" />}
      </div>
      <div className="flex-1 min-w-[180px]">
        {manual
          ? <input className="w-full text-sm font-medium text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:border-brand-500 outline-none py-0.5"
              value={item.name} placeholder="Descrição do produto" onChange={e => onChange({ name: e.target.value })} />
          : <p className="text-sm font-medium text-gray-900 leading-snug">{item.name}</p>}
        <p className="text-xs text-gray-500 mt-0.5">
          {[item.ref && `Ref. ${item.ref}`, brand].filter(Boolean).join(' · ') || (manual ? 'Item avulso' : '')}
        </p>
        {!manual && (
          <label className="mt-1 flex items-center gap-1.5 text-xs" title="Como o produto aparece no PDF quando a opção “Nome genérico” está ligada">
            <span className="shrink-0 text-gray-400">No PDF:</span>
            <input className="flex-1 min-w-0 font-medium text-navy bg-transparent border-b border-dashed border-gray-200 focus:border-brand-500 outline-none placeholder:text-navy/70"
              value={item.label ?? ''} placeholder={genericName(item.name)} onChange={e => onChange({ label: e.target.value })} />
          </label>
        )}
        <input className="mt-1 w-full text-xs text-gray-600 bg-transparent outline-none placeholder:text-gray-300 focus:placeholder:text-gray-400"
          value={item.note ?? ''} placeholder="+ observação (acabamento, cor, temperatura…)" onChange={e => onChange({ note: e.target.value })} />
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center rounded-pill border border-surface-border bg-white">
          <button type="button" className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={item.qty <= 1}
            onClick={() => onChange({ qty: Math.max(1, item.qty - 1) })}><Minus className="w-3.5 h-3.5" /></button>
          <input inputMode="numeric" className="w-10 text-center text-sm tabular-nums outline-none bg-transparent" value={item.qty || ''}
            onChange={e => onChange({ qty: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0)) })}
            onBlur={() => !item.qty && onChange({ qty: 1 })} />
          <button type="button" className="p-1.5 text-gray-400 hover:text-gray-700" onClick={() => onChange({ qty: item.qty + 1 })}><Plus className="w-3.5 h-3.5" /></button>
        </div>
        <div className="w-28">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
            <MoneyInput value={item.unit_price} onChange={n => onChange({ unit_price: n })} placeholder="0,00"
              className={cn('w-full pl-8 pr-2 py-1.5 text-sm text-right tabular-nums rounded-pill border bg-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
                item.unit_price ? 'border-surface-border' : 'border-amber-300')} />
          </div>
          <p className="text-[10px] text-gray-400 text-right mt-0.5 pr-1">unitário</p>
        </div>
        <div className="w-24 text-right">
          <p className="text-sm font-semibold text-gray-900 tabular-nums">{brl(itemTotal(item))}</p>
        </div>
        <div className="flex flex-col opacity-40 group-hover:opacity-100 transition-opacity">
          <button type="button" title="Subir" disabled={first} onClick={() => onMove(-1)} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:invisible"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button type="button" title="Descer" disabled={last} onClick={() => onMove(1)} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:invisible"><ArrowDown className="w-3.5 h-3.5" /></button>
        </div>
        <button type="button" title="Remover item" onClick={onRemove} className="p-1.5 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d
  if (j < 0 || j >= arr.length) return arr
  const next = arr.slice(); [next[i], next[j]] = [next[j], next[i]]; return next
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

export function ProposalEditor({ initial }: { initial: Proposal }) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [p, setP] = useState<ProposalInput>(() => ({
    client_name: initial.client_name, client_contact_id: initial.client_contact_id,
    architect_name: initial.architect_name ?? '', architect_contact_id: initial.architect_contact_id,
    proposal_date: initial.proposal_date, valid_days: initial.valid_days, payment_terms: initial.payment_terms ?? '',
    discount_type: initial.discount_type, discount_value: initial.discount_value, notes: initial.notes ?? '',
    rooms: initial.rooms, print_options: initial.print_options,
  }))
  const [save, setSave] = useState<SaveState>('saved')
  const [searchRoom, setSearchRoom] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [newRoom, setNewRoom] = useState<string | null>(null)
  const [editingRoom, setEditingRoom] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  const totals = useMemo(() => proposalTotals(p.rooms, p.discount_type, p.discount_value), [p.rooms, p.discount_type, p.discount_value])
  const itemCount = p.rooms.reduce((n, r) => n + r.items.length, 0)

  // Salva sozinho 1s depois da última mudança (compara com o último estado salvo).
  const latest = useRef(p)
  latest.current = p
  const savedJson = useRef(JSON.stringify(p))
  const toastRef = useRef(toast)
  toastRef.current = toast
  const inflight = useRef<Promise<boolean> | null>(null)
  const flush = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current
    const snapshot = latest.current
    const json = JSON.stringify(snapshot)
    if (json === savedJson.current) { setSave('saved'); return true }
    setSave('saving')
    const run = saveProposal(initial.id, snapshot).then(r => {
      if ('error' in r) { setSave('error'); toastRef.current.error('Não deu para salvar', r.error); return false }
      savedJson.current = json
      setSave(JSON.stringify(latest.current) === json ? 'saved' : 'dirty')
      return true
    })
    inflight.current = run
    const ok = await run
    inflight.current = null
    return ok
  }, [initial.id])
  useEffect(() => {
    if (JSON.stringify(p) === savedJson.current) return
    setSave('dirty')
    const t = setTimeout(flush, 1000)
    return () => clearTimeout(t)
  }, [p, flush])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === 'dirty' || save === 'saving') e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [save])

  const set = (patch: Partial<ProposalInput>) => setP(cur => ({ ...cur, ...patch }))
  const setRooms = (fn: (rooms: ProposalRoom[]) => ProposalRoom[]) => setP(cur => ({ ...cur, rooms: fn(cur.rooms) }))
  const updateRoom = (roomId: string, fn: (r: ProposalRoom) => ProposalRoom) => setRooms(rs => rs.map(r => (r.id === roomId ? fn(r) : r)))

  function addRoom(name: string) {
    const n = name.trim()
    if (!n) return
    setRooms(rs => [...rs, { id: uid(), name: n, items: [] }])
    setNewRoom(null)
  }
  async function removeRoom(room: ProposalRoom) {
    if (room.items.length && !(await confirm(`Excluir o ambiente “${room.name}” e os ${room.items.length} produtos dele?`, 'Excluir'))) return
    setRooms(rs => rs.filter(r => r.id !== room.id))
  }
  function addItems(roomId: string, items: ProposalItem[]) {
    updateRoom(roomId, r => ({ ...r, items: [...r.items, ...items] }))
  }

  async function duplicate() {
    setDuplicating(true)
    await flush()
    const r = await duplicateProposal(initial.id)
    setDuplicating(false)
    if ('error' in r) { toast.error('Não deu para duplicar', r.error); return }
    router.push(`/propostas/${r.id}`)
  }

  const missingPrice = p.rooms.some(r => r.items.some(i => !i.unit_price))

  return (
    <div className="space-y-5 pb-16">
      {ConfirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/propostas" className="p-2 rounded-full hover:bg-white text-gray-500"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Orçamento {proposalCode(initial.number)}</h1>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              {save === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> Salvando…</>}
              {save === 'dirty' && 'Alterações não salvas'}
              {save === 'saved' && <><Check className="w-3 h-3 text-emerald-600" /> Salvo</>}
              {save === 'error' && <span className="text-red-600">Erro ao salvar — <button className="underline" onClick={flush}>tentar de novo</button></span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={duplicate} disabled={duplicating}>
            {duplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />} Duplicar
          </button>
          <button className="btn-primary" onClick={() => setPrintOpen(true)}><Printer className="w-4 h-4" /> Imprimir PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* Dados do orçamento */}
          <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ContactField label="Cliente" value={p.client_name} placeholder="Nome do cliente" excludeType="architect"
              onChange={(name, id) => set({ client_name: name, client_contact_id: id })} />
            <ContactField label="Arquiteto(a)" value={p.architect_name ?? ''} placeholder="Opcional" type="architect"
              onChange={(name, id) => set({ architect_name: name, architect_contact_id: id })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Data</label>
                <input type="date" className="input" value={p.proposal_date} onChange={e => e.target.value && set({ proposal_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Validade (dias)</label>
                <input inputMode="numeric" className="input" placeholder="ex.: 10" value={p.valid_days ?? ''}
                  onChange={e => set({ valid_days: Number(e.target.value.replace(/\D/g, '')) || null })} />
              </div>
            </div>
            <div className="sm:row-span-2">
              <label className="label">Condições de pagamento</label>
              <textarea className="input !rounded-2xl min-h-[76px] resize-y" value={p.payment_terms ?? ''}
                placeholder="ex.: À vista no PIX ou em até 10x no cartão" onChange={e => set({ payment_terms: e.target.value })} />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PAYMENT_SUGGESTIONS.map(s => (
                  <button key={s} type="button" className="text-[11px] px-2 py-0.5 rounded-full border border-surface-border text-gray-500 hover:text-gray-800 hover:bg-white"
                    onClick={() => set({ payment_terms: p.payment_terms ? `${p.payment_terms.replace(/\s+$/, '')}\n${s}` : s })}>+ {s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Ambientes */}
          {p.rooms.map((room, ri) => (
            <div key={room.id} className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                {editingRoom === room.id ? (
                  <input autoFocus className="text-base font-semibold text-gray-900 bg-transparent border-b border-brand-500 outline-none flex-1"
                    defaultValue={room.name}
                    onBlur={e => { const n = e.target.value.trim(); if (n) updateRoom(room.id, r => ({ ...r, name: n })); setEditingRoom(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRoom(null) }} />
                ) : (
                  <button type="button" className="group flex items-center gap-2 text-base font-semibold text-gray-900" onClick={() => setEditingRoom(room.id)}>
                    {room.name} <PenLine className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500" />
                  </button>
                )}
                <span className="text-xs text-gray-400">{room.items.length} {room.items.length === 1 ? 'item' : 'itens'}</span>
                <div className="ml-auto flex items-center gap-0.5">
                  <button type="button" title="Subir ambiente" disabled={ri === 0} onClick={() => setRooms(rs => move(rs, ri, -1))} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button type="button" title="Descer ambiente" disabled={ri === p.rooms.length - 1} onClick={() => setRooms(rs => move(rs, ri, 1))} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  <button type="button" title="Excluir ambiente" onClick={() => removeRoom(room)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              {room.items.length === 0 && <p className="text-sm text-gray-400 py-4">Nenhum produto neste ambiente ainda.</p>}
              <div>
                {room.items.map((item, ii) => (
                  <ItemRow key={item.id} item={item} first={ii === 0} last={ii === room.items.length - 1}
                    onChange={patch => updateRoom(room.id, r => ({ ...r, items: r.items.map(i => (i.id === item.id ? { ...i, ...patch } : i)) }))}
                    onRemove={() => updateRoom(room.id, r => ({ ...r, items: r.items.filter(i => i.id !== item.id) }))}
                    onMove={d => updateRoom(room.id, r => ({ ...r, items: move(r.items, ii, d) }))} />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 mt-1 border-t border-surface-border">
                <button type="button" className="btn-secondary !py-1.5" onClick={() => setSearchRoom(room.id)}><Plus className="w-4 h-4" /> Adicionar produto</button>
                <button type="button" className="btn-ghost" onClick={() => addItems(room.id, [{ id: uid(), catalog_id: null, source: null, ref: null, name: '', image_url: null, qty: 1, unit_price: 0 }])}>
                  <Plus className="w-4 h-4" /> Item avulso
                </button>
                <p className="ml-auto text-sm text-gray-500">Total do ambiente <span className="ml-2 text-base font-semibold text-gray-900 tabular-nums">{brl(roomTotal(room))}</span></p>
              </div>
            </div>
          ))}

          {newRoom === null ? (
            <button type="button" onClick={() => setNewRoom('')}
              className="w-full rounded-card border-2 border-dashed border-surface-border py-4 text-sm font-medium text-gray-500 hover:text-gray-800 hover:border-gray-300 flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Novo ambiente
            </button>
          ) : (
            <div className="card p-4 space-y-3">
              <div className="flex gap-2">
                <input autoFocus className="input" placeholder="Nome do ambiente" value={newRoom} onChange={e => setNewRoom(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addRoom(newRoom); if (e.key === 'Escape') setNewRoom(null) }} />
                <button className="btn-primary" onClick={() => addRoom(newRoom)} disabled={!newRoom.trim()}>Adicionar</button>
                <button className="btn-ghost" onClick={() => setNewRoom(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ROOM_SUGGESTIONS.filter(s => !p.rooms.some(r => r.name === s)).map(s => (
                  <button key={s} type="button" onClick={() => addRoom(s)} className="text-xs px-2.5 py-1 rounded-full border border-surface-border text-gray-600 hover:bg-surface-secondary">{s}</button>
                ))}
              </div>
            </div>
          )}

          <div className="card p-5">
            <label className="label">Observações (saem no PDF)</label>
            <textarea className="input !rounded-2xl min-h-[80px] resize-y" value={p.notes ?? ''}
              placeholder="ex.: Prazo de entrega de 20 dias úteis. Lâmpadas não inclusas." onChange={e => set({ notes: e.target.value })} />
          </div>
        </div>

        {/* Resumo */}
        <div className="card p-5 lg:sticky lg:top-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Resumo</h2>
          <div className="space-y-1.5 text-sm">
            {p.rooms.map(r => (
              <div key={r.id} className="flex justify-between gap-3 text-gray-600">
                <span className="truncate">{r.name}</span><span className="tabular-nums shrink-0">{brl(roomTotal(r))}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 pt-2 border-t border-surface-border font-medium text-gray-800">
              <span>Subtotal</span><span className="tabular-nums">{brl(totals.subtotal)}</span>
            </div>
          </div>

          <div>
            <label className="label">Desconto</label>
            <div className="flex gap-2">
              <div className="flex rounded-pill border border-surface-border bg-white p-0.5 text-sm shrink-0">
                {(['percent', 'value'] as const).map(t => (
                  <button key={t} type="button" onClick={() => set({ discount_type: t })}
                    className={cn('px-3 py-1 rounded-pill', p.discount_type === t ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-800')}>
                    {t === 'percent' ? '%' : 'R$'}
                  </button>
                ))}
              </div>
              <MoneyInput value={p.discount_value} onChange={n => set({ discount_value: n })} placeholder="0" className="input text-right tabular-nums" />
            </div>
            {totals.discount > 0 && (
              <p className="text-xs text-gray-500 mt-1 text-right">
                − {brl(totals.discount)}{p.discount_type === 'value' && ` (${(totals.discountPct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
              </p>
            )}
          </div>

          <div className="flex items-baseline justify-between pt-3 border-t border-surface-border">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-2xl font-semibold text-gray-900 tabular-nums">{brl(totals.total)}</span>
          </div>
          <p className="text-xs text-gray-400">{itemCount} {itemCount === 1 ? 'produto' : 'produtos'} em {p.rooms.length} {p.rooms.length === 1 ? 'ambiente' : 'ambientes'}</p>
          {missingPrice && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">Há produtos sem preço (campo em amarelo).</p>}
          <button className="btn-primary w-full justify-center" onClick={() => setPrintOpen(true)}><Printer className="w-4 h-4" /> Imprimir PDF</button>
        </div>
      </div>

      {searchRoom && (
        <ProductSearchModal roomName={p.rooms.find(r => r.id === searchRoom)?.name ?? ''}
          onAdd={item => addItems(searchRoom, [{ ...item, id: uid() }])} onClose={() => setSearchRoom(null)} />
      )}
      {printOpen && (
        <PrintOptionsModal options={p.print_options} onClose={() => setPrintOpen(false)}
          onPrint={async options => {
            set({ print_options: options })
            latest.current = { ...latest.current, print_options: options }
            const w = window.open('about:blank', '_blank')
            await flush()
            const on = Object.entries(options).filter(([, v]) => v).map(([k]) => k).join(',')
            const url = `/propostas-imprimir/${initial.id}?o=${on}&auto=1`
            if (w) w.location.href = url
            else window.location.href = url
            setPrintOpen(false)
          }} />
      )}
    </div>
  )
}
