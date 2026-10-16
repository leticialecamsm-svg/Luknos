import { NextRequest, NextResponse } from 'next/server'
import { getCrmMessages } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

// Leitura das mensagens por GET: as ações do servidor (POST) andam em fila, uma por vez, então
// uma leitura em andamento atrasava o envio da próxima mensagem. Por aqui as leituras correm em paralelo.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const conversationId = sp.get('c')
  if (!conversationId) return NextResponse.json({ error: 'Conversa não informada', items: [], hasMore: false }, { status: 400 })
  const r = await getCrmMessages(conversationId, { before: sp.get('before'), limit: Number(sp.get('limit')) || undefined })
  return NextResponse.json(r, { status: 'error' in r && r.error ? 403 : 200, headers: { 'Cache-Control': 'no-store' } })
}
