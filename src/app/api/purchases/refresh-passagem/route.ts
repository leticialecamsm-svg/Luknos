import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarEventosPassagem } from '@/lib/nfe'

// Backfill retroativo: consulta por chave (consChNFe) devolve todo o histórico de
// eventos ainda disponível pra aquela nota, ao contrário da sincronização por NSU
// (que só traz o que é novo desde a última vez). Limitado a poucas notas por
// clique pra não estourar a cota de 20 consultas/hora da SEFAZ compartilhada com
// as outras buscas (impostos, produtos, novas NFs).
const MAX_POR_EXECUCAO = 12

export async function POST() {
  try {
    const supabase = createAdminClient()
    const { data: nfes } = await supabase
      .from('nfe_received')
      .select('chave_nfe, ultima_passagem_data')
      .order('data_emissao', { ascending: false })
      .limit(MAX_POR_EXECUCAO)

    if (!nfes || nfes.length === 0) return NextResponse.json({ updated: 0, checked: 0 })

    let updated = 0
    for (const n of nfes) {
      try {
        const eventos = await consultarEventosPassagem(n.chave_nfe)
        if (eventos.length === 0) continue
        const ultimo = eventos.reduce((a, b) => (a.data > b.data ? a : b))
        if (!n.ultima_passagem_data || ultimo.data > n.ultima_passagem_data) {
          await supabase
            .from('nfe_received')
            .update({ ultima_passagem_uf: ultimo.uf, ultima_passagem_data: ultimo.data, ultima_passagem_desc: ultimo.descricao })
            .eq('chave_nfe', n.chave_nfe)
          updated++
        }
      } catch {
        // ignora falha pontual numa chave e segue pras outras
      }
    }

    return NextResponse.json({ updated, checked: nfes.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
