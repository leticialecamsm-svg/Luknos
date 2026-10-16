import https from 'https'
import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'
import { getAgent, tag, CNPJ_EMPRESA } from '@/lib/nfe'

// Manifestação do destinatário — evento 210210 "Ciência da Operação".
// A SEFAZ só libera o XML completo (nfeProc, com itens e protocolo) de uma NF
// recebida pelo DistDFe depois que o destinatário registra a ciência; antes
// disso só vem o resumo (resNFe). A ciência é neutra: não aceita nem recusa a
// nota, e ainda permite Confirmação / Desconhecimento / Não realizada depois.
//
// Webservice do Ambiente Nacional (cOrgao 91). NÃO conta na cota de 20/hora do
// DistDFe — é outro serviço.
const EVENTO_URL = 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx'
const EVENTO_NS  = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4'
const MAX_POR_LOTE = 20 // limite da SEFAZ de eventos por envEvento

// 135 = registrado e vinculado à NF-e, 136 = registrado sem vínculo,
// 573 = duplicidade (a ciência já tinha sido registrada antes)
const OK_STATS = new Set(['135', '136', '573'])

export interface ResultadoCiencia { chave: string; ok: boolean; cStat: string; xMotivo: string }

function getChaveECert() {
  const pfxB64 = process.env.CERT_PFX_B64
  const passphrase = process.env.CERT_PFX_PASSWORD
  if (!pfxB64 || !passphrase) throw new Error('Certificado digital não configurado (CERT_PFX_B64 / CERT_PFX_PASSWORD)')
  const der = forge.util.decode64(pfxB64.replace(/\s/g, ''))
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), passphrase)
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]
  if (!keyBag?.key) throw new Error('Chave privada não encontrada no certificado A1.')
  // Mais de um certificado no .pfx (cadeia da AC): usa o que casa com a chave privada
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map(b => b.cert!).filter(Boolean)
  const pub = forge.pki.setRsaPublicKey((keyBag.key as forge.pki.rsa.PrivateKey).n, (keyBag.key as forge.pki.rsa.PrivateKey).e)
  const cert = certs.find(c => forge.pki.publicKeyToPem(c.publicKey) === forge.pki.publicKeyToPem(pub)) ?? certs[0]
  if (!cert) throw new Error('Certificado não encontrado no arquivo A1.')
  return { privateKey: forge.pki.privateKeyToPem(keyBag.key), cert: forge.pki.certificateToPem(cert) }
}

// Horário de Brasília (UTC-3, sem horário de verão desde 2019), formato exigido pela SEFAZ
function dhEventoAgora() {
  const d = new Date(Date.now() - 3 * 3600_000)
  return d.toISOString().slice(0, 19) + '-03:00'
}

function assinarEvento(chave: string, privateKey: string, cert: string) {
  const id = `ID210210${chave}01`
  const evento = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${id}"><cOrgao>91</cOrgao><tpAmb>1</tpAmb><CNPJ>${CNPJ_EMPRESA}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${dhEventoAgora()}</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento></evento>`

  // Padrão da NF-e: assinatura envelopada, C14N, RSA-SHA1, digest SHA1
  const sig = new SignedXml({
    privateKey,
    publicCert: cert,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  })
  sig.addReference({
    xpath: "//*[local-name(.)='infEvento']",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  })
  sig.computeSignature(evento, { location: { reference: "//*[local-name(.)='infEvento']", action: 'after' } })
  return sig.getSignedXml()
}

function post(body: string): Promise<string> {
  const agent = getAgent()
  return new Promise((resolve, reject) => {
    const url = new URL(EVENTO_URL)
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST', agent,
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${EVENTO_NS}/nfeRecepcaoEvento"`,
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

export async function manifestarCiencia(chaves: string[]): Promise<ResultadoCiencia[]> {
  if (chaves.length === 0) return []
  const { privateKey, cert } = getChaveECert()
  const resultados: ResultadoCiencia[] = []

  for (let i = 0; i < chaves.length; i += MAX_POR_LOTE) {
    const lote = chaves.slice(i, i + MAX_POR_LOTE)
    const eventos = lote.map(c => assinarEvento(c, privateKey, cert)).join('')
    const idLote = String(Date.now()).slice(-15)
    const envEvento = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${idLote}</idLote>${eventos}</envEvento>`
    const soap = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="${EVENTO_NS}">${envEvento}</nfeDadosMsg></soap12:Body></soap12:Envelope>`

    const xml = await post(soap)
    const loteStat = tag(xml, 'cStat')
    const loteMotivo = tag(xml, 'xMotivo')
    const retEventos = xml.match(/<retEvento[\s>][\s\S]*?<\/retEvento>/g) ?? []
    const porChave = new Map(retEventos.map(r => [tag(r, 'chNFe'), { cStat: tag(r, 'cStat'), xMotivo: tag(r, 'xMotivo') }]))

    for (const chave of lote) {
      const r = porChave.get(chave) ?? { cStat: loteStat || 'erro', xMotivo: loteMotivo || 'Sem resposta da SEFAZ' }
      resultados.push({ chave, ok: OK_STATS.has(r.cStat), ...r })
    }
  }
  return resultados
}

// Registra a ciência e grava o resultado em nfe_received
export async function registrarCiencia(
  supabase: { from: (t: string) => any },
  chaves: string[],
): Promise<ResultadoCiencia[]> {
  const resultados = await manifestarCiencia(chaves)
  const agora = new Date().toISOString()
  for (const r of resultados) {
    await supabase
      .from('nfe_received')
      .update({ ciencia_em: r.ok ? agora : null, ciencia_cstat: r.cStat, ciencia_motivo: r.xMotivo })
      .eq('chave_nfe', r.chave)
  }
  return resultados
}

// Mensagem pro usuário quando a nota ainda não tem XML completo:
// registra a ciência se for a primeira vez (não gasta a cota do DistDFe).
// Retorna null quando a ciência já existia e vale a pena consultar o DistDFe.
export async function garantirCiencia(
  supabase: { from: (t: string) => any },
  chave: string,
  row: { ciencia_em?: string | null; tem_xml_completo?: boolean | null } | null,
): Promise<string | null> {
  // XML completo já veio antes (ciência feita por outro sistema) ou ciência já registrada
  if (row?.ciencia_em || row?.tem_xml_completo) return null
  const [r] = await registrarCiencia(supabase, [chave])
  if (!r.ok) return `A SEFAZ recusou a Ciência da Operação: ${r.xMotivo} (cStat ${r.cStat}).`
  return 'Ciência da Operação registrada agora na SEFAZ. Ela costuma liberar o XML completo em alguns minutos — tente de novo daqui a pouco.'
}
