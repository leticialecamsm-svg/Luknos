import { createClient } from '@/lib/supabase/server'
import { getSystemUsersForCrm } from '@/lib/crm-actions'
import { CrmInboxPage } from '@/components/crm/CrmInboxPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversas — CRM Luknos' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Page({ searchParams }: { searchParams: { c?: string } }) {
  // o layout (src/app/crm/layout.tsx) já garante acesso via requirePageAccess.
  const { data: { user } } = await createClient().auth.getUser()
  const users = await getSystemUsersForCrm()
  const initialId = searchParams.c && UUID.test(searchParams.c) ? searchParams.c : null
  return <CrmInboxPage currentUserId={user!.id} users={users as any} initialConversationId={initialId} />
}
