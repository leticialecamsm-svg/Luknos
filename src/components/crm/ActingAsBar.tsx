'use client'

import { useEffect, useState } from 'react'
import { getActingContext, setActingAs, type ActingContext } from '@/lib/crm-actions'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { UserCog, Loader2, Undo2 } from 'lucide-react'

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
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-gray-500" title="Atuar no CRM em nome de outro atendente">
      <UserCog className="w-4 h-4 text-gray-400" />
      <span className="sr-only">Atuar como</span>
      <select
        value={ctx.acting?.id ?? ''}
        disabled={busy}
        onChange={(e) => change(e.target.value || null)}
        className={`max-w-[11rem] border rounded-full pl-2.5 pr-1 py-1 text-xs bg-white ${ctx.acting ? 'border-amber-400 text-amber-900' : 'border-gray-200 text-gray-700'}`}
      >
        <option value="">Eu mesmo</option>
        {ctx.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role_label}</option>)}
      </select>
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
    </label>
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
