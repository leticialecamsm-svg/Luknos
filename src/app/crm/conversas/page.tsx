import { createClient } from '@/lib/supabase/server'
import { getSystemUsersForCrm, getActingContext } from '@/lib/crm-actions'
import { CrmInboxPage } from '@/components/crm/CrmInboxPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversas — CRM Luknos' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Page({ searchParams }: { searchParams: { c?: string } }) {
  // o layout (src/app/crm/layout.tsx) já garante acesso via requirePageAccess.
  // o layout já validou a sessão com o servidor de login; aqui basta ler o token (verificado localmente)
  const [{ data: claims }, users, acting] = await Promise.all([createClient().auth.getClaims(), getSystemUsersForCrm(), getActingContext()])
  const initialId = searchParams.c && UUID.test(searchParams.c) ? searchParams.c : null
  return <CrmInboxPage currentUserId={acting.acting?.id ?? claims!.claims.sub} users={users as any} initialConversationId={initialId} actingAsName={acting.acting?.name ?? null} isAdmin={acting.can_act} />
}
