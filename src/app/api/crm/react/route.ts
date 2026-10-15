import { NextRequest, NextResponse } from 'next/server'
import { reactToMessage } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

// Reação por rota (em paralelo com os envios).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { messageId?: string; emoji?: string } | null
  if (!body?.messageId || typeof body.emoji !== 'string') return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  return NextResponse.json(await reactToMessage(body.messageId, body.emoji))
}
