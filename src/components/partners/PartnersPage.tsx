'use client'

import { useState, useTransition, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createContact, updateContact, deleteContact } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { Search, Plus, Trash2, X, User2, Building2, Pencil, ChevronDown, ChevronLeft, ChevronRight, Phone, Mail, Calendar, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PartnersDashboard, PartnerStats, statsFor } from './PartnersDashboard'
import { QuoteQuickViewModal } from '@/components/quotes/QuoteQuickViewModal'

export const TYPE_LABEL: Record<string, string> = {
  architect: 'Arquiteto',
  engineer: 'Engenheiro',
  designer: 'Designer',
  electrician: 'Eletricista',
  plasterer: 'Gesseiro',
  carpenter: 'Marceneiro',
  client: 'Cliente',
  other: 'Outro',
}
const TYPE_COLOR: Record<string, string> = {
  architect: 'bg-blue-50 text-blue-700',
  engineer: 'bg-amber-50 text-amber-700',
  designer: 'bg-purple-50 text-purple-700',
  electrician: 'bg-yellow-50 text-yellow-700',
  plasterer: 'bg-pink-50 text-pink-700',
  carpenter: 'bg-orange-50 text-orange-700',
  client: 'bg-green-50 text-green-700',
  other: 'bg-gray-100 text-gray-600',
}
const TYPE_KEYS = ['architect','engineer','designer','electrician','plasterer','carpenter','client']

interface AppUser { id: string; name: string; avatar_color?: string }
interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  type: string
  company?: string
  new_prospection?: boolean
  prospection_date?: string
  created_at?: string
  created_by?: string
  assigned_to?: string
  assigned_user?: AppUser | null
  creator?: AppUser | null
  commission_rate?: number | null
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
function Avatar({ user, size = 'sm' }: { user: AppUser; size?: 'sm' | 'md' }) {
  const initials = user.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
  const sz = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
      style={{ background: user.avatar_color ?? '#6366f1' }}
      title={user.name}
    >
      {initials}
    </div>
  )
}

// ── Formulário reutilizável ───────────────────────────────────────────────────
function ContactForm({
  initial, onSave, onCancel, pending, title, users, currentUserId, isAdmin,
}: {
  initial: Partial<Contact>
  onSave: (data: Omit<Contact, 'id' | 'assigned_user' | 'creator'>) => void
  onCancel: () => void
  pending: boolean
  title: string
  users: AppUser[]
  currentUserId: string
  isAdmin?: boolean
}) {
  const [name, setName]           = useState(initial.name ?? '')
  const [phone, setPhone]         = useState(initial.phone ?? '')
  const [email, setEmail]         = useState(initial.email ?? '')
  const [type, setType]           = useState(initial.type ?? 'architect')
  const [company, setCompany]     = useState(initial.company ?? '')
  const [prospection, setProsp]   = useState(initial.new_prospection ?? false)
  const [assignedTo, setAssigned] = useState<string>(initial.assigned_to ?? currentUserId)
  const [commRate, setCommRate]   = useState(initial.commission_rate != null ? String(initial.commission_rate) : '')
  const [linkedUser, setLinkedUser] = useState<string>((initial as any).linked_user_id ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(), phone: phone || undefined, email: email || undefined,
      type, company: company || undefined, new_prospection: prospection,
      assigned_to: assignedTo,
      commission_rate: isAdmin && commRate !== '' ? parseFloat(commRate) : initial.commission_rate,
      linked_user_id: isAdmin ? (linkedUser || null) : (initial as any).linked_user_id,
    } as any)
  }

  return (
    <div className="card p-5 border-brand-200 border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Linha 1: Nome + Tipo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Arq. Mariana Silva" className="input" />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select value={type} onChange={e => setType(e.target.value)} className="select">
              {TYPE_KEYS.map(k => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
            </select>
          </div>
        </div>

        {/* Linha 2: Telefone + Email */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Telefone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(82) 99999-9999" className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" className="input" />
          </div>
        </div>

        {/* Linha 3: Empresa */}
        <div>
          <label className="label">Empresa / Escritório</label>
          <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Nome do escritório (opcional)" className="input" />
        </div>

        {/* Responsável — seletor pill igual ao de orçamentos */}
        <div>
          <label className="label">Responsável</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {users.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => setAssigned(u.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all',
                  assignedTo === u.id
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-600 border-surface-border hover:border-brand-300'
                )}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                  style={{ backgroundColor: u.avatar_color ?? '#6366f1' }}
                >
                  {u.name[0]}
                </div>
                {u.name.split(' ')[0]}
                {u.id === currentUserId && <span className="text-[10px] opacity-70">(você)</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Nova prospecção toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <button
            type="button"
            onClick={() => setProsp(p => !p)}
            className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0', prospection ? 'bg-brand-500' : 'bg-gray-200')}
          >
            <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform', prospection ? 'translate-x-4' : 'translate-x-0.5')} />
          </button>
          <span className="text-sm font-medium text-gray-700">Nova prospecção</span>
        </label>

        {/* Taxa de comissão — admin only */}
        {isAdmin && (
          <div>
            <label className="label">Taxa de comissão (%)</label>
            <div className="relative">
              <input
                type="number" min="0" max="100" step="0.1"
                value={commRate}
                onChange={e => setCommRate(e.target.value)}
                placeholder="Ex: 5"
                className="input pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Percentual de comissão sobre vendas fechadas</p>
          </div>
        )}

        {/* Vincular a colaborador (projetista) — admin only */}
        {isAdmin && (
          <div>
            <label className="label">Vincular a colaborador (projetista)</label>
            <select value={linkedUser} onChange={e => setLinkedUser(e.target.value)} className="select">
              <option value="">Nenhum (parceiro externo)</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Se este parceiro também é um colaborador, a comissão dele entra no painel do colaborador
              (1% das vendas dele + esta taxa nas vendas em que for projetista) — e deixa de aparecer aqui em Parceiros.
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={pending} className="btn-primary">Salvar contato</button>
          <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        </div>
      </form>
    </div>
  )
}

// ── Modal de visualização ─────────────────────────────────────────────────────
function ContactModal({ contact, onClose, onEdit, isAdmin }: {
  contact: Contact; onClose: () => void; onEdit: () => void; isAdmin?: boolean
}) {
  const now = new Date()
  const [viewYear, setViewYear]   = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [commData, setCommData]   = useState<any[] | null>(null)
  const [loadingComm, setLoadingComm] = useState(false)
  const [openQuotes, setOpenQuotes] = useState<any[] | null>(null)
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [quoteModal, setQuoteModal] = useState<string | null>(null)

  const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  useEffect(() => {
    if (!isAdmin || !(contact as any).commission_rate) return
    loadComm(viewYear, viewMonth)
  }, [])

  useEffect(() => {
    setLoadingQuotes(true)
    import('@/lib/actions').then(({ getContactAllQuotes }) =>
      getContactAllQuotes(contact.id, contact.name).then(data => { setOpenQuotes(data as any[]); setLoadingQuotes(false) })
    )
  }, [contact.id])

  async function loadComm(y: number, m: number) {
    setLoadingComm(true)
    const { getContactSalesTotal } = await import('@/lib/actions')
    const data = await getContactSalesTotal(contact.id, y, m)
    setCommData(data as any[])
    setLoadingComm(false)
  }

  function prevMonth() {
    const nm = viewMonth === 1 ? 12 : viewMonth - 1
    const ny = viewMonth === 1 ? viewYear - 1 : viewYear
    setViewMonth(nm); setViewYear(ny); loadComm(ny, nm)
  }
  function nextMonth() {
    const nm = viewMonth === 12 ? 1 : viewMonth + 1
    const ny = viewMonth === 12 ? viewYear + 1 : viewYear
    setViewMonth(nm); setViewYear(ny); loadComm(ny, nm)
  }

  function fmt(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function fmtCurrency(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const commRate = Number((contact as any).commission_rate ?? 0)
  const monthTotal = (commData ?? []).reduce((s, r) => s + Number(r.quote_value ?? 0), 0)
  const commTotal  = (commData ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center">
                <span className="text-base font-bold text-gray-600">
                  {contact.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">{contact.name}</h2>
                <span className={cn('inline-block badge text-xs mt-0.5', TYPE_COLOR[contact.type] ?? 'bg-gray-100 text-gray-600')}>
                  {TYPE_LABEL[contact.type] ?? contact.type}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-brand-500 transition-colors rounded-lg hover:bg-gray-50" title="Editar">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {contact.new_prospection && (
            <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
              <span className="text-amber-600 text-xs font-semibold">✦ Nova prospecção</span>
              {contact.prospection_date && (
                <span className="text-amber-500 text-xs">· registrado em {fmt(contact.prospection_date)}</span>
              )}
            </div>
          )}

          <dl className="space-y-3 text-sm">
            {contact.company && (
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">{contact.company}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a href={`tel:${contact.phone}`} className="text-brand-600 hover:text-brand-700">{contact.phone}</a>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a href={`mailto:${contact.email}`} className="text-brand-600 hover:text-brand-700">{contact.email}</a>
              </div>
            )}
            {contact.assigned_user && (
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex items-center gap-2">
                  <Avatar user={contact.assigned_user} size="sm" />
                  <span className="text-gray-700">{contact.assigned_user.name}</span>
                </div>
              </div>
            )}
            {contact.created_at && (
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-500">Cadastrado em {fmt(contact.created_at)}</span>
              </div>
            )}
          </dl>

          {/* Orçamentos vinculados a este parceiro */}
          <div className="mt-5 border-t border-surface-border pt-5">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Orçamentos do parceiro</h3>
            {loadingQuotes ? (
              <div className="text-xs text-gray-400 py-1">Carregando...</div>
            ) : openQuotes && openQuotes.length > 0 ? (
              <>
                {(() => {
                  const open = openQuotes.filter((q: any) => q.status !== 'done' && !['closed','lost'].includes(q.temperature ?? ''))
                  const closed = openQuotes.filter((q: any) => q.temperature === 'closed')
                  const openSum = open.reduce((s: number, q: any) => s + Number(q.quoted_value ?? 0), 0)
                  const closedSum = closed.reduce((s: number, q: any) => s + Number(q.final_value ?? q.quoted_value ?? 0), 0)
                  return (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-lg bg-blue-50 px-3 py-2">
                        <p className="text-[10px] font-semibold text-blue-700 uppercase">Em negociação</p>
                        <p className="text-sm font-bold text-blue-700">{openSum.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                        <p className="text-[10px] text-gray-500">{open.length} orçamento(s)</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-3 py-2">
                        <p className="text-[10px] font-semibold text-emerald-700 uppercase">Fechado</p>
                        <p className="text-sm font-bold text-emerald-700">{closedSum.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                        <p className="text-[10px] text-gray-500">{closed.length} venda(s)</p>
                      </div>
                    </div>
                  )
                })()}
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {openQuotes.map((q: any) => {
                    const isClosed = q.temperature === 'closed'
                    const isLost = q.temperature === 'lost'
                    const tag = isClosed ? { t: 'Fechada', c: 'bg-emerald-100 text-emerald-700' }
                      : isLost ? { t: 'Perdida', c: 'bg-gray-100 text-gray-500' }
                      : { t: 'Negociação', c: 'bg-blue-100 text-blue-700' }
                    const val = isClosed ? (q.final_value ?? q.quoted_value) : q.quoted_value
                    return (
                      <button key={q.id} type="button" onClick={() => setQuoteModal(q.id)}
                        className="w-full flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors text-left">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-xs font-semibold text-brand-600">#{q.number}</span>
                          <span className="text-xs text-gray-600 truncate">{q.client_name ?? '—'}</span>
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', tag.c)}>{tag.t}</span>
                        </div>
                        <span className="text-xs font-medium text-gray-700 shrink-0 ml-2">
                          {val != null ? Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">Nenhum orçamento vinculado.</p>
            )}
          </div>

          {/* Painel de comissões — admin only */}
          {isAdmin && commRate > 0 && (
            <div className="mt-5 border-t border-surface-border pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Comissões</h3>
                {/* Seletor de mês */}
                <div className="flex items-center gap-1">
                  <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-medium text-gray-600 w-20 text-center">
                    {MONTHS_SHORT[viewMonth-1]} {viewYear}
                  </span>
                  <button onClick={nextMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {loadingComm ? (
                <div className="text-xs text-gray-400 py-2">Carregando...</div>
              ) : commData && commData.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase">Total vendas</p>
                      <p className="text-base font-bold text-gray-900 mt-0.5">{fmtCurrency(monthTotal)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-amber-600 uppercase">Comissão ({commRate}%)</p>
                      <p className="text-base font-bold text-amber-700 mt-0.5">{fmtCurrency(commTotal)}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {commData.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                        <span className="text-gray-500">Orç. #{r.quote?.number ?? '—'}</span>
                        <span className="font-medium text-gray-700">{fmtCurrency(Number(r.amount ?? 0))}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400">Nenhuma comissão neste mês.</p>
              )}
            </div>
          )}

          {isAdmin && commRate === 0 && (
            <div className="mt-5 border-t border-surface-border pt-4">
              <p className="text-xs text-gray-400">Taxa de comissão não definida. Edite o parceiro para configurar.</p>
            </div>
          )}
        </div>
      </div>
      {quoteModal && <QuoteQuickViewModal quoteId={quoteModal} onClose={() => setQuoteModal(null)} />}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export function PartnersPage({
  initialContacts, users, currentUserId, isAdmin, partnerStats,
}: {
  initialContacts: any[]
  users: AppUser[]
  currentUserId: string
  isAdmin?: boolean
  partnerStats?: PartnerStats
}) {
  const toast = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [typeDropOpen, setTypeDropOpen] = useState(false)
  const [userFilter, setUserFilter] = useState<string>('all')
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingContact, setViewingContact] = useState<Contact | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Abre modal de novo parceiro se vier de ?new=1 (FAB)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNewModal(true)
      router.replace('/partners')
    }
  }, [])

  // Contadores por tipo
  const typeCounts = TYPE_KEYS.reduce((acc, k) => {
    acc[k] = contacts.filter(c => c.type === k).length
    return acc
  }, {} as Record<string, number>)

  const filtered = contacts.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search) || (c.company ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter.length === 0 || typeFilter.includes(c.type)
    const matchUser = userFilter === 'all' || c.assigned_to === userFilter
    return matchSearch && matchType && matchUser
  })

  function toggleTypeFilter(t: string) {
    setTypeFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function enrichContact(raw: any): Contact {
    return {
      ...raw,
      assigned_user: raw.assigned_to ? users.find(u => u.id === raw.assigned_to) ?? null : null,
      creator: null,
    }
  }

  function handleCreate(data: Omit<Contact, 'id' | 'assigned_user' | 'creator'>) {
    startTransition(async () => {
      const res = await createContact(data as any)
      if (res.error) { setMsg({ type: 'err', text: res.error }); toast.error('OCORREU UM ERRO', res.error); return }
      setContacts(prev => [...prev, enrichContact(res.data)].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('TUDO CERTO!', `${data.name} adicionado(a) com sucesso!`)
      setShowNewModal(false)
    })
  }

  function handleUpdate(id: string, data: Omit<Contact, 'id' | 'assigned_user' | 'creator'>) {
    startTransition(async () => {
      const res = await updateContact(id, data as any)
      if (res.error) { setMsg({ type: 'err', text: res.error }); toast.error('OCORREU UM ERRO', res.error); return }
      const enriched = enrichContact(res.data)
      setContacts(prev => prev.map(c => c.id === id ? enriched : c).sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('TUDO CERTO!', `${data.name} atualizado(a)!`)
      setEditingId(null)
      if (viewingContact?.id === id) setViewingContact(enriched)
    })
  }

  async function handleDelete(id: string, contactName: string) {
    const ok = await confirm(`Excluir "${contactName}"?`, 'Sim, excluir')
    if (!ok) return
    startTransition(async () => {
      const res = await deleteContact(id)
      if (res.error) { toast.error('OCORREU UM ERRO', res.error); return }
      toast.success('TUDO CERTO!', `${contactName} excluído(a).`)
      setContacts(prev => prev.filter(c => c.id !== id))
      if (viewingContact?.id === id) setViewingContact(null)
    })
  }

  const typeFilterLabel = typeFilter.length === 0
    ? 'Todos os tipos'
    : typeFilter.length === 1
      ? TYPE_LABEL[typeFilter[0]]
      : `${typeFilter.length} tipos`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Parceiros & Contatos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} contatos cadastrados</p>
        </div>
        <button onClick={() => { setShowNewModal(true); setEditingId(null) }} className="btn-primary">
          <Plus className="w-4 h-4" /> Novo Parceiro
        </button>
      </div>

      {/* Dashboard de parceiros */}
      <PartnersDashboard contacts={contacts} stats={partnerStats} />

      {/* Contadores por tipo */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {TYPE_KEYS.map(k => (
          <button
            key={k}
            onClick={() => toggleTypeFilter(k)}
            className={cn(
              'rounded-xl p-3 text-left border transition-all',
              typeFilter.includes(k)
                ? 'border-brand-400 bg-brand-50'
                : 'border-surface-border bg-white hover:border-gray-300'
            )}
          >
            <p className={cn('text-xl font-bold', typeFilter.includes(k) ? 'text-brand-600' : 'text-gray-800')}>
              {typeCounts[k] ?? 0}
            </p>
            <p className="text-[11px] text-gray-500 font-medium leading-tight mt-0.5">{TYPE_LABEL[k]}</p>
          </button>
        ))}
      </div>

      {/* Feedback */}
      {msg && (
        <div className={cn('px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between',
          msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
          {msg.text}
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Modal novo contato */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <ContactForm
              title="Novo Parceiro"
              initial={{ assigned_to: currentUserId }}
              onSave={handleCreate}
              onCancel={() => setShowNewModal(false)}
              pending={pending}
              users={users}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      )}

      {/* Busca + filtro tipo dropdown */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou empresa..."
            className="input pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown de tipos multi-select */}
        <div className="relative">
          <button
            onClick={() => setTypeDropOpen(o => !o)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all whitespace-nowrap',
              typeFilter.length > 0
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-surface-border bg-white text-gray-600 hover:border-gray-300'
            )}
          >
            <span>{typeFilterLabel}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {typeDropOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setTypeDropOpen(false)} />
              <div className="absolute right-0 mt-1 z-20 bg-white border border-surface-border rounded-xl shadow-xl p-2 w-48">
                {typeFilter.length > 0 && (
                  <button
                    onClick={() => setTypeFilter([])}
                    className="w-full text-left px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-50 rounded-lg mb-1 font-medium"
                  >
                    Limpar filtros
                  </button>
                )}
                {TYPE_KEYS.map(k => (
                  <label key={k} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={typeFilter.includes(k)}
                      onChange={() => toggleTypeFilter(k)}
                      className="w-3.5 h-3.5 accent-brand-500"
                    />
                    <span className="text-sm text-gray-700">{TYPE_LABEL[k]}</span>
                    <span className="ml-auto text-xs text-gray-400">{typeCounts[k] ?? 0}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {typeFilter.length > 0 && (
          <button onClick={() => setTypeFilter([])} className="text-xs text-brand-600 hover:underline whitespace-nowrap self-center">
            Limpar
          </button>
        )}

        {/* Filtro de responsável — pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setUserFilter('all')}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              userFilter === 'all' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
            )}
          >
            Todos
          </button>
          {users.map(u => (
            <button
              key={u.id}
              onClick={() => setUserFilter(userFilter === u.id ? 'all' : u.id)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                userFilter === u.id ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
              )}
            >
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                style={{ backgroundColor: u.avatar_color ?? '#6366f1' }}>
                {u.name[0]}
              </div>
              {u.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <User2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">Nenhum contato encontrado</p>
          <p className="text-xs text-gray-400 mt-1">Tente outro termo ou adicione um novo contato</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-surface">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Empresa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Telefone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Responsável</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => (
                  <>
                    <tr
                      key={c.id}
                      className={cn(
                        'border-b border-surface-border hover:bg-surface transition-colors group cursor-pointer',
                        editingId === c.id ? 'bg-surface' : '',
                        idx === filtered.length - 1 && editingId !== c.id ? 'border-0' : ''
                      )}
                      onClick={() => { if (editingId !== c.id) setViewingContact(c) }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-surface-secondary flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-gray-600">
                              {c.name.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{c.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {c.new_prospection && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                  ✦ Nova prospecção
                                </span>
                              )}
                              {(() => { const s = statsFor(c, partnerStats); return s.openValue > 0 ? (
                                <span className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                  {s.openValue.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})} em neg.
                                </span>
                              ) : null })()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-block badge text-xs', TYPE_COLOR[c.type] ?? 'bg-gray-100 text-gray-600')}>
                          {TYPE_LABEL[c.type] ?? c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.company ? (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Building2 className="w-3 h-3 shrink-0" />
                            <span>{c.company}</span>
                          </div>
                        ) : <span className="text-sm text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {c.phone
                          ? <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} className="text-sm text-brand-600 hover:text-brand-700 transition-colors">{c.phone}</a>
                          : <span className="text-sm text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {c.assigned_user ? (
                          <div className="flex items-center gap-2">
                            <Avatar user={c.assigned_user} size="sm" />
                            <span className="text-xs text-gray-600">{c.assigned_user.name.split(' ')[0]}</span>
                          </div>
                        ) : <span className="text-sm text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => { setEditingId(editingId === c.id ? null : c.id); setShowNewModal(false) }}
                            className="text-gray-300 hover:text-brand-500 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id, c.name)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {editingId === c.id && (
                      <tr key={`edit-${c.id}`} className={cn('border-b border-surface-border', idx === filtered.length - 1 ? 'border-0' : '')}>
                        <td colSpan={6} className="px-4 py-3">
                          <ContactForm
                            title="Editar contato"
                            initial={c}
                            onSave={(data) => handleUpdate(c.id, data)}
                            onCancel={() => setEditingId(null)}
                            pending={pending}
                            users={users}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de visualização */}
      {viewingContact && (
        <ContactModal
          contact={viewingContact}
          onClose={() => setViewingContact(null)}
          onEdit={() => { setEditingId(viewingContact.id); setViewingContact(null) }}
          isAdmin={isAdmin}
        />
      )}

      {ConfirmDialog}
    </div>
  )
}
