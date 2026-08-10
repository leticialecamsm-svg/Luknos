import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveUsers, getGoalPreviewData, getCollaboratorRoleNames } from '@/lib/actions'
import { GoalPreviewDashboard } from '@/components/dashboard/GoalPreviewDashboard'
import { SellerPicker } from '@/components/dashboard/SellerPicker'

export const dynamic = 'force-dynamic'

// Rota de teste — só admin acessa. Mostra o novo formato de comunicação de
// meta/ritmo (status do ritmo, meta de hoje, pipeline em jogo) pra um
// vendedor escolhido, SEM tocar no dashboard real de ninguém ainda.
export default async function MetaPreviewPage({ searchParams }: { searchParams: { userId?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [allUsers, collaboratorRoles] = await Promise.all([getActiveUsers(), getCollaboratorRoleNames()])
  const sellers = allUsers.filter((u: any) => collaboratorRoles.includes(u.role) || u.is_projetista)

  const selectedUserId = searchParams.userId ?? sellers[0]?.id
  if (!selectedUserId) {
    return <div className="p-6 text-sm text-gray-500">Nenhum vendedor ativo encontrado.</div>
  }

  const now = new Date()
  const data = await getGoalPreviewData(selectedUserId, now.getFullYear(), now.getMonth() + 1)
  const selectedUser = sellers.find((u: any) => u.id === selectedUserId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🧪 Preview — novo formato de meta</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rota de teste, visível só para admin. Não afeta o dashboard real de ninguém.</p>
        </div>
        <SellerPicker sellers={sellers} selectedId={selectedUserId} />
      </div>

      <GoalPreviewDashboard data={data} userName={selectedUser?.name ?? 'Vendedor'} />
    </div>
  )
}
