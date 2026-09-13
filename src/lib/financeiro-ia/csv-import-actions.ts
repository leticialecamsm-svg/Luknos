'use server'

// Server action da importação de CSV de boletos do Master Lojista
// (Fase 3, item 11). Ver docs/FUNCTIONS.md do pacote: import-master-lojista-csv.
// Diferente da Fase 2, aqui inserimos direto em `transactions` (em vez de
// passar pela RPC create_transaction_with_installments) porque precisamos
// gravar `import_hash` — o índice único idx_transactions_import_hash é a
// regra anti-duplicação: reimportar o mesmo arquivo não duplica lançamentos.
// O trigger set_transaction_completeness já cuida de completude/aprovação
// nesse insert direto, igual cuidaria via RPC.

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const PATHS = ['/financeiro-ia/contas-a-pagar', '/financeiro-ia/importar-csv']

export type CsvBoletoRow = {
  descricao: string
  documento?: string
  fornecedor?: string
  valor: number
  vencimento: string // yyyy-mm-dd
  categoria?: string
}

export type CsvImportSummary = {
  csv_import_id: string
  rows_total: number
  rows_imported: number
  rows_skipped_duplicate: number
  incomplete_rows: number
  errors: string[]
}

export type CsvImportLog = {
  id: string
  file_name: string
  rows_total: number
  rows_imported: number
  rows_skipped_duplicate: number
  created_at: string
}

function computeImportHash(row: CsvBoletoRow): string {
  const raw = `${row.documento ?? ''}|${row.vencimento}|${row.valor.toFixed(2)}|${row.descricao.trim().toLowerCase()}`
  return createHash('sha256').update(raw).digest('hex')
}

export async function listCsvImports(): Promise<CsvImportLog[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('csv_imports')
    .select('id, file_name, rows_total, rows_imported, rows_skipped_duplicate, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}

export async function importBoletosCsv(
  fileName: string,
  rows: CsvBoletoRow[],
  defaultCostCenterId: string | null
): Promise<CsvImportSummary | { error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const errors: string[] = []
  const validRows: (CsvBoletoRow & { hash: string })[] = []

  rows.forEach((row, idx) => {
    const line = idx + 2 // +1 header, +1 1-indexed
    if (!row.descricao?.trim()) return errors.push(`Linha ${line}: descrição vazia`)
    if (!row.valor || row.valor <= 0) return errors.push(`Linha ${line}: valor inválido`)
    if (!row.vencimento || Number.isNaN(new Date(row.vencimento).getTime())) return errors.push(`Linha ${line}: vencimento inválido`)
    validRows.push({ ...row, hash: computeImportHash(row) })
  })

  const hashes = validRows.map(r => r.hash)
  const { data: existing } = hashes.length
    ? await supabase.from('transactions').select('import_hash').in('import_hash', hashes)
    : { data: [] as { import_hash: string }[] }
  const existingHashes = new Set((existing ?? []).map(e => e.import_hash))

  let imported = 0
  let skippedDuplicate = 0
  let incomplete = 0

  for (const row of validRows) {
    if (existingHashes.has(row.hash)) {
      skippedDuplicate++
      continue
    }

    let supplierId: string | null = null
    if (row.documento?.trim()) {
      const { data: existingSupplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('document', row.documento.trim())
        .maybeSingle()
      if (existingSupplier) {
        supplierId = existingSupplier.id
      } else {
        const { data: newSupplier, error: supplierError } = await supabase
          .from('suppliers')
          .insert({ name: row.fornecedor?.trim() || row.documento.trim(), document: row.documento.trim() })
          .select('id')
          .single()
        if (supplierError) {
          errors.push(`Fornecedor "${row.documento}": ${supplierError.message}`)
        } else {
          supplierId = newSupplier.id
        }
      }
    }

    let categoryId: string | null = null
    if (row.categoria?.trim()) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', row.categoria.trim())
        .eq('kind', 'despesa')
        .maybeSingle()
      categoryId = cat?.id ?? null
    }

    const { error: insertError } = await supabase.from('transactions').insert({
      direction: 'a_pagar',
      description: row.descricao.trim(),
      amount: row.valor,
      category_id: categoryId,
      supplier_id: supplierId,
      cost_center_id: defaultCostCenterId,
      due_date: row.vencimento,
      import_hash: row.hash,
      created_by: user?.id ?? null,
    })

    if (insertError) {
      errors.push(`"${row.descricao}": ${insertError.message}`)
      continue
    }

    imported++
    if (!(categoryId && defaultCostCenterId)) incomplete++
    existingHashes.add(row.hash)
  }

  const { data: logRow, error: logError } = await supabase
    .from('csv_imports')
    .insert({
      file_name: fileName,
      storage_path: `csv-imports/${fileName}`,
      rows_total: rows.length,
      rows_imported: imported,
      rows_skipped_duplicate: skippedDuplicate,
      imported_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (logError) return { error: logError.message }

  PATHS.forEach(p => revalidatePath(p))

  return {
    csv_import_id: logRow.id,
    rows_total: rows.length,
    rows_imported: imported,
    rows_skipped_duplicate: skippedDuplicate,
    incomplete_rows: incomplete,
    errors,
  }
}
