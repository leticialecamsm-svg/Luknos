import { NextRequest, NextResponse } from 'next/server'
import { getIncomingNotification } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

// Dados do aviso de mensagem nova, por GET (fora da fila das ações: não atrasa um envio em andamento).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('m')
  if (!id) return NextResponse.json(null, { status: 400 })
  return NextResponse.json(await getIncomingNotification(id), { headers: { 'Cache-Control': 'no-store' } })
}
