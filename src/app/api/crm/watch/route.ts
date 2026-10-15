import { NextRequest, NextResponse } from 'next/server'
import { setCrmWatch } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

// Conversa aberta e à vista (online=true, repetido a cada ~20 s) ou não mais (online=false).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { c?: string; online?: boolean } | null
  if (!body?.c) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  const r = await setCrmWatch(body.c, !!body.online)
  return NextResponse.json(r, { status: 'error' in r && r.error ? 403 : 200 })
}
