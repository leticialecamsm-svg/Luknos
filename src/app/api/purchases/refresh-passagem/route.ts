import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarEventosPassagem } from '@/lib/nfe'

// Atualiza o registro de passagem de UMA nota. A consulta por chave (consChNFe)
// devolve todo o histórico de eventos ainda disponível pra ela, ao contrário da
// sincronização por NSU (que só traz o que é novo). Roda só pra nota escolhida —
// antes rodava em lote de 10 seguidas, o que consome a cota de 20/hora da SEFAZ
// (compartilhada com as outras buscas) e a deixa de olho no CNPJ.
const COOLDOWN_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const { chave } = await req.json().catch(() => ({ chave: '' })) as { chave?: string }
    const chaveLimpa = (chave ?? '').replace(/\D/g, '')
    if (chaveLimpa.length !== 44) return NextResponse.json({ error: 'Chave inválida' }, { status: 400 })

    const supabase = createAdminClient()

    // Mesmo bloqueio da sincronização: se a SEFAZ mandou esperar, não insiste
    const { data: sync } = await supabase.from('nfe_sync_state').select('last_query_at, last_cstat').eq('id', 'default').single()
    if ((sync?.last_cstat === '656') && sync.last_query_at) {
      const elapsed = Date.now() - new Date(sync.last_query_at).getTime()
      if (elapsed < COOLDOWN_MS) {
        const faltam = Math.ceil((COOLDOWN_MS - elapsed) / 60000)
        return NextResponse.json({ error: `A SEFAZ pediu pra aguardar (consumo indevido). Faltam ${faltam} min.` }, { status: 429 })
      }
    }

    const { data: nfe } = await supabase.from('nfe_received').select('ultima_passagem_data').eq('chave_nfe', chaveLimpa).single()
    const { eventos, cStat, xMotivo } = await consultarEventosPassagem(chaveLimpa)

    // 656 = SEFAZ pediu pra esperar: grava o bloqueio pra todos os botões respeitarem
    if (cStat === '656') {
      await supabase.from('nfe_sync_state').update({ last_query_at: new Date().toISOString(), last_cstat: '656' }).eq('id', 'default')
      return NextResponse.json({ error: `SEFAZ: ${xMotivo} (cStat 656). Aguarde cerca de 1 hora.` }, { status: 429 })
    }
    if (cStat !== '137' && cStat !== '138') {
      return NextResponse.json({ error: `SEFAZ: ${xMotivo || 'sem retorno'} (cStat ${cStat || '?'})` }, { status: 400 })
    }
    if (eventos.length === 0) return NextResponse.json({ updated: false, semEvento: true })

    const ultimo = eventos.reduce((a, b) => (a.data > b.data ? a : b))
    if (nfe?.ultima_passagem_data && ultimo.data <= nfe.ultima_passagem_data) {
      return NextResponse.json({ updated: false, semNovidade: true, uf: ultimo.uf })
    }
    await supabase
      .from('nfe_received')
      .update({ ultima_passagem_uf: ultimo.uf, ultima_passagem_data: ultimo.data, ultima_passagem_desc: ultimo.descricao })
      .eq('chave_nfe', chaveLimpa)
    return NextResponse.json({ updated: true, uf: ultimo.uf, data: ultimo.data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
