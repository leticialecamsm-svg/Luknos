'use client'

// Simulador de viabilidade: desconto × comissão do especificador × máquina/bandeira/parcelas.
// Toda a conta roda no servidor (src/lib/negotiation-sim.ts); vendedor só vê "dá / não dá".
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { getSimulatorBootstrap, simulateScenario, simulateMatrix, type MachineRate } from '@/lib/negotiation-sim'

const MACHINES: Record<string, string> = { powerpay: 'PowerPay', cielo: 'Cielo' }
const BRANDS: Record<string, string> = { visa_master: 'Visa / Master', elo: 'Elo', elo_amex: 'Elo / Amex / outras' }
const pct = (n: number) => `${n.toFixed(2).replace('.', ',')}%`

export function NegotiationSimulator({ baseValue }: { baseValue: number | null }) {
  const [boot, setBoot] = useState<{ isAdmin: boolean; rates: MachineRate[] } | null>(null)
  const [mode, setMode] = useState<'pct' | 'value'>('pct')
  const [discInput, setDiscInput] = useState('10')
  const [spec, setSpec] = useState('10')
  const [seller, setSeller] = useState(true)
  const [machine, setMachine] = useState('powerpay')
  const [brand, setBrand] = useState('visa_master')
  const [form, setForm] = useState('credit-2')   // pix | debit-1 | credit-N
  const [res, setRes] = useState<any>(null)
  const [matrix, setMatrix] = useState<any>(null)

  useEffect(() => {
    getSimulatorBootstrap().then(r => { if (!('error' in r)) setBoot(r as any) })
  }, [])

  const base = baseValue ?? 0
  const discountPct = useMemo(() => {
    const v = parseFloat(discInput.replace(',', '.')) || 0
    if (mode === 'pct') return v
    return base > 0 ? Math.max(0, (1 - v / base) * 100) : 0
  }, [discInput, mode, base])
  const specifierPct = parseFloat(spec.replace(',', '.')) || 0

  // marcas disponíveis por máquina; forma disponível por máquina+marca
  const brands = useMemo(() => Array.from(new Set((boot?.rates ?? []).filter(r => r.machine === machine).map(r => r.brand))), [boot, machine])
  const forms = useMemo(() => {
    const rs = (boot?.rates ?? []).filter(r => r.machine === machine && r.brand === brand)
    return [{ key: 'pix', label: 'PIX / Dinheiro' }, ...rs.map(r => ({
      key: `${r.kind}-${r.installments}`,
      label: r.kind === 'debit' ? 'Débito' : r.installments === 1 ? 'Crédito à vista' : `Crédito ${r.installments}x`,
    }))]
  }, [boot, machine, brand])

  useEffect(() => { if (brands.length && !brands.includes(brand)) setBrand(brands[0]) }, [brands, brand])
  useEffect(() => { if (forms.length && !forms.some(f => f.key === form)) setForm(forms[0].key) }, [forms, form])

  useEffect(() => {
    if (!boot || !base) return
    const [kind, n] = form === 'pix' ? ['pix', '1'] : form.split('-')
    const t = setTimeout(async () => {
      const [a, b] = await Promise.all([
        simulateScenario({ baseValue: base, discountPct, specifierPct, includeSeller: seller, fee: { machine, brand, kind: kind as any, installments: Number(n) } }),
        simulateMatrix({ baseValue: base, discountPct, specifierPct, includeSeller: seller }),
      ])
      setRes(a); setMatrix(b)
    }, 250)
    return () => clearTimeout(t)
  }, [boot, base, discountPct, specifierPct, seller, machine, brand, form])

  if (!base) return <p className="text-xs text-gray-400 italic">Defina o valor orçado para simular.</p>
  if (!boot) return <p className="text-xs text-gray-400">Carregando…</p>
  const isAdmin = boot.isAdmin
  const admin = res?.admin

  const groups: { machine: string; brand: string }[] = []
  matrix?.rows?.forEach((r: any) => { if (!groups.some(g => g.machine === r.machine && g.brand === r.brand)) groups.push({ machine: r.machine, brand: r.brand }) })
  const formKeys: { key: string; label: string }[] = []
  const seen = new Set<string>()
  matrix?.rows?.forEach((r: any) => {
    const key = `${r.kind}-${r.installments}`
    if (!seen.has(key)) { seen.add(key); formKeys.push({ key, label: r.kind === 'debit' ? 'Débito' : r.installments === 1 ? 'Crédito à vista' : `Crédito ${r.installments}x` }) }
  })
  formKeys.sort((a, b) => {
    const k = (x: string) => x.startsWith('debit') ? 0 : Number(x.split('-')[1])
    return k(a.key) - k(b.key)
  })

  return (
    <div className="space-y-4">
      {/* Entradas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-gray-500">Desconto</label>
            <button onClick={() => { setMode(m => m === 'pct' ? 'value' : 'pct'); setDiscInput(mode === 'pct' ? (base * (1 - discountPct / 100)).toFixed(2) : discountPct.toFixed(2)) }}
              className="text-[10px] text-brand-600 hover:underline">{mode === 'pct' ? 'usar valor final' : 'usar %'}</button>
          </div>
          <input className="input w-full" value={discInput} onChange={e => setDiscInput(e.target.value)} inputMode="decimal"
            placeholder={mode === 'pct' ? '%' : 'R$ valor final'} />
          <p className="text-[10px] text-gray-400 mt-0.5">{mode === 'pct' ? `Valor final ${formatCurrency(base * (1 - discountPct / 100))}` : `Equivale a ${pct(discountPct)}`}</p>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Comissão especificador (%)</label>
          <input className="input w-full" value={spec} onChange={e => setSpec(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Máquina</label>
          <select className="select w-full" value={machine} onChange={e => setMachine(e.target.value)}>
            {Object.entries(MACHINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Bandeira</label>
          <select className="select w-full" value={brand} onChange={e => setBrand(e.target.value)}>
            {brands.map(b => <option key={b} value={b}>{BRANDS[b] ?? b}</option>)}
          </select>
        </div>
        <div className="col-span-2 md:col-span-2">
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Forma de pagamento</label>
          <select className="select w-full" value={form} onChange={e => setForm(e.target.value)}>
            {forms.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        {isAdmin && (
          <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600 mt-5">
            <input type="checkbox" checked={seller} onChange={e => setSeller(e.target.checked)} />
            Incluir 2,5% do vendedor <span className="text-gray-400">(desmarque se a venda foi sua ou do João)</span>
          </label>
        )}
      </div>

      {/* Resultado */}
      {res && !res.error && (
        <div className={cn('rounded-xl border p-3', res.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
          <div className="flex items-center gap-2">
            {res.ok ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
            <p className={cn('text-sm font-semibold', res.ok ? 'text-green-800' : 'text-red-800')}>
              {res.ok ? 'Dá para fazer' : 'Não fecha a meta'} · {formatCurrency(res.finalValue)}
            </p>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Desconto máximo nessa forma: <strong>{pct(res.maxDiscountPct)}</strong> · preço mínimo <strong>{formatCurrency(res.minPrice)}</strong>
          </p>
          {admin && (
            <div className="mt-2 text-xs text-gray-700 space-y-0.5 border-t border-black/5 pt-2">
              <p>Máquina {pct(admin.feePct)} ({formatCurrency(admin.fee)}) · comissão {pct(admin.commPct)} ({formatCurrency(admin.commV)}) · imposto ({formatCurrency(admin.tax)})</p>
              <p>Custo {formatCurrency(admin.cost)} · <strong>Lucro {pct(admin.profitPct)} ({formatCurrency(admin.profitValue)})</strong> — meta {admin.targetPct}%</p>
            </div>
          )}
        </div>
      )}

      {/* Matriz */}
      {matrix && !matrix.error && (
        <div className="overflow-x-auto">
          <p className="text-[11px] text-gray-500 mb-1">Desconto máximo mantendo a meta · verde = o desconto atual ({pct(discountPct)}) cabe</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="py-1.5 pr-3 text-left font-semibold text-gray-500">Forma</th>
                {groups.map(g => <th key={g.machine + g.brand} className="py-1.5 px-2 text-right font-semibold text-gray-500">{MACHINES[g.machine]}<br /><span className="font-normal">{BRANDS[g.brand]}</span></th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-surface-border">
                <td className="py-1.5 pr-3 font-medium text-gray-800">PIX / Dinheiro</td>
                <td colSpan={groups.length} className={cn('py-1.5 px-2 text-right font-semibold', matrix.pix.ok ? 'text-green-700' : 'text-red-600')}>
                  {pct(matrix.pix.maxDiscountPct)}
                </td>
              </tr>
              {formKeys.map(f => (
                <tr key={f.key} className="border-b border-surface-border last:border-0">
                  <td className="py-1.5 pr-3 font-medium text-gray-800">{f.label}</td>
                  {groups.map(g => {
                    const c = matrix.rows.find((r: any) => r.machine === g.machine && r.brand === g.brand && `${r.kind}-${r.installments}` === f.key)
                    if (!c) return <td key={g.machine + g.brand} className="py-1.5 px-2 text-right text-gray-300">—</td>
                    return (
                      <td key={g.machine + g.brand} className={cn('py-1.5 px-2 text-right font-semibold', c.ok ? 'text-green-700 bg-green-50/60' : 'text-red-600 bg-red-50/60')}
                        title={`Taxa ${pct(c.fee)}${c.profitPct != null ? ` · lucro ${pct(c.profitPct)}` : ''}`}>
                        {pct(c.maxDiscountPct)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
