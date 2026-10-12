import { env } from './env.ts'
export function isInternalCall(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  return req.headers.get('x-internal-call') === '1' && token === env.serviceRoleKey
}
