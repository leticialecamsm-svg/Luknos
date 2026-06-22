import { NextRequest, NextResponse } from 'next/server'
import { debugContactQuotes } from '@/lib/actions'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const result = await debugContactQuotes(id)
  return NextResponse.json(result, { status: 200 })
}
