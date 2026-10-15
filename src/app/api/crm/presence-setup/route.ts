import { NextRequest, NextResponse } from 'next/server'
import { setupCrmPresenceWebhook } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

// Administrador: ?apply=1 liga o aviso de "digitando" do contato no webhook da Evolution;
// sem apply, só mostra a configuração atual de cada número.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const probe = sp.get('lid') ? { instance: sp.get('instance') ?? '', lid: sp.get('lid') ?? '', jid: sp.get('jid') ?? '' } : undefined // TEMP
  const r = await setupCrmPresenceWebhook(sp.get('apply') === '1', probe)
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
