import { NewQuoteForm } from '@/components/quotes/NewQuoteForm'
import { getActiveUsers } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'

export default async function NewQuotePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const users = await getActiveUsers()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Novo orçamento</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Preencha os campos obrigatórios e salve
        </p>
      </div>
      <NewQuoteForm currentUserId={user?.id ?? ''} users={users} />
    </div>
  )
}
