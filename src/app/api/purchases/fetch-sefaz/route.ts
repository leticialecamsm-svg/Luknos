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
  if (!res.ok) throw new Error(`Falha ao autenticar na SEFAZ AL (${res.status}). Confira usuário/senha do portal Cobrança DF-e.`)
  // O portal entrega o token no header Authorization (é de lá que o front deles lê);
  // id_token no corpo fica como reserva
  const header = res.headers.get('authorization') ?? ''
  const data = await res.json().catch(() => ({}))
  const token = header.startsWith('Bearer ') ? header.slice(7) : data.id_token
  if (!token) throw new Error('Token não retornado pela SEFAZ AL')
  return token
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
    // A consulta de detalhe é pública no portal Cobrança DF-e (funciona sem login).
    // O token do login passou a ser recusado com 401 nessa rota, então vai sem
    // autenticação; o login só entra como reserva se a SEFAZ voltar a exigir.
    const url = `${SEFAZ_BASE}/sfz-cobranca-dfe-api/api/detalhe-calculo-nfes?chaveNota.equals=${chave}`
    let res = await fetch(url, { cache: 'no-store' })
    if ((res.status === 401 || res.status === 403) && process.env.SEFAZ_AL_USER && process.env.SEFAZ_AL_PASSWORD) {
      const token = await getSefazToken()
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    }
    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: 'Nota não encontrada na SEFAZ AL' }, { status: 404 })
      const corpo = (await res.text().catch(() => '')).slice(0, 300)
      console.error(`fetch-sefaz ${res.status}:`, corpo)
      throw new Error(`SEFAZ AL retornou ${res.status}`)
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
