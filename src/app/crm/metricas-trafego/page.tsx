import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadTrafficMetrics } from '@/lib/traffic-metrics'
import { TrafficMetrics } from '@/components/crm/TrafficMetrics'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Métricas do tráfego — CRM Luknos' }

const DAY = /^\d{4}-\d{2}-\d{2}$/

function thisMonth() {
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  const [y, m] = today.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(last).padStart(2, '0')}` }
}

export default async function Page({ searchParams }: { searchParams: { de?: string; ate?: string } }) {
  // o layout do CRM já garante o acesso; as métricas são só para admin
  const supabase = createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const { data: profile } = await supabase.from('users').select('role').eq('id', claims!.claims.sub).single()
  if (profile?.role !== 'admin') redirect('/crm')

  let { from, to } = thisMonth()
  if (DAY.test(searchParams.de ?? '') && DAY.test(searchParams.ate ?? '')) {
    from = searchParams.de!
    to = searchParams.ate!
    if (from > to) [from, to] = [to, from]
  }
  const data = await loadTrafficMetrics(from, to)
  return <TrafficMetrics data={data} />
}
