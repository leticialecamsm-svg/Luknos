'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { QUICK_REACTIONS } from '@/lib/crm-reactions'
import { getMyReactionEmojis, saveMyReactionEmojis } from '@/lib/crm-actions'

// Os 6 emojis da fileira de reação de quem está logado. Carrega uma vez e é
// compartilhado por todos os balões (cada mensagem não busca de novo).
let current: string[] = [...QUICK_REACTIONS]
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useReactionFavorites() {
  const favorites = useSyncExternalStore(subscribe, () => current, () => current)
  useEffect(() => {
    if (loaded) return
    loaded = true
    getMyReactionEmojis().then((list) => { if (list?.length === 6) { current = list; emit() } }).catch(() => { loaded = false })
  }, [])
  return favorites
}

export async function setReactionFavorites(list: string[]) {
  const prev = current
  current = list
  emit()
  const r = await saveMyReactionEmojis(list)
  if ('error' in r) { current = prev; emit() }
  return r
}
