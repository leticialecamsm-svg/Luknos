import { createAdminClient } from '@/lib/supabase/admin'

// A SEFAZ limita a 20 consultas/hora por CNPJ no webservice NFeDistribuicaoDFe
// (usado por "Buscar novas NFs", "Atualizar passagens" e "Buscar produtos na SEFAZ").
// Cada chamada real registra 1 linha aqui, pra dar pra mostrar quanto já foi
// consumido na última hora antes de estourar e levar rejeição 656 da SEFAZ.
export const SEFAZ_DIST_HOURLY_LIMIT = 20

export async function logSefazDistCall() {
  try {
    await createAdminClient().from('sefaz_dist_calls').insert({})
  } catch {
    // não deixa uma falha de log quebrar a consulta em si
  }
}

export async function getSefazQuotaUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await createAdminClient()
    .from('sefaz_dist_calls')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo)
  const used = count ?? 0
  return { used, limit: SEFAZ_DIST_HOURLY_LIMIT, remaining: Math.max(0, SEFAZ_DIST_HOURLY_LIMIT - used) }
}
