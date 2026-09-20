import { NextRequest, NextResponse } from 'next/server'
import { syncQuoteAttachmentsToDrive } from '@/lib/google-drive'

// POST /api/external/drive-sync { quote_number } — chamado pelo robô (edge
// function) depois de cadastrar o orçamento: cria a pasta no Drive e sobe os anexos.
// Auth: EXTERNAL_API_KEY.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const key =
    req.headers.get('x-api-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  const expected = process.env.EXTERNAL_API_KEY
  if (!expected || key !== expected) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const n = Number(body.quote_number)
  if (!Number.isFinite(n)) return NextResponse.json({ error: 'quote_number_required' }, { status: 422 })

  try {
    return NextResponse.json(await syncQuoteAttachmentsToDrive(n))
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
