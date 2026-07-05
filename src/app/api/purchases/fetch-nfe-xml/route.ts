import { NextRequest, NextResponse } from 'next/server'
import https from 'https'
import zlib from 'zlib'
import { promisify } from 'util'

const gunzip = promisify(zlib.gunzip)

const SEFAZ_URL = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
const CNPJ = '45118870000106'
const C_UF_AUTOR = '27' // Alagoas

function buildSoap(chave: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
  <soapenv:Header/>
  <soapenv:Body>
    <nfe:nfeDistDFeInteresse>
      <nfe:nfeDadosMsg>
        <nfeDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>1</tpAmb>
          <cUFAutor>${C_UF_AUTOR}</cUFAutor>
          <CNPJ>${CNPJ}</CNPJ>
          <consChNFe>
            <chNFe>${chave}</chNFe>
          </consChNFe>
        </nfeDistDFeInt>
      </nfe:nfeDadosMsg>
    </nfe:nfeDistDFeInteresse>
  </soapenv:Body>
</soapenv:Envelope>`
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
    const url = new URL(SEFAZ_URL)
    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse',
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

function getXmlText(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
  return m?.[1]?.trim() ?? ''
}

function getAllMatches(xml: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g')
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) results.push(m[1])
  return results
}

function parseNFeXML(nfeXml: string) {
  const get = (scope: string, tag: string) => {
    const m = scope.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))
    return m?.[1]?.trim() ?? ''
  }

  const numeroNota = get(nfeXml, 'nNF')
  const dataEmissao = (get(nfeXml, 'dhEmi') || get(nfeXml, 'dEmi')).slice(0, 10)
  const fornecedorCnpj = get(nfeXml, 'emit CNPJ') || (() => {
    const emitBlock = nfeXml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? ''
    return get(emitBlock, 'CNPJ')
  })()
  const fornecedorNome = (() => {
    const emitBlock = nfeXml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? ''
    return get(emitBlock, 'xFant') || get(emitBlock, 'xNome')
  })()

  const detBlocks = nfeXml.match(/<det\s[^>]*>[\s\S]*?<\/det>/g) ?? []
  const items = detBlocks.map(det => {
    const nItemMatch = det.match(/nItem="(\d+)"/)
    const nItem = parseInt(nItemMatch?.[1] ?? '0')
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

  return { numeroNota, dataEmissao, fornecedorCnpj, fornecedorNome, items }
}

export async function GET(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave')?.replace(/\D/g, '') ?? ''
  if (chave.length !== 44) return NextResponse.json({ error: 'Chave inválida (deve ter 44 dígitos)' }, { status: 400 })

  try {
    const soap = buildSoap(chave)
    const xml = await soapRequest(soap)

    // Verifica rejeição
    const cStat = getXmlText(xml, 'cStat')
    const xMotivo = getXmlText(xml, 'xMotivo')

    if (cStat !== '138') {
      // cStat 138 = documento localizado
      return NextResponse.json({ error: `SEFAZ: ${xMotivo} (cStat ${cStat})` }, { status: 400 })
    }

    // Extrai docZip (gzip+base64)
    const docZips = getAllMatches(xml, 'docZip')
    if (!docZips.length) return NextResponse.json({ error: 'Documento não encontrado na resposta da SEFAZ' }, { status: 404 })

    // Descomprime o primeiro docZip (procNFe)
    const compressed = Buffer.from(docZips[0], 'base64')
    const nfeXml = (await gunzip(compressed)).toString('utf-8')

    const parsed = parseNFeXML(nfeXml)
    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
