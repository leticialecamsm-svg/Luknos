import { NextRequest, NextResponse } from 'next/server'
import { sendCrmMessage } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Envio de mensagem por rota (em paralelo; não espera outras ações do servidor terminarem).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.conversationId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  return NextResponse.json(await sendCrmMessage(body))
}
