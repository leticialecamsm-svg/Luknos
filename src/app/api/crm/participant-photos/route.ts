import { NextRequest, NextResponse } from 'next/server'
import { getParticipantPhotos } from '@/lib/crm-actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Fotos de perfil de quem fala no grupo aberto (jid -> link), para mostrar ao lado das mensagens.
export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('c')
  if (!c) return NextResponse.json({ photos: {} }, { status: 400 })
  const r = await getParticipantPhotos(c)
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
