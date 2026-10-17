import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Estado do monitoramento (tabela crm_health, escrita pela função crm-health-check) para a faixa do CRM.
// A leitura passa pelas regras de acesso do banco: só quem está logado vê.
export async function GET() {
  const supabase = createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims?.sub) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const [{ data: rows }, { data: events }] = await Promise.all([
    supabase.from('crm_health').select('component, label, status, detail, reason, since, checked_at'),
    supabase.from('crm_health_events').select('id, component, kind, message, at').order('at', { ascending: false }).limit(15),
  ])
  return NextResponse.json({ rows: rows ?? [], events: events ?? [], now: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}
