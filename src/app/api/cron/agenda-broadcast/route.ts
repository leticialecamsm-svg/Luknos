import { NextRequest, NextResponse } from 'next/server'

// GET /api/cron/agenda-broadcast — disparo diário (08h30 America/Sao_Paulo) da
// agenda da semana + resumo do dia para todos os colaboradores do robô.
// Agendado pelo cron da Vercel (vercel.json → "30 11 * * *" UTC).
//
// Auth: header Authorization "Bearer <CRON_SECRET>" (a Vercel envia isso
// automaticamente quando a env CRON_SECRET existe). Sem CRON_SECRET, libera.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  // ?dry=1 — mostra o que cada colaborador receberia, sem enviar nada
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/wa-agenda-daily`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'x-internal-call': '1',
      },
      body: JSON.stringify({ dry_run: dryRun }),
    })
    const body = await res.json().catch(() => null)
    return NextResponse.json({ ok: res.ok, status: res.status, result: body })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
}
