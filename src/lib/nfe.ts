import https from 'https'
import zlib from 'zlib'
import { promisify } from 'util'
import { logSefazDistCall } from '@/lib/sefaz-quota'

const gunzip = promisify(zlib.gunzip)

const DIST_URL = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
const DIST_NS  = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe'

export const CNPJ_EMPRESA = process.env.EMPRESA_CNPJ ?? '45118870000106'

export interface NFeItemParsed {
  nItem: number
  cProd: string
  xProd: string
  ncm: string
  quantidade: number
  valorTotal: number
  ipiPercent: number
}

export interface NFeParsed {
  numeroNota: string
  dataEmissao: string
  fornecedorCnpj: string
  fornecedorNome: string
  transportadoraCnpj: string
  transportadoraNome: string
  items: NFeItemParsed[]
}

export function getAgent() {
  const pfxB64 = process.env.CERT_PFX_B64
  const passphrase = process.env.CERT_PFX_PASSWORD
  if (!pfxB64 || !passphrase) throw new Error('Certificado digital não configurado (CERT_PFX_B64 / CERT_PFX_PASSWORD)')
  return new https.Agent({ pfx: Buffer.from(pfxB64, 'base64'), passphrase, rejectUnauthorized: false })
}

export function buildDistChaveSoap(chave: string) {
  const inner = `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><cUFAutor>27</cUFAutor><CNPJ>${CNPJ_EMPRESA}</CNPJ><consChNFe><chNFe>${chave}</chNFe></consChNFe></distDFeInt>`
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="${DIST_NS}"><nfeDadosMsg>${inner}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`
}

export async function soapPost(urlStr: string, body: string, headers: Record<string, string | number>): Promise<string> {
  await logSefazDistCall() // toda chamada aqui consome da cota de 20/hora da SEFAZ
  return new Promise((resolve, reject) => {
    const agent = getAgent()
    const url = new URL(urlStr)
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST', agent,
      headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
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

export function tag(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? ''
}

export function parseNFeXML(nfeXml: string): NFeParsed {
  const numeroNota = tag(nfeXml, 'nNF')
  const dataEmissao = (tag(nfeXml, 'dhEmi') || tag(nfeXml, 'dEmi')).slice(0, 10)

  const emitBlock = nfeXml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? ''
  const fornecedorCnpj = tag(emitBlock, 'CNPJ')
  const fornecedorNome = tag(emitBlock, 'xFant') || tag(emitBlock, 'xNome')

  const transpBlock = nfeXml.match(/<transporta>([\s\S]*?)<\/transporta>/)?.[1] ?? ''
  const transportadoraCnpj = tag(transpBlock, 'CNPJ') || tag(transpBlock, 'CPF')
  const transportadoraNome = tag(transpBlock, 'xNome')

  const detBlocks = nfeXml.match(/<det\s[^>]*>[\s\S]*?<\/det>/g) ?? []
  const items = detBlocks.map(det => {
    const nItem = parseInt(det.match(/nItem="(\d+)"/)?.[1] ?? '0')
    const prodBlock = det.match(/<prod>([\s\S]*?)<\/prod>/)?.[1] ?? ''
    const ipiBlock = det.match(/<IPITrib>([\s\S]*?)<\/IPITrib>/)?.[1] ?? ''

    const cProd = tag(prodBlock, 'cProd')
    const xProd = tag(prodBlock, 'xProd')
    const ncm = tag(prodBlock, 'NCM')
    const quantidade = parseFloat(tag(prodBlock, 'qCom')) || 0
    const valorTotal = parseFloat(tag(prodBlock, 'vProd')) || 0

    let ipiPercent = 0
    if (ipiBlock) {
      const pIPI = parseFloat(tag(ipiBlock, 'pIPI'))
      if (pIPI) ipiPercent = pIPI
      else {
        const vIPI = parseFloat(tag(ipiBlock, 'vIPI')) || 0
        if (valorTotal > 0) ipiPercent = (vIPI / valorTotal) * 100
      }
    }

    return { nItem, cProd, xProd, ncm, quantidade, valorTotal, ipiPercent }
  })

  return { numeroNota, dataEmissao, fornecedorCnpj, fornecedorNome, transportadoraCnpj, transportadoraNome, items }
}

export async function unzipDoc(b64: string): Promise<string> {
  const buf = Buffer.from(b64.replace(/\s/g, ''), 'base64')
  try {
    return (await gunzip(buf)).toString('utf-8')
  } catch {
    return buf.toString('utf-8')
  }
}

// Consulta a NF-e completa por chave via DistDFe (consChNFe).
// ATENÇÃO: limitado a 20 consultas/hora por CNPJ pela SEFAZ. Use com parcimônia.
export async function consultarNFeCompleta(chave: string): Promise<{ ok: boolean; cStat: string; xMotivo: string; nfe?: NFeParsed }> {
  const soap = buildDistChaveSoap(chave)
  const xml = await soapPost(DIST_URL, soap, {
    'Content-Type': `application/soap+xml; charset=utf-8; action="${DIST_NS}/nfeDistDFeInteresse"`,
  })

  const cStat = tag(xml, 'cStat')
  const xMotivo = tag(xml, 'xMotivo')

  if (cStat === '137' || cStat === '138') {
    const docZip = xml.match(/<docZip[^>]*>([A-Za-z0-9+/=\s]+)<\/docZip>/)?.[1]
    if (docZip) {
      const inner = await unzipDoc(docZip)
      const nfeBlock = inner.match(/<nfeProc[\s>][\s\S]*?<\/nfeProc>/)?.[0]
        ?? inner.match(/<NFe[\s>][\s\S]*?<\/NFe>/)?.[0]
        ?? inner
      const nfe = parseNFeXML(nfeBlock)
      if (nfe.items.length > 0) return { ok: true, cStat, xMotivo, nfe }
    }
  }

  return { ok: false, cStat, xMotivo }
}

// Códigos IBGE de UF usados no campo cOrgao dos eventos
const UF_POR_CODIGO: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

export interface EventoPassagem { uf: string; data: string; descricao: string }

// Consulta por chave (consChNFe) devolve TODOS os documentos/eventos ainda disponíveis
// pra aquela nota (não só os novos, como a sincronização por NSU) — é o jeito de
// recuperar retroativamente eventos de passagem de notas mais antigas.
// ATENÇÃO: consome da mesma cota de 20 consultas/hora por CNPJ da SEFAZ.
export async function consultarEventosPassagem(chave: string): Promise<{ eventos: EventoPassagem[]; cStat: string; xMotivo: string; schemasEncontrados: string[]; todosEventos: string[] }> {
  const soap = buildDistChaveSoap(chave)
  const xml = await soapPost(DIST_URL, soap, {
    'Content-Type': `application/soap+xml; charset=utf-8; action="${DIST_NS}/nfeDistDFeInteresse"`,
  })

  const cStat = tag(xml, 'cStat')
  const xMotivo = tag(xml, 'xMotivo')

  const docRegex = /<docZip[^>]*schema="([^"]+)"[^>]*>([A-Za-z0-9+/=\s]+)<\/docZip>/g
  const eventos: EventoPassagem[] = []
  const schemasEncontrados: string[] = []
  const todosEventos: string[] = [] // diagnóstico: xEvento de TODO resEvento, mesmo os que não são passagem
  let m: RegExpExecArray | null
  while ((m = docRegex.exec(xml)) !== null) {
    const schema = m[1]
    schemasEncontrados.push(schema)
    if (!schema.includes('resEvento')) continue
    try {
      const inner = await unzipDoc(m[2])
      const xEvento = tag(inner, 'xEvento')
      const dhEvento = tag(inner, 'dhEvento')
      const cOrgao = tag(inner, 'cOrgao')
      if (xEvento) todosEventos.push(xEvento)
      if (xEvento && /passagem/i.test(xEvento)) {
        eventos.push({ uf: UF_POR_CODIGO[cOrgao] ?? cOrgao, data: dhEvento, descricao: xEvento })
      }
    } catch {
      // ignora evento com erro de parsing
    }
  }
  return { eventos, cStat, xMotivo, schemasEncontrados, todosEventos }
}
