import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarEventosPassagem } from '@/lib/nfe'

// Backfill retroativo: consulta por chave (consChNFe) devolve todo o histórico de
// eventos ainda disponível pra aquela nota, ao contrário da sincronização por NSU
// (que só traz o que é novo desde a última vez). Só verifica notas marcadas como
// "não entregues" (ainda em trânsito) — as já entregues não precisam de consulta,
// isso economiza a cota de 20 consultas/hora da SEFAZ compartilhada com as outras
// buscas (impostos, produtos, novas NFs).
const MAX_POR_EXECUCAO = 10

export async function POST() {
  try {
    const supabase = createAdminClient()
    const { data: nfes } = await supabase
      .from('nfe_received')
      .select('chave_nfe, ultima_passagem_data')
      .eq('entregue', false)
      .order('data_emissao', { ascending: false })
      .limit(MAX_POR_EXECUCAO)

    if (!nfes || nfes.length === 0) return NextResponse.json({ updated: 0, checked: 0 })

    let updated = 0
    let semEvento = 0
    let checked = 0
    const statusCount: Record<string, number> = {}
    let ultimoMotivo = ''

    for (const n of nfes) {
      checked++
      try {
        const { eventos, cStat, xMotivo } = await consultarEventosPassagem(n.chave_nfe)
        statusCount[cStat] = (statusCount[cStat] ?? 0) + 1
        // 656 = cota de 20 consultas/hora estourada — para na hora, sem gastar o resto do lote à toa
        if (cStat === '656') { ultimoMotivo = `${cStat}: ${xMotivo}`; break }
        if (cStat !== '137' && cStat !== '138') ultimoMotivo = `${cStat}: ${xMotivo}`
        if (eventos.length === 0) { semEvento++; continue }
        const ultimo = eventos.reduce((a, b) => (a.data > b.data ? a : b))
        if (!n.ultima_passagem_data || ultimo.data > n.ultima_passagem_data) {
          await supabase
            .from('nfe_received')
            .update({ ultima_passagem_uf: ultimo.uf, ultima_passagem_data: ultimo.data, ultima_passagem_desc: ultimo.descricao })
            .eq('chave_nfe', n.chave_nfe)
          updated++
        }
      } catch (e: any) {
        ultimoMotivo = e.message ?? 'erro desconhecido'
      }
    }

    return NextResponse.json({ updated, checked, semEvento, statusCount, ultimoMotivo })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
