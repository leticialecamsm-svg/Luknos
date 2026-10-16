import { NextRequest, NextResponse } from 'next/server'
import { forwardCrmMessage } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Encaminhar por rota (pode demorar com arquivo: baixa, copia e envia; não trava outros envios).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { messageId?: string; targets?: string[] } | null
  if (!body?.messageId || !Array.isArray(body.targets)) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  return NextResponse.json(await forwardCrmMessage(body.messageId, body.targets))
}
