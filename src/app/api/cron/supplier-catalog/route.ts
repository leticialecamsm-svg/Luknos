import { NextRequest, NextResponse } from 'next/server'
import { syncAccordCatalog } from '@/lib/catalog/accord-sync'

// GET /api/cron/supplier-catalog — segunda 6h. Atualiza as fotos e medidas do
// catálogo da Accord usadas em Cotação e Preços (passe o mouse no produto).

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await syncAccordCatalog())
}
