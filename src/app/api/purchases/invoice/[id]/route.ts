import { NextRequest, NextResponse } from 'next/server'
import { getPurchaseInvoice } from '@/lib/actions'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const data = await getPurchaseInvoice(params.id)
  if (!data) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(data)
}
