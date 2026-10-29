import { createAdminClient } from '@/lib/supabase/admin'

// Métricas do tráfego (CRM, só admin): conversas que entraram por anúncio (Status, Instagram, Facebook —
// dados que o WhatsApp manda junto com o clique) ou pelo Google (frase pronta "vim pelo google").
// A conta é feita no banco (crm_traffic_leads); aqui só junta nomes, fotos dos anúncios e o período anterior.

export const TZ_OFFSET = '-03:00'

export type TrafficSource = 'status' | 'instagram' | 'facebook' | 'google'

export interface TrafficLead {
  conversation_id: string
  entry_at: string
  source: TrafficSource
  campaign: string // chave do anúncio (mesma imagem = mesmo anúncio)
  title: string | null
  url: string | null
  instance_id: string
  assigned_user_id: string | null
  contact_name: string | null
  phone: string | null
  first_reply_at: string | null
  first_reply_user: string | null
  inbound_count: number
  outbound_count: number
  deal_value: number | null
  stage_id: string | null
  has_solicitation: boolean
  returning_contact: boolean
}

export interface TrafficCampaign { key: string; title: string; thumb: string | null; url: string | null }

export interface TrafficMetricsData {
  from: string
  to: string
  leads: TrafficLead[]
  prev: { from: string; to: string; total: number; bySource: Record<string, number>; replied: number }
  campaigns: TrafficCampaign[]
  users: { id: string; name: string; avatar_url: string | null; avatar_color: string | null }[]
  instances: { id: string; label: string }[]
  stages: { id: string; name: string; color: string | null; position: number }[]
  firstDataDay: string | null // desde quando o CRM registra anúncios
}

export function rangeBounds(from: string, to: string) {
  const start = new Date(`${from}T00:00:00${TZ_OFFSET}`)
  const end = new Date(new Date(`${to}T00:00:00${TZ_OFFSET}`).getTime() + 24 * 3600_000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

type Row = {
  conversation_id: string; entry_message_id: string; entry_at: string; source: string; title: string | null
  thumb_hash: string; url: string | null; instance_id: string; assigned_user_id: string | null
  contact_name: string | null; remote_jid: string | null; first_reply_at: string | null; first_reply_user: string | null
  inbound_count: number; outbound_count: number; deal_value: number | string | null; stage_id: string | null
  has_solicitation: boolean; returning_contact: boolean
}

const SOURCES: TrafficSource[] = ['status', 'instagram', 'facebook', 'google']

export async function loadTrafficMetrics(from: string, to: string): Promise<TrafficMetricsData> {
  const admin = createAdminClient()
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1
  const prevTo = shiftDay(from, -1)
  const prevFrom = shiftDay(prevTo, -(days - 1))
  const cur = rangeBounds(from, to)
  const prv = rangeBounds(prevFrom, prevTo)

  const [{ data: rows, error }, { data: prevRows }, { data: users }, { data: instances }, { data: stages }, { data: first }] = await Promise.all([
    admin.rpc('crm_traffic_leads', { p_from: cur.start, p_to: cur.end }),
    admin.rpc('crm_traffic_leads', { p_from: prv.start, p_to: prv.end }),
    admin.from('users').select('id, name, avatar_url, avatar_color'),
    admin.from('crm_instances').select('id, label'),
    admin.from('crm_stages').select('id, name, color, position').order('position'),
    admin.from('crm_messages').select('created_at').not('ad_context', 'is', null).order('created_at').limit(1),
  ])
  if (error) throw new Error(error.message)
  const list = (rows ?? []) as Row[]

  // um anúncio = mesma imagem; o nome é o título mais usado (o WhatsApp às vezes manda sem título)
  const byKey = new Map<string, { titles: Map<string, number>; msgId: string; url: string | null }>()
  for (const r of list) {
    if (r.source === 'google') continue
    const c = byKey.get(r.thumb_hash) ?? { titles: new Map(), msgId: r.entry_message_id, url: r.url }
    if (r.title && r.title !== 'Anúncio no Status') c.titles.set(r.title, (c.titles.get(r.title) ?? 0) + 1)
    byKey.set(r.thumb_hash, c)
  }
  const msgIds = Array.from(byKey.values()).map((c) => c.msgId)
  const thumbs = new Map<string, string | null>()
  if (msgIds.length) {
    const { data } = await admin.from('crm_messages').select('id, thumb:ad_context->>thumb').in('id', msgIds)
    for (const m of (data ?? []) as { id: string; thumb: string | null }[]) thumbs.set(m.id, m.thumb)
  }
  const campaigns: TrafficCampaign[] = Array.from(byKey.entries()).map(([key, c], i) => ({
    key,
    title: Array.from(c.titles.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? `Anúncio sem título ${i + 1}`,
    thumb: thumbs.get(c.msgId) ?? null,
    url: c.url,
  }))
  if (list.some((r) => r.source === 'google')) campaigns.push({ key: 'google', title: 'Google (“vim pelo google”)', thumb: null, url: null })

  const leads: TrafficLead[] = list.map((r) => ({
    conversation_id: r.conversation_id,
    entry_at: r.entry_at,
    source: (SOURCES.includes(r.source as TrafficSource) ? r.source : 'facebook') as TrafficSource,
    campaign: r.thumb_hash,
    title: r.title,
    url: r.url,
    instance_id: r.instance_id,
    assigned_user_id: r.assigned_user_id,
    contact_name: r.contact_name,
    phone: r.remote_jid?.endsWith('@s.whatsapp.net') ? `+${r.remote_jid.split('@')[0]}` : null,
    first_reply_at: r.first_reply_at,
    first_reply_user: r.first_reply_user,
    inbound_count: r.inbound_count,
    outbound_count: r.outbound_count,
    deal_value: r.deal_value == null ? null : Number(r.deal_value),
    stage_id: r.stage_id,
    has_solicitation: r.has_solicitation,
    returning_contact: r.returning_contact,
  })).sort((a, b) => b.entry_at.localeCompare(a.entry_at))

  const prevList = (prevRows ?? []) as Row[]
  const bySource: Record<string, number> = {}
  for (const r of prevList) bySource[r.source] = (bySource[r.source] ?? 0) + 1

  return {
    from, to, leads, campaigns,
    prev: { from: prevFrom, to: prevTo, total: prevList.length, bySource, replied: prevList.filter((r) => r.first_reply_at).length },
    users: (users ?? []) as TrafficMetricsData['users'],
    instances: (instances ?? []) as TrafficMetricsData['instances'],
    stages: (stages ?? []) as TrafficMetricsData['stages'],
    firstDataDay: first?.[0]?.created_at ? new Date(new Date(first[0].created_at).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : null,
  }
}
