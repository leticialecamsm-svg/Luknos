import { NextResponse } from 'next/server'

// Diagnóstico do certificado configurado. NÃO expõe o conteúdo do certificado nem
// a senha — só metadados (tamanhos e verificações booleanas) suficientes pra saber
// se o valor foi colado inteiro e no formato certo.
export async function GET() {
  const raw = process.env.CERT_PFX_B64
  const pass = process.env.CERT_PFX_PASSWORD

  if (!raw) return NextResponse.json({ configurada: false, motivo: 'CERT_PFX_B64 não existe' })

  const limpa = raw.replace(/\s/g, '')
  const buf = Buffer.from(limpa, 'base64')

  let derDeclarado: number | null = null
  if (buf.length > 4 && (buf[1] & 0x80)) {
    const n = buf[1] & 0x7f
    if (buf.length >= 2 + n) derDeclarado = buf.readUIntBE(2, n) + 2 + n
  }

  return NextResponse.json({
    configurada: true,
    senhaConfigurada: !!pass,
    senhaTamanho: pass?.length ?? 0,
    base64_tamanho_bruto: raw.length,
    base64_tamanho_sem_espacos: limpa.length,
    base64_esperado: 12040,
    tamanho_bate: limpa.length === 12040,
    comeca_correto: limpa.startsWith('MIIjQAIBAzCC'),
    termina_correto: limpa.endsWith('CFrQDDVTGhv+AgIIAA=='),
    tem_aspas: /^["']|["']$/.test(raw.trim()),
    tem_prefixo_nome_var: /^CERT_PFX_B64\s*=/.test(raw.trim()),
    decodificado_bytes: buf.length,
    decodificado_byte0_hex: buf.length ? '0x' + buf[0].toString(16) : null,
    der_tamanho_declarado: derDeclarado,
    der_esperado: 9028,
  })
}
