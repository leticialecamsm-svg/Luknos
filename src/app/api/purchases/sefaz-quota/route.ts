import { NextResponse } from 'next/server'
import { getSefazQuotaUsage } from '@/lib/sefaz-quota'

export async function GET() {
  const quota = await getSefazQuotaUsage()
  return NextResponse.json(quota)
}
