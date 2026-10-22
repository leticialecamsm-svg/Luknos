'use client'

import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EMOJI_GROUPS, isSingleEmoji } from '@/lib/crm-reactions'
import { setReactionFavorites, useReactionFavorites } from './useReactionFavorites'
import { useToast } from '@/components/ui/Toast'

// Seletor completo de reações. No modo "editar favoritos": toca num dos 6 da fileira
// e depois no emoji que vai ocupar o lugar dele.
export function ReactionPicker({ mine, onPick }: { mine: string[]; onPick: (emoji: string) => void }) {
  const toast = useToast()
  const favorites = useReactionFavorites()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>(favorites)
  const [slot, setSlot] = useState(0)
  const [typed, setTyped] = useState('')

  function choose(e: string) {
    if (!editing) { onPick(e); return }
    setDraft((d) => {
      const next = [...d]
      const dupAt = next.indexOf(e)
      if (dupAt >= 0 && dupAt !== slot) next[dupAt] = next[slot] // troca de lugar em vez de repetir
      next[slot] = e
      return next
    })
    setSlot((s) => (s + 1) % 6)
  }

  async function save() {
    const r = await setReactionFavorites(draft)
    if ('error' in r) { toast.error('ERRO', r.error); return }
    setEditing(false)
  }

  const row = editing ? draft : favorites

  return (
    <div className="w-[min(20rem,calc(100vw-16px))] p-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{editing ? 'Toque no lugar e escolha o emoji' : 'Seus favoritos'}</p>
        {editing ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { setDraft(favorites); setEditing(false) }} className="px-2 py-1 text-xs rounded-lg text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button type="button" onClick={save} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-gray-900 text-white hover:bg-gray-800"><Check className="w-3.5 h-3.5" /> Salvar</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setDraft(favorites); setSlot(0); setEditing(true) }} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg text-gray-600 hover:bg-gray-100">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
        {row.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            onClick={() => (editing ? setSlot(i) : onPick(e))}
            aria-label={editing ? `Trocar o favorito ${i + 1} (${e})` : `Reagir com ${e}`}
            className={cn(
              'w-10 h-10 rounded-full text-2xl leading-none hover:bg-gray-100',
              editing && slot === i && 'ring-2 ring-sky-400 bg-sky-50',
              !editing && mine.includes(e) && 'bg-sky-100 ring-1 ring-sky-300',
            )}
          >{e}</button>
        ))}
      </div>
      <div className="max-h-56 overflow-y-auto overscroll-contain pr-0.5">
        {EMOJI_GROUPS.map((g) => (
          <div key={g.label} className="mb-1.5">
            <p className="text-[11px] text-gray-400 px-0.5 mb-0.5">{g.label}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {g.emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => choose(e)}
                  aria-label={e}
                  className={cn('h-9 rounded-lg text-xl leading-none hover:bg-gray-100', !editing && mine.includes(e) && 'bg-sky-100')}
                >{e}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(ev) => {
          ev.preventDefault()
          const e = typed.trim()
          if (!isSingleEmoji(e)) { toast.error('EMOJI INVÁLIDO', 'Digite ou cole um único emoji.'); return }
          setTyped('')
          choose(e)
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Outro emoji: digite ou cole"
          className="flex-1 min-w-0 px-2.5 py-1.5 text-base sm:text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <button type="submit" disabled={!typed.trim()} className="px-2.5 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-40">OK</button>
      </form>
    </div>
  )
}
