import { NextRequest, NextResponse } from 'next/server'
import { requireBotAccess } from '@/lib/bot-access'
import { buildAuthUrl } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'

// Inicia a conexão do Google Drive (só admin).
export async function GET(req: NextRequest) {
  await requireBotAccess({ requireAdmin: true })
  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildAuthUrl(req.nextUrl.origin, state))
  res.cookies.set('g_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' })
  return res
}
