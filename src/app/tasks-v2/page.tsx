import { getTasks, getAllTasks, getCurrentUser, getActiveUsers } from '@/lib/actions'
import { TasksV2 } from '@/components/tasks/TasksV2'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarefas v2 — Luknos' }

export default async function TasksV2Page() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [currentUser, myTasks] = await Promise.all([getCurrentUser(), getTasks()])
  const isAdmin = currentUser?.role === 'admin'
  const [allTasks, allUsers] = isAdmin
    ? await Promise.all([getAllTasks(), getActiveUsers()])
    : [[], []]

  return (
    <TasksV2
      myTasks={myTasks as any[]}
      allTasks={allTasks as any[]}
      allUsers={allUsers as any[]}
      currentUser={currentUser as any}
      isAdmin={isAdmin}
    />
  )
}
