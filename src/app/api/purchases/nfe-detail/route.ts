import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarNFeCompleta } from '@/lib/nfe'

// Retorna os itens de uma NF recebida.
// Lê do banco (items_json) para NÃO gastar consulta à SEFAZ (limite de 20/hora).
// Só consulta a SEFAZ se ainda não temos o XML completo guardado.
export async function GET(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave')?.replace(/\D/g, '') ?? ''
  if (chave.length !== 44) return NextResponse.json({ error: 'Chave inválida' }, { status: 400 })

  try {
    const supabase = createAdminClient()
    const { data: row } = await supabase
      .from('nfe_received')
      .select('*')
      .eq('chave_nfe', chave)
      .single()

    // Já temos os itens guardados → devolve do banco (zero consultas à SEFAZ)
    if (row?.items_json && Array.isArray(row.items_json) && row.items_json.length > 0) {
      return NextResponse.json({
        items: row.items_json,
        transportadoraNome: row.transportadora_nome ?? '',
        _fonte: 'cache',
      })
    }

    // Não temos → consulta a SEFAZ uma única vez e guarda
    const res = await consultarNFeCompleta(chave)
    if (res.ok && res.nfe) {
      await supabase
        .from('nfe_received')
        .update({
          items_json: res.nfe.items,
          tem_xml_completo: true,
          xml_fetched_at: new Date().toISOString(),
          transportadora_cnpj: res.nfe.transportadoraCnpj || row?.transportadora_cnpj || null,
          transportadora_nome: res.nfe.transportadoraNome || row?.transportadora_nome || null,
        })
        .eq('chave_nfe', chave)

      return NextResponse.json({
        items: res.nfe.items,
        transportadoraNome: res.nfe.transportadoraNome || row?.transportadora_nome || '',
        _fonte: 'sefaz',
      })
    }

    // SEFAZ não retornou itens (limite atingido, só resumo, etc.)
    const msg = res.cStat === '656'
      ? 'Limite de consultas da SEFAZ atingido (20/hora). Tente novamente mais tarde ou manifieste ciência da nota.'
      : `Itens ainda não disponíveis nesta nota (${res.xMotivo || 'sem XML completo'}).`
    return NextResponse.json({ items: [], _semItens: true, _motivo: msg })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
