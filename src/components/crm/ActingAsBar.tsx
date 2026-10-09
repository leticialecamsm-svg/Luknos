'use client'

import { useEffect, useState } from 'react'
import { getActingContext, setActingAs, type ActingContext } from '@/lib/crm-actions'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { UserCog, Loader2, Undo2 } from 'lucide-react'

// Só administradores: atuar no CRM em nome de outro atendente (ex.: alguém faltou).
// A assinatura das mensagens passa a ser a da pessoa, e o seu avatar aparece junto.
export function ActingAsBar() {
  const toast = useToast()
  const [ctx, setCtx] = useState<ActingContext | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getActingContext().then(setCtx) }, [])
  if (!ctx || !ctx.can_act) return null

  async function change(userId: string | null) {
    setBusy(true)
    const r = await setActingAs(userId)
    if ('error' in r && r.error) { setBusy(false); toast.error('ERRO', r.error); return }
    window.location.reload() // recarrega tudo já como a pessoa escolhida (ou de volta como você)
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <UserCog className="w-4 h-4 text-gray-400" />
        <label htmlFor="act-as" className="text-gray-500">Atuar como</label>
        <select
          id="act-as"
          value={ctx.acting?.id ?? ''}
          disabled={busy}
          onChange={(e) => change(e.target.value || null)}
          className="border border-gray-200 rounded-full px-3 py-1 text-sm bg-white"
        >
          <option value="">Eu mesmo</option>
          {ctx.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role_label}</option>)}
        </select>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {ctx.acting && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <Avatar user={ctx.acting} size={28} />
          <span className="flex-1 min-w-[220px]">
            <b>Você está atuando como {ctx.acting.name}.</b> Vê as conversas dele(a) e o que enviar sai com o nome dele(a); o seu avatar aparece junto, marcado em âmbar, no histórico.
          </span>
          <button disabled={busy} onClick={() => change(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-900 text-white text-xs font-medium hover:bg-amber-800 disabled:opacity-60">
            <Undo2 className="w-3.5 h-3.5" /> Voltar para mim
          </button>
        </div>
      )}
    </div>
  )
}
