import { createAdminClient } from '@/lib/supabase/admin'
import { ReportsPage, type ReportRow } from '@/components/reports/ReportsPage'
import { getTeamUpdateHealth } from '@/lib/negotiation-updates'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Relatórios — Luknos' }

export default async function Page() {
  const admin = createAdminClient()

  const [qfRes, qRes, cRes, nRes, aRes, hRes, gRes, health] = await Promise.all([
    admin.from('quotes_full')
      .select('id, number, client_id, client_name, architect_id, architect_name, origin, temperature, loss_reason, final_value, quoted_value, quote_date, created_at, closed_at, owners')
      .limit(20000),
    admin.from('quotes').select('id, paid_traffic_type').limit(20000),
    admin.from('contacts').select('id, type').neq('type', 'client').limit(20000),
    admin.from('negotiations').select('quote_id, temperature_updated_at').limit(20000),
    admin.from('activities').select('quote_id, created_at').not('user_id', 'is', null).limit(50000),
    admin.from('neg_temperature_history').select('quote_id, created_at').eq('auto_demoted', false).limit(50000),
    admin.from('monthly_goals').select('user_id, year, month, target'),
    getTeamUpdateHealth(),
  ])

  const paid = new Map((qRes.data ?? []).map((q: any) => [q.id, q.paid_traffic_type]))
  const partnerType = new Map((cRes.data ?? []).map((c: any) => [c.id, c.type]))

  // Última notícia dada por uma pessoa (nota, troca manual de temperatura)
  const touch = new Map<string, string>()
  const bump = (id: string, iso?: string | null) => { if (iso && (!touch.get(id) || iso > touch.get(id)!)) touch.set(id, iso) }
  ;(aRes.data ?? []).forEach((a: any) => bump(a.quote_id, a.created_at))
  ;(hRes.data ?? []).forEach((h: any) => bump(h.quote_id, h.created_at))
  ;(nRes.data ?? []).forEach((n: any) => bump(n.quote_id, n.temperature_updated_at))

  const rows: ReportRow[] = (qfRes.data ?? []).map((q: any) => {
    const created = String(q.created_at ?? '').slice(0, 10)
    // quote_date é a data real do pedido; created_at pode ser a data em que foi digitado
    const requested = q.quote_date && q.quote_date < created ? q.quote_date : created
    return {
      id: q.id,
      number: q.number,
      client: q.client_name ?? '',
      clientId: q.client_id ?? null,
      origin: q.origin ?? 'other',
      paidTraffic: !!paid.get(q.id),
      partnerId: q.architect_id ?? null,
      partnerName: q.architect_name ?? null,
      partnerType: q.architect_id ? (partnerType.get(q.architect_id) ?? 'other') : null,
      temperature: q.temperature ?? null,
      lossReason: q.loss_reason ?? null,
      value: Number(q.final_value ?? 0),
      quoted: Number(q.quoted_value ?? 0),
      createdAt: requested,
      closedAt: q.closed_at ? String(q.closed_at).slice(0, 10) : null,
      lastTouch: touch.get(q.id) ?? q.created_at ?? null,
      owners: (Array.isArray(q.owners) ? q.owners : [])
        .filter((o: any) => o?.user_id)
        .map((o: any) => ({ id: o.user_id, name: o.name ?? '—', color: o.avatar_color ?? '#6B7280' })),
    }
  })

  const goals = (gRes.data ?? []).map((g: any) => ({ userId: g.user_id, year: g.year, month: g.month, target: Number(g.target) }))

  return <ReportsPage rows={rows} health={health} goals={goals} />
}
