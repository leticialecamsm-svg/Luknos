// Trava contra contato repetido (regras puras, sem I/O; cobertas por testes).
// "Ádna Oliveira", "adna  oliveira" e "Adna Oliveira." contam como o mesmo nome.

import { samePhone, onlyDigits } from './crm-panel'

export type DedupCandidate = { id: string; name: string | null; phone: string | null; email: string | null }

// Nome comparável: sem acento, minúsculo, só letras/números, espaços simples.
export function normalizeContactName(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function hasPhone(p: string | null | undefined): boolean {
  return onlyDigits(p).length >= 8
}

export type DuplicateReason = 'phone' | 'email' | 'name'

// Procura um contato que já seja a mesma pessoa:
// - mesmo telefone (com/sem 9º dígito e 55) → duplicado, só quando opts.phone (padrão: sim). Fora do CRM
//   fica desligado: aqui cliente costuma ser cadastrado com o telefone do arquiteto, casal divide número etc.;
// - mesmo e-mail → duplicado;
// - mesmo nome (ignorando acento/caixa/pontuação) → duplicado, exceto quando os dois têm
//   telefone e os telefones são diferentes (aí são homônimos de verdade).
export function findDuplicateContact(
  input: { name?: string | null; phone?: string | null; email?: string | null },
  existing: DedupCandidate[],
  ignoreId?: string | null,
  opts: { phone?: boolean } = {},
): { contact: DedupCandidate; reason: DuplicateReason } | null {
  const checkPhone = opts.phone !== false
  const name = normalizeContactName(input.name)
  const email = (input.email ?? '').trim().toLowerCase()
  const phoneOk = hasPhone(input.phone)
  let byName: DedupCandidate | null = null
  for (const c of existing) {
    if (ignoreId && c.id === ignoreId) continue
    if (checkPhone && phoneOk && hasPhone(c.phone) && samePhone(input.phone, c.phone)) return { contact: c, reason: 'phone' }
    if (email && (c.email ?? '').trim().toLowerCase() === email) return { contact: c, reason: 'email' }
    if (!byName && name && normalizeContactName(c.name) === name) {
      const bothPhonesDiffer = phoneOk && hasPhone(c.phone) && !samePhone(input.phone, c.phone)
      if (!bothPhonesDiffer) byName = c
    }
  }
  return byName ? { contact: byName, reason: 'name' } : null
}

export function duplicateMessage(d: { contact: DedupCandidate; reason: DuplicateReason }, extra?: string): string {
  const why = d.reason === 'phone' ? 'com este telefone' : d.reason === 'email' ? 'com este e-mail' : 'com este nome'
  return `Já existe o contato "${d.contact.name}" ${why}${extra ? ` (${extra})` : ''}. Use o cadastro existente em vez de criar outro.`
}
