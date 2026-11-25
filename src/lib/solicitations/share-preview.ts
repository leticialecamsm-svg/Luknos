// Dados do banner que aparece quando o link de uma solicitação é enviado pelo WhatsApp.
// ATENÇÃO: é o único dado da solicitação visível SEM login (para quem tem o link).
// Só nome do projeto, cliente, número e etapa — nada de valores, telefone, endereço ou arquivos.
import { createAdminClient } from '@/lib/supabase/admin'
import { STAGES } from '@/lib/solicitations/stages'
import { currentStages } from '@/lib/solicitations/current-stage'

export interface SharePreview { number: number; title: string; client: string | null; stage: string | null }

export const SOLICITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getSharePreview(id: string): Promise<SharePreview | null> {
  if (!SOLICITATION_ID.test(id)) return null
  const db = createAdminClient()
  const { data } = await db
    .from('solicitations')
    .select('number, title, client:client_id(name)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!data) return null
  const client = ((data as any).client?.name as string | undefined)?.trim() || null
  const stageId = (await currentStages(db, [id])).get(id) ?? null
  return {
    number: data.number as number,
    title: (data.title as string | null)?.trim() || client || `Solicitação #${data.number}`,
    client,
    stage: STAGES.find((s) => s.id === stageId)?.label ?? null,
  }
}
