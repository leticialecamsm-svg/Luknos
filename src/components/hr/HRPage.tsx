'use client'

import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export function HRPage({ earnings, year, month }: {
  earnings: Record<string, any>
  year: number
  month: number
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(null)

  function navigateMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    router.push(`/hr?year=${y}&month=${m}`)
  }

  const rows = Object.values(earnings)
    .filter((r: any) => r.total > 0 || r.sellerSales > 0)
    .sort((a: any, b: any) => b.total - a.total)

  const totalComm = rows.reduce((s: number, r: any) => s + r.total, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RH — Comissões</h1>
          <p className="text-sm text-gray-500 mt-1">Valores a pagar por colaborador no mês selecionado</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700">
          <button onClick={() => navigateMonth(-1)} className="hover:text-gray-900 px-1">◀</button>
          <span className="w-36 text-center">{MONTH_NAMES[month - 1].toUpperCase()} {year}</span>
          <button onClick={() => navigateMonth(1)} className="hover:text-gray-900 px-1">▶</button>
        </div>
      </div>

      {/* Regras */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 space-y-0.5">
          <p><strong>Vendedor:</strong> 1% sobre o valor total das vendas fechadas no mês (dividido igualmente entre co-vendedores)</p>
          <p><strong>Projetista:</strong> % conforme taxa cadastrada (geralmente 5%) sobre o valor final de cada projeto em que foi responsável</p>
        </div>
      </div>

      {/* Total do mês */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Total a pagar no mês</p>
          <p className="text-3xl font-bold text-emerald-700 mt-0.5">{formatCurrency(totalComm)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">{rows.length} colaborador{rows.length !== 1 ? 'es' : ''} com comissão</p>
        </div>
      </div>

      {/* Tabela detalhada */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] border-b border-gray-100 bg-gray-50">
          <div className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Colaborador</div>
          <div className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Vendas no mês</div>
          <div className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Com. vendedor (1%)</div>
          <div className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Com. projetista</div>
          <div className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Total a pagar</div>
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            Nenhuma comissão registrada para {MONTH_NAMES[month - 1]} {year}
          </div>
        )}

        {rows.map((r: any) => {
          const isOpen = expanded === r.user.id
          const hasProjDetails = r.projetistaSales?.length > 0
          return (
            <div key={r.user.id} className="border-b border-gray-100 last:border-0">
              {/* Row principal */}
              <div
                className={cn(
                  'grid grid-cols-[1fr_auto_auto_auto_auto] items-center hover:bg-gray-50 transition-colors',
                  hasProjDetails && 'cursor-pointer'
                )}
                onClick={() => hasProjDetails && setExpanded(isOpen ? null : r.user.id)}
              >
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <Avatar user={r.user} size={32} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{r.user.name}</p>
                    <div className="flex gap-1.5 mt-0.5">
                      {r.sellerComm > 0 && (
                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Vendedor</span>
                      )}
                      {r.projetistaComm > 0 && (
                        <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Projetista</span>
                      )}
                    </div>
                  </div>
                  {hasProjDetails && (
                    <ChevronRight className={cn('w-4 h-4 text-gray-400 ml-auto transition-transform', isOpen && 'rotate-90')} />
                  )}
                </div>
                <div className="px-4 py-3.5 text-sm text-gray-700 text-right tabular-nums">
                  {r.sellerSales > 0 ? formatCurrency(r.sellerSales) : '—'}
                </div>
                <div className="px-4 py-3.5 text-sm text-gray-700 text-right tabular-nums">
                  {r.sellerComm > 0 ? formatCurrency(r.sellerComm) : '—'}
                </div>
                <div className="px-4 py-3.5 text-sm text-gray-700 text-right tabular-nums">
                  {r.projetistaComm > 0 ? formatCurrency(r.projetistaComm) : '—'}
                </div>
                <div className="px-4 py-3.5 text-sm font-bold text-emerald-700 text-right tabular-nums">
                  {formatCurrency(r.total)}
                </div>
              </div>

              {/* Detalhe dos projetos */}
              {isOpen && hasProjDetails && (
                <div className="bg-violet-50 border-t border-violet-100 px-4 py-3">
                  <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2">Projetos como responsável</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-violet-600 border-b border-violet-200">
                        <th className="text-left pb-2 font-semibold">Orçamento</th>
                        <th className="text-left pb-2 font-semibold">Cliente</th>
                        <th className="text-right pb-2 font-semibold">Valor venda</th>
                        <th className="text-right pb-2 font-semibold">Taxa</th>
                        <th className="text-right pb-2 font-semibold">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.projetistaSales.map((p: any, i: number) => (
                        <tr key={i} className="border-b border-violet-100 last:border-0">
                          <td className="py-2 font-mono text-violet-800">#{p.number}</td>
                          <td className="py-2 text-gray-700">{p.client_name}</td>
                          <td className="py-2 text-right tabular-nums text-gray-700">{formatCurrency(p.value)}</td>
                          <td className="py-2 text-right text-violet-600 font-semibold">{p.rate}%</td>
                          <td className="py-2 text-right tabular-nums font-bold text-violet-700">{formatCurrency(p.comm)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-violet-200 bg-violet-100/50">
                        <td colSpan={4} className="py-2 text-xs font-bold text-violet-700">Subtotal projetista</td>
                        <td className="py-2 text-right tabular-nums font-bold text-violet-700">{formatCurrency(r.projetistaComm)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}

        {/* Totais */}
        {rows.length > 0 && (
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] bg-gray-50 border-t-2 border-gray-200">
            <div className="px-4 py-3 text-sm font-bold text-gray-700">Total</div>
            <div className="px-4 py-3 text-sm font-bold text-gray-700 text-right tabular-nums">
              {formatCurrency(rows.reduce((s: number, r: any) => s + r.sellerSales, 0))}
            </div>
            <div className="px-4 py-3 text-sm font-bold text-gray-700 text-right tabular-nums">
              {formatCurrency(rows.reduce((s: number, r: any) => s + r.sellerComm, 0))}
            </div>
            <div className="px-4 py-3 text-sm font-bold text-gray-700 text-right tabular-nums">
              {formatCurrency(rows.reduce((s: number, r: any) => s + r.projetistaComm, 0))}
            </div>
            <div className="px-4 py-3 text-sm font-bold text-emerald-700 text-right tabular-nums">
              {formatCurrency(totalComm)}
            </div>
          </div>
        )}
      </div>

      {/* Aviso sobre a divisão */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700">
        <strong>⚠️ Importante sobre divisão de vendas:</strong> O valor de comissão de vendedor (1%) é calculado sobre{' '}
        <strong>o valor total atribuído a cada colaborador na view <code>sales_by_month</code></strong>.
        Se uma venda tem 2 co-vendedores e a view já divide o valor, a comissão está correta.
        Verifique no Supabase se a view <code>sales_by_month</code> divide o <code>final_value</code> pelo número de donos (<code>num_owners</code>).
      </div>
    </div>
  )
}
