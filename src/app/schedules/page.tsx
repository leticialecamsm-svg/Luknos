import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSchedules } from '@/lib/actions'
import { SchedulesContainer } from '@/components/schedules/SchedulesContainer'

export default async function SchedulesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Pega agenda do mês atual
  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const schedules = await getSchedules(startDate, endDate)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500 mt-1">Visualize e gerencie agendamentos da equipe</p>
        </div>
      </div>

      <SchedulesContainer initialSchedules={schedules} />
    </div>
  )
}
