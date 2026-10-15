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

// Escritas que não podem esperar na fila das ações do servidor (uma ação longa, como encaminhar
// um arquivo, segurava o envio da mensagem seguinte): vão por rota própria, em paralelo.
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => null)
  if (!data) return { error: `Falha de conexão (${res.status})` } as T
  return data as T
}

export type SendInput = Parameters<typeof import('@/lib/crm-actions').sendCrmMessage>[0]
export const postCrmSend = (input: SendInput) => postJson<{ error?: string; ok?: boolean; messageId?: string | null }>('/api/crm/send', input)
export const postCrmForward = (messageId: string, targets: string[]) => postJson<{ error?: string; ok?: boolean; sent?: number }>('/api/crm/forward', { messageId, targets })
export const postCrmReact = (messageId: string, emoji: string) => postJson<{ error?: string; ok?: boolean }>('/api/crm/react', { messageId, emoji })
