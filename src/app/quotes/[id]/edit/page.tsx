import { notFound } from 'next/navigation'
import { getQuoteById, getActiveUsers } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { EditQuoteForm } from '@/components/quotes/EditQuoteForm'

export default async function EditQuotePage({ params }: { params: { id: string } }) {
  const [quote, users] = await Promise.all([getQuoteById(params.id), getActiveUsers()])
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!quote) notFound()
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Editar orçamento #{String(quote.number).padStart(3,'0')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{quote.client_name}</p>
      </div>
      <EditQuoteForm quote={quote} users={users} currentUserId={user?.id ?? ''} />
    </div>
  )
}
