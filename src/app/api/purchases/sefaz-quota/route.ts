import { NextResponse } from 'next/server'
import { getSefazQuotaUsage, getRecentSefazCalls } from '@/lib/sefaz-quota'

export async function GET() {
  const [quota, recent] = await Promise.all([getSefazQuotaUsage(), getRecentSefazCalls(12)])
  return NextResponse.json({ ...quota, recent })
}
