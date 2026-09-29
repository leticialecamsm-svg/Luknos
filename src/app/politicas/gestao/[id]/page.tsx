import { notFound, redirect } from 'next/navigation'
import { getAdminPolicy, listAssignableUsers } from '@/lib/policies/actions'
import { PolicyEditor } from '@/components/policies/PolicyEditor'

export const dynamic = 'force-dynamic'

export default async function EditPolicyPage({ params }: { params: { id: string } }) {
  const [detail, users] = await Promise.all([getAdminPolicy(params.id), listAssignableUsers()])
  if (!detail) {
    // getAdminPolicy devolve null tanto para "não é admin" quanto "não existe"
    if (!users.length) redirect('/politicas')
    notFound()
  }
  return <PolicyEditor detail={detail} users={users as { id: string; name: string; role: string }[]} />
}
