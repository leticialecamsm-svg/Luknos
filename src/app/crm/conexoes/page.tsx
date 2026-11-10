import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCrmConnections } from '@/lib/crm-actions'
import { CrmConnections } from '@/components/crm/CrmConnections'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conexões — CRM Luknos' }

export default async function Page() {
  // o layout do CRM já garante o acesso; a tela de conexões é só para administradores
  const supabase = createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const { data: profile } = await supabase.from('users').select('role').eq('id', claims!.claims.sub).single()
  if (profile?.role !== 'admin') redirect('/crm')

  const data = await getCrmConnections()
  if ('error' in data) return <p role="alert" className="text-sm text-red-600">{data.error}</p>
  return <CrmConnections initial={data} />
}
