import { createClient } from '@/lib/supabase/server'
import { CrmBoardPage } from '@/components/crm/CrmBoardPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'CRM — Luknos' }

export default async function Page() {
  // o layout (src/app/crm/layout.tsx) já garante acesso via requirePageAccess.
  const supabase = createClient()
  // o layout já validou a sessão com o servidor de login; aqui basta ler o token (verificado localmente)
  const { data: claims } = await supabase.auth.getClaims()
  const { data: profile } = await supabase.from('users').select('role').eq('id', claims!.claims.sub).single()
  return <CrmBoardPage isAdmin={profile?.role === 'admin'} />
}
