import { NextResponse } from 'next/server'
import { getSchedules } from '@/lib/actions'

export async function GET() {
  const schedules = await getSchedules()
  // Retorna o que a função real entrega ao frontend
  const summary = (schedules as any[]).slice(0, 5).map(s => ({
    title: s.title,
    scheduled_date: s.scheduled_date,
    team_members: s.team_members,
    participants: (s.participants ?? []).map((p: any) => p?.name),
    participantsRaw: s.participants,
    creator: s.creator?.name ?? null,
    quote: s.quote ?? null,
  }))
  return NextResponse.json({ count: schedules.length, summary }, { status: 200 })
}
