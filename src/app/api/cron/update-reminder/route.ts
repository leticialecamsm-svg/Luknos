import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { buildTeamUpdateSnapshot } from '@/lib/negotiation-updates'

// GET /api/cron/update-reminder — 17h (America/Sao_Paulo), segunda a sábado.
// Manda pelo robô, pra cada vendedor, as negociações da lista do dia que ele
// ainda não atualizou. Também é o que cria a lista do dia de quem não abriu o
// sistema — assim todo mundo tem "due" registrado (base da gamificação).
//
// Só envia se wa_bot_config.update_reminder_enabled = true.
// ?dry=1 → mostra o que cada um receberia, sem enviar (funciona mesmo desligado).

export const dynamic = 'force-dynamic'

async function isAdminSession() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return false
  const { data } = await createAdminClient().from('users').select('role').eq('id', user.id).maybeSingle()
  return data?.role === 'admin'
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  const admin = createAdminClient()
  const [{ data: cfg }, { data: collabs }] = await Promise.all([
    admin.from('wa_bot_config').select('update_reminder_enabled, system_api_base_url')
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    admin.from('wa_collaborators').select('phone_e164, display_name, system_user_id').eq('is_active', true),
  ])

  const snapshot = await buildTeamUpdateSnapshot()
  const base = (cfg?.system_api_base_url || 'https://luknos.vercel.app').replace(/\/$/, '')
  const enabled = !!cfg?.update_reminder_enabled

  const phonesByUser = new Map<string, string[]>()
  ;(collabs ?? []).forEach(c => {
    if (!c.system_user_id || !c.phone_e164) return
    const list = phonesByUser.get(c.system_user_id) ?? []
    if (!list.includes(c.phone_e164)) list.push(c.phone_e164)
    phonesByUser.set(c.system_user_id, list)
  })

  const messages: { userId: string; to: string[]; pending: number; text: string }[] = []
  for (const s of snapshot) {
    const pending = s.today.filter(i => !s.done.includes(i.quoteId))
    const phones = phonesByUser.get(s.userId)
    if (!phones?.length || pending.length === 0) continue

    const lines = pending.slice(0, 8).map(i =>
      `• *#${i.number}* ${i.client}${i.partner ? ` (${i.partner})` : ''} — ${i.daysSilent >= 999 ? 'nunca atualizado' : `${i.daysSilent} dias sem notícia`}`)
    const text =
      `📋 *Negociações pra atualizar hoje*\n` +
      `Faltam *${pending.length}* da sua lista do dia:\n\n` +
      lines.join('\n') +
      (pending.length > 8 ? `\n…e mais ${pending.length - 8}` : '') +
      `\n\nÉ só contar em uma frase o que aconteceu no WhatsApp:\n${base}/dashboard/tasks`
    messages.push({ userId: s.userId, to: phones, pending: pending.length, text })
  }

  if (dryRun || !enabled) {
    // O conteúdo tem nome de cliente: só mostra pra quem veio com o segredo do
    // cron ou está logado como admin. Pra qualquer outro, só os números.
    const canSee = (secret && req.headers.get('authorization') === `Bearer ${secret}`) || await isAdminSession()
    return NextResponse.json({
      ok: true, sent: false, enabled, dryRun,
      messages: canSee ? messages : messages.map(m => ({ pending: m.pending })),
    })
  }

  // Envio de verdade só com o segredo do cron — sem ele, qualquer um que
  // descobrisse a URL poderia disparar mensagens pra equipe em loop.
  if (!secret) {
    return NextResponse.json({ ok: false, sent: 0, error: 'Defina CRON_SECRET na Vercel antes de ativar o lembrete.' })
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-whatsapp-message`
  let sent = 0
  for (const m of messages) {
    for (const to of m.to) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'x-internal-call': '1',
          },
          body: JSON.stringify({ to_phone_e164: to, text: m.text }),
        })
        if (r.ok) sent++
      } catch (e) {
        console.error('lembrete de atualização falhou', to, e)
      }
    }
  }
  return NextResponse.json({ ok: true, sent, messages: messages.length })
}
