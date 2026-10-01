import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarNFeCompleta } from '@/lib/nfe'

// Gera o DANFE (PDF) de uma NF recebida pela API do Meu Danfe (grátis).
// 1ª vez: envia o XML guardado (ou busca na SEFAZ, gastando 1 das 20/hora) pra
// /convert/xml-to-da — a nota fica salva na Área do Cliente deles.
// Depois: baixa por chave em /get/da, sem reenviar o XML (reenvio repetido do
// mesmo XML bloqueia a conta deles).
const API = 'https://api.meudanfe.com.br/v2/fd'

async function meuDanfe(apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Api-Key': apiKey, ...init.headers },
    cache: 'no-store',
  })
  if (!res.ok) return { ok: false as const, status: res.status }
  const body = await res.json() as { data?: string }
  if (!body.data) return { ok: false as const, status: 500 }
  return { ok: true as const, pdf: Buffer.from(body.data, 'base64') }
}

export async function GET(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const chave = req.nextUrl.searchParams.get('chave')?.replace(/\D/g, '') ?? ''
  if (chave.length !== 44) return NextResponse.json({ error: 'Chave inválida' }, { status: 400 })

  try {
    const supabase = createAdminClient()

    // Api-Key cadastrada em /fiscal/configuracoes (env só como reserva)
    const { data: cfg } = await supabase.from('fiscal_config').select('meudanfe_api_key').eq('id', true).single()
    const apiKey = cfg?.meudanfe_api_key || process.env.MEUDANFE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Api-Key do Meu Danfe não cadastrada. Configure em Fiscal → Configurações.' }, { status: 400 })
    }
    const { data: row } = await supabase
      .from('nfe_received')
      .select('numero_nota, xml_nfe, danfe_meudanfe, transportadora_cnpj, transportadora_nome')
      .eq('chave_nfe', chave)
      .single()

    let pdf: Buffer | null = null

    if (row?.danfe_meudanfe) {
      const r = await meuDanfe(apiKey, `/get/da/${chave}`)
      if (r.ok) pdf = r.pdf
      // 404 = apagada lá (expirou "Manter registros por") → converte de novo abaixo
    }

    if (!pdf) {
      let xml = row?.xml_nfe as string | null
      if (!xml) {
        const res = await consultarNFeCompleta(chave)
        if (!res.ok || !res.xml) {
          const msg = res.cStat === '656'
            ? 'Limite de consultas da SEFAZ atingido (20/hora). Tente novamente mais tarde.'
            : `XML completo desta nota ainda não disponível na SEFAZ (${res.xMotivo || 'sem retorno'}).`
          return NextResponse.json({ error: msg }, { status: 400 })
        }
        xml = res.xml
        await supabase
          .from('nfe_received')
          .update({
            xml_nfe: xml,
            items_json: res.nfe!.items,
            tem_xml_completo: true,
            xml_fetched_at: new Date().toISOString(),
            transportadora_cnpj: res.nfe!.transportadoraCnpj || row?.transportadora_cnpj || null,
            transportadora_nome: res.nfe!.transportadoraNome || row?.transportadora_nome || null,
          })
          .eq('chave_nfe', chave)
      }

      const r = await meuDanfe(apiKey, '/convert/xml-to-da', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: xml,
      })
      if (!r.ok) {
        const msg = r.status === 401 || r.status === 403
          ? 'Api-Key do Meu Danfe inválida ou substituída. Confira em Fiscal → Configurações.'
          : `Meu Danfe não conseguiu gerar o PDF (erro ${r.status}).`
        return NextResponse.json({ error: msg }, { status: 502 })
      }
      pdf = r.pdf
      await supabase.from('nfe_received').update({ danfe_meudanfe: true }).eq('chave_nfe', chave)
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="DANFE-${row?.numero_nota || chave}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
