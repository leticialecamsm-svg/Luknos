import type { createAdminClient } from '@/lib/supabase/admin'
import { pickCurrentStage, STAGES } from '@/lib/solicitations/stages'

// Etapa atual REAL de cada solicitação (a do fluxo: primeira etapa iniciada e
// ainda não concluída, igual à tela de Solicitações). O campo `work_stage` da
// tabela é a "etapa da obra" (fundação, acabamento…) e não serve para isso.
// Sem nenhum registro iniciado, cai na última etapa escolhida ao registrar
// mensagens do WhatsApp.
export async function currentStages(admin: ReturnType<typeof createAdminClient>, ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (!ids.length) return out
  const q = (t: string, cols: string) => admin.from(t).select(cols).in('solicitation_id', ids)
  const [quotes, negs, visits, projects, purchases, shipments, installs, posts, links] = await Promise.all([
    q('quotes', 'solicitation_id, status'),
    q('negotiations', 'solicitation_id, temperature'),
    q('visits', 'solicitation_id, status'),
    q('design_projects', 'solicitation_id, status'),
    q('purchase_checklist_items', 'solicitation_id, status'),
    q('shipments', 'solicitation_id, separation_status, is_completed'),
    q('installation_trackings', 'solicitation_id, status'),
    q('post_sale_followups', 'solicitation_id, resolution'),
    admin.from('crm_solicitation_links').select('solicitation_id, stage, created_at').in('solicitation_id', ids).order('created_at', { ascending: false }),
  ])
  const started = new Map<string, Record<string, boolean>>()
  const done = new Map<string, Record<string, boolean>>()
  const mark = (m: Map<string, Record<string, boolean>>, sid: string, st: string) => { const o = m.get(sid) ?? {}; o[st] = true; m.set(sid, o) }
  const purchAll = new Map<string, boolean>()
  for (const r of (quotes.data ?? []) as any[]) { mark(started, r.solicitation_id, 'orcamento'); if (r.status === 'done') mark(done, r.solicitation_id, 'orcamento') }
  for (const r of (negs.data ?? []) as any[]) { mark(started, r.solicitation_id, 'negociacao'); if (r.temperature === 'closed' || r.temperature === 'lost') mark(done, r.solicitation_id, 'negociacao') }
  for (const r of (visits.data ?? []) as any[]) { mark(started, r.solicitation_id, 'visita'); if (r.status === 'done') mark(done, r.solicitation_id, 'visita') }
  for (const r of (projects.data ?? []) as any[]) { mark(started, r.solicitation_id, 'projeto'); if (r.status === 'concluido') mark(done, r.solicitation_id, 'projeto') }
  for (const r of (purchases.data ?? []) as any[]) { mark(started, r.solicitation_id, 'compra'); purchAll.set(r.solicitation_id, (purchAll.get(r.solicitation_id) ?? true) && r.status === 'recebido') }
  purchAll.forEach((all, sid) => { if (all) mark(done, sid, 'compra') })
  for (const r of (shipments.data ?? []) as any[]) { mark(started, r.solicitation_id, 'expedicao'); if (r.is_completed || r.separation_status === 'delivered') mark(done, r.solicitation_id, 'expedicao') }
  for (const r of (installs.data ?? []) as any[]) { mark(started, r.solicitation_id, 'instalacao'); if (r.status === 'concluida') mark(done, r.solicitation_id, 'instalacao') }
  for (const r of (posts.data ?? []) as any[]) { mark(started, r.solicitation_id, 'posVenda'); if (r.resolution) mark(done, r.solicitation_id, 'posVenda') }
  const lastLink = new Map<string, string>()
  for (const r of (links.data ?? []) as any[]) if (!lastLink.has(r.solicitation_id)) lastLink.set(r.solicitation_id, r.stage)
  const order = STAGES.map((x) => x.id)
  for (const id of ids) out.set(id, pickCurrentStage(order, started.get(id) ?? {}, done.get(id) ?? {}) ?? lastLink.get(id) ?? null)
  return out
}
