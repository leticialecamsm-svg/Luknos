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

type Line = { machine: string; brand: string; form: string; share: string }

function LineRow({ line, rates, onChange, onRemove, single }: { line: Line; rates: MachineRate[]; onChange: (l: Line) => void; onRemove: () => void; single: boolean }) {
  const brands = Array.from(new Set(rates.filter(r => r.machine === line.machine).map(r => r.brand)))
  const brand = brands.includes(line.brand) ? line.brand : brands[0]
  const forms = [{ key: 'pix', label: 'PIX / Dinheiro' }, ...rates.filter(r => r.machine === line.machine && r.brand === brand).map(r => ({
    key: `${r.kind}-${r.installments}`,
    label: r.kind === 'debit' ? 'Débito' : r.installments === 1 ? 'Crédito à vista' : `Crédito ${r.installments}x`,
  }))]
  const form = forms.some(f => f.key === line.form) ? line.form : forms[0].key
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <select className="select col-span-3" value={line.machine} onChange={e => onChange({ ...line, machine: e.target.value })}>
        {Object.entries(MACHINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select className="select col-span-3" value={brand} onChange={e => onChange({ ...line, brand: e.target.value })}>
        {brands.map(b => <option key={b} value={b}>{BRANDS[b] ?? b}</option>)}
      </select>
      <select className="select col-span-3" value={form} onChange={e => onChange({ ...line, brand, form: e.target.value })}>
        {forms.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <div className="col-span-2 flex items-center gap-1">
        <input className="input w-full" value={line.share} onChange={e => onChange({ ...line, share: e.target.value })} inputMode="decimal" disabled={single} />
        <span className="text-xs text-gray-400">%</span>
      </div>
      {!single ? <button onClick={onRemove} className="col-span-1 text-gray-400 hover:text-red-500 text-sm">✕</button> : <span className="col-span-1" />}
    </div>
  )
}

function splitKey(kind: string, n: number) {
  if (kind === 'pix') return 'pix'
  if (kind === 'debit') return 'debit'
  return `credit_${Math.min(n, 12)}x`
}

export function NegotiationSimulator({ baseValue, canApply, onApply }: { baseValue: number | null; canApply?: boolean; onApply?: (v: { finalValue: number; splits: any[] }) => void }) {
  const [boot, setBoot] = useState<{ isAdmin: boolean; rates: MachineRate[] } | null>(null)
  const [mode, setMode] = useState<'pct' | 'value'>('pct')
  const [discInput, setDiscInput] = useState('10')
  const [spec, setSpec] = useState('10')
  const [seller, setSeller] = useState(true)
  const [lines, setLines] = useState<Line[]>([{ machine: 'powerpay', brand: 'visa_master', form: 'credit-2', share: '100' }])
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

  useEffect(() => {
    if (!boot || !base) return
    const payload = lines.map(l => {
      const [kind, n] = l.form === 'pix' ? ['pix', '1'] : l.form.split('-')
      return { machine: l.machine, brand: l.brand, kind: kind as any, installments: Number(n), sharePct: parseFloat(l.share.replace(',', '.')) || 0 }
    })
    const t = setTimeout(async () => {
      const [a, b] = await Promise.all([
        simulateScenario({ baseValue: base, discountPct, specifierPct, includeSeller: seller, lines: payload }),
        simulateMatrix({ baseValue: base, discountPct, specifierPct, includeSeller: seller }),
      ])
      setRes(a); setMatrix(b)
    }, 250)
    return () => clearTimeout(t)
  }, [boot, base, discountPct, specifierPct, seller, lines])

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
        {isAdmin && (
          <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600 mt-5">
            <input type="checkbox" checked={seller} onChange={e => setSeller(e.target.checked)} />
            Incluir 2,5% do vendedor <span className="text-gray-400">(desmarque se a venda foi sua ou do João)</span>
          </label>
        )}
      </div>

      {/* Formas de pagamento (misto) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-gray-500">Forma de pagamento (Máquina · Bandeira · Forma · % do valor)</p>
          <button onClick={() => setLines(ls => [...ls, { ...ls[ls.length - 1], form: 'pix', share: '0' }])} className="text-[11px] text-brand-600 hover:underline">+ dividir pagamento</button>
        </div>
        {lines.map((l, i) => (
          <LineRow key={i} line={l} rates={boot.rates} single={lines.length === 1}
            onChange={nl => setLines(ls => ls.map((x, k) => k === i ? nl : x))}
            onRemove={() => setLines(ls => ls.filter((_, k) => k !== i))} />
        ))}
        {lines.length > 1 && (() => {
          const tot = lines.reduce((a, l) => a + (parseFloat(l.share.replace(',', '.')) || 0), 0)
          return Math.abs(tot - 100) > 0.01 ? <p className="text-[11px] text-amber-600">As porcentagens somam {tot.toFixed(1)}% — devem somar 100%.</p> : null
        })()}
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
          {canApply && onApply && res.ok && (() => {
            const tot = lines.reduce((a, l) => a + (parseFloat(l.share.replace(',', '.')) || 0), 0)
            return Math.abs(tot - 100) < 0.01 ? (
              <button className="btn-primary text-xs py-1.5 mt-3" onClick={() => {
                const fv = Math.round(res.finalValue * 100) / 100
                let rest = fv
                const splits = lines.map((l, i) => {
                  const [kind, n] = l.form === 'pix' ? ['pix', '1'] : l.form.split('-')
                  const amt = i === lines.length - 1 ? Math.round(rest * 100) / 100 : Math.round(fv * (parseFloat(l.share.replace(',', '.')) || 0)) / 100
                  rest -= amt
                  return { method_key: splitKey(kind, Number(n)), amount: amt, status: 'paid', date: new Date().toISOString().slice(0, 10) }
                })
                onApply({ finalValue: fv, splits })
              }}>Usar na venda</button>
            ) : null
          })()}
        </div>
      )}

      {/* Matriz */}
      {matrix && !matrix.error && (
        <div className="overflow-x-auto">
          <p className="text-[11px] text-gray-500 mb-1">Taxa da parcela (em destaque) e desconto máximo mantendo a meta · verde = o desconto atual ({pct(discountPct)}) cabe</p>
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
                      <td key={g.machine + g.brand} className={cn('py-1.5 px-2 text-right', c.ok ? 'bg-green-50/60' : 'bg-red-50/60')}
                        title={c.profitPct != null ? `Lucro ${pct(c.profitPct)}` : undefined}>
                        <span className="font-semibold text-gray-800">{pct(c.fee)}</span>
                        <span className={cn('block text-[10px]', c.ok ? 'text-green-700' : 'text-red-600')}>até {pct(c.maxDiscountPct)}</span>
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
