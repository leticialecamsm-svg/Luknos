import { NextRequest, NextResponse } from 'next/server'
import { getCrmSnapshot } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'

const SCOPES = ['mine', 'unassigned', 'all', 'groups'] as const
type Scope = (typeof SCOPES)[number]

// Lista + contadores por GET (ver api/crm/messages: leitura fora da fila das ações do servidor).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const scope = (SCOPES as readonly string[]).includes(sp.get('scope') ?? '') ? (sp.get('scope') as Scope) : 'mine'
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 200, 1), 500)
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean)
  const labels = (sp.get('labels') ?? '').split(',').filter(Boolean)
  const r = await getCrmSnapshot(scope, limit, ids.length ? ids : undefined, sp.get('stages') === '1', labels.length ? labels : undefined)
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
