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

export const CRM_AWAITING_REFRESH = 'crm-awaiting-refresh'

async function load() {
  if (inFlight) return
  inFlight = true
  try {
    state = await getCrmAwaiting()
    listeners.forEach((l) => l(state))
  } catch { /* rede fora do ar: mantém o último valor */ }
  inFlight = false
}

const onVisible = () => { if (document.visibilityState === 'visible') load() }

function start() {
  load()
  timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60_000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener(CRM_AWAITING_REFRESH, load)
}
function stop() {
  if (timer) clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener(CRM_AWAITING_REFRESH, load)
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
