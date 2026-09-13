import type { CashflowDay } from '@/lib/financeiro-ia/panels-actions'

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFmt = (v: string) => new Date(v + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })

export function FluxoSemanalClient({ days }: { days: CashflowDay[] }) {
  const last = days[days.length - 1]
  const pendingApproval = days.reduce((s, d) => s + d.pending_approval, 0)
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Fluxo semanal</h1>
      <p className="text-gray-500 mb-6">
        Projeção dos próximos 7 dias.{' '}
        {last && (
          <>Saldo projetado no fim do período: <span className={`font-semibold ${last.closing_balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>{money(last.closing_balance)}</span></>
        )}
        {pendingApproval > 0 && (
          <> · <span className="text-purple-700">{money(pendingApproval)} aguardando aprovação (não entram nesta projeção)</span></>
        )}
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Dia</th>
              <th className="px-4 py-2.5">Saldo inicial</th>
              <th className="px-4 py-2.5">Entradas previstas</th>
              <th className="px-4 py-2.5">Saídas previstas</th>
              <th className="px-4 py-2.5">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            {days.map(d => (
              <tr key={d.date} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 text-gray-700 capitalize">{dateFmt(d.date)}</td>
                <td className="px-4 py-2.5 text-gray-700">{money(d.opening_balance)}</td>
                <td className="px-4 py-2.5 text-green-700">{d.expected_in > 0 ? `+${money(d.expected_in)}` : money(0)}</td>
                <td className="px-4 py-2.5 text-red-600">{d.expected_out > 0 ? `-${money(d.expected_out)}` : money(0)}</td>
                <td className={`px-4 py-2.5 font-semibold ${d.closing_balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{money(d.closing_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
