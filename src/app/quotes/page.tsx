import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllQuotes, getMyQuotes } from '@/lib/actions'
import { QuotesList } from '@/components/quotes/QuotesList'
import { NewQuoteButton } from '@/components/quotes/NewQuoteButton'

export default async function QuotesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'
  const [myQuotes, allQuotes] = await Promise.all([
    getMyQuotes(),
    getAllQuotes(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Orçamentos</h1>
        <NewQuoteButton className="btn-primary">+ Novo orçamento</NewQuoteButton>
      </div>
      <QuotesList myQuotes={myQuotes} allQuotes={allQuotes} isAdmin={isAdmin} />
    </div>
  )
}
