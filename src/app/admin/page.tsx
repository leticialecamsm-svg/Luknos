import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminPanel } from '@/components/admin/AdminPanel'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: users } = await supabase.from('users').select('*').order('active', { ascending: false }).order('name')

  const now = new Date()
  const { data: goals } = await supabase
    .from('monthly_goals')
    .select('*')
    .eq('year', now.getFullYear())
    .eq('month', now.getMonth() + 1)

  return <AdminPanel users={users ?? []} goals={goals ?? []} />
}
