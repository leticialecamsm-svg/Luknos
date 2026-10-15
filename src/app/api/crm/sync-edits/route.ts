import { NextRequest, NextResponse } from 'next/server'
import { syncCrmEdits } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Recupera edições/apagamentos feitos no WhatsApp que o CRM não registrou (?c=<conversa>).
export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('c')
  if (!c) return NextResponse.json({ error: 'Conversa não informada' }, { status: 400 })
  return NextResponse.json(await syncCrmEdits(c), { headers: { 'Cache-Control': 'no-store' } })
}
