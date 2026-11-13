import { createContact, updateContact, savePartnerSensitive } from '@/lib/actions'
import type { PartnerFormValues } from './partner-types'

const blank = (s: string) => (s.trim() ? s.trim() : undefined)

async function saveSensitive(contactId: string, v: PartnerFormValues): Promise<string | undefined> {
  if (!v.sensitiveVisible) return undefined
  const r = await savePartnerSensitive(contactId, { cpf: v.cpf, pix_key: v.pix_key, birth_date: v.birth_date, address: v.address }, true)
  return 'error' in r ? 'O parceiro foi salvo, mas CPF, PIX e endereço não: ' + r.error : undefined
}

export async function createPartner(v: PartnerFormValues): Promise<{ error: string } | { contact: any; warning?: string }> {
  const res = await createContact({
    name: v.name, phone: blank(v.phone), email: blank(v.email), type: v.type, company: blank(v.company),
    new_prospection: v.new_prospection, assigned_to: v.assigned_to,
    commission_rate: v.commission_rate, linked_user_id: v.linked_user_id,
  })
  if (res.error || !res.data) return { error: res.error ?? 'Não foi possível salvar' }
  return { contact: res.data, warning: await saveSensitive(res.data.id, v) }
}

export async function updatePartner(id: string, v: PartnerFormValues): Promise<{ error: string } | { contact: any; warning?: string }> {
  const res = await updateContact(id, {
    name: v.name, phone: v.phone.trim(), email: v.email.trim(), type: v.type, company: v.company.trim(),
    new_prospection: v.new_prospection, assigned_to: v.assigned_to,
    commission_rate: v.commission_rate, linked_user_id: v.linked_user_id,
  })
  if (res.error || !res.data) return { error: res.error ?? 'Não foi possível salvar' }
  return { contact: res.data, warning: await saveSensitive(id, v) }
}
