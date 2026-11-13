'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X, Lock, Loader2, Info } from 'lucide-react'
import { getActiveUsers, getPartnerSensitive, type PartnerSensitive } from '@/lib/actions'
import { formatCpf } from '@/lib/partner-registration'
import { useFocusTrap } from '@/components/ui/useFocusTrap'
import { cn } from '@/lib/utils'
import { TYPE_KEYS, TYPE_LABEL, type AppUser, type PartnerFormValues } from './partner-types'

type Initial = Partial<PartnerFormValues> & { id?: string }

// Cadastro e edição de parceiro (tela de Parceiros, botão "+" e conversa do CRM usam este mesmo modal).
export function PartnerFormModal({
  title, subtitle, initial, users: usersProp, currentUserId, isAdmin = false, notice, submitLabel = 'Salvar parceiro', onSave, onClose,
}: {
  title: string
  subtitle?: string
  initial: Initial
  users?: AppUser[]
  currentUserId: string
  isAdmin?: boolean
  notice?: ReactNode
  submitLabel?: string
  onSave: (values: PartnerFormValues) => Promise<{ error?: string } | void>
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useFocusTrap(ref, onClose, !pending)

  const [users, setUsers] = useState<AppUser[]>(usersProp ?? [])
  useEffect(() => { if (!usersProp) getActiveUsers().then((u) => setUsers(u as AppUser[])) }, [usersProp])

  const [name, setName] = useState(initial.name ?? '')
  const [type, setType] = useState(initial.type ?? 'architect')
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  const [company, setCompany] = useState(initial.company ?? '')
  const [assignedTo, setAssignedTo] = useState(initial.assigned_to ?? currentUserId)
  const [prospection, setProspection] = useState(initial.new_prospection ?? false)
  const [commRate, setCommRate] = useState(initial.commission_rate != null ? String(initial.commission_rate) : '')
  const [linkedUser, setLinkedUser] = useState(initial.linked_user_id ?? '')
  const [cpf, setCpf] = useState(initial.cpf ?? '')
  const [pix, setPix] = useState(initial.pix_key ?? '')
  const [birth, setBirth] = useState(initial.birth_date ?? '')
  const [address, setAddress] = useState(initial.address ?? '')

  // Parceiro já cadastrado: traz CPF, PIX, nascimento e endereço salvos (só para quem tem permissão).
  // O que veio preenchido pela conversa tem prioridade sobre o que está salvo.
  const [sensitive, setSensitive] = useState<'loading' | 'ok' | 'hidden'>(initial.id ? 'loading' : 'ok')
  useEffect(() => {
    if (!initial.id) return
    let alive = true
    getPartnerSensitive(initial.id).then((r) => {
      if (!alive) return
      if ('error' in r) { setSensitive('hidden'); return }
      const d: PartnerSensitive = r.data
      if (!initial.cpf) setCpf(d.cpf)
      if (!initial.pix_key) setPix(d.pix_key)
      if (!initial.birth_date) setBirth(d.birth_date)
      if (!initial.address) setAddress(d.address)
      setSensitive('ok')
    })
    return () => { alive = false }
  }, [initial.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const typeKeys: string[] = initial.type && !(TYPE_KEYS as readonly string[]).includes(initial.type) ? [...TYPE_KEYS, initial.type] : [...TYPE_KEYS]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || pending) return
    setPending(true); setError(null)
    const rate = isAdmin && commRate !== '' ? parseFloat(commRate) : initial.commission_rate
    const r = await onSave({
      name: name.trim(), type, phone: phone.trim(), email: email.trim(), company: company.trim(),
      assigned_to: assignedTo, new_prospection: prospection,
      commission_rate: rate, linked_user_id: isAdmin ? (linkedUser || null) : initial.linked_user_id,
      cpf: cpf.trim(), pix_key: pix.trim(), birth_date: birth, address: address.trim(),
      sensitiveVisible: sensitive === 'ok',
    })
    if (r && 'error' in r && r.error) { setError(r.error); setPending(false) }
    // sem erro: quem chamou fecha o modal
  }

  const section = 'text-[11px] font-semibold uppercase tracking-wider text-gray-400'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) onClose() }}>
      <div className="fixed inset-0 modal-backdrop pointer-events-none" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="relative bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 leading-6">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-surface-secondary"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {notice && (
              <div className="flex gap-2.5 rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2.5 text-sm text-amber-900">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" /><div>{notice}</div>
              </div>
            )}

            <section className="space-y-3">
              <h3 className={section}>Identificação</h3>
              <div>
                <label className="label" htmlFor="pf-name">Nome *</label>
                <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Arq. Mariana Silva" className="input" />
              </div>
              <div>
                <span className="label">Tipo</span>
                <div className="flex flex-wrap gap-1.5">
                  {typeKeys.map((k) => (
                    <button key={k} type="button" onClick={() => setType(k)} aria-pressed={type === k}
                      className={cn('px-3 py-1.5 rounded-full text-sm border transition-colors', type === k ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-surface-border hover:border-brand-300')}>
                      {TYPE_LABEL[k] ?? k}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="pf-phone">Telefone</label>
                  <input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(82) 99999-9999" className="input" inputMode="tel" />
                </div>
                <div>
                  <label className="label" htmlFor="pf-email">E-mail</label>
                  <input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" className="input" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="pf-company">Empresa / escritório</label>
                <input id="pf-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Nome do escritório (opcional)" className="input" />
              </div>
            </section>

            {sensitive !== 'hidden' && (
              <section className="space-y-3 rounded-xl border border-surface-border bg-surface/60 p-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  <h3 className={section}>Cadastro e pagamento</h3>
                  {sensitive === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                </div>
                <p className="text-xs text-gray-500 -mt-1">Visível só para administradores e para o responsável pelo parceiro.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="pf-cpf">CPF</label>
                    <input id="pf-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} onBlur={() => setCpf((v) => formatCpf(v))} placeholder="000.000.000-00" className="input" inputMode="numeric" />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-birth">Data de nascimento</label>
                    <input id="pf-birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="pf-pix">Chave PIX</label>
                  <input id="pf-pix" value={pix} onChange={(e) => setPix(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="pf-address">Endereço</label>
                  <textarea id="pf-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Rua, número, bairro, cidade, CEP" className="input rounded-2xl resize-none" />
                </div>
              </section>
            )}

            <section className="space-y-3">
              <h3 className={section}>Responsável</h3>
              <div className="flex flex-wrap gap-1.5">
                {users.map((u) => (
                  <button key={u.id} type="button" onClick={() => setAssignedTo(u.id)} aria-pressed={assignedTo === u.id}
                    className={cn('flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full text-sm border transition-colors', assignedTo === u.id ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-surface-border hover:border-brand-300')}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: u.avatar_color ?? '#6366f1' }}>{u.name[0]}</span>
                    {u.name.split(' ')[0]}
                    {u.id === currentUserId && <span className="text-[10px] opacity-70">(você)</span>}
                  </button>
                ))}
              </div>
              <button type="button" role="switch" aria-checked={prospection} onClick={() => setProspection((p) => !p)} className="flex items-center gap-3 select-none text-left">
                <span className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0', prospection ? 'bg-brand-500' : 'bg-gray-200')}>
                  <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform', prospection ? 'translate-x-4' : 'translate-x-0.5')} />
                </span>
                <span><span className="block text-sm font-medium text-gray-700">Nova prospecção</span><span className="block text-xs text-gray-400">Marca este parceiro como uma prospecção nova do mês</span></span>
              </button>
            </section>

            {isAdmin && (
              <section className="space-y-3">
                <h3 className={section}>Comissão</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="pf-rate">Taxa de comissão (%)</label>
                    <div className="relative">
                      <input id="pf-rate" type="number" min="0" max="100" step="0.1" value={commRate} onChange={(e) => setCommRate(e.target.value)} placeholder="Padrão do tipo" className="input pr-8" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Sobre vendas fechadas. Vazio usa o padrão do tipo.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-linked">Vincular a colaborador (projetista)</label>
                    <select id="pf-linked" value={linkedUser} onChange={(e) => setLinkedUser(e.target.value)} className="select">
                      <option value="">Nenhum (parceiro externo)</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Se também é colaborador, a comissão vai para o painel dele e sai daqui.</p>
                  </div>
                </div>
              </section>
            )}
          </div>

          <div className="border-t border-surface-border px-6 py-3.5 flex items-center gap-3 bg-white sm:rounded-b-2xl">
            <p role="alert" className="flex-1 text-sm text-red-600 min-w-0">{error}</p>
            <button type="button" onClick={onClose} disabled={pending} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={pending || !name.trim()} className="btn-primary">
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}{submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
