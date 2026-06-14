import { TasksListNew } from '@/components/tasks/TasksListNew'
import { getTasks, getAllTasks, getCurrentUser, getActiveUsers } from '@/lib/actions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Tarefas — Luknos',
}

export default async function TasksPage() {
  const [user, myTasks] = await Promise.all([
    getCurrentUser(),
    getTasks(),
  ])

  const isAdmin = user?.role === 'admin'

  const [allTasks, allUsers] = isAdmin
    ? await Promise.all([getAllTasks(), getActiveUsers()])
    : [[], []]

  return (
    <TasksListNew
      initialMyTasks={myTasks as any}
      initialAllTasks={allTasks as any}
      initialUsers={allUsers as any}
      initialUserName={user?.name ?? 'Usuário'}
      initialUserRole={user?.role ?? 'seller'}
    />
  )
}
