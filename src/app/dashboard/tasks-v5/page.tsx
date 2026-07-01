import { getTasks, getAllTasks, getCurrentUser, getActiveUsers } from '@/lib/actions'
import { TasksV5 } from '@/components/tasks/TasksV5'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarefas — Luknos' }

export default async function TasksV5Page() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [currentUser, myTasks] = await Promise.all([getCurrentUser(), getTasks()])
  const isAdmin = currentUser?.role === 'admin'
  const [allTasks, allUsers] = isAdmin
    ? await Promise.all([getAllTasks(), getActiveUsers()])
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
