import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// A SEFAZ limita a 20 consultas/hora por CNPJ no webservice NFeDistribuicaoDFe
// (usado por "Buscar novas NFs", "Atualizar passagens" e "Buscar produtos na SEFAZ").
// Cada chamada real registra 1 linha aqui, pra dar pra mostrar quanto já foi
// consumido na última hora antes de estourar e levar rejeição 656 da SEFAZ.
export const SEFAZ_DIST_HOURLY_LIMIT = 20

// Origens possíveis, mostradas no histórico: de qual botão/rotina veio a consulta
export type OrigemSefaz = 'sincronizacao' | 'produtos' | 'danfe' | 'passagem' | 'cadastro-nota'

// Registra quem (usuário logado), o quê (origem) e em qual nota — é o que permite
// separar o consumo da cota que vem daqui do que vem de outros sistemas que usam o
// mesmo certificado/CNPJ (ERP, contador etc.), que a SEFAZ soma na mesma cota.
export async function logSefazDistCall(origem: OrigemSefaz, chave?: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    let userId: string | null = null
    let userName: string | null = null
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (user) {
        userId = user.id
        const { data: perfil } = await admin.from('users').select('name').eq('id', user.id).single()
        userName = perfil?.name ?? user.email ?? null
      }
    } catch {
      // sem sessão (rotina automática): fica só com a origem
    }
    const { data } = await admin
      .from('sefaz_dist_calls')
      .insert({ origem, chave_nfe: chave ?? null, user_id: userId, user_name: userName })
      .select('id')
      .single()
    return data?.id ?? null
  } catch {
    // não deixa uma falha de log quebrar a consulta em si
    return null
  }
}

export async function setSefazCallStat(id: string | null, cStat: string) {
  if (!id || !cStat) return
  try {
    await createAdminClient().from('sefaz_dist_calls').update({ cstat: cStat }).eq('id', id)
  } catch {
    // idem
  }
}

export interface ConsultaSefazRecente { quando: string; origem: string | null; quem: string | null; chave: string | null; cstat: string | null }

export async function getRecentSefazCalls(limit = 12): Promise<ConsultaSefazRecente[]> {
  const { data } = await createAdminClient()
    .from('sefaz_dist_calls')
    .select('created_at, origem, user_name, chave_nfe, cstat')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(r => ({ quando: r.created_at, origem: r.origem, quem: r.user_name, chave: r.chave_nfe, cstat: r.cstat }))
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
