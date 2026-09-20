import { NextRequest, NextResponse } from 'next/server'
import { requireBotAccess } from '@/lib/bot-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { emailFromIdToken, exchangeCode } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  await requireBotAccess({ requireAdmin: true })
  const back = (q: string) => NextResponse.redirect(new URL(`/bot-config?${q}`, req.nextUrl.origin))

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const expected = req.cookies.get('g_oauth_state')?.value
  if (req.nextUrl.searchParams.get('error')) return back('drive=denied')
  if (!code || !state || state !== expected) return back('drive=invalid_state')

  try {
    const tokens = await exchangeCode(code, req.nextUrl.origin)
    if (!tokens.refresh_token) return back('drive=no_refresh_token')
    const { data: { user } } = await createClient().auth.getUser()
    const { error } = await createAdminClient()
      .from('google_drive_connection')
      .upsert({
        id: true,
        refresh_token: tokens.refresh_token,
        account_email: emailFromIdToken(tokens.id_token),
        connected_at: new Date().toISOString(),
        connected_by: user?.id ?? null,
      })
    if (error) return back('drive=save_failed')
  } catch {
    return back('drive=error')
  }
  const res = back('drive=ok')
  res.cookies.delete('g_oauth_state')
  return res
}
