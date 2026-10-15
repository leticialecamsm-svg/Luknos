import { NextRequest, NextResponse } from 'next/server'
import { setupCrmPresenceWebhook } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

// Administrador: ?apply=1 liga o aviso de "digitando" do contato no webhook da Evolution;
// sem apply, só mostra a configuração atual de cada número.
export async function GET(req: NextRequest) {
  const r = await setupCrmPresenceWebhook(req.nextUrl.searchParams.get('apply') === '1')
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
