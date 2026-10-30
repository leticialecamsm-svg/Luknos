'use client'

import { useEffect, useState } from 'react'
import { getActingContext, setActingAs, type ActingContext } from '@/lib/crm-actions'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { UserCog, Undo2 } from 'lucide-react'
import { ToolbarMenu, ToolbarMenuItem } from './ToolbarMenu'

// Só administradores: atuar no CRM em nome de outro atendente (ex.: alguém faltou).
// A assinatura das mensagens passa a ser a da pessoa, e o seu avatar aparece junto.
// Fica compacto, na mesma linha das abas; o aviso âmbar só aparece enquanto atua como outra pessoa.
export function useActingContext() {
  const [ctx, setCtx] = useState<ActingContext | null>(null)
  useEffect(() => { getActingContext().then(setCtx) }, [])
  return ctx
}

function useChangeActing() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function change(userId: string | null) {
    setBusy(true)
    const r = await setActingAs(userId)
    if ('error' in r && r.error) { setBusy(false); toast.error('ERRO', r.error); return }
    window.location.reload() // recarrega tudo já como a pessoa escolhida (ou de volta como você)
  }
  return { busy, change }
}

export function ActingAsSelect({ ctx }: { ctx: ActingContext | null }) {
  const { busy, change } = useChangeActing()
  if (!ctx || !ctx.can_act) return null
  const current = ctx.acting
  return (
    <ToolbarMenu
      ariaLabel="Atuar como"
      title="Atuar no CRM em nome de outro atendente"
      tone={current ? 'amber' : 'default'}
      disabled={busy}
      busy={busy}
      className="max-w-[13rem] max-sm:max-w-[9rem]"
      width="w-72"
      icon={current ? <Avatar user={current} size={18} /> : <UserCog className="w-3.5 h-3.5 text-gray-500" />}
      label={current ? current.name : 'Eu mesmo'}
    >
      {(close) => (
        <>
          <ToolbarMenuItem selected={!current} onClick={() => { close(); if (current) change(null) }} lead={<span className="w-5 h-5 rounded-full bg-gray-100 inline-flex items-center justify-center"><UserCog className="w-3 h-3 text-gray-500" /></span>}>
            Eu mesmo
          </ToolbarMenuItem>
          {ctx.users.map((u) => (
            <ToolbarMenuItem key={u.id} selected={current?.id === u.id} onClick={() => { close(); if (current?.id !== u.id) change(u.id) }} lead={<Avatar user={u} size={20} />} hint={u.role_label}>
              {u.name}
            </ToolbarMenuItem>
          ))}
        </>
      )}
    </ToolbarMenu>
  )
}

export function ActingAsBanner({ ctx }: { ctx: ActingContext | null }) {
  const { busy, change } = useChangeActing()
  if (!ctx?.can_act || !ctx.acting) return null
  return (
    <div role="status" className="mb-2 flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
      <Avatar user={ctx.acting} size={22} />
      <span className="flex-1 min-w-0 truncate">
        <b>Atuando como {ctx.acting.name}</b> — o que enviar sai com o nome dele(a); o seu avatar fica marcado em âmbar no histórico.
      </span>
      <button disabled={busy} onClick={() => change(null)} className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-900 text-white text-xs font-medium hover:bg-amber-800 disabled:opacity-60">
        <Undo2 className="w-3.5 h-3.5" /> Voltar para mim
      </button>
    </div>
  )
}
