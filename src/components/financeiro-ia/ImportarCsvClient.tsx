'use client'

import { useRef, useState, useTransition } from 'react'
import { Upload, FileText, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { CostCenter } from '@/lib/financeiro-ia/actions'
import { importBoletosCsv, type CsvBoletoRow, type CsvImportSummary, type CsvImportLog } from '@/lib/financeiro-ia/csv-import-actions'

const inputCls = 'w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300'
const dateFmt = (v: string) => new Date(v).toLocaleDateString('pt-BR')
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Parser CSV simples: separador vírgula ou ponto e vírgula, aspas duplas
// opcionais em qualquer campo. Suficiente para exportações tabulares comuns
// (Excel/Sheets/ERP) sem precisar de uma dependência externa.
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const parseLine = (line: string) => {
    const cells: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === sep && !inQuotes) { cells.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    cells.push(cur.trim())
    return cells
  }
  const headers = parseLine(lines[0]).map(h => h.toLowerCase())
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

function normalizeDate(raw: string): string {
  const v = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return v
}

function normalizeAmount(raw: string): number {
  const v = raw.trim().replace(/[R$\s]/g, '')
  if (v.includes(',') && v.includes('.')) return Number(v.replace(/\./g, '').replace(',', '.'))
  if (v.includes(',')) return Number(v.replace(',', '.'))
  return Number(v)
}

function toRows(headers: string[], raw: string[][]): CsvBoletoRow[] {
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const iDesc = idx('descric')
  const iDoc = idx('document') !== -1 ? idx('document') : idx('cnpj')
  const iForn = idx('fornecedor')
  const iValor = idx('valor')
  const iVenc = idx('vencimento')
  const iCat = idx('categoria')

  return raw.map(cols => ({
    descricao: iDesc !== -1 ? cols[iDesc] ?? '' : '',
    documento: iDoc !== -1 ? cols[iDoc] : undefined,
    fornecedor: iForn !== -1 ? cols[iForn] : undefined,
    valor: iValor !== -1 ? normalizeAmount(cols[iValor] ?? '') : NaN,
    vencimento: iVenc !== -1 ? normalizeDate(cols[iVenc] ?? '') : '',
    categoria: iCat !== -1 ? cols[iCat] : undefined,
  }))
}

export function ImportarCsvClient({ costCenters, initialImports }: { costCenters: CostCenter[]; initialImports: CsvImportLog[] }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<CsvBoletoRow[]>([])
  const [costCenterId, setCostCenterId] = useState('')
  const [summary, setSummary] = useState<CsvImportSummary | null>(null)
  const [imports, setImports] = useState(initialImports)

  const onFile = (file: File) => {
    setSummary(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const { headers, rows: raw } = parseCsv(text)
      setRows(toRows(headers, raw))
    }
    reader.readAsText(file, 'utf-8')
  }

  const doImport = () => {
    if (!fileName || rows.length === 0) return toast.error('Selecione um CSV com boletos')
    startTransition(async () => {
      const res = await importBoletosCsv(fileName, rows, costCenterId || null)
      if ('error' in res) return toast.error('Erro ao importar', res.error)
      setSummary(res)
      setImports([{
        id: res.csv_import_id, file_name: fileName, rows_total: res.rows_total,
        rows_imported: res.rows_imported, rows_skipped_duplicate: res.rows_skipped_duplicate,
        created_at: new Date().toISOString(),
      }, ...imports])
      toast.success('Importação concluída', `${res.rows_imported} lançamentos criados.`)
      setRows([])
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Importar CSV do Master Lojista</h1>
      <p className="text-gray-500 mb-6">
        Colunas esperadas: descrição, documento (CNPJ/CPF do fornecedor), fornecedor, valor, vencimento e categoria (opcional). Boletos já importados (mesmo documento + vencimento + valor + descrição) não são duplicados.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Arquivo CSV</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Centro de custo padrão (opcional)</label>
            <select className={inputCls} value={costCenterId} onChange={e => setCostCenterId(e.target.value)}>
              <option value="">—</option>
              {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {rows.length > 0 && (
          <>
            <p className="text-sm text-gray-600 mb-2">{rows.length} linha(s) lida(s) do arquivo. Pré-visualização das primeiras 5:</p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Fornecedor</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2">{r.descricao || <span className="text-red-500">vazio</span>}</td>
                      <td className="px-3 py-2">{r.documento || '—'}</td>
                      <td className="px-3 py-2">{r.fornecedor || '—'}</td>
                      <td className="px-3 py-2">{Number.isFinite(r.valor) ? money(r.valor) : <span className="text-red-500">inválido</span>}</td>
                      <td className="px-3 py-2">{r.vencimento || <span className="text-red-500">inválido</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={doImport} disabled={pending} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
              <Upload className="w-4 h-4" /> Importar {rows.length} lançamento(s)
            </button>
          </>
        )}

        {summary && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm space-y-1">
            <p className="flex items-center gap-2 text-green-700"><CheckCircle2 className="w-4 h-4" /> {summary.rows_imported} importados de {summary.rows_total}</p>
            {summary.rows_skipped_duplicate > 0 && <p className="text-gray-600">{summary.rows_skipped_duplicate} ignorados por já existirem (duplicados)</p>}
            {summary.incomplete_rows > 0 && <p className="text-amber-700">{summary.incomplete_rows} ficaram incompletos (sem categoria e/ou centro de custo) — classifique em Contas a pagar</p>}
            {summary.errors.length > 0 && (
              <div className="text-red-600">
                <p className="flex items-center gap-2 mt-2"><AlertTriangle className="w-4 h-4" /> {summary.errors.length} erro(s):</p>
                <ul className="list-disc list-inside">
                  {summary.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-3">Histórico de importações</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Arquivo</th>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Total</th>
              <th className="px-4 py-2.5">Importados</th>
              <th className="px-4 py-2.5">Duplicados</th>
            </tr>
          </thead>
          <tbody>
            {imports.length > 0 ? imports.map(i => (
              <tr key={i.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 text-gray-700 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" />{i.file_name}</td>
                <td className="px-4 py-2.5 text-gray-700">{dateFmt(i.created_at)}</td>
                <td className="px-4 py-2.5 text-gray-700">{i.rows_total}</td>
                <td className="px-4 py-2.5 text-green-700">{i.rows_imported}</td>
                <td className="px-4 py-2.5 text-gray-500">{i.rows_skipped_duplicate}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Nenhuma importação ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
