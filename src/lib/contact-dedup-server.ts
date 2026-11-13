// Só usar no servidor (admin client).
import { findDuplicateContact, duplicateMessage, type DedupCandidate, type DuplicateReason } from './contact-dedup'

type Admin = { from: (t: string) => any }

// Lê todos os contatos (em páginas de 1000, limite do PostgREST) e procura um que já seja a mesma pessoa.
export async function findExistingContact(
  admin: Admin,
  input: { name?: string | null; phone?: string | null; email?: string | null },
  ignoreId?: string | null,
  opts: { phone?: boolean } = {},
): Promise<{ contact: DedupCandidate & { assigned_to?: string | null; type?: string }; reason: DuplicateReason; message: string } | null> {
  const all: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('contacts').select('id, name, phone, email, type, assigned_to').order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const dup = findDuplicateContact(input, all, ignoreId, opts)
  if (!dup) return null
  const c = dup.contact as any
  let owner: string | undefined
  if (c.assigned_to) {
    const { data: u } = await admin.from('users').select('name').eq('id', c.assigned_to).maybeSingle()
    owner = u?.name ? `responsável: ${u.name}` : undefined
  }
  return { contact: c, reason: dup.reason, message: duplicateMessage(dup, owner) }
}
