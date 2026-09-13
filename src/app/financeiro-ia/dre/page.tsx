import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { getDre, getCategoryBreakdown } from '@/lib/financeiro-ia/panels-actions'

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function Page() {
  await requireFinanceiroProfile()
  const end = new Date()
  const start = new Date()
  start.setDate(1)
  const startISO = start.toISOString().slice(0, 10)
  const endISO = end.toISOString().slice(0, 10)

  const [dre, breakdown] = await Promise.all([
    getDre(startISO, endISO),
    getCategoryBreakdown(startISO, endISO),
  ])

  const expenseCategories = breakdown.filter(b => b.kind === 'despesa' || b.kind === 'a_pagar')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">DRE simplificado</h1>
      <p className="text-gray-500 mb-6">
        {start.toLocaleDateString('pt-BR')} a {end.toLocaleDateString('pt-BR')} — considera apenas lançamentos completos.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card label="Receita" value={money(dre.revenue)} tone="text-green-600" />
        <Card label="Despesas" value={money(dre.total_expenses)} tone="text-red-600" />
        <Card label="Resultado" value={money(dre.result)} tone={dre.result >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Despesas por categoria</h2>
          <BreakdownList items={expenseCategories.map(c => ({ label: c.category_name, total: c.total, percentage: c.percentage }))} empty="Nenhuma despesa completa no período." />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Despesas por centro de custo</h2>
          <BreakdownList items={dre.expenses_by_cost_center.map(c => ({ label: c.cost_center_name, total: c.total }))} empty="Nenhuma despesa completa no período." />
        </div>
      </div>
    </div>
  )
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{label}</div>
      <div className={`text-xl font-bold ${tone || 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function BreakdownList({ items, empty }: { items: { label: string; total: number; percentage?: number }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-gray-400">{empty}</p>
  const max = Math.max(...items.map(i => i.total), 1)
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      {items.map(i => (
        <div key={i.label}>
          <div className="flex justify-between text-sm text-gray-700 mb-1">
            <span>{i.label}</span>
            <span className="font-medium">{money(i.total)}{i.percentage !== undefined ? ` (${i.percentage}%)` : ''}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-700 rounded-full" style={{ width: `${(i.total / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
