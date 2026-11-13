'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X, Pencil, Trash2, Phone, Mail, Building2, Users, Calendar, Lock, Eye, EyeOff, Copy, ChevronLeft, ChevronRight, MessageCircle, Loader2, Cake, MapPin, KeyRound, Fingerprint } from 'lucide-react'
import { getContactAllQuotes, getContactSalesTotal, getPartnerSensitive, type PartnerSensitive } from '@/lib/actions'
import { formatBirthDate } from '@/lib/partner-registration'
import { useToast } from '@/components/ui/Toast'
import { useFocusTrap } from '@/components/ui/useFocusTrap'
import { QuoteQuickViewModal } from '@/components/quotes/QuoteQuickViewModal'
import { cn, formatCurrency } from '@/lib/utils'
import { TYPE_COLOR, TYPE_LABEL, initials, type AppUser, type Contact } from './partner-types'

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="mt-0.5 text-gray-400 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <div className="text-sm text-gray-800 break-words">{children}</div>
      </div>
    </div>
  )
}

const maskCpf = (v: string) => (v.replace(/\D/g, '').length === 11 ? `•••.•••.•••-${v.replace(/\D/g, '').slice(-2)}` : '••••••••')

export function PartnerViewModal({
  contact, isAdmin, stats, onClose, onEdit, onDelete,
}: {
  contact: Contact
  isAdmin?: boolean
  stats?: { openValue: number; openCount: number; closedValue: number; closedCount: number }
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const toast = useToast()
  const ref = useRef<HTMLDivElement>(null)
  const [quoteModal, setQuoteModal] = useState<string | null>(null)
  useFocusTrap(ref, () => { if (!quoteModal) onClose() }, true)

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [commData, setCommData] = useState<any[] | null>(null)
  const [loadingComm, setLoadingComm] = useState(false)
  const [quotes, setQuotes] = useState<any[] | null>(null)
  const [sens, setSens] = useState<PartnerSensitive | null | 'loading'>('loading')
  const [reveal, setReveal] = useState(false)

  const commRate = Number(contact.commission_rate ?? 0)

  useEffect(() => { getContactAllQuotes(contact.id, contact.name).then((d) => setQuotes(d as any[])) }, [contact.id, contact.name])
  useEffect(() => { getPartnerSensitive(contact.id).then((r) => setSens('error' in r ? null : r.data)) }, [contact.id])
  useEffect(() => { if (isAdmin && commRate > 0) loadComm(viewYear, viewMonth) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadComm(y: number, m: number) {
    setLoadingComm(true)
    setCommData((await getContactSalesTotal(contact.id, y, m)) as any[])
    setLoadingComm(false)
  }
  function shiftMonth(delta: number) {
    let m = viewMonth + delta, y = viewYear
    if (m < 1) { m = 12; y-- } else if (m > 12) { m = 1; y++ }
    setViewMonth(m); setViewYear(y); loadComm(y, m)
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast.success('COPIADO!', `${what} copiado(a).`) } catch { toast.error('NÃO FOI POSSÍVEL COPIAR', 'Copie manualmente.') }
  }

  const digits = (contact.phone ?? '').replace(/\D/g, '')
  const waPhone = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : ''
  const monthTotal = (commData ?? []).reduce((s, r) => s + Number(r.quote_value ?? 0), 0)
  const commTotal = (commData ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  const open = (quotes ?? []).filter((q: any) => q.status !== 'done' && !['closed', 'lost'].includes(q.temperature ?? ''))
  const closed = (quotes ?? []).filter((q: any) => q.temperature === 'closed')
  const openSum = stats?.openValue ?? open.reduce((s: number, q: any) => s + Number(q.quoted_value ?? 0), 0)
  const closedSum = stats?.closedValue ?? closed.reduce((s: number, q: any) => s + Number(q.final_value ?? q.quoted_value ?? 0), 0)

  const hasSens = sens && sens !== 'loading' && (sens.cpf || sens.pix_key || sens.birth_date || sens.address)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !quoteModal) onClose() }}>
      <div className="fixed inset-0 modal-backdrop pointer-events-none" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={contact.name} className="relative bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col">
        {/* Cabeçalho */}
        <div className="px-6 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-surface-secondary flex items-center justify-center shrink-0 text-lg font-bold text-gray-600">{initials(contact.name)}</div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-gray-900 leading-7 truncate">{contact.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className={cn('badge', TYPE_COLOR[contact.type] ?? 'bg-gray-100 text-gray-600')}>{TYPE_LABEL[contact.type] ?? contact.type}</span>
                {contact.new_prospection && <span className="badge bg-amber-50 text-amber-700">✦ Nova prospecção</span>}
                {commRate > 0 && isAdmin && <span className="badge bg-gray-100 text-gray-600">Comissão {commRate}%</span>}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-surface-secondary"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" onClick={onEdit} className="btn-primary"><Pencil className="w-4 h-4" /> Editar</button>
            {waPhone && <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className="btn-secondary"><MessageCircle className="w-4 h-4" /> WhatsApp</a>}
            <button type="button" onClick={onDelete} className="btn-ghost ml-auto text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /> Excluir</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Negócios */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Em negociação</p>
              <p className="text-lg font-bold text-blue-700 mt-0.5">{formatCurrency(openSum)}</p>
              <p className="text-xs text-gray-500">{quotes ? `${open.length} orçamento(s)` : '…'}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Fechado</p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">{formatCurrency(closedSum)}</p>
              <p className="text-xs text-gray-500">{quotes ? `${closed.length} venda(s)` : '…'}</p>
            </div>
          </div>

          {/* Contato */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Contato</h3>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field icon={<Phone className="w-4 h-4" />} label="Telefone">{contact.phone ? <a href={`tel:${contact.phone}`} className="text-brand-600 hover:text-brand-700">{contact.phone}</a> : <span className="text-gray-400">Não informado</span>}</Field>
              <Field icon={<Mail className="w-4 h-4" />} label="E-mail">{contact.email ? <a href={`mailto:${contact.email}`} className="text-brand-600 hover:text-brand-700">{contact.email}</a> : <span className="text-gray-400">Não informado</span>}</Field>
              <Field icon={<Building2 className="w-4 h-4" />} label="Empresa / escritório">{contact.company || <span className="text-gray-400">—</span>}</Field>
              <Field icon={<Users className="w-4 h-4" />} label="Responsável">
                {contact.assigned_user ? <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded-full text-white text-[9px] font-bold inline-flex items-center justify-center" style={{ background: contact.assigned_user.avatar_color ?? '#6366f1' }}>{contact.assigned_user.name[0]}</span>{contact.assigned_user.name}</span> : <span className="text-gray-400">—</span>}
              </Field>
              <Field icon={<Calendar className="w-4 h-4" />} label="Cadastrado em"><span className="text-gray-600">{fmtDateTime(contact.created_at)}</span></Field>
              {contact.new_prospection && contact.prospection_date && <Field icon={<Calendar className="w-4 h-4" />} label="Prospecção registrada"><span className="text-amber-700">{fmtDateTime(contact.prospection_date)}</span></Field>}
            </div>
          </section>

          {/* Cadastro e pagamento */}
          {sens === 'loading' && <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando cadastro…</div>}
          {sens && sens !== 'loading' && (
            <section className="rounded-xl border border-surface-border bg-surface/60 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Cadastro e pagamento</h3>
                {hasSens && (
                  <button type="button" onClick={() => setReveal((r) => !r)} className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
                    {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{reveal ? 'Ocultar' : 'Mostrar'}
                  </button>
                )}
              </div>
              {!hasSens ? (
                <p className="text-sm text-gray-500">Nenhum dado ainda. Clique em Editar para preencher CPF, PIX, nascimento e endereço.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                  {sens.cpf && (
                    <Field icon={<Fingerprint className="w-4 h-4" />} label="CPF">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[13px]">{reveal ? sens.cpf : maskCpf(sens.cpf)}
                        <button type="button" onClick={() => copy(sens.cpf, 'CPF')} aria-label="Copiar CPF" className="text-gray-400 hover:text-gray-700"><Copy className="w-3.5 h-3.5" /></button></span>
                    </Field>
                  )}
                  {sens.birth_date && <Field icon={<Cake className="w-4 h-4" />} label="Nascimento">{reveal ? formatBirthDate(sens.birth_date) : '••/••/••••'}</Field>}
                  {sens.pix_key && (
                    <Field icon={<KeyRound className="w-4 h-4" />} label="Chave PIX">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[13px] break-all">{reveal ? sens.pix_key : '••••••••••'}
                        <button type="button" onClick={() => copy(sens.pix_key, 'Chave PIX')} aria-label="Copiar chave PIX" className="text-gray-400 hover:text-gray-700 shrink-0"><Copy className="w-3.5 h-3.5" /></button></span>
                    </Field>
                  )}
                  {sens.address && <Field icon={<MapPin className="w-4 h-4" />} label="Endereço">{reveal ? sens.address : '••••••••••••••••'}</Field>}
                </div>
              )}
            </section>
          )}

          {/* Orçamentos */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Orçamentos do parceiro</h3>
            {quotes === null ? <p className="text-xs text-gray-400">Carregando…</p> : quotes.length === 0 ? <p className="text-sm text-gray-400">Nenhum orçamento vinculado.</p> : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {quotes.map((q: any) => {
                  const isClosed = q.temperature === 'closed'
                  const tag = isClosed ? { t: 'Fechada', c: 'bg-emerald-100 text-emerald-700' } : q.temperature === 'lost' ? { t: 'Perdida', c: 'bg-gray-100 text-gray-500' } : { t: 'Negociação', c: 'bg-blue-100 text-blue-700' }
                  const val = isClosed ? (q.final_value ?? q.quoted_value) : q.quoted_value
                  return (
                    <button key={q.id} type="button" onClick={() => setQuoteModal(q.id)} className="w-full flex items-center justify-between bg-surface-secondary rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors text-left">
                      <span className="min-w-0 flex items-center gap-2">
                        <span className="text-xs font-semibold text-brand-600">#{q.number}</span>
                        <span className="text-xs text-gray-600 truncate">{q.client_name ?? '—'}</span>
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', tag.c)}>{tag.t}</span>
                      </span>
                      <span className="text-xs font-medium text-gray-700 shrink-0 ml-2">{val != null ? formatCurrency(Number(val)) : '—'}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Comissões (admin) */}
          {isAdmin && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Comissões</h3>
                {commRate > 0 && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mês anterior" className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="text-xs font-medium text-gray-600 w-20 text-center">{MONTHS_SHORT[viewMonth - 1]} {viewYear}</span>
                    <button type="button" onClick={() => shiftMonth(1)} aria-label="Próximo mês" className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              {commRate === 0 ? <p className="text-sm text-gray-400">Taxa de comissão não definida. Clique em Editar para configurar.</p>
                : loadingComm ? <p className="text-xs text-gray-400">Carregando…</p>
                : commData && commData.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-surface-secondary rounded-lg p-3"><p className="text-[10px] font-semibold text-gray-500 uppercase">Total vendas</p><p className="text-base font-bold text-gray-900 mt-0.5">{formatCurrency(monthTotal)}</p></div>
                      <div className="bg-amber-50 rounded-lg p-3"><p className="text-[10px] font-semibold text-amber-600 uppercase">Comissão ({commRate}%)</p><p className="text-base font-bold text-amber-700 mt-0.5">{formatCurrency(commTotal)}</p></div>
                    </div>
                    <div className="space-y-1">
                      {commData.map((r: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-50"><span className="text-gray-500">Orç. #{r.quote?.number ?? '—'}</span><span className="font-medium text-gray-700">{formatCurrency(Number(r.amount ?? 0))}</span></div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-sm text-gray-400">Nenhuma comissão neste mês.</p>}
            </section>
          )}
        </div>
      </div>
      {quoteModal && <QuoteQuickViewModal quoteId={quoteModal} onClose={() => setQuoteModal(null)} />}
    </div>
  )
}
