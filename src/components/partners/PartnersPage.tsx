'use client'

import { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { deleteContact } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { Search, Plus, Trash2, X, User2, Pencil, Users, ArrowDownUp, Phone, Mail, Building2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { ToolbarMenu, ToolbarMenuItem } from '@/components/crm/ToolbarMenu'
import { PartnersDashboard, type PartnerStats, statsFor } from './PartnersDashboard'
import { PartnerFormModal } from './PartnerFormModal'
import { PartnerViewModal } from './PartnerViewModal'
import { createPartner, updatePartner } from './partner-save'
import { TYPE_COLOR, TYPE_KEYS, TYPE_LABEL, initials, type AppUser, type Contact } from './partner-types'

export { TYPE_LABEL }

type Sort = 'name' | 'open'

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
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [userFilter, setUserFilter] = useState<string>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [form, setForm] = useState<{ mode: 'new' } | { mode: 'edit'; contact: Contact } | null>(null)
  const [viewing, setViewing] = useState<Contact | null>(null)

  // ?new=1 (atalho do botão "+") abre o cadastro
  useEffect(() => {
    if (searchParams.get('new') === '1') { setForm({ mode: 'new' }); router.replace('/partners') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const enrich = (raw: any): Contact => ({ ...raw, assigned_user: raw.assigned_to ? users.find((u) => u.id === raw.assigned_to) ?? null : null, creator: null })

  const typeCounts = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const c of contacts) acc[c.type] = (acc[c.type] ?? 0) + 1
    return acc
  }, [contacts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    const list = contacts.filter((c) => {
      const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || (qDigits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(qDigits))
      return matchSearch && (typeFilter.length === 0 || typeFilter.includes(c.type)) && (userFilter === 'all' || c.assigned_to === userFilter)
    })
    if (sort === 'open') list.sort((a, b) => statsFor(b, partnerStats).openValue - statsFor(a, partnerStats).openValue || a.name.localeCompare(b.name))
    else list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [contacts, search, typeFilter, userFilter, sort, partnerStats])

  const hasFilters = !!search || typeFilter.length > 0 || userFilter !== 'all'
  const clearFilters = () => { setSearch(''); setTypeFilter([]); setUserFilter('all') }
  const toggleType = (t: string) => setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  async function handleSave(v: Parameters<typeof createPartner>[0]) {
    const edit = form?.mode === 'edit' ? form.contact : null
    const r = edit ? await updatePartner(edit.id, v) : await createPartner(v)
    if ('error' in r) { toast.error('OCORREU UM ERRO', r.error); return { error: r.error } }
    const enriched = enrich(r.contact)
    setContacts((prev) => (edit ? prev.map((c) => (c.id === edit.id ? enriched : c)) : [...prev, enriched]))
    if (viewing?.id === enriched.id) setViewing(enriched)
    toast.success('TUDO CERTO!', `${v.name} ${edit ? 'atualizado(a)' : 'adicionado(a)'}!`)
    if (r.warning) toast.error('ATENÇÃO', r.warning)
    setForm(null)
  }

  async function handleDelete(c: Contact) {
    const ok = await confirm(`Excluir "${c.name}"?`, 'Sim, excluir')
    if (!ok) return
    const res = await deleteContact(c.id)
    if ('error' in res && res.error) { toast.error('OCORREU UM ERRO', res.error); return }
    toast.success('TUDO CERTO!', `${c.name} excluído(a).`)
    setContacts((prev) => prev.filter((x) => x.id !== c.id))
    if (viewing?.id === c.id) setViewing(null)
  }

  const userLabel = userFilter === 'all' ? 'Responsável' : users.find((u) => u.id === userFilter)?.name.split(' ')[0] ?? 'Responsável'

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Parceiros & contatos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} cadastrados{hasFilters && <> · {filtered.length} na busca</>}</p>
        </div>
        <button onClick={() => setForm({ mode: 'new' })} className="btn-primary shrink-0"><Plus className="w-4 h-4" /> Novo parceiro</button>
      </div>

      <PartnersDashboard contacts={contacts} stats={partnerStats} />

      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, e-mail ou empresa…" aria-label="Buscar parceiros" className="input pl-10 pr-9" />
            {search && <button onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ToolbarMenu
              icon={<Users className="w-3.5 h-3.5 text-gray-500" />} label={userLabel} tone={userFilter !== 'all' ? 'active' : 'default'}
              onClear={userFilter !== 'all' ? () => setUserFilter('all') : undefined} clearLabel="Limpar responsável" ariaLabel="Filtrar por responsável" align="right" width="w-56"
            >
              {(close) => (
                <>
                  <ToolbarMenuItem selected={userFilter === 'all'} onClick={() => { setUserFilter('all'); close() }}>Todos os responsáveis</ToolbarMenuItem>
                  {users.map((u) => (
                    <ToolbarMenuItem key={u.id} selected={userFilter === u.id} onClick={() => { setUserFilter(u.id); close() }}
                      lead={<span className="w-5 h-5 rounded-full text-white text-[9px] font-bold inline-flex items-center justify-center" style={{ background: u.avatar_color ?? '#6366f1' }}>{u.name[0]}</span>}>
                      {u.name}
                    </ToolbarMenuItem>
                  ))}
                </>
              )}
            </ToolbarMenu>
            <ToolbarMenu icon={<ArrowDownUp className="w-3.5 h-3.5 text-gray-500" />} label={sort === 'name' ? 'Ordem alfabética' : 'Maior negociação'} ariaLabel="Ordenar" align="right" width="w-52">
              {(close) => (
                <>
                  <ToolbarMenuItem selected={sort === 'name'} onClick={() => { setSort('name'); close() }}>Ordem alfabética</ToolbarMenuItem>
                  <ToolbarMenuItem selected={sort === 'open'} onClick={() => { setSort('open'); close() }}>Maior negociação</ToolbarMenuItem>
                </>
              )}
            </ToolbarMenu>
            {hasFilters && <button onClick={clearFilters} className="text-xs text-brand-600 hover:underline px-1">Limpar filtros</button>}
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Filtrar por tipo">
          <button onClick={() => setTypeFilter([])} aria-pressed={typeFilter.length === 0}
            className={cn('shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors', typeFilter.length === 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-surface-border hover:border-gray-300')}>
            Todos <span className={cn('text-xs', typeFilter.length === 0 ? 'text-white/70' : 'text-gray-400')}>{contacts.length}</span>
          </button>
          {TYPE_KEYS.map((k) => (
            <button key={k} onClick={() => toggleType(k)} aria-pressed={typeFilter.includes(k)}
              className={cn('shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors', typeFilter.includes(k) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-surface-border hover:border-gray-300')}>
              {TYPE_LABEL[k]} <span className={cn('text-xs', typeFilter.includes(k) ? 'text-white/70' : 'text-gray-400')}>{typeCounts[k] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <User2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">Nenhum parceiro encontrado</p>
          <p className="text-xs text-gray-400 mt-1">{hasFilters ? 'Tente outro termo ou limpe os filtros.' : 'Cadastre o primeiro parceiro.'}</p>
          {hasFilters && <button onClick={clearFilters} className="btn-secondary mt-4">Limpar filtros</button>}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-surface-border bg-surface text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Parceiro</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Contato</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Responsável</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 text-right">Em negociação</th>
                  <th className="px-4 py-3 w-24"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const s = statsFor(c, partnerStats)
                  return (
                    <tr key={c.id} onClick={() => setViewing(c)} className="border-b last:border-0 border-surface-border hover:bg-surface transition-colors group cursor-pointer">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center shrink-0 text-xs font-semibold text-gray-600">{initials(c.name)}</div>
                          <div className="min-w-0">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setViewing(c) }} className="block text-sm font-semibold text-gray-900 truncate max-w-[260px] text-left hover:text-brand-600">{c.name}</button>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span className={cn('badge text-[11px] !py-0', TYPE_COLOR[c.type] ?? 'bg-gray-100 text-gray-600')}>{TYPE_LABEL[c.type] ?? c.type}</span>
                              {c.new_prospection && <span className="badge text-[11px] !py-0 bg-amber-50 text-amber-700">✦ Nova prospecção</span>}
                              {c.company && <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 truncate max-w-[160px]"><Building2 className="w-3 h-3 shrink-0" />{c.company}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {c.phone || c.email ? (
                          <div className="space-y-0.5 min-w-0">
                            {c.phone && <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-gray-700 hover:text-brand-600"><Phone className="w-3 h-3 text-gray-400 shrink-0" />{c.phone}</a>}
                            {c.email && <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-gray-500 hover:text-brand-600 truncate max-w-[220px]"><Mail className="w-3 h-3 text-gray-400 shrink-0" /><span className="truncate">{c.email}</span></a>}
                          </div>
                        ) : <span className="badge bg-gray-100 text-gray-500 text-[11px]">Sem contato</span>}
                      </td>
                      <td className="px-4 py-3">
                        {c.assigned_user ? (
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full text-white text-[10px] font-semibold inline-flex items-center justify-center shrink-0" style={{ background: c.assigned_user.avatar_color ?? '#6366f1' }}>{c.assigned_user.name[0]}</span>
                            <span className="text-sm text-gray-600">{c.assigned_user.name.split(' ')[0]}</span>
                          </div>
                        ) : <span className="text-sm text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.openValue > 0 ? (
                          <div><p className="text-sm font-bold text-blue-700">{formatCurrency(s.openValue)}</p><p className="text-[11px] text-gray-400">{s.openCount} orçamento{s.openCount !== 1 ? 's' : ''}</p></div>
                        ) : <span className="text-sm text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setForm({ mode: 'edit', contact: c })} aria-label={`Editar ${c.name}`} title="Editar" className="p-1.5 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-white"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(c)} aria-label={`Excluir ${c.name}`} title="Excluir" className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-white"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewing && (
        <PartnerViewModal
          contact={viewing}
          isAdmin={isAdmin}
          stats={statsFor(viewing, partnerStats)}
          onClose={() => setViewing(null)}
          onEdit={() => { setForm({ mode: 'edit', contact: viewing }); setViewing(null) }}
          onDelete={() => handleDelete(viewing)}
        />
      )}

      {form && (
        <PartnerFormModal
          title={form.mode === 'new' ? 'Novo parceiro' : 'Editar parceiro'}
          subtitle={form.mode === 'edit' ? form.contact.name : undefined}
          initial={form.mode === 'edit'
            ? { ...form.contact, phone: form.contact.phone ?? '', email: form.contact.email ?? '', company: form.contact.company ?? '', assigned_to: form.contact.assigned_to ?? currentUserId, linked_user_id: form.contact.linked_user_id ?? '' }
            : { assigned_to: currentUserId }}
          users={users}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          submitLabel={form.mode === 'new' ? 'Cadastrar parceiro' : 'Salvar alterações'}
          onSave={handleSave}
          onClose={() => setForm(null)}
        />
      )}

      {ConfirmDialog}
    </div>
  )
}
