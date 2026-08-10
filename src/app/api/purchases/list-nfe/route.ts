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

interface NFeItem {
  nItem: number
  cProd: string
  xProd: string
  ncm: string
  quantidade: number
  valorTotal: number
  ipiPercent: number
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
  items: NFeItem[] | null // preenchido só quando há XML completo (nfeProc)
}

interface EventoPassagem {
  chave: string
  uf: string
  data: string
  descricao: string
}

// Códigos IBGE de UF usados no campo cOrgao/cUF dos eventos — só as usadas em trânsito interestadual
const UF_POR_CODIGO: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

// resEvento – resumo de evento (registro de passagem, confirmação de operação, etc.)
// A NT 2014/002 distribui o "Registro de Passagem" pelo mesmo NFeDistribuicaoDFe já usado
// pra baixar as notas — não precisa da tela pública com captcha da SEFAZ.
function parseResEvento(xml: string): EventoPassagem | null {
  const chave = get(xml, 'chNFe')
  const xEvento = get(xml, 'xEvento')
  const dhEvento = get(xml, 'dhEvento')
  const cOrgao = get(xml, 'cOrgao')
  if (!chave || !xEvento) return null
  if (!/passagem/i.test(xEvento)) return null // só nos interessa registro de passagem
  return { chave, uf: UF_POR_CODIGO[cOrgao] ?? cOrgao, data: dhEvento, descricao: xEvento }
}

function parseResNFe(xml: string, nsu: string, schema: string): NFeResumida {
  // resNFe – resumo da nota (schema resNFe_v1.01.xsd)
  const chave = get(xml, 'chNFe')
  const nNF = get(xml, 'nNF')
  const dhEmi = (get(xml, 'dhEmi') || get(xml, 'dEmi')).slice(0, 10)
  const cnpjEmit = get(xml, 'CNPJ') // primeiro CNPJ é o emitente
  const xNome = get(xml, 'xNome')
  const vNF = parseFloat(get(xml, 'vNF') || get(xml, 'vNFe') || '0') || 0

  return { chave, nsu, schema, numeroNota: nNF, dataEmissao: dhEmi, fornecedorCnpj: cnpjEmit, fornecedorNome: xNome, valorTotal: vNF, transportadoraCnpj: '', transportadoraNome: '', items: null }
}

function parseItems(xml: string): NFeItem[] {
  const detBlocks = xml.match(/<det\s[^>]*>[\s\S]*?<\/det>/g) ?? []
  return detBlocks.map(det => {
    const nItem = parseInt(det.match(/nItem="(\d+)"/)?.[1] ?? '0')
    const prodBlock = det.match(/<prod>([\s\S]*?)<\/prod>/)?.[1] ?? ''
    const ipiBlock = det.match(/<IPITrib>([\s\S]*?)<\/IPITrib>/)?.[1] ?? ''
    const cProd = get(prodBlock, 'cProd')
    const xProd = get(prodBlock, 'xProd')
    const ncm = get(prodBlock, 'NCM')
    const quantidade = parseFloat(get(prodBlock, 'qCom')) || 0
    const valorTotal = parseFloat(get(prodBlock, 'vProd')) || 0
    let ipiPercent = 0
    if (ipiBlock) {
      const pIPI = parseFloat(get(ipiBlock, 'pIPI'))
      if (pIPI) ipiPercent = pIPI
      else {
        const vIPI = parseFloat(get(ipiBlock, 'vIPI')) || 0
        if (valorTotal > 0) ipiPercent = (vIPI / valorTotal) * 100
      }
    }
    return { nItem, cProd, xProd, ncm, quantidade, valorTotal, ipiPercent }
  })
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
  const items = parseItems(xml)

  return { chave, nsu, schema, numeroNota: nNF, dataEmissao: dhEmi, fornecedorCnpj, fornecedorNome, valorTotal: vNF, transportadoraCnpj, transportadoraNome, items: items.length ? items : null }
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
      const eventos: EventoPassagem[] = []
      let m: RegExpExecArray | null

      while ((m = docRegex.exec(xml)) !== null) {
        const nsu = m[1]
        const schema = m[2]
        const b64 = m[3]
        try {
          const inner = await dezipDoc(b64)
          if (schema.includes('resEvento')) {
            const evt = parseResEvento(inner)
            if (evt) eventos.push(evt)
            continue
          }
          let nfe: NFeResumida | null = null
          if (schema.includes('resNFe')) nfe = parseResNFe(inner, nsu, schema)
          else if (schema.includes('nfeProc') || schema.includes('procNFe')) nfe = parseNFeProc(inner, nsu, schema)
          if (nfe?.chave) docs.push(nfe)
        } catch {
          // ignora doc com erro de parsing
        }
      }

      // Atualiza o registro de passagem mais recente de cada nota já lançada em Compras
      for (const evt of eventos) {
        await supabase
          .from('nfe_received')
          .update({ ultima_passagem_uf: evt.uf, ultima_passagem_data: evt.data, ultima_passagem_desc: evt.descricao })
          .eq('chave_nfe', evt.chave)
          .or(`ultima_passagem_data.is.null,ultima_passagem_data.lt.${evt.data}`)
      }

      // Upsert no banco
      const toRow = (d: NFeResumida) => ({
        chave_nfe: d.chave,
        numero_nota: d.numeroNota || null,
        data_emissao: d.dataEmissao || null,
        fornecedor_cnpj: d.fornecedorCnpj || null,
        fornecedor_nome: d.fornecedorNome || null,
        valor_total: d.valorTotal || null,
        transportadora_cnpj: d.transportadoraCnpj || null,
        transportadora_nome: d.transportadoraNome || null,
        items_json: d.items,
        tem_xml_completo: !!d.items,
        xml_fetched_at: d.items ? new Date().toISOString() : null,
        nsu: d.nsu,
      })

      // Resumos (resNFe): só insere se ainda não existir
      const resumos = docs.filter(d => !d.items)
      if (resumos.length > 0) {
        const { error } = await supabase
          .from('nfe_received')
          .upsert(resumos.map(toRow), { onConflict: 'chave_nfe', ignoreDuplicates: true })
        if (!error) newCount += resumos.length
      }

      // XML completo (nfeProc): atualiza a linha existente para gravar itens/transportadora
      const completos = docs.filter(d => d.items)
      if (completos.length > 0) {
        const { error } = await supabase
          .from('nfe_received')
          .upsert(completos.map(toRow), { onConflict: 'chave_nfe', ignoreDuplicates: false })
        if (!error) newCount += completos.length
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

    // Cruza com notas já lançadas no sistema (purchase_invoices)
    const { data: lancadas } = await supabase
      .from('purchase_invoices')
      .select('chave_nfe')
    const chavesLancadas = new Set((lancadas ?? []).map(l => l.chave_nfe))

    const nfes = (data ?? []).map(n => ({
      ...n,
      status: chavesLancadas.has(n.chave_nfe) ? 'added' : n.status,
    }))

    return NextResponse.json({ nfes })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
