import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const db = createClient()
  const { data: { user } } = await db.auth.getUser()

  // Lê schedules cru (admin) e os ids de participantes
  const { data: schedules } = await createAdminClient()
    .from('schedules')
    .select('id, title, team_members, created_by')
    .order('created_at', { ascending: false })
    .limit(3)

  const userIds = Array.from(new Set(
    (schedules ?? []).flatMap((s: any) => s.team_members ?? []).filter(Boolean)
  ))

  // Tenta ler users com o cliente AUTENTICADO (como o enrichSchedules faz)
  const authRead = userIds.length
    ? await db.from('users').select('id, name, avatar_url').in('id', userIds)
    : { data: [], error: null }

  // Tenta ler users com o cliente ADMIN (service role)
  const adminRead = userIds.length
    ? await createAdminClient().from('users').select('id, name, avatar_url').in('id', userIds)
    : { data: [], error: null }

  return NextResponse.json({
    authenticatedUser: user?.id ?? null,
    sampleSchedules: schedules,
    participantUserIds: userIds,
    authClient_usersFound: (authRead.data ?? []).map((u: any) => u.name),
    authClient_error: authRead.error?.message ?? null,
    adminClient_usersFound: (adminRead.data ?? []).map((u: any) => u.name),
    adminClient_error: adminRead.error?.message ?? null,
  }, { status: 200 })
}
