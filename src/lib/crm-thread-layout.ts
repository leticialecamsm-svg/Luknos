import { formatDayLabel, sameDay } from './crm-time'

// Arranjo da conversa no estilo do WhatsApp: separador quando muda o dia e
// "sequências" de mensagens seguidas da mesma pessoa (só a primeira leva nome/rabinho).

export interface LayoutMsg {
  direction: 'inbound' | 'outbound'
  sender_user_id: string | null
  acted_by_name?: string | null
  participant_jid?: string | null
  participant_name?: string | null
  is_system: boolean
  created_at: string
}

export interface LayoutSlot {
  day: string | null   // texto do separador antes desta mensagem
  first: boolean       // começa uma sequência
}

function author(m: LayoutMsg): string {
  if (m.is_system) return 'system'
  if (m.direction === 'outbound') return `out:${m.sender_user_id ?? 'phone'}:${m.acted_by_name ?? ''}`
  return `in:${m.participant_jid ?? m.participant_name ?? ''}`
}

export function threadLayout(msgs: LayoutMsg[], now: Date = new Date()): LayoutSlot[] {
  return msgs.map((m, i) => {
    const prev = i > 0 ? msgs[i - 1] : null
    const newDay = !prev || !sameDay(prev.created_at, m.created_at)
    return {
      day: newDay ? formatDayLabel(m.created_at, now) : null,
      first: newDay || !prev || prev.is_system || author(prev) !== author(m),
    }
  })
}
