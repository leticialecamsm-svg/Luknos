import { NextResponse } from 'next/server'
import https from 'https'
import zlib from 'zlib'
import { promisify } from 'util'
import { createAdminClient } from '@/lib/supabase/admin'

const gunzip = promisify(zlib.gunzip)

const DIST_URL = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
const DIST_NS  = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe'
const CNPJ     = process.env.EMPRESA_CNPJ ?? '45118870000106'

function getAgent() {
  const pfxB64 = process.env.CERT_PFX_B64
  const passphrase = process.env.CERT_PFX_PASSWORD
  if (!pfxB64 || !passphrase) throw new Error('Certificado digital não configurado')
  return new https.Agent({ pfx: Buffer.from(pfxB64, 'base64'), passphrase, rejectUnauthorized: false })
}

function buildDistNsuSoap(ultNSU: string) {
  const inner = `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><cUFAutor>27</cUFAutor><CNPJ>${CNPJ}</CNPJ><distNSU><ultNSU>${ultNSU.padStart(15, '0')}</ultNSU></distNSU></distDFeInt>`
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="${DIST_NS}"><nfeDadosMsg>${inner}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`
}

function soapPost(body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const agent = getAgent()
    const url = new URL(DIST_URL)
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST', agent,
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${DIST_NS}/nfeDistDFeInteresse"`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function get(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? ''
}

async function dezipDoc(b64: string): Promise<string> {
  const buf = Buffer.from(b64.replace(/\s/g, ''), 'base64')
  try {
    const dec = await gunzip(buf)
    return dec.toString('utf-8')
  } catch {
    return buf.toString('utf-8')
  }
}

interface NFeResumida {
  chave: string
  nsu: string
  schema: string
  numeroNota: string
  dataEmissao: string
  fornecedorCnpj: string
  fornecedorNome: string
  valorTotal: number
  transportadoraCnpj: string
  transportadoraNome: string
}

function parseResNFe(xml: string, nsu: string, schema: string): NFeResumida {
  // resNFe – resumo da nota (schema resNFe_v1.01.xsd)
  const chave = get(xml, 'chNFe')
  const nNF = get(xml, 'nNF')
  const dhEmi = (get(xml, 'dhEmi') || get(xml, 'dEmi')).slice(0, 10)
  const cnpjEmit = get(xml, 'CNPJ') // primeiro CNPJ é o emitente
  const xNome = get(xml, 'xNome')
  const vNF = parseFloat(get(xml, 'vNF') || get(xml, 'vNFe') || '0') || 0

  return { chave, nsu, schema, numeroNota: nNF, dataEmissao: dhEmi, fornecedorCnpj: cnpjEmit, fornecedorNome: xNome, valorTotal: vNF, transportadoraCnpj: '', transportadoraNome: '' }
}

function parseNFeProc(xml: string, nsu: string, schema: string): NFeResumida {
  const chave = xml.match(/Id="NFe(\d{44})"/)?.[1] ?? get(xml, 'chNFe')
  const nNF = get(xml, 'nNF')
  const dhEmi = (get(xml, 'dhEmi') || get(xml, 'dEmi')).slice(0, 10)
  const emitBlock = xml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? ''
  const fornecedorCnpj = get(emitBlock, 'CNPJ')
  const fornecedorNome = get(emitBlock, 'xFant') || get(emitBlock, 'xNome')
  const vNF = parseFloat(get(xml, 'vNF') || get(xml, 'vNFe') || '0') || 0
  const transpBlock = xml.match(/<transporta>([\s\S]*?)<\/transporta>/)?.[1] ?? ''
  const transportadoraCnpj = get(transpBlock, 'CNPJ') || get(transpBlock, 'CPF')
  const transportadoraNome = get(transpBlock, 'xNome')

  return { chave, nsu, schema, numeroNota: nNF, dataEmissao: dhEmi, fornecedorCnpj, fornecedorNome, valorTotal: vNF, transportadoraCnpj, transportadoraNome }
}

export async function POST() {
  try {
    const supabase = createAdminClient()

    // Lê último NSU sincronizado
    const { data: syncState } = await supabase
      .from('nfe_sync_state')
      .select('ultimo_nsu')
      .eq('id', 'default')
      .single()

    let ultNSU = syncState?.ultimo_nsu ?? '0'
    let newCount = 0
    let pagesRead = 0
    const MAX_PAGES = 10 // limite de segurança

    while (pagesRead < MAX_PAGES) {
      pagesRead++
      const soap = buildDistNsuSoap(ultNSU)
      const xml = await soapPost(soap)

      const cStat = get(xml, 'cStat')
      const xMotivo = get(xml, 'xMotivo')
      const maxNSU = get(xml, 'maxNSU')
      const ultNSUResp = get(xml, 'ultNSU')

      // 137/138 = documentos retornados, 656 = sem documentos novos
      if (cStat !== '137' && cStat !== '138') {
        if (cStat === '656' || ultNSU !== '0') break // sem mais documentos
        return NextResponse.json({ error: `SEFAZ: ${xMotivo} (cStat ${cStat})` }, { status: 400 })
      }

      // Processa cada docZip retornado
      const docRegex = /<docZip[^>]*NSU="(\d+)"[^>]*schema="([^"]+)"[^>]*>([A-Za-z0-9+/=\s]+)<\/docZip>/g
      const docs: NFeResumida[] = []
      let m: RegExpExecArray | null

      while ((m = docRegex.exec(xml)) !== null) {
        const nsu = m[1]
        const schema = m[2]
        const b64 = m[3]
        try {
          const inner = await dezipDoc(b64)
          let nfe: NFeResumida | null = null
          if (schema.includes('resNFe')) nfe = parseResNFe(inner, nsu, schema)
          else if (schema.includes('nfeProc') || schema.includes('procNFe')) nfe = parseNFeProc(inner, nsu, schema)
          if (nfe?.chave) docs.push(nfe)
        } catch {
          // ignora doc com erro de parsing
        }
      }

      // Upsert no banco (ignora chaves já existentes)
      if (docs.length > 0) {
        const rows = docs.map(d => ({
          chave_nfe: d.chave,
          numero_nota: d.numeroNota || null,
          data_emissao: d.dataEmissao || null,
          fornecedor_cnpj: d.fornecedorCnpj || null,
          fornecedor_nome: d.fornecedorNome || null,
          valor_total: d.valorTotal || null,
          transportadora_cnpj: d.transportadoraCnpj || null,
          transportadora_nome: d.transportadoraNome || null,
          nsu: d.nsu,
        }))
        const { error: upsertError } = await supabase
          .from('nfe_received')
          .upsert(rows, { onConflict: 'chave_nfe', ignoreDuplicates: true })
        if (!upsertError) newCount += docs.length
      }

      // Atualiza NSU
      ultNSU = ultNSUResp || ultNSU
      await supabase
        .from('nfe_sync_state')
        .update({ ultimo_nsu: ultNSU, max_nsu: maxNSU, updated_at: new Date().toISOString() })
        .eq('id', 'default')

      // Se já chegou ao fim, para
      if (!maxNSU || ultNSU >= maxNSU || docs.length === 0) break
    }

    return NextResponse.json({ ok: true, novasNFs: newCount })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('nfe_received')
      .select('*')
      .order('data_emissao', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ nfes: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
