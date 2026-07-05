import { NextRequest, NextResponse } from 'next/server'

const SEFAZ_BASE = 'https://contribuinte.sefaz.al.gov.br/cobrancadfe'

async function getSefazToken(): Promise<string> {
  const user = process.env.SEFAZ_AL_USER
  const pass = process.env.SEFAZ_AL_PASSWORD
  if (!user || !pass) throw new Error('Credenciais SEFAZ não configuradas (SEFAZ_AL_USER / SEFAZ_AL_PASSWORD)')

  const res = await fetch(`${SEFAZ_BASE}/api/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass, rememberMe: false }),
  })
  if (!res.ok) throw new Error(`Falha ao autenticar na SEFAZ: ${res.status}`)
  const data = await res.json()
  if (!data.id_token) throw new Error('Token não retornado pela SEFAZ')
  return data.id_token
}

export interface SefazItem {
  numeroItem: number
  descricaoProduto: string
  codigoNcm: number | null
  tipoImposto: string        // ST | ANT
  valorIcms: number
  valorFecoep: number
  aliquotaIcms: number       // decimal, ex: 0.205
  aliquotaFecoep: number     // decimal, ex: 0.01
  mvaValor: number | null
  numDocResponsavel: string
  segmento: string
}

export async function GET(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave')
  if (!chave || chave.length !== 44) {
    return NextResponse.json({ error: 'Chave NF-e inválida (deve ter 44 dígitos)' }, { status: 400 })
  }

  try {
    const token = await getSefazToken()

    const res = await fetch(
      `${SEFAZ_BASE}/sfz-cobranca-dfe-api/api/detalhe-calculo-nfes?chaveNota.equals=${chave}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: 'Nota não encontrada na SEFAZ AL' }, { status: 404 })
      throw new Error(`SEFAZ retornou ${res.status}`)
    }

    const raw: any[] = await res.json()
    if (!raw || raw.length === 0) {
      return NextResponse.json({ error: 'Nenhum item de imposto encontrado para esta chave' }, { status: 404 })
    }

    const items: SefazItem[] = raw.map((r, i) => ({
      numeroItem: r.id ?? i + 1,
      descricaoProduto: r.descricaoProduto ?? '',
      codigoNcm: r.codigoNcm ?? null,
      tipoImposto: r.tipoImposto ?? '',
      valorIcms: Number(r.valorIcmsCalculado) || 0,
      valorFecoep: Number(r.valorFecoepCalculado) || 0,
      aliquotaIcms: parseFloat(r.aliquotaIcms) || 0,
      aliquotaFecoep: parseFloat(r.aliquotaFecoep) || 0,
      mvaValor: r.mvaValor ? parseFloat(r.mvaValor) : null,
      numDocResponsavel: r.numDocResponsavel ?? '',
      segmento: (r.segmento ?? '').trim(),
    }))

    // Metadados gerais da nota
    const meta = {
      numeroNota: raw[0]?.numeroNota ?? '',
      dataEmissao: raw[0]?.dataEmissao ?? '',
      fornecedorCnpj: raw[0]?.numeroDocumentoEmitente ?? '',
    }

    return NextResponse.json({ items, meta })
  } catch (err: any) {
    console.error('fetch-sefaz error:', err)
    return NextResponse.json({ error: err.message ?? 'Erro ao consultar SEFAZ' }, { status: 500 })
  }
}
