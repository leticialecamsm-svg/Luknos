'use server'

// Simulador de viabilidade da negociação. A composição de preço (custo, imposto,
// margem) NUNCA sai do servidor: o cliente só recebe o que o seu perfil pode ver.
// Premissas fixas (composição padrão do orçamento original):
//   maquineta 6,9% · imposto ST 3,45% · comissão 12,5% (10% especificador + 2,5% vendedor) · lucro 33%.
// O custo é implícito: cost% do preço original = 1 − maq − imposto − comissão − lucro.
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TARGET = 0.33
const BASE_MACHINE = 0.069
const TAX = 0.0345
const BASE_COMM = 0.125
const SELLER_COMM = 0.025
const COST_SHARE = 1 - BASE_MACHINE - TAX - BASE_COMM - TARGET

export type MachineRate = { machine: string; brand: string; kind: 'debit' | 'credit'; installments: number; fee_pct: number }

export type SimInput = {
  baseValue: number          // valor orçado (ponto de partida)
  discountPct: number        // desconto em %
  specifierPct: number       // comissão do especificador em %
  includeSeller?: boolean    // só admin pode desligar (venda feita por Letícia/João)
  // formas de pagamento (pagamento misto): sharePct = % do valor final naquela forma
  lines: { machine: string; brand: string; kind: 'debit' | 'credit' | 'pix'; installments: number; sharePct: number }[]
}

function profitOf(discount: number, feePct: number, commPct: number) {
  return 1 - COST_SHARE / (1 - discount) - feePct / 100 - TAX - commPct / 100
}
function maxDiscount(feePct: number, commPct: number) {
  const d = 1 - COST_SHARE / (1 - feePct / 100 - TAX - commPct / 100 - TARGET)
  return Math.max(0, d)
}

async function whoAmI() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role, extra_pages').eq('id', user.id).single()
  if (data?.role === 'admin') return { isAdmin: true }
  // Quem tem acesso completo a Cotação e Preços (ex.: Jennifer) também vê o percentual real.
  const { data: role } = await createAdminClient().from('roles').select('allowed_pages').eq('name', data?.role ?? '').maybeSingle()
  const pages: string[] = [...(role?.allowed_pages ?? []), ...((data?.extra_pages as string[] | null) ?? [])]
  return { isAdmin: pages.some(p => p === '/pricing') }
}

export async function getSimulatorBootstrap() {
  const me = await whoAmI()
  if (!me) return { error: 'Não autenticado' as const }
  const { data } = await createAdminClient()
    .from('payment_machine_rates').select('machine,brand,kind,installments,fee_pct')
    .order('machine').order('brand').order('kind').order('installments')
  return { isAdmin: me.isAdmin, rates: (data ?? []).map(r => ({ ...r, fee_pct: Number(r.fee_pct) })) as MachineRate[] }
}

export async function simulateScenario(input: SimInput) {
  const me = await whoAmI()
  if (!me) return { error: 'Não autenticado' as const }
  const base = Math.max(0, input.baseValue)
  const disc = Math.min(0.95, Math.max(0, input.discountPct / 100))
  const includeSeller = me.isAdmin ? input.includeSeller !== false : true
  const comm = Math.max(0, input.specifierPct) + (includeSeller ? SELLER_COMM * 100 : 0)

  const { data: all } = await createAdminClient().from('payment_machine_rates').select('machine,brand,kind,installments,fee_pct')
  const lines = input.lines?.length ? input.lines : [{ machine: '', brand: '', kind: 'pix' as const, installments: 1, sharePct: 100 }]
  const totalShare = lines.reduce((a, l) => a + l.sharePct, 0) || 100
  let feePct = 0
  for (const l of lines) {
    if (l.kind === 'pix') continue
    const r = (all ?? []).find(x => x.machine === l.machine && x.brand === l.brand && x.kind === l.kind && x.installments === l.installments)
    feePct += Number(r?.fee_pct ?? 0) * (l.sharePct / totalShare)
  }
  const profit = profitOf(disc, feePct, comm)
  const maxD = maxDiscount(feePct, comm)
  const finalValue = base * (1 - disc)
  const out = {
    finalValue,
    ok: profit >= TARGET - 0.0005,
    maxDiscountPct: maxD * 100,
    minPrice: base * (1 - maxD),
  }
  if (!me.isAdmin) return out
  const fee = finalValue * feePct / 100
  const commV = finalValue * comm / 100
  const tax = finalValue * TAX
  const cost = base * COST_SHARE
  return {
    ...out,
    admin: {
      profitPct: profit * 100, profitValue: finalValue * profit, feePct, fee, commPct: comm, commV, tax, cost,
      targetPct: TARGET * 100,
    },
  }
}

// Matriz: desconto máximo (mantendo 33%) para cada máquina × bandeira × forma.
export async function simulateMatrix(input: { baseValue: number; discountPct: number; specifierPct: number; includeSeller?: boolean }) {
  const me = await whoAmI()
  if (!me) return { error: 'Não autenticado' as const }
  const includeSeller = me.isAdmin ? input.includeSeller !== false : true
  const comm = Math.max(0, input.specifierPct) + (includeSeller ? SELLER_COMM * 100 : 0)
  const disc = Math.min(0.95, Math.max(0, input.discountPct / 100))
  const { data } = await createAdminClient().from('payment_machine_rates').select('machine,brand,kind,installments,fee_pct')
  const mk = (fee: number) => {
    const m = maxDiscount(fee, comm)
    return { fee, maxDiscountPct: m * 100, minPrice: input.baseValue * (1 - m), ok: profitOf(disc, fee, comm) >= TARGET - 0.0005,
      ...(me.isAdmin ? { profitPct: profitOf(disc, fee, comm) * 100 } : {}) }
  }
  return {
    pix: mk(0),
    rows: (data ?? []).map(r => ({ machine: r.machine, brand: r.brand, kind: r.kind as 'debit' | 'credit', installments: r.installments, ...mk(Number(r.fee_pct)) })),
  }
}
