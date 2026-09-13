import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/cron/financial-daily-summary — disparo diário (~07h America/Sao_Paulo)
// do resumo de caixa do Luknos Financeiro pelo robô de WhatsApp já existente
// da loja (Fase 3, item 12 do PLANO.md — docs/FUNCTIONS.md: send-daily-whatsapp-summary).
// Agendado pelo cron da Vercel (vercel.json → "0 10 * * *" UTC = 07h BRT).
//
// Regra anti-ruído: só envia se houver algo a vencer/receber hoje; senão
// grava skipped_reason e não dispara. Idempotente: um resumo por dia
// (idx_whatsapp_summary_date é UNIQUE em summary_date) — reenviar o mesmo
// dia não duplica.
//
// Auth: header Authorization "Bearer <CRON_SECRET>" (a Vercel envia isso
// automaticamente quando a env CRON_SECRET existe). Sem CRON_SECRET, libera.

export const dynamic = 'force-dynamic'

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type DailyCashPanel = {
  consolidated_balance: number
  total_due_today: number
  total_receivable_today: number
  remaining: number
  items: unknown[]
}

function buildMessage(panel: DailyCashPanel, dateLabel: string): string {
  const lines = [`🌅 *Bom dia! Caixa de ${dateLabel}*`, '']
  if (panel.total_due_today > 0) lines.push(`📤 Hoje vencem *${money(panel.total_due_today)}* em boletos.`)
  if (panel.total_receivable_today > 0) lines.push(`📥 Hoje tem *${money(panel.total_receivable_today)}* a receber.`)
  lines.push(`🏦 Saldo consolidado: *${money(panel.consolidated_balance)}*`)
  const remainingLabel = panel.remaining >= 0 ? 'Sobra' : 'Falta'
  lines.push(`${panel.remaining >= 0 ? '✅' : '⚠️'} ${remainingLabel} de *${money(Math.abs(panel.remaining))}* hoje.`)
  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const dryRun = req.nextUrl.searchParams.get('dry') === '1'
  const targetDate = req.nextUrl.searchParams.get('target_date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  const admin = createAdminClient()

  if (!dryRun) {
    const { data: existing } = await admin
      .from('whatsapp_summary_log')
      .select('id, sent')
      .eq('summary_date', targetDate)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ summary_date: targetDate, sent: existing.sent, skipped_reason: 'já enviado/registrado hoje' })
    }
  }

  const { data: panel, error: panelError } = await admin.rpc('get_daily_cash_panel', { target_date: targetDate })
  if (panelError || !panel) {
    return NextResponse.json({ ok: false, error: panelError?.message ?? 'painel indisponível' }, { status: 500 })
  }

  const cashPanel = panel as DailyCashPanel
  const hasSomethingToReport = cashPanel.total_due_today > 0 || cashPanel.total_receivable_today > 0
  const dateLabel = new Date(targetDate + 'T00:00:00').toLocaleDateString('pt-BR')

  if (!hasSomethingToReport) {
    if (!dryRun) {
      await admin.from('whatsapp_summary_log').insert({
        summary_date: targetDate, payload: cashPanel, sent: false, skipped_reason: 'sem contas relevantes vencendo hoje',
      })
    }
    return NextResponse.json({ summary_date: targetDate, sent: false, skipped_reason: 'sem contas relevantes vencendo hoje' })
  }

  const text = buildMessage(cashPanel, dateLabel)

  const { data: profiles } = await admin.from('profiles').select('id').in('role', ['gestora', 'socio_gestor'])
  const profileIds = (profiles ?? []).map(p => p.id)
  const { data: collaborators } = profileIds.length
    ? await admin.from('wa_collaborators').select('phone_e164').eq('is_active', true).in('system_user_id', profileIds)
    : { data: [] as { phone_e164: string }[] }
  const phones = Array.from(new Set((collaborators ?? []).map(c => c.phone_e164).filter(Boolean)))

  if (dryRun) {
    return NextResponse.json({ summary_date: targetDate, sent: false, dryRun: true, text, phones, panel: cashPanel })
  }

  if (phones.length === 0) {
    await admin.from('whatsapp_summary_log').insert({
      summary_date: targetDate, payload: cashPanel, sent: false, skipped_reason: 'nenhum colaborador (gestora/sócio gestor) cadastrado no robô com telefone ativo',
    })
    return NextResponse.json({ summary_date: targetDate, sent: false, skipped_reason: 'nenhum destinatário cadastrado' })
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-whatsapp-message`
  let sentCount = 0
  for (const to of phones) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'x-internal-call': '1',
        },
        body: JSON.stringify({ to_phone_e164: to, text }),
      })
      if (r.ok) sentCount++
    } catch (e) {
      console.error('resumo financeiro diário falhou', to, e)
    }
  }

  const sent = sentCount > 0
  await admin.from('whatsapp_summary_log').insert({
    summary_date: targetDate, payload: cashPanel, sent, skipped_reason: sent ? null : 'falha ao enviar para todos os destinatários',
  })

  return NextResponse.json({ summary_date: targetDate, sent, recipients: phones.length, delivered: sentCount })
}
