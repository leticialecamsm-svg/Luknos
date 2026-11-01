'use client'

import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { reassignConversation } from '@/lib/crm-actions'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { ToolbarMenu, ToolbarMenuItem } from './ToolbarMenu'

type Person = { id: string; name: string; role_label?: string; role?: string; has_crm?: boolean; avatar_url?: string | null; avatar_color?: string | null }

// Consultor que atende a conversa, no topo dela. Trocar fica registrado na conversa
// ("Consultor alterado de Fulano para Sicrano por Beltrano") e no histórico.
export function ConsultantSelect({ conversationId, assignedId, users, onChanged }: {
  conversationId: string
  assignedId: string | null
  users: Person[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const current = users.find((u) => u.id === assignedId) ?? null
  const options = users.filter((u) => u.has_crm !== false)

  async function pick(id: string | null) {
    if (id === assignedId) return
    setBusy(true)
    const r = await reassignConversation(conversationId, id)
    setBusy(false)
    if ('error' in r && r.error) { toast.error('ERRO', r.error); return }
    const to = users.find((u) => u.id === id)?.name
    toast.success('CONSULTOR ALTERADO', to ? `Agora quem atende é ${to}` : 'Conversa sem responsável')
    onChanged()
  }

  return (
    <ToolbarMenu
      ariaLabel="Consultor responsável"
      title="Consultor responsável por este atendimento"
      align="left"
      width="w-72"
      busy={busy}
      disabled={busy}
      className="max-w-[12rem]"
      icon={current ? <Avatar user={current} size={18} /> : <UserRound className="w-3.5 h-3.5 text-gray-400" />}
      label={current ? current.name : <span className="text-gray-400">Sem consultor</span>}
    >
      {(close) => (
        <>
          {options.map((u) => (
            <ToolbarMenuItem key={u.id} selected={u.id === assignedId} onClick={() => { close(); pick(u.id) }} lead={<Avatar user={u} size={20} />} hint={u.role_label}>
              {u.name}
            </ToolbarMenuItem>
          ))}
          <div className="border-t border-gray-100 my-1" />
          <ToolbarMenuItem selected={!assignedId} onClick={() => { close(); pick(null) }} lead={<span className="w-5 h-5 rounded-full bg-gray-100 inline-flex items-center justify-center"><UserRound className="w-3 h-3 text-gray-400" /></span>}>
            Sem consultor
          </ToolbarMenuItem>
        </>
      )}
    </ToolbarMenu>
  )
}
