import { NextRequest, NextResponse } from 'next/server'
import https from 'https'

const SVRS_URL = 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx'
const SVRS_NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4'

function buildSoap(chave: string) {
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

function soapRequest(body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const agent = getAgent()
    const url = new URL(SVRS_URL)
    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `${SVRS_NS}/nfeConsultaNF`,
        'Content-Length': Buffer.byteLength(body),
      },
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

export async function GET(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave')?.replace(/\D/g, '') ?? ''
  if (chave.length !== 44) return NextResponse.json({ error: 'Chave inválida (deve ter 44 dígitos)' }, { status: 400 })

  try {
    const soap = buildSoap(chave)
    const xml = await soapRequest(soap)

    const cStat = get(xml, 'cStat')
    const xMotivo = get(xml, 'xMotivo')

    // 100 = Autorizado, 150 = Cancelada
    if (cStat !== '100' && cStat !== '150') {
      return NextResponse.json({ error: `SEFAZ: ${xMotivo} (cStat ${cStat})` }, { status: 400 })
    }

    // Extrai NF-e do retConsSitNFe → procNFe ou NFe diretamente
    const nfeBlock = xml.match(/<NFe[^>]*>([\s\S]*?)<\/NFe>/)?.[0]
      ?? xml.match(/<nfeProc[^>]*>([\s\S]*?)<\/nfeProc>/)?.[0]
      ?? xml

    const parsed = parseNFeXML(nfeBlock)
    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
