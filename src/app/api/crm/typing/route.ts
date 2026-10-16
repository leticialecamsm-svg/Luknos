import { NextRequest, NextResponse } from 'next/server'
import { setCrmTyping } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

// "Digitando…" do atendente. Por rota (e não ação do servidor) para não entrar na fila das ações
// e nunca atrasar o envio de uma mensagem.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { c?: string; state?: string } | null
  if (!body?.c || (body.state !== 'composing' && body.state !== 'paused')) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  const r = await setCrmTyping(body.c, body.state)
  return NextResponse.json(r, { status: 'error' in r && r.error ? 403 : 200 })
}
