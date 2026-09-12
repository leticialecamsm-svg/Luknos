import { createAdminClient } from '@/lib/supabase/admin'
import { ReportsPage, type ReportRow } from '@/components/reports/ReportsPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Relatórios — Luknos' }

export default async function Page() {
  const admin = createAdminClient()

  const [qfRes, qRes, cRes] = await Promise.all([
    admin.from('quotes_full')
      .select('id, number, client_name, architect_id, origin, temperature, final_value, quoted_value, created_at, closed_at, owners')
      .limit(20000),
    admin.from('quotes').select('id, paid_traffic_type').limit(20000),
    admin.from('contacts').select('id, type').neq('type', 'client').limit(20000),
  ])

  const paid = new Map((qRes.data ?? []).map((q: any) => [q.id, q.paid_traffic_type]))
  const partnerType = new Map((cRes.data ?? []).map((c: any) => [c.id, c.type]))

  const rows: ReportRow[] = (qfRes.data ?? []).map((q: any) => ({
    id: q.id,
    number: q.number,
    client: q.client_name ?? '',
    origin: q.origin ?? 'other',
    paidTraffic: !!paid.get(q.id),
    partnerType: q.architect_id ? (partnerType.get(q.architect_id) ?? 'other') : null,
    temperature: q.temperature ?? null,
    value: Number(q.final_value ?? 0),
    quoted: Number(q.quoted_value ?? 0),
    createdAt: String(q.created_at ?? '').slice(0, 10),
    closedAt: q.closed_at ? String(q.closed_at).slice(0, 10) : null,
    owners: (Array.isArray(q.owners) ? q.owners : [])
      .filter((o: any) => o?.user_id)
      .map((o: any) => ({ id: o.user_id, name: o.name ?? '—', color: o.avatar_color ?? '#6B7280' })),
  }))

  return <ReportsPage rows={rows} />
}
