import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Verifica se o usuário logado pode acessar `pagePath` (ex: '/finance').
// Admin sempre passa. Os demais papéis só acessam o que estiver marcado
// em roles.allowed_pages — configurável em /admin/users.
// Use no topo de cada layout.tsx de rota protegida.
export async function requirePageAccess(pagePath: string) {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile) redirect('/auth/login')
  if (profile.role === 'admin') return { profile, allowedPages: null as string[] | null }

  const admin = createAdminClient()
  const { data: role } = await admin.from('roles').select('allowed_pages').eq('name', profile.role).maybeSingle()
  const allowedPages: string[] = role?.allowed_pages ?? []

  const hasAccess = allowedPages.some(p => pagePath === p || pagePath.startsWith(p + '/'))
  if (!hasAccess) redirect(allowedPages[0] ?? '/dashboard')

  return { profile, allowedPages }
}
