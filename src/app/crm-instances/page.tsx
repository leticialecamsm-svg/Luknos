import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCrmInstances, getSystemUsersForCrm } from '@/lib/crm-actions'
import { CrmInstancesPage } from '@/components/crm/CrmInstancesPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Números do CRM — Luknos' }

export default async function Page() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/crm')

  const [items, users] = await Promise.all([getCrmInstances(), getSystemUsersForCrm()])
  return <CrmInstancesPage initial={items as any} users={users as any} />
}
