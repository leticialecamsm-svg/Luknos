import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllQuotes, getActiveUsers } from '@/lib/actions'
import { NegotiationsWorkspace } from '@/components/negotiations/NegotiationsWorkspace'

export const dynamic = 'force-dynamic'

export default async function NegotiationsPreview() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [allQuotes, users] = await Promise.all([getAllQuotes(), getActiveUsers()])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Negociações <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ml-2">preview</span></h1>
          <p className="text-sm text-gray-500 mt-0.5">Comercial — indicadores e prioridade de fechamento (preview p/ aprovação)</p>
        </div>
        <a href="/quotes/new" className="btn-primary">+ Novo orçamento</a>
      </div>
      <NegotiationsWorkspace allQuotes={allQuotes} users={users} />
    </div>
  )
}
