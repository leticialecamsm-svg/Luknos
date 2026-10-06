import { NextRequest, NextResponse } from 'next/server'
import { syncAccordCatalog } from '@/lib/catalog/accord-sync'
import { syncUsinaCatalog } from '@/lib/catalog/usina-sync'
import { syncSorteluzCatalog } from '@/lib/catalog/sorteluz-sync'

// GET /api/cron/supplier-catalog?source=accord|usina|sorteluz — segunda de manhã, uma rodada por site.
// Atualiza as fotos e medidas dos catálogos usados em Cotação e Preços (passe o mouse no produto).

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const source = req.nextUrl.searchParams.get('source') ?? 'accord'
  if (source === 'usina') return NextResponse.json(await syncUsinaCatalog())
  if (source === 'sorteluz') return NextResponse.json(await syncSorteluzCatalog())
  if (source === 'accord') return NextResponse.json(await syncAccordCatalog())
  return NextResponse.json({ error: 'source inválido' }, { status: 400 })
}
