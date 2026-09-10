import { getMyTasksWeek, getAllTasksWeek, getCurrentUser, getActiveUsers, getSchedules } from '@/lib/actions'
import { TasksV5 } from '@/components/tasks/TasksV5'
import { requireAnyPageAccess, canAccessPage } from '@/lib/access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarefas e Agenda — Luknos' }

export default async function TasksPage({ searchParams }: { searchParams?: { view?: string } }) {
  // Tarefas e Agenda eram duas páginas; quem tinha permissão de qualquer uma
  // das duas continua entrando aqui.
  const { allowedPages } = await requireAnyPageAccess(['/dashboard/tasks', '/schedules'])

  // A agenda virou uma aba/painel dentro de Tarefas, mas continua obedecendo a
  // permissão da página /schedules — quem não tinha acesso à Agenda antes
  // também não passa a ver os compromissos da equipe agora.
  const canSeeAgenda = canAccessPage(allowedPages, '/schedules')

  // Agenda: do mês passado até 4 meses à frente, pra cobrir a navegação de semanas
  const now = new Date()
  const agStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
  const agEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString().split('T')[0]

  // Ativas: sempre todas. Concluídas: só a semana atual (weekOffset 0) —
  // o resto do histórico é buscado sob demanda pelo passador de semana.
  const [currentUser, myTasks, schedules] = await Promise.all([
    getCurrentUser(),
    getMyTasksWeek(0),
    canSeeAgenda ? getSchedules(agStart, agEnd) : Promise.resolve([]),
  ])
  const isAdmin = currentUser?.role === 'admin'
  const [allTasks, allUsers] = isAdmin
    ? await Promise.all([getAllTasksWeek(0), getActiveUsers()])
    : [[], []]

  return (
    <TasksV5
      myTasks={myTasks as any[]}
      allTasks={allTasks as any[]}
      allUsers={allUsers as any[]}
      currentUser={currentUser as any}
      isAdmin={isAdmin}
      canSeeAgenda={canSeeAgenda}
      initialSchedules={schedules as any[]}
      initialView={canSeeAgenda && searchParams?.view === 'agenda' ? 'agenda' : 'tarefas'}
    />
  )
}
