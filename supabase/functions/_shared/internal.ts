import { env } from './env.ts'

// Chamada interna entre Edge Functions do robô (service role).
// O header x-internal-call marca a origem; as funções-alvo (engine, submit,
// workers) tratam isso como "interna (service role)".
export async function invokeFunction(
  name: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${env.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'x-internal-call': '1',
    },
    body: JSON.stringify(body),
  })
  const parsed = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body: parsed }
}

export function isInternalCall(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  return req.headers.get('x-internal-call') === '1' && token === env.serviceRoleKey
}

// Fire-and-forget: usa EdgeRuntime.waitUntil quando disponível (produção),
// senão aguarda a promise antes de responder (dev local).
export async function runBackground(p: Promise<unknown>): Promise<void> {
  const er = (globalThis as Record<string, unknown>).EdgeRuntime as
    | { waitUntil?: (p: Promise<unknown>) => void }
    | undefined
  if (er && typeof er.waitUntil === 'function') {
    er.waitUntil(p.catch((e) => console.error('background task falhou', e)))
    return
  }
  try {
    await p
  } catch (e) {
    console.error('background task falhou', e)
  }
}
