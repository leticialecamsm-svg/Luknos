'use server'

// Orçamento de Produtos — só admin. Tabela acessada pelo servidor (admin client)
// com a checagem de papel feita aqui, como em Cotação e Preços.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normText } from '@/lib/pricing/synonyms'
import { proposalTotals, printOptions, type DiscountType, type PrintOptions, type ProposalRoom } from './calc'

async function guard(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? { userId: user.id } : { error: 'Apenas administradores' }
}

export type Proposal = {
  id: string; number: number
  client_name: string; client_contact_id: string | null
  architect_name: string | null; architect_contact_id: string | null
  proposal_date: string; valid_days: number | null; payment_terms: string | null
  discount_type: DiscountType; discount_value: number; notes: string | null
  rooms: ProposalRoom[]; print_options: PrintOptions; total: number
  created_by: string | null; created_at: string; updated_at: string
  seller_name?: string | null
}

export type ProposalSummary = Pick<Proposal, 'id' | 'number' | 'client_name' | 'architect_name' | 'proposal_date' | 'total' | 'updated_at'> & { items: number; rooms: number }

const normalize = (r: any): Proposal => ({
  ...r, discount_value: Number(r.discount_value) || 0, total: Number(r.total) || 0,
  rooms: Array.isArray(r.rooms) ? r.rooms : [], print_options: printOptions(r.print_options),
})

export async function listProposals(): Promise<{ proposals: ProposalSummary[] } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return auth
  const { data, error } = await createAdminClient().from('product_proposals')
    .select('id, number, client_name, architect_name, proposal_date, total, updated_at, rooms')
    .order('updated_at', { ascending: false }).limit(500)
  if (error) return { error: error.message }
  return {
    proposals: (data ?? []).map((r: any) => ({
      id: r.id, number: r.number, client_name: r.client_name, architect_name: r.architect_name,
      proposal_date: r.proposal_date, total: Number(r.total) || 0, updated_at: r.updated_at,
      rooms: (r.rooms ?? []).length,
      items: (r.rooms ?? []).reduce((n: number, room: ProposalRoom) => n + (room.items?.length ?? 0), 0),
    })),
  }
}

export async function getProposal(id: string): Promise<{ proposal: Proposal } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return auth
  const db = createAdminClient()
  const { data, error } = await db.from('product_proposals').select('*').eq('id', id).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Orçamento não encontrado' }
  const proposal = normalize(data)
  if (proposal.created_by) {
    const { data: u } = await db.from('users').select('name').eq('id', proposal.created_by).maybeSingle()
    proposal.seller_name = (u as any)?.name ?? null
  }
  return { proposal }
}

export async function createProposal(): Promise<{ id: string } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return auth
  const { data, error } = await createAdminClient().from('product_proposals').insert({
    created_by: auth.userId,
    rooms: [{ id: crypto.randomUUID(), name: 'Sala', items: [] }],
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/propostas')
  return { id: data.id }
}

export type ProposalInput = Omit<Proposal, 'id' | 'number' | 'total' | 'created_by' | 'created_at' | 'updated_at' | 'seller_name'>

export async function saveProposal(id: string, input: ProposalInput): Promise<{ ok: true; updated_at: string } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return auth
  const { total } = proposalTotals(input.rooms, input.discount_type, input.discount_value)
  const { data, error } = await createAdminClient().from('product_proposals').update({
    client_name: input.client_name.trim(),
    client_contact_id: input.client_contact_id,
    architect_name: input.architect_name?.trim() || null,
    architect_contact_id: input.architect_contact_id,
    proposal_date: input.proposal_date,
    valid_days: input.valid_days || null,
    payment_terms: input.payment_terms?.trim() || null,
    discount_type: input.discount_type,
    discount_value: Math.max(0, Number(input.discount_value) || 0),
    notes: input.notes?.trim() || null,
    rooms: input.rooms,
    print_options: printOptions(input.print_options),
    total,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('updated_at').single()
  if (error) return { error: error.message }
  revalidatePath('/propostas')
  return { ok: true, updated_at: data.updated_at }
}

export async function duplicateProposal(id: string): Promise<{ id: string } | { error: string }> {
  const got = await getProposal(id)
  if ('error' in got) return got
  const p = got.proposal
  const auth = await guard()
  if ('error' in auth) return auth
  const { data, error } = await createAdminClient().from('product_proposals').insert({
    client_name: p.client_name, client_contact_id: p.client_contact_id,
    architect_name: p.architect_name, architect_contact_id: p.architect_contact_id,
    valid_days: p.valid_days, payment_terms: p.payment_terms,
    discount_type: p.discount_type, discount_value: p.discount_value, notes: p.notes,
    rooms: p.rooms, print_options: p.print_options, total: p.total, created_by: auth.userId,
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/propostas')
  return { id: data.id }
}

export async function deleteProposal(id: string): Promise<{ ok: true } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return auth
  const { error } = await createAdminClient().from('product_proposals').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/propostas')
  return { ok: true }
}

export type CatalogHit = {
  id: string; source: string; ref: string; name: string; line: string | null; model: string | null
  variant: string | null; image_url: string | null; dims: string
  finishes: { code: string; name: string; url: string }[]
}

const dims = (r: any) => [
  r.altura_cm && `A ${Number(r.altura_cm)}`, r.largura_cm && `L ${Number(r.largura_cm)}`,
  r.profundidade_cm && `P ${Number(r.profundidade_cm)}`, r.diametro_cm && `Ø ${Number(r.diametro_cm)}`,
].filter(Boolean).join(' × ') + (r.altura_cm || r.largura_cm || r.profundidade_cm || r.diametro_cm ? ' cm' : '')

// Busca no catálogo dos fornecedores: cada palavra tem que aparecer no nome, ref, modelo, linha ou variação.
export async function searchCatalog(query: string, source?: string | null): Promise<{ hits: CatalogHit[] } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return auth
  const terms = normText(query).split(/[\s,()%*]+/).filter(t => t.length >= 2).slice(0, 6)
  if (!terms.length && !source) return { hits: [] }
  let q = createAdminClient().from('supplier_catalog_products')
    .select('id, source, ref, name, line, model, variant, image_url, finishes, altura_cm, largura_cm, profundidade_cm, diametro_cm')
  if (source) q = q.eq('source', source)
  for (const t of terms) {
    // o catálogo tem acento e a busca vem sem: cada vogal vira '_' (qualquer letra), 'luminaria' acha 'Luminária'
    const p = `%${t.replace(/[aeiou]/g, '_')}%`
    q = q.or(`name.ilike.${p},ref.ilike.${p},model.ilike.${p},line.ilike.${p},variant.ilike.${p}`)
  }
  const { data, error } = await q.order('name').limit(80)
  if (error) return { error: error.message }
  const hits = (data ?? []).map((r: any) => ({
    id: r.id, source: r.source, ref: r.ref, name: r.name, line: r.line, model: r.model, variant: r.variant,
    image_url: r.image_url, dims: dims(r), finishes: Array.isArray(r.finishes) ? r.finishes : [],
  }))
  // com foto primeiro
  hits.sort((a, b) => Number(!a.image_url) - Number(!b.image_url))
  return { hits }
}
