import { env } from './env.ts'

// Cliente do endpoint de negócio do Luknos (Next.js).
// REGRA DE OURO: toda escrita no banco de negócio (quotes, contacts, proposals,
// comissão, tarefas) passa por AQUI — via POST /api/external/quotes, com API key.
// As Edge Functions nunca escrevem direto nessas tabelas.

const base = () => env.systemApiUrl.replace(/\/$/, '')

export async function systemApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${base()}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.systemApiKey,
      ...(init.headers ?? {}),
    },
  })
}

// Atalhos que a Fase 2 vai usar:
export const systemApi = {
  createQuote: (payload: unknown) =>
    systemApiFetch('/api/external/quotes', { method: 'POST', body: JSON.stringify(payload) }),
}
