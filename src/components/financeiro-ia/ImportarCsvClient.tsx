'use client'

import { useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileText, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { CostCenter } from '@/lib/financeiro-ia/actions'
import { importBoletosCsv, type CsvBoletoRow, type CsvImportSummary, type CsvImportLog } from '@/lib/financeiro-ia/csv-import-actions'

const inputCls = 'w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300'
const dateFmt = (v: string) => new Date(v).toLocaleDateString('pt-BR')
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function normalizeDateBR(raw: string): string {
  const v = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return v
}

function excelDateToISO(serial: number): string {
  // Excel conta dias a partir de 1899-12-30 (compensando o bug do ano bissexto de 1900)
  const utcDays = Math.floor(serial - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  return date.toISOString().slice(0, 10)
}

function normalizeAmount(raw: string | number): number {
  if (typeof raw === 'number') return raw
  const v = raw.trim().replace(/[R$\s]/g, '')
  if (v.includes(',') && v.includes('.')) return Number(v.replace(/\./g, '').replace(',', '.'))
  if (v.includes(',')) return Number(v.replace(',', '.'))
  return Number(v)
}

type SheetRow = Record<string, string | number | undefined>

// O Master Lojista exporta TODAS as contas cadastradas (aluguel, internet,
// prolabore, energia...), não só boletos de fornecedor. Só entram no
// financeiro as linhas que têm CPF/CNPJ preenchido (ou seja, são de fato
// um fornecedor com nota fiscal) e que ainda estão "Em aberto" — o resto
// (contas fixas sem fornecedor) já é lançado manualmente em Contas a pagar.
function findKey(headers: string[], ...needles: string[]): string | undefined {
  return headers.find(h => needles.some(n => h.toLowerCase().includes(n)))
}

function toBoletoRows(sheetRows: SheetRow[]): { rows: CsvBoletoRow[]; skippedNonSupplier: number } {
  if (sheetRows.length === 0) return { rows: [], skippedNonSupplier: 0 }
  const headers = Object.keys(sheetRows[0])
  const kPagarPara = findKey(headers, 'pagar para', 'fornecedor')
  const kDoc = findKey(headers, 'cpf/cnpj', 'cnpj', 'document')
  const kValor = findKey(headers, 'valor') && headers.filter(h => h.toLowerCase().includes('valor'))[0]
  const kVenc = findKey(headers, 'vencimento')
  const kSituacao = findKey(headers, 'situa')
  const kNotaFiscal = findKey(headers, 'nota fiscal')
  const kNFatura = findKey(headers, 'n° fatura', 'n fatura', 'fatura')
  const kDescricao = findKey(headers, 'descri')
  const kCategoria = findKey(headers, 'categoria')

  // Formato "Master Lojista" reconhecido: tem coluna de CPF/CNPJ e "pagar para"
  const isMasterLojista = !!kDoc && !!kPagarPara

  let skippedNonSupplier = 0
  const rows: CsvBoletoRow[] = []

  for (const r of sheetRows) {
    const rawVenc = kVenc ? r[kVenc] : undefined
    if (rawVenc === undefined || rawVenc === '') continue // linha de rodapé/total sem vencimento

    if (isMasterLojista) {
      const doc = kDoc ? String(r[kDoc] ?? '').trim() : ''
      const situacao = kSituacao ? String(r[kSituacao] ?? '').trim().toLowerCase() : ''
      if (!doc) { skippedNonSupplier++; continue }
      if (kSituacao && situacao && situacao !== 'em aberto') { skippedNonSupplier++; continue }

      const pagarPara = String(r[kPagarPara!] ?? '').trim()
      const nf = kNotaFiscal ? String(r[kNotaFiscal] ?? '').replace(/\.0$/, '').trim() : ''
      const nFatura = kNFatura ? String(r[kNFatura] ?? '').trim() : ''
      const vencimento = typeof rawVenc === 'number' ? excelDateToISO(rawVenc) : normalizeDateBR(String(rawVenc))
      const valorRaw = kValor ? r[kValor] : undefined

      rows.push({
        descricao: nf ? `NF ${nf} — ${pagarPara}` : (nFatura ? `Fatura ${nFatura} — ${pagarPara}` : pagarPara),
        documento: doc,
        fornecedor: pagarPara,
        valor: valorRaw !== undefined ? normalizeAmount(valorRaw) : NaN,
        vencimento,
        categoria: kCategoria ? String(r[kCategoria] ?? '').trim() || undefined : undefined,
      })
      continue
    }

    // Formato simples/genérico: descricao, documento, fornecedor, valor, vencimento, categoria
    const valorRaw = kValor ? r[kValor] : undefined
    rows.push({
      descricao: kDescricao ? String(r[kDescricao] ?? '').trim() : '',
      documento: kDoc ? String(r[kDoc] ?? '').trim() || undefined : undefined,
      fornecedor: kPagarPara ? String(r[kPagarPara] ?? '').trim() || undefined : undefined,
      valor: valorRaw !== undefined ? normalizeAmount(valorRaw) : NaN,
      vencimento: typeof rawVenc === 'number' ? excelDateToISO(rawVenc) : normalizeDateBR(String(rawVenc)),
      categoria: kCategoria ? String(r[kCategoria] ?? '').trim() || undefined : undefined,
    })
  }

  return { rows, skippedNonSupplier }
}

function parseCsvText(text: string): SheetRow[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0)
  if (lines.length === 0) return []
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
  return lines.slice(1).map(parseLine).map(cols => {
    const row: SheetRow = {}
    headers.forEach((h, i) => { row[h] = cols[i] })
    return row
  })
}

export function ImportarCsvClient({ costCenters, initialImports }: { costCenters: CostCenter[]; initialImports: CsvImportLog[] }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<CsvBoletoRow[]>([])
  const [skippedNonSupplier, setSkippedNonSupplier] = useState(0)
  const [costCenterId, setCostCenterId] = useState('')
  const [summary, setSummary] = useState<CsvImportSummary | null>(null)
  const [imports, setImports] = useState(initialImports)

  const onFile = (file: File) => {
    setSummary(null)
    setFileName(file.name)
    const isCsv = /\.csv$/i.test(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      if (isCsv) {
        const text = String(reader.result ?? '')
        const { rows: parsed, skippedNonSupplier: skipped } = toBoletoRows(parseCsvText(text))
        setRows(parsed)
        setSkippedNonSupplier(skipped)
      } else {
        const buf = reader.result as ArrayBuffer
        const workbook = XLSX.read(buf, { type: 'array', cellDates: false })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const sheetRows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' })
        const { rows: parsed, skippedNonSupplier: skipped } = toBoletoRows(sheetRows)
        setRows(parsed)
        setSkippedNonSupplier(skipped)
      }
    }
    if (isCsv) reader.readAsText(file, 'utf-8')
    else reader.readAsArrayBuffer(file)
  }

  const doImport = () => {
    if (!fileName || rows.length === 0) return toast.error('Nenhum boleto de fornecedor encontrado no arquivo')
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
      setSkippedNonSupplier(0)
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Importar CSV do Master Lojista</h1>
      <p className="text-gray-500 mb-6">
        Aceita a planilha exportada pelo Master Lojista (.xls) ou um CSV simples. Só entram os <strong>boletos com fornecedor</strong> (linhas com CPF/CNPJ) que ainda estão em aberto — contas sem fornecedor (aluguel, internet, prolabore etc.) são ignoradas automaticamente, pois já são lançadas manualmente. Boletos já importados (mesmo fornecedor + vencimento + valor) não são duplicados.
      </p>

      <div className="bg-white border border-surface-border rounded-card shadow-card p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Arquivo (.xls, .xlsx ou .csv)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

        {fileName && (
          <p className="text-sm text-gray-600 mb-2">
            {rows.length} boleto(s) de fornecedor encontrado(s)
            {skippedNonSupplier > 0 && <> · {skippedNonSupplier} linha(s) ignorada(s) por não ter fornecedor/CNPJ (conta fixa, já lançada manualmente)</>}
          </p>
        )}

        {rows.length > 0 && (
          <>
            <p className="text-xs text-gray-500 mb-2">Pré-visualização das primeiras 5:</p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-surface-secondary text-left text-xs font-semibold text-gray-500 uppercase">
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
          <div className="mt-4 p-4 bg-surface-secondary rounded-lg text-sm space-y-1">
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
      <div className="bg-white border border-surface-border rounded-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-secondary text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
