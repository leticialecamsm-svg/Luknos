import { createClient } from '@/lib/supabase/server'
import { getSystemUsersForCrm } from '@/lib/crm-actions'
import { CrmInboxPage } from '@/components/crm/CrmInboxPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'CRM — Luknos' }

export default async function Page() {
  // o layout (src/app/crm/layout.tsx) já garante acesso via requirePageAccess.
  const { data: { user } } = await createClient().auth.getUser()
  const users = await getSystemUsersForCrm()
  return <CrmInboxPage currentUserId={user!.id} users={users as any} />
}
