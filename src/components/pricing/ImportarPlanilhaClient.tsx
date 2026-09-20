'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { importSupplierSheet, seedProductTypes } from '@/lib/pricing/actions'
import { parseSupplierSheet, type SheetImport } from '@/lib/pricing/parse-sheet'

type Parsed = SheetImport & { sheet: string; selected: boolean; done?: 'ok' | 'error'; message?: string }

const CHUNK = 8 // notas por chamada, pra não estourar o tempo da função

export function ImportarPlanilhaClient() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<Parsed[]>([])
  const [reading, setReading] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')

  const onFile = (file: File) => {
    setReading(true); setParsed([])
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result as ArrayBuffer, { type: 'array', cellDates: true })
        const out: Parsed[] = []
        for (const name of wb.SheetNames) {
          if (/antiga/i.test(name)) continue
          const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, defval: null, raw: true })
          const isSupplierSheet = rows[0]?.[1] === 'Nome do Produto' && rows[1]?.[0] === 'Região' && String(rows[0]?.[5] ?? '').startsWith('Valor do Fornecedor')
          if (!isSupplierSheet) continue
          const p = parseSupplierSheet(name, rows)
          if (p.report.items > 0) out.push({ ...p, sheet: name, selected: true })
        }
        setParsed(out)
        if (!out.length) toast.error('Nenhuma aba de fornecedor reconhecida nesse arquivo')
      } catch (e: any) {
        toast.error('Não consegui ler o arquivo', e?.message)
      } finally { setReading(false) }
    }
    reader.readAsArrayBuffer(file)
  }

  const run = async () => {
    setRunning(true)
    const allTypes = new Map<string, { ncm: string; name: string; count: number }>()
    let okSheets = 0
    for (const p of parsed.filter(x => x.selected)) {
      let failed: string | null = null
      for (let i = 0; i < p.invoices.length && !failed; i += CHUNK) {
        setProgress(`${p.supplier}: notas ${Math.min(i + CHUNK, p.invoices.length)}/${p.invoices.length}`)
        const res = await importSupplierSheet({
          supplier: p.supplier, region: p.region, defaultUf: p.defaultUf, invoices: p.invoices.slice(i, i + CHUNK),
        })
        if ('error' in res && res.error) failed = res.error
      }
      setParsed(prev => prev.map(x => x.sheet === p.sheet ? { ...x, done: failed ? 'error' : 'ok', message: failed ?? undefined } : x))
      if (!failed) {
        okSheets++
        for (const t of p.types) {
          const k = `${t.ncm}|${t.name}`
          const cur = allTypes.get(k)
          allTypes.set(k, { ...t, count: (cur?.count ?? 0) + t.count })
        }
      }
    }
    setProgress('Gravando tipos de produto…')
    const types = Array.from(allTypes.values()).filter(t => t.count >= 2)
    for (let i = 0; i < types.length; i += 200) await seedProductTypes(types.slice(i, i + 200))
    setProgress('')
    setRunning(false)
    toast.success('Importação concluída', `${okSheets} fornecedor(es) importado(s).`)
  }

  const selected = parsed.filter(p => p.selected)
  const totalItems = selected.reduce((s, p) => s + p.report.items, 0)
  const totalInvoices = selected.reduce((s, p) => s + p.invoices.length, 0)

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Importar planilha de precificação</h1>
      <p className="text-sm text-gray-500 mb-5 max-w-3xl">
        Envie o arquivo da planilha (.xlsx — no Google Sheets: Arquivo → Fazer download → Excel). Cada aba de fornecedor vira um fornecedor
        com suas notas (data, número e estado de origem) e itens. Reimportar atualiza as notas existentes em vez de duplicar.
        As abas “(ANTIGA)”, Markup, Preços e Cotação são ignoradas.
      </p>

      <div className="card p-5 mb-5">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="text-sm"
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} disabled={running} />
        {reading && <p className="text-sm text-gray-500 mt-3 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lendo planilha…</p>}
      </div>

      {parsed.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-secondary text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 w-10" />
                <th className="px-4 py-2.5">Fornecedor</th>
                <th className="px-4 py-2.5">Origem</th>
                <th className="px-4 py-2.5 text-right">Notas</th>
                <th className="px-4 py-2.5 text-right">Itens</th>
                <th className="px-4 py-2.5 text-right" title="Linhas em que o preço calculado difere do preço digitado na planilha">Divergentes</th>
                <th className="px-4 py-2.5 text-right" title="Itens sem ST/ANT — ficam sem perfil de imposto">Sem tipo</th>
                <th className="px-4 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map(p => (
                <tr key={p.sheet} className="border-t border-surface-border">
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={p.selected} disabled={running} className="accent-brand-500"
                      onChange={e => setParsed(prev => prev.map(x => x.sheet === p.sheet ? { ...x, selected: e.target.checked } : x))} />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{p.supplier}</td>
                  <td className="px-4 py-2.5 text-gray-500">{p.defaultUf ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.invoices.length}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.report.items}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${p.report.divergent ? 'text-amber-600' : 'text-gray-400'}`}>{p.report.divergent}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${p.report.withoutTipo ? 'text-amber-600' : 'text-gray-400'}`}>{p.report.withoutTipo}</td>
                  <td className="px-4 py-2.5">
                    {p.done === 'ok' && <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="w-4 h-4" /> Importado</span>}
                    {p.done === 'error' && <span className="flex items-center gap-1 text-red-600" title={p.message}><AlertTriangle className="w-4 h-4" /> Erro</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-4 px-4 py-3 border-t border-surface-border bg-surface-secondary">
            <button onClick={run} disabled={running || selected.length === 0}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar {selected.length} fornecedor(es) · {totalInvoices} notas · {totalItems} itens
            </button>
            {progress && <span className="text-xs text-gray-500">{progress}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
