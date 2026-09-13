import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { getMonthlySummary } from '@/lib/financeiro-ia/panels-actions'

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function Page() {
  await requireFinanceiroProfile()
  const summary = await getMonthlySummary()
  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Visão mensal</h1>
      <p className="text-gray-500 mb-6 capitalize">{monthLabel}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Total a pagar" value={money(summary.total_payable)} tone="text-red-600" />
        <Card label="Total a receber" value={money(summary.total_receivable)} tone="text-green-600" />
        <Card
          label="Preciso vender"
          value={money(summary.needed_sales_to_break_even)}
          tone={summary.needed_sales_to_break_even > 0 ? 'text-amber-600' : 'text-green-600'}
        />
        <Card
          label="Resultado projetado"
          value={money(summary.projected_result)}
          tone={summary.projected_result >= 0 ? 'text-green-600' : 'text-red-600'}
        />
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Considera apenas lançamentos completos (com categoria, centro de custo e conta bancária) com vencimento neste mês.
      </p>
    </div>
  )
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-white border border-surface-border rounded-card shadow-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{label}</div>
      <div className={`text-xl font-bold ${tone || 'text-gray-900'}`}>{value}</div>
    </div>
  )
}
