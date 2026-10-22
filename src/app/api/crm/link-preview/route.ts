import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchLinkPreview } from '@/lib/link-preview'

export const dynamic = 'force-dynamic'

// Prévia de um link (título, imagem, site) para o cartão nas mensagens do CRM.
export async function GET(req: NextRequest) {
  const { data } = await createClient().auth.getClaims()
  if (!data?.claims?.sub) return NextResponse.json(null, { status: 401 })
  const url = req.nextUrl.searchParams.get('url') ?? ''
  if (!/^https?:\/\//i.test(url) || url.length > 2000) return NextResponse.json(null, { status: 400 })
  const preview = await fetchLinkPreview(url)
  return NextResponse.json(preview, { headers: { 'Cache-Control': 'private, max-age=86400' } })
}
