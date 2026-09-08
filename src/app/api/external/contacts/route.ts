import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Busca de contatos para o Robô de Orçamentos WhatsApp (Edge Function
// resolve-contact). Autenticada por API key — NUNCA expõe contatos sem a chave.
// A escrita de orçamento continua sendo exclusiva de POST /api/external/quotes.

export const dynamic = 'force-dynamic'

function authorized(req: NextRequest): boolean {
  const key =
    req.headers.get('x-api-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  const expected = process.env.EXTERNAL_API_KEY
  return !!expected && key === expected
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role') === 'partner' ? 'partner' : 'client'
  const name = (searchParams.get('name') ?? '').trim().slice(0, 120)
  const phoneDigits = (searchParams.get('phone') ?? '').replace(/\D/g, '')

  if (!name && !phoneDigits) {
    return NextResponse.json({ found: false, matches: [], needs_creation: true })
  }

  const db = createAdminClient()
  let q = db.from('contacts').select('id, name, phone, type, company')

  // client = type 'client'; partner/especificador = qualquer outro tipo
  q = role === 'partner' ? q.neq('type', 'client') : q.eq('type', 'client')

  // sanitiza para o filtro PostgREST (vírgula/parênteses/asterisco quebram o .or())
  const safeName = name.replace(/[,()*\\.]/g, ' ').trim()
  const filters: string[] = []
  if (safeName) filters.push(`name.ilike.%${safeName}%`)
  if (phoneDigits) filters.push(`phone.ilike.%${phoneDigits.slice(-8)}%`)
  if (filters.length === 0) {
    return NextResponse.json({ found: false, matches: [], needs_creation: true })
  }
  q = q.or(filters.join(','))

  const { data, error } = await q.limit(8)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const matches = (data ?? []).map((c) => ({
    system_contact_id: c.id,
    name: c.name,
    phone: c.phone ?? null,
    type: c.type,
    company: c.company ?? null,
  }))

  return NextResponse.json({
    found: matches.length > 0,
    matches,
    needs_creation: matches.length === 0,
  })
}
