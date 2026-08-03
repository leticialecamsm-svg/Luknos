import { getRoles, getAllUsersForAdmin } from '@/lib/actions'
import { UsersAdminPanel } from '@/components/admin/UsersAdminPanel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Usuários e Papéis — Luknos' }

export default async function AdminUsersPage() {
  const [roles, users] = await Promise.all([getRoles(), getAllUsersForAdmin()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usuários e Papéis</h1>
        <p className="text-gray-500 mt-1">Crie usuários, defina tipos de acesso e escolha quais páginas cada um pode ver.</p>
      </div>
      <UsersAdminPanel initialRoles={roles as any[]} initialUsers={users as any[]} />
    </div>
  )
}
