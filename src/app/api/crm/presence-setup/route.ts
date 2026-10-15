import { NextRequest, NextResponse } from 'next/server'
import { setupCrmPresenceWebhook } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

// Administrador: ?apply=1 liga o aviso de "digitando" do contato no webhook da Evolution;
// sem apply, só mostra a configuração atual de cada número.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  // ?events=PRESENCE_UPDATE,MESSAGES_UPDATE (padrão: PRESENCE_UPDATE)
  const events = sp.get('events')?.split(',').map((e) => e.trim().toUpperCase()).filter((e) => /^[A-Z_]+$/.test(e))
  const r = await setupCrmPresenceWebhook(sp.get('apply') === '1', events?.length ? events : undefined)
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
