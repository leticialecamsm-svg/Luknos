'use client'

// Widget compacto no topo de uma aba de etapa: mostra avatars dos responsáveis
// designados pra essa etapa e permite editar (adicionar/remover usuários).
// Diferente de "equipe envolvida" (que é quem já registrou ações).

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, Loader2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setStageResponsibles, listActiveUsers } from '@/lib/solicitations/actions'

type UserRow = { id: string; name: string; avatar_url: string | null; avatar_color: string | null }

export function StageResponsibles({
  solicitationId,
  stage,
  stageLabel,
  responsibles,
}: {
  solicitationId: string
  stage: string
  stageLabel: string
  responsibles: UserRow[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [users, setUsers] = useState<UserRow[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(responsibles.map(r => r.id)))
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSelected(new Set(responsibles.map(r => r.id))) }, [responsibles])

  useEffect(() => {
    if (!open) return
    listActiveUsers().then(setUsers)
  }, [open])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function save() {
    startTransition(async () => {
      await setStageResponsibles(solicitationId, stage, Array.from(selected))
      setOpen(false)
      router.refresh()
    })
  }

  const filtered = query.length === 0
    ? users
    : users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={boxRef} className="relative flex items-center gap-1.5">
      {responsibles.length > 0 ? (
        <div className="flex -space-x-1.5">
          {responsibles.slice(0, 4).map(u => (
            <Avatar key={u.id} user={u} size={22} />
          ))}
          {responsibles.length > 4 && (
            <div className="w-[22px] h-[22px] rounded-full bg-gray-100 ring-1 ring-white text-[9px] font-semibold text-gray-600 flex items-center justify-center">
              +{responsibles.length - 4}
            </div>
          )}
        </div>
      ) : (
        <span className="text-[11px] text-gray-400 italic">Sem responsável</span>
      )}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={responsibles.length ? 'Editar responsáveis' : 'Definir responsável'}
        className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full border border-dashed border-gray-300 text-gray-400 hover:text-brand-600 hover:border-brand-400 transition-colors"
      >
        <Plus className="w-2.5 h-2.5" />
      </button>

      {open && (
        <div className="absolute z-30 top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-black/5 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-700">Responsáveis — {stageLabel}</span>
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar pessoa…"
            className="w-full px-3 py-2 text-xs border-b border-gray-100 focus:outline-none"
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-3">Nenhuma pessoa encontrada.</p>
            )}
            {filtered.map(u => {
              const isSel = selected.has(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors', isSel ? 'bg-brand-50' : 'hover:bg-gray-50')}
                >
                  <Avatar user={u} size={20} />
                  <span className="flex-1 truncate">{u.name}</span>
                  {isSel && <Check className="w-3 h-3 text-brand-600" />}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 justify-end px-3 py-2 border-t border-gray-100 bg-gray-50">
            <button type="button" onClick={() => setOpen(false)} className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
            <button type="button" onClick={save} disabled={pending}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50">
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Avatar({ user, size }: { user: UserRow; size: number }) {
  if (user.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar_url} alt={user.name} title={user.name}
      className="rounded-full object-cover ring-1 ring-white"
      style={{ width: size, height: size }} />
  }
  const initials = user.name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      title={user.name}
      className="rounded-full flex items-center justify-center font-semibold ring-1 ring-white shrink-0"
      style={{
        width: size, height: size,
        background: user.avatar_color ?? '#e5e7eb',
        color: '#fff',
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initials}
    </div>
  )
}
