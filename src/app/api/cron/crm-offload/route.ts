import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { offloadMessageToDrive } from '@/lib/crm-media'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Passa para o Google Drive os arquivos do CRM que ainda estão no Supabase (os antigos e os
// que a equipe envia) e libera o espaço lá. Figurinhas (webp) ficam no Supabase: são pequenas
// e a biblioteca de figurinhas usa o arquivo direto.
// Chamado pelo pg_cron (cabeçalho x-cron-secret, tabela internal_cron_secrets 'crm-offload').
const BUDGET_MS = 240_000

export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const given = req.headers.get('x-cron-secret')
  const { data: sec } = await admin.from('internal_cron_secrets').select('secret').eq('name', 'crm-offload').maybeSingle()
  if (!given || !sec?.secret || given !== sec.secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 60, 300)
  const { data: rows, error } = await admin
    .from('crm_messages')
    .select('id, storage_path, file_name, mime_type, created_at')
    .not('storage_path', 'is', null)
    .is('drive_file_id', null)
    .or('mime_type.is.null,mime_type.neq.image/webp')
    .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const started = Date.now()
  let moved = 0
  const failed: string[] = []
  for (const r of rows ?? []) {
    if (Date.now() - started > BUDGET_MS) break
    try {
      await offloadMessageToDrive(r as any)
      moved++
    } catch (e: any) {
      failed.push(`${r.id}: ${String(e?.message ?? e).slice(0, 120)}`)
    }
  }
  return NextResponse.json({ checked: rows?.length ?? 0, moved, failed })
}
