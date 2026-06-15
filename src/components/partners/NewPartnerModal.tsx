'use client'

import { useState, useEffect, useTransition } from 'react'
import { X } from 'lucide-react'
import { createContact, getActiveUsers } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = {
  architect: 'Arquiteto',
  engineer: 'Engenheiro',
  designer: 'Designer',
  electrician: 'Eletricista',
  plasterer: 'Gesseiro',
  carpenter: 'Marceneiro',
  client: 'Cliente',
}
const TYPE_KEYS = Object.keys(TYPE_LABEL)

interface AppUser { id: string; name: string; avatar_color?: string }

export function NewPartnerModal({ currentUserId, onClose }: { currentUserId: string; onClose: () => void }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [users, setUsers] = useState<AppUser[]>([])

  const [name, setName]           = useState('')
  const [phone, setPhone]         = useState('')
  const [email, setEmail]         = useState('')
  const [type, setType]           = useState('architect')
  const [company, setCompany]     = useState('')
  const [prospection, setProsp]   = useState(false)
  const [assignedTo, setAssigned] = useState(currentUserId)

  useEffect(() => {
    getActiveUsers().then(u => setUsers(u as AppUser[]))
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      const res = await createContact({
        name: name.trim(),
        phone: phone || undefined,
        email: email || undefined,
        type,
        company: company || undefined,
        new_prospection: prospection,
        assigned_to: assignedTo,
      })
      if (res.error) { toast.error('OCORREU UM ERRO', res.error); return }
      toast.success('TUDO CERTO!', `${name} adicionado(a) com sucesso!`)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Novo Parceiro</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nome + Tipo */}
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

            {/* Telefone + Email */}
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

            {/* Empresa */}
            <div>
              <label className="label">Empresa / Escritório</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Nome do escritório (opcional)" className="input" />
            </div>

            {/* Responsável — pill selector */}
            {users.length > 0 && (
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
            )}

            {/* Nova prospecção */}
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

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={pending} className="btn-primary">
                {pending ? 'Salvando...' : 'Salvar parceiro'}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
