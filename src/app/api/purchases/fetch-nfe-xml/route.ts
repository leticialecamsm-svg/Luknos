import { NextRequest, NextResponse } from 'next/server'
import https from 'https'
import zlib from 'zlib'
import { promisify } from 'util'

const gunzip = promisify(zlib.gunzip)

// NFeDistribuicaoDFe – Nacional, retorna XML completo com itens (SOAP 1.2)
const DIST_URL = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
const DIST_NS  = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe'

// NFeConsultaProtocolo4 – SVRS (AL), retorna protocolo mas NÃO os itens (SOAP 1.1)
const SVRS_URL = 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx'
const SVRS_NS  = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4'

function buildDistSoap(chave: string, cnpj: string) {
  const inner = `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><cUFAutor>27</cUFAutor><CNPJ>${cnpj}</CNPJ><consChNFe><chNFe>${chave}</chNFe></consChNFe></distDFeInt>`
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInt xmlns="${DIST_NS}"><nfeDadosMsg>${inner}</nfeDadosMsg></nfeDistDFeInt></soap12:Body></soap12:Envelope>`
}

function buildSvrsConsultaSoap(chave: string) {
  const inner = `<consSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe>`
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body><nfeDadosMsg xmlns="${SVRS_NS}">${inner}</nfeDadosMsg></soap:Body></soap:Envelope>`
}

function getAgent() {
  const pfxB64 = process.env.CERT_PFX_B64
  const passphrase = process.env.CERT_PFX_PASSWORD
  if (!pfxB64 || !passphrase) throw new Error('Certificado digital não configurado (CERT_PFX_B64 / CERT_PFX_PASSWORD)')
  return new https.Agent({
    pfx: Buffer.from(pfxB64, 'base64'),
    passphrase,
    rejectUnauthorized: false,
  })
}

function soapRequest(urlStr: string, body: string, headers: Record<string, string | number>): Promise<string> {
  return new Promise((resolve, reject) => {
    const agent = getAgent()
    const url = new URL(urlStr)
    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      agent,
      headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
    }
    const req = https.request(options, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
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

function parseNFeXML(nfeXml: string) {
  const numeroNota = get(nfeXml, 'nNF')
  const dataEmissao = (get(nfeXml, 'dhEmi') || get(nfeXml, 'dEmi')).slice(0, 10)

  const emitBlock = nfeXml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? ''
  const fornecedorCnpj = get(emitBlock, 'CNPJ')
  const fornecedorNome = get(emitBlock, 'xFant') || get(emitBlock, 'xNome')

  const detBlocks = nfeXml.match(/<det\s[^>]*>[\s\S]*?<\/det>/g) ?? []
  const items = detBlocks.map(det => {
    const nItem = parseInt(det.match(/nItem="(\d+)"/)?.[1] ?? '0')
    const prodBlock = det.match(/<prod>([\s\S]*?)<\/prod>/)?.[1] ?? ''
    const ipiBlock = det.match(/<IPITrib>([\s\S]*?)<\/IPITrib>/)?.[1] ?? ''

    const cProd = get(prodBlock, 'cProd')
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

    return { nItem, cProd, ncm, quantidade, valorTotal, ipiPercent }
  })

  return { numeroNota, dataEmissao, fornecedorCnpj, fornecedorNome, items }
}

// Extrai e descompacta o XML da NF-e do docZip retornado pelo DistDFe
async function extractNFeFromDist(xml: string): Promise<string | null> {
  // DistDFe retorna docZip em base64+gzip
  const docZipMatch = xml.match(/<docZip[^>]*schema="[^"]*nfe_v[^"]*"[^>]*>([A-Za-z0-9+/=\s]+)<\/docZip>/)
    ?? xml.match(/<docZip[^>]*>([A-Za-z0-9+/=\s]+)<\/docZip>/)
  if (docZipMatch) {
    try {
      const buf = Buffer.from(docZipMatch[1].replace(/\s/g, ''), 'base64')
      const decompressed = await gunzip(buf)
      const innerXml = decompressed.toString('utf-8')
      return innerXml.match(/<NFe[\s>][\s\S]*?<\/NFe>/)?.[0]
        ?? innerXml.match(/<nfeProc[\s>][\s\S]*?<\/nfeProc>/)?.[0]
        ?? innerXml
    } catch {
      // fallthrough
    }
  }

  return xml.match(/<NFe[\s>][\s\S]*?<\/NFe>/)?.[0]
    ?? xml.match(/<nfeProc[\s>][\s\S]*?<\/nfeProc>/)?.[0]
    ?? null
}

export async function GET(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave')?.replace(/\D/g, '') ?? ''
  if (chave.length !== 44) return NextResponse.json({ error: 'Chave inválida (deve ter 44 dígitos)' }, { status: 400 })

  const cnpj = process.env.EMPRESA_CNPJ ?? '45118870000106'

  // Tentativa 1: NFeDistribuicaoDFe Nacional (SOAP 1.2) – retorna XML completo com itens
  try {
    const distSoap = buildDistSoap(chave, cnpj)
    const distXml = await soapRequest(DIST_URL, distSoap, {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'SOAPAction': `${DIST_NS}/nfeDistDFeInt`,
    })

    const cStat = get(distXml, 'cStat')
    const xMotivo = get(distXml, 'xMotivo')

    // cStat 137/138 = documentos retornados com sucesso
    if (cStat === '137' || cStat === '138') {
      const nfeBlock = await extractNFeFromDist(distXml)
      if (nfeBlock) {
        return NextResponse.json(parseNFeXML(nfeBlock))
      }
    }

    // cStat 215 = Falha schema, 656 = não credenciado, outros erros
    // Apenas loga e tenta fallback SVRS
    console.warn(`[fetch-nfe-xml] DistDFe cStat ${cStat}: ${xMotivo}`)
  } catch (e: any) {
    console.warn(`[fetch-nfe-xml] DistDFe erro: ${e.message}`)
  }

  // Tentativa 2: NFeConsultaProtocolo4 SVRS – só confirma autorização, sem itens
  try {
    const svrsSoap = buildSvrsConsultaSoap(chave)
    const svrsXml = await soapRequest(SVRS_URL, svrsSoap, {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `${SVRS_NS}/nfeConsultaNF`,
    })

    const cStat = get(svrsXml, 'cStat')
    const xMotivo = get(svrsXml, 'xMotivo')

    if (cStat !== '100' && cStat !== '150') {
      return NextResponse.json({ error: `SEFAZ: ${xMotivo} (cStat ${cStat})` }, { status: 400 })
    }

    // Autorizada, mas sem itens (protocolo apenas)
    return NextResponse.json({
      numeroNota: '',
      dataEmissao: '',
      fornecedorCnpj: '',
      fornecedorNome: '',
      items: [],
      _semItens: true,
      _autorizada: true,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
