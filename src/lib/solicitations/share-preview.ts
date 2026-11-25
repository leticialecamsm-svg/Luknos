// Dados do banner que aparece quando o link de uma solicitação é enviado pelo WhatsApp.
// ATENÇÃO: é o único dado da solicitação visível SEM login (para quem tem o link).
// Só nome do projeto, cliente, número, etapa e foto/iniciais dos responsáveis da equipe — nada de
// valores, telefone, endereço ou arquivos.
import { createAdminClient } from '@/lib/supabase/admin'
import { STAGES } from '@/lib/solicitations/stages'
import { currentStages } from '@/lib/solicitations/current-stage'

export interface ShareMember { id: string; name: string; avatarUrl: string | null }
export interface SharePreview { number: number; title: string; client: string | null; clientId: string | null; stage: string | null; team: ShareMember[] }

export const SOLICITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getSharePreview(id: string): Promise<SharePreview | null> {
  if (!SOLICITATION_ID.test(id)) return null
  const db = createAdminClient()
  const { data } = await db
    .from('solicitations')
    .select('number, title, client_id, client:client_id(name)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!data) return null
  const client = ((data as any).client?.name as string | undefined)?.trim() || null
  const [stages, { data: resp }] = await Promise.all([
    currentStages(db, [id]),
    db.from('solicitation_stage_responsibles').select('user:user_id(id, name, avatar_url)').eq('solicitation_id', id),
  ])
  const stageId = stages.get(id) ?? null
  // a mesma "Equipe" da tela: responsáveis registrados nas etapas, sem repetir
  const team = new Map<string, ShareMember>()
  for (const r of (resp ?? []) as any[]) if (r.user) team.set(r.user.id, { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatar_url ?? null })
  return {
    number: data.number as number,
    title: (data.title as string | null)?.trim() || client || `Solicitação #${data.number}`,
    client,
    clientId: (data.client_id as string | null) ?? null,
    stage: STAGES.find((s) => s.id === stageId)?.label ?? null,
    team: Array.from(team.values()),
  }
}
