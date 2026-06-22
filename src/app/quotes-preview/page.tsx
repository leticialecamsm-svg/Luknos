import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllQuotes, getActiveUsers } from '@/lib/actions'
import { QuotesWorkspace } from '@/components/quotes/QuotesWorkspace'

export const dynamic = 'force-dynamic'

export default async function QuotesPreview() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [allQuotes, users] = await Promise.all([getAllQuotes(), getActiveUsers()])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Orçamentos <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ml-2">preview</span></h1>
          <p className="text-sm text-gray-500 mt-0.5">Visão orientada a fechamento — para sua aprovação</p>
        </div>
        <a href="/quotes/new" className="btn-primary">+ Novo orçamento</a>
      </div>
      <QuotesWorkspace allQuotes={allQuotes} users={users} />
    </div>
  )
}
