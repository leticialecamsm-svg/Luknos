// Camada fina de comunicação com a Focus NFe. Nada aqui fala com a SEFAZ
// diretamente — a Focus assina o XML com o certificado que já está cadastrado
// na empresa dela e transmite. Autenticação: HTTP Basic, token como usuário,
// senha em branco (padrão da API).

const BASE_URL = {
  homologacao: 'https://homologacao.focusnfe.com.br/v2',
  producao: 'https://api.focusnfe.com.br/v2',
} as const

export type FocusAmbiente = keyof typeof BASE_URL

export type FocusResult<T = any> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: any }

async function call(ambiente: FocusAmbiente, token: string, method: string, path: string, body?: unknown): Promise<FocusResult> {
  const url = `${BASE_URL[ambiente]}${path}`
  const auth = Buffer.from(`${token}:`).toString('base64')
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e: any) {
    return { ok: false, status: 0, error: `Falha de rede ao falar com a Focus: ${e?.message ?? e}` }
  }
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }

  if (!res.ok) {
    const msg = data?.mensagem ?? data?.erros?.[0]?.mensagem ?? data?.codigo ?? text ?? `HTTP ${res.status}`
    return { ok: false, status: res.status, error: String(msg), data }
  }
  return { ok: true, status: res.status, data }
}

export function focusEmitirNfe(ambiente: FocusAmbiente, token: string, ref: string, payload: unknown) {
  return call(ambiente, token, 'POST', `/nfe?ref=${encodeURIComponent(ref)}`, payload)
}
export function focusEmitirNfce(ambiente: FocusAmbiente, token: string, ref: string, payload: unknown) {
  return call(ambiente, token, 'POST', `/nfce?ref=${encodeURIComponent(ref)}`, payload)
}
export function focusConsultar(ambiente: FocusAmbiente, token: string, tipo: 'nfe' | 'nfce', ref: string) {
  return call(ambiente, token, 'GET', `/${tipo}/${encodeURIComponent(ref)}`)
}
export function focusCancelar(ambiente: FocusAmbiente, token: string, tipo: 'nfe' | 'nfce', ref: string, justificativa: string) {
  return call(ambiente, token, 'DELETE', `/${tipo}/${encodeURIComponent(ref)}`, { justificativa })
}
