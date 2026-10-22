import { NextRequest, NextResponse } from 'next/server'
import { rebuildCatalogPrices } from '@/lib/proposals/catalog-prices'

// GET /api/cron/catalog-prices — todo dia cedo. Recalcula o preço de cada produto do catálogo
// a partir das compras (Cotação e Preços), usado no Orçamento de Produtos.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await rebuildCatalogPrices())
}
