import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarNFeCompleta, parseNFeXML } from '@/lib/nfe'
import { garantirCiencia } from '@/lib/nfe-manifestacao'

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

// O DistDFe só entrega NF-e por chave até 90 dias após a emissão, e a ciência
// só é aceita até 10 dias — fora disso nem tenta a SEFAZ (gastaria cota à toa).
const LIMITE_SEFAZ_DIAS = 85

type BuscaChave = { ok: true; xml: string } | { ok: false; status: number; aviso?: boolean; msg: string }

// Busca paga do Meu Danfe pela chave (R$ 0,03; grátis se a nota já está na
// Área do Cliente). É o mesmo que colar a chave no site deles: não depende de
// ciência nem do prazo da SEFAZ. A busca é assíncrona — consulta o status no
// mesmo endpoint, esperando ≥1s entre chamadas (menos que isso bloqueia a conta).
async function buscarPorChaveNoMeuDanfe(apiKey: string, chave: string): Promise<BuscaChave> {
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    if (tentativa > 0) await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${API}/add/${chave}`, { method: 'PUT', headers: { 'Api-Key': apiKey }, cache: 'no-store' })
    if (res.status === 402) return { ok: false, status: 402, msg: 'Sem saldo no Meu Danfe para buscar esta nota (R$ 0,03 por busca). Adicione créditos em web.meudanfe.com.br.' }
    if (res.status === 401 || res.status === 403) return { ok: false, status: 502, msg: 'Api-Key do Meu Danfe inválida ou substituída. Confira em Fiscal → Configurações.' }
    if (!res.ok) return { ok: false, status: 502, msg: `Meu Danfe não conseguiu buscar a nota (erro ${res.status}).` }
    const { status, statusMessage } = await res.json() as { status: string; statusMessage?: string }
    if (status === 'OK') break
    if (status === 'NOT_FOUND') return { ok: false, status: 404, msg: 'O Meu Danfe não encontrou esta nota na SEFAZ.' }
    if (status === 'ERROR') return { ok: false, status: 502, msg: `O Meu Danfe falhou ao buscar a nota (${statusMessage || 'erro'}). Tente novamente mais tarde.` }
    if (tentativa === 11) return { ok: false, status: 409, aviso: true, msg: 'O Meu Danfe ainda está buscando esta nota na SEFAZ. Tente de novo em alguns segundos.' }
  }
  const res = await fetch(`${API}/get/xml/${chave}`, { headers: { 'Api-Key': apiKey }, cache: 'no-store' })
  const body = res.ok ? await res.json() as { data?: string } : null
  const xml = body?.data?.match(/<nfeProc[\s>][\s\S]*?<\/nfeProc>/)?.[0] ?? body?.data
  if (!xml) return { ok: false, status: 502, msg: `Meu Danfe achou a nota mas não devolveu o XML (erro ${res.status}).` }
  return { ok: true, xml }
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
      .select('numero_nota, data_emissao, fornecedor_nome, xml_nfe, danfe_meudanfe, transportadora_cnpj, transportadora_nome, tem_xml_completo, ciencia_em, ciencia_cstat')
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
        const dias = row?.data_emissao ? (Date.now() - new Date(row.data_emissao).getTime()) / 86400_000 : 0
        // 596 = ciência recusada por prazo: a SEFAZ não vai liberar o XML
        let usarMeuDanfe = dias > LIMITE_SEFAZ_DIAS || row?.ciencia_cstat === '596'

        if (!usarMeuDanfe) {
          // Sem ciência a SEFAZ só devolve o resumo — registra antes de gastar consulta
          const aviso = await garantirCiencia(supabase, chave, row)
          if (aviso?.startsWith('A SEFAZ recusou')) usarMeuDanfe = true
          else if (aviso) return NextResponse.json({ error: aviso }, { status: 409 })
        }

        if (!usarMeuDanfe) {
          const res = await consultarNFeCompleta(chave, 'danfe')
          if (res.ok && res.xml) {
            xml = res.xml
          } else if (res.cStat === '632') {
            usarMeuDanfe = true // "Solicitação fora de prazo, a NF-e não está mais disponível para download"
          } else {
            const msg = res.cStat === '656'
              ? 'Limite de consultas da SEFAZ atingido (20/hora). Tente novamente mais tarde.'
              : row?.ciencia_em
                ? `A Ciência da Operação foi registrada às ${new Date(row.ciencia_em).toLocaleTimeString('pt-BR', { timeZone: 'America/Maceio', hour: '2-digit', minute: '2-digit' })}, mas a SEFAZ ainda não liberou o XML completo. Tente novamente em alguns minutos.`
                : `XML completo desta nota ainda não disponível na SEFAZ (${res.xMotivo || 'sem retorno'}).`
            return NextResponse.json({ error: msg }, { status: 400 })
          }
        }

        if (usarMeuDanfe) {
          const busca = await buscarPorChaveNoMeuDanfe(apiKey, chave)
          if (!busca.ok) return NextResponse.json({ error: busca.msg }, { status: busca.aviso ? 409 : busca.status })
          xml = busca.xml
        }

        // Guarda o XML (e os itens, que o "Buscar produtos" também passa a ter)
        const nfe = parseNFeXML(xml!)
        await supabase
          .from('nfe_received')
          .update({
            xml_nfe: xml,
            ...(nfe.items.length ? { items_json: nfe.items, tem_xml_completo: true, xml_fetched_at: new Date().toISOString() } : {}),
            fornecedor_nome: nfe.fornecedorNome || row?.fornecedor_nome || null,
            transportadora_cnpj: nfe.transportadoraCnpj || row?.transportadora_cnpj || null,
            transportadora_nome: nfe.transportadoraNome || row?.transportadora_nome || null,
            // a busca por chave já deixa a nota na Área do Cliente deles
            ...(usarMeuDanfe ? { danfe_meudanfe: true } : {}),
          })
          .eq('chave_nfe', chave)

        if (usarMeuDanfe) {
          const r = await meuDanfe(apiKey, `/get/da/${chave}`)
          if (r.ok) pdf = r.pdf
        }
      }

      if (!pdf) {
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
    }

    return new Response(new Uint8Array(pdf!), {
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
