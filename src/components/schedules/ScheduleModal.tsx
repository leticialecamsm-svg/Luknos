'use client'

import { useState, useEffect, useRef } from 'react'
import { createSchedule, updateSchedule, searchContacts, getQuotesList, getActiveUsers } from '@/lib/actions'
import { X, Search, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'

const TYPE_OPTIONS = [
  { value: 'visita', label: 'Visita' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'follow_up', label: 'Follow-up' },
] as const

interface ScheduleModalProps {
  schedule?: any           // se presente → modo edição
  defaultDate?: string     // data pré-preenchida (criação inline a partir de um dia)
  defaultQuote?: { id: string; label: string }  // pré-vincular orçamento (a partir da página de orçamento)
  onClose: () => void
  onSuccess: (saved?: any) => void
}

export function ScheduleModal({ schedule, defaultDate, defaultQuote, onClose, onSuccess }: ScheduleModalProps) {
  const toast = useToast()
  const isEdit = !!schedule
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState(schedule?.title ?? '')
  const [type, setType] = useState<string>(schedule?.type ?? 'reuniao')
  const [date, setDate] = useState(schedule?.scheduled_date ?? defaultDate ?? new Date().toISOString().split('T')[0])
  const [time, setTime] = useState(schedule?.scheduled_time ?? '')
  const [location, setLocation] = useState(schedule?.location ?? '')
  const [members, setMembers] = useState<string[]>(schedule?.team_members ?? [])

  const [users, setUsers] = useState<any[]>([])

  // Parceiro (typeahead)
  const [partnerId, setPartnerId] = useState<string | null>(schedule?.partner_id ?? null)
  const [partnerLabel, setPartnerLabel] = useState<string>(schedule?.partner_name ?? '')
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerResults, setPartnerResults] = useState<any[]>([])
  const [partnerOpen, setPartnerOpen] = useState(false)
  const partnerRef = useRef<HTMLDivElement>(null)

  // Orçamento (typeahead)
  const [quotes, setQuotes] = useState<any[]>([])
  const [quoteId, setQuoteId] = useState<string | null>(schedule?.quote_id ?? defaultQuote?.id ?? null)
  const [quoteLabel, setQuoteLabel] = useState<string>(
    schedule?.quote ? `#${schedule.quote.number} · ${schedule.quote.client_name}` : (defaultQuote?.label ?? '')
  )
  const [quoteQuery, setQuoteQuery] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const quoteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getActiveUsers().then(u => setUsers(u as any[]))
    getQuotesList().then(q => setQuotes(q as any[]))
  }, [])

  // Busca de parceiros
  useEffect(() => {
    if (partnerQuery.length < 2) { setPartnerResults([]); return }
    let active = true
    searchContacts(partnerQuery).then(r => { if (active) setPartnerResults(r as any[]) })
    return () => { active = false }
  }, [partnerQuery])

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (partnerRef.current && !partnerRef.current.contains(e.target as Node)) setPartnerOpen(false)
      if (quoteRef.current && !quoteRef.current.contains(e.target as Node)) setQuoteOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const filteredQuotes = quoteQuery.length < 1
    ? quotes.slice(0, 8)
    : quotes.filter(q =>
        String(q.number).includes(quoteQuery) ||
        (q.client_name ?? '').toLowerCase().includes(quoteQuery.toLowerCase())
      ).slice(0, 10)

  function toggleMember(id: string) {
    setMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Informe o nome do agendamento'); return }
    if (!date) { setError('Informe a data'); return }
    setError('')
    setSaving(true)

    const payload = {
      title: title.trim(),
      type: type as any,
      quote_id: quoteId,
      partner_id: partnerId,
      scheduled_date: date,
      scheduled_time: time || null,
      location: location || null,
      team_members: members,
    }

    const res = isEdit
      ? await updateSchedule(schedule.id, payload)
      : await createSchedule(payload)

    setSaving(false)
    if (res.error) {
      setError(res.error)
      toast.error('OCORREU UM ERRO', res.error)
      return
    }
    toast.success('TUDO CERTO!', isEdit ? 'Agendamento atualizado.' : 'Agendamento criado.')
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-surface-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Editar agendamento' : 'Novo agendamento'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          {/* Nome */}
          <div>
            <label className="label">Nome do agendamento <span className="text-red-400">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="Ex: Visita técnica ao cliente" className="input mt-1" required />
          </div>

          {/* Data + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data <span className="text-red-400">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input mt-1" required />
            </div>
            <div>
              <label className="label">Horário</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="input mt-1" />
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="label">Tipo</label>
            <div className="flex gap-2 mt-1">
              {TYPE_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setType(opt.value)}
                  className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                    type === opt.value ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-surface-border hover:border-brand-300')}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Participantes */}
          <div>
            <label className="label">Participantes</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {users.map(u => {
                const sel = members.includes(u.id)
                return (
                  <button key={u.id} type="button" onClick={() => toggleMember(u.id)}
                    className={cn('flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-sm border transition-all',
                      sel ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-surface-border text-gray-600 hover:border-gray-300')}>
                    <Avatar user={u} size={20} />
                    {u.name.split(' ')[0]}
                    {sel && <Check className="w-3 h-3" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Parceiro */}
          <div ref={partnerRef}>
            <label className="label">Parceiro</label>
            {partnerId ? (
              <div className="flex items-center gap-2 bg-gray-50 border border-surface-border rounded-lg px-3 py-2 mt-1">
                <span className="text-sm text-gray-700 flex-1">{partnerLabel}</span>
                <button type="button" onClick={() => { setPartnerId(null); setPartnerLabel(''); setPartnerQuery('') }}>
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input value={partnerQuery} onChange={e => { setPartnerQuery(e.target.value); setPartnerOpen(true) }}
                  onFocus={() => setPartnerOpen(true)} placeholder="Digite o nome do parceiro..." className="input pl-9" />
                {partnerOpen && partnerResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-surface-border rounded-lg shadow-lg z-20 mt-1 max-h-48 overflow-y-auto">
                    {partnerResults.map(p => (
                      <button key={p.id} type="button"
                        onClick={() => { setPartnerId(p.id); setPartnerLabel(p.name); setPartnerOpen(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface flex items-center justify-between">
                        <span>{p.name}</span>
                        {p.company && <span className="text-xs text-gray-400">{p.company}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Endereço */}
          <div>
            <label className="label">Endereço</label>
            <input value={location} onChange={e => setLocation(e.target.value)}
              placeholder="Ex: Rua das Flores, 123" className="input mt-1" />
          </div>

          {/* Orçamento relacionado */}
          <div ref={quoteRef}>
            <label className="label">Orçamento relacionado</label>
            {quoteId ? (
              <div className="flex items-center gap-2 bg-gray-50 border border-surface-border rounded-lg px-3 py-2 mt-1">
                <span className="text-sm text-gray-700 flex-1">{quoteLabel}</span>
                <button type="button" onClick={() => { setQuoteId(null); setQuoteLabel(''); setQuoteQuery('') }}>
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input value={quoteQuery} onChange={e => { setQuoteQuery(e.target.value); setQuoteOpen(true) }}
                  onFocus={() => setQuoteOpen(true)} placeholder="Digite nº ou cliente..." className="input pl-9" />
                {quoteOpen && filteredQuotes.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-surface-border rounded-lg shadow-lg z-20 mt-1 max-h-48 overflow-y-auto">
                    {filteredQuotes.map(q => (
                      <button key={q.id} type="button"
                        onClick={() => { setQuoteId(q.id); setQuoteLabel(`#${q.number} · ${q.client_name}`); setQuoteOpen(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface">
                        <span className="font-semibold text-brand-600">#{q.number}</span>
                        <span className="text-gray-600 ml-2">{q.client_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
