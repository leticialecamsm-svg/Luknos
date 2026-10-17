import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendHealthPush } from '@/lib/crm-push'

export const dynamic = 'force-dynamic'

// Chamado pelo monitor (função crm-health-check) quando algo cai ou volta: avisa a equipe por push.
export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const given = req.headers.get('x-cron-secret')
  const { data: sec } = await admin.from('internal_cron_secrets').select('secret').eq('name', 'crm-health').maybeSingle()
  if (!given || !sec?.secret || given !== sec.secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (typeof body?.title !== 'string' || typeof body?.body !== 'string') return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  return NextResponse.json(await sendHealthPush(body.title.slice(0, 120), body.body.slice(0, 300)))
}
