'use client'

import { useEffect, useState } from 'react'
import { getCrmAwaiting, type AwaitingSummary } from '@/lib/crm-actions'

// Um único "poller" compartilhado entre o menu, o sino e o título da aba.
// summary: undefined = ainda carregando; null = sem acesso ao CRM.
type State = AwaitingSummary | null | undefined
let state: State = undefined
const listeners = new Set<(s: State) => void>()
let timer: ReturnType<typeof setInterval> | null = null
let inFlight = false
let lastLoadAt = 0
const MIN_GAP_MS = 15_000 // pedidos de atualização muito seguidos viram um só

export const CRM_AWAITING_REFRESH = 'crm-awaiting-refresh'

async function load(force = false) {
  if (inFlight) return
  if (!force && Date.now() - lastLoadAt < MIN_GAP_MS) return
  inFlight = true
  lastLoadAt = Date.now()
  try {
    state = await getCrmAwaiting()
    listeners.forEach((l) => l(state))
  } catch { /* rede fora do ar: mantém o último valor */ }
  inFlight = false
}

const onVisible = () => { if (document.visibilityState === 'visible') load() }
const onRefresh = () => { load() }

function start() {
  load(true)
  timer = setInterval(() => { if (document.visibilityState === 'visible') load(true) }, 60_000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener(CRM_AWAITING_REFRESH, onRefresh)
}
function stop() {
  if (timer) clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener(CRM_AWAITING_REFRESH, onRefresh)
}

export function useCrmAwaiting(enabled = true): State {
  const [s, setS] = useState<State>(state)
  useEffect(() => {
    if (!enabled) return
    listeners.add(setS)
    if (listeners.size === 1) start()
    else setS(state)
    return () => {
      listeners.delete(setS)
      if (listeners.size === 0) stop()
    }
  }, [enabled])
  return enabled ? s : null
}
