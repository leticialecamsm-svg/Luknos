'use client'

import { createClient } from '@/lib/supabase/client'

type Payload = { eventType?: string; new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }

// Escuta mudanças em crm_messages em tempo real. O canal precisa do login do usuário (token)
// para o banco liberar as linhas (RLS): sem isso ele conecta, mas nunca entrega nenhum evento.
// Devolve a função que encerra a escuta.
export function subscribeCrmMessages(name: string, event: 'INSERT' | '*', onEvent: (p: Payload) => void): () => void {
  const supabase = createClient()
  let channel: ReturnType<typeof supabase.channel> | null = null
  let cancelled = false
  ;(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) supabase.realtime.setAuth(session.access_token)
    if (cancelled) return
    channel = supabase
      .channel(name)
      .on('postgres_changes', { event, schema: 'public', table: 'crm_messages' }, (p) => onEvent(p as unknown as Payload))
      .subscribe()
  })()
  return () => {
    cancelled = true
    if (channel) supabase.removeChannel(channel)
  }
}

// "Digitando…": mudanças em crm_presence (contato pelo WhatsApp ou atendente pelo CRM).
// Mesma regra de acesso das mensagens (RLS), por isso também precisa do token.
export function subscribeCrmPresence(onEvent: (row: { conversation_id: string; actor: string; actor_name: string | null; state: string; updated_at: string }) => void): () => void {
  const supabase = createClient()
  let channel: ReturnType<typeof supabase.channel> | null = null
  let cancelled = false
  ;(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) supabase.realtime.setAuth(session.access_token)
    if (cancelled) return
    channel = supabase
      .channel('crm:presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_presence' }, (p) => {
        const row = (p as unknown as { new?: Record<string, unknown> }).new
        if (row && row.conversation_id) onEvent(row as never)
      })
      .subscribe()
  })()
  return () => {
    cancelled = true
    if (channel) supabase.removeChannel(channel)
  }
}
