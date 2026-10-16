import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCrmMessagePush } from '@/lib/crm-push'

export const dynamic = 'force-dynamic'

// Chamado pelo banco (gatilho em crm_messages) a cada mensagem recebida: manda o aviso por push.
export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const given = req.headers.get('x-cron-secret')
  const { data: sec } = await admin.from('internal_cron_secrets').select('secret').eq('name', 'crm-push').maybeSingle()
  if (!given || !sec?.secret || given !== sec.secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (typeof body?.message_id !== 'string') return NextResponse.json({ error: 'missing_message_id' }, { status: 400 })
  return NextResponse.json(await sendCrmMessagePush(body.message_id))
}
