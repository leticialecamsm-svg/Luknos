// Admin: leva os anexos de orçamento antigos (soltos na pasta do cliente) para a
// subpasta "Orçamento" da solicitação.
//   GET /api/admin/mover-anexos-orcamento            -> só lista o que seria movido
//   GET /api/admin/mover-anexos-orcamento?executar=1 -> move de verdade
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { moveQuoteFilesToOrcamento } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const execute = req.nextUrl.searchParams.get('executar') === '1'
  const r = await moveQuoteFilesToOrcamento(execute)
  return NextResponse.json({ modo: execute ? 'executado' : 'simulacao', resumo: r.summary, itens: r.items })
}
