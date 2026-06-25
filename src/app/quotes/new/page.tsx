import { QuoteForm } from '@/components/quotes/QuoteForm'
import { getActiveUsers } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function NewQuotePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const users = await getActiveUsers()

  return <QuoteForm users={users} currentUserId={user?.id ?? ''} />
}
