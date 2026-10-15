'use client'

import type { getCrmMessages, getCrmSnapshot } from '@/lib/crm-actions'

type Snapshot = Awaited<ReturnType<typeof getCrmSnapshot>>
type MessagesPage = Awaited<ReturnType<typeof getCrmMessages>>

// Leituras do CRM por GET (rodam em paralelo; as ações do servidor ficam livres para enviar/alterar).
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', signal })
  const body = await res.json().catch(() => null)
  if (!body) throw new Error(`Falha ao carregar (${res.status})`)
  return body as T
}

export function fetchCrmSnapshot(scope: string, limit: number, ids?: string[], withStages = false, signal?: AbortSignal) {
  const p = new URLSearchParams({ scope, limit: String(limit) })
  if (ids?.length) p.set('ids', ids.join(','))
  if (withStages) p.set('stages', '1')
  return getJson<Snapshot>(`/api/crm/snapshot?${p}`, signal)
}

export function fetchCrmMessages(conversationId: string, opts: { before?: string | null; limit?: number } = {}, signal?: AbortSignal) {
  const p = new URLSearchParams({ c: conversationId })
  if (opts.before) p.set('before', opts.before)
  if (opts.limit) p.set('limit', String(opts.limit))
  return getJson<MessagesPage>(`/api/crm/messages?${p}`, signal)
}
