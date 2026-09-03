import { getMyTasksWeek, getAllTasksWeek, getCurrentUser, getActiveUsers } from '@/lib/actions'
import { TasksV5 } from '@/components/tasks/TasksV5'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarefas — Luknos' }

export default async function TasksPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Ativas: sempre todas. Concluídas: só a semana atual (weekOffset 0) —
  // o resto do histórico é buscado sob demanda pelo passador de semana.
  const [currentUser, myTasks] = await Promise.all([getCurrentUser(), getMyTasksWeek(0)])
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
    />
  )
}
