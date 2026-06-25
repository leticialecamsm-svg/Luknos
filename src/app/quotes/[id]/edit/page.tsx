import { notFound } from 'next/navigation'
import { getQuoteById, getActiveUsers } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { QuoteForm } from '@/components/quotes/QuoteForm'

export const dynamic = 'force-dynamic'

export default async function EditQuotePage({ params }: { params: { id: string } }) {
  const [quote, users] = await Promise.all([getQuoteById(params.id), getActiveUsers()])
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!quote) notFound()
  return <QuoteForm quote={quote} users={users} currentUserId={user?.id ?? ''} />
}
