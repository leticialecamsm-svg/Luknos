import { createClient } from '@/lib/supabase/server'
import { CrmBoardPage } from '@/components/crm/CrmBoardPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'CRM — Luknos' }

export default async function Page() {
  // o layout (src/app/crm/layout.tsx) já garante acesso via requirePageAccess.
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
  return <CrmBoardPage isAdmin={profile?.role === 'admin'} />
}
