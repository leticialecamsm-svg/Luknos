// Lê uma aba de fornecedor da planilha de precificação. Estrutura de cada aba:
//   linha 1: cabeçalho · linha 2: "Região | <fornecedor>" · linha 4: região/empresas
//   depois, blocos: [data] → ["Nota: 138751 (SC)"] → itens (col. A..U)
// Colunas: A qtd · B nome · C NCM · D valor total · E tipo ICMS · G IPI · K vlr ICMS
//          M vlr FECOEP · N custo · O maquineta · P imposto ANT/ST · Q comissão · R lucro · T venda

import { computeQuote } from './engine'
import type { ImportInvoice, ImportItem } from './actions'

type Cell = string | number | Date | null | undefined

const num = (v: Cell): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    return v.trim() && Number.isFinite(n) && !v.startsWith('#') ? n : null
  }
  return null
}

const isoDate = (d: Date) => {
  // a planilha guarda datas sem hora; evita o deslocamento de fuso ao virar ISO
  const t = new Date(d.getTime() + 12 * 3600 * 1000)
  return t.toISOString().slice(0, 10)
}

const NOTA_RE = /nota[:º°\s]*\s*([0-9][0-9.\-]*)\s*(?:\(([A-Za-z]{2})\))?/i

function normalizeTipo(v: Cell): string | null {
  const t = String(v ?? '').trim().toUpperCase()
  return t === 'ST' || t === 'ANT' ? t : null
}

function mode(values: number[], fallback: number): number {
  if (!values.length) return fallback
  const c = new Map<number, number>()
  for (const v of values) c.set(Math.round(v * 10000) / 10000, (c.get(Math.round(v * 10000) / 10000) ?? 0) + 1)
  return Array.from(c.entries()).sort((a, b) => b[1] - a[1])[0][0]
}

export type SheetImport = {
  supplier: string
  region: string | null
  defaultUf: string | null
  invoices: ImportInvoice[]
  types: { ncm: string; name: string; count: number }[]
  report: { items: number; skipped: number; divergent: number; withoutTipo: number }
}

export function typeName(desc: string): string | null {
  const first = desc.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[\s,\-/(]+/).find(w => w.length >= 3 && !/\d/.test(w))
  return first ? first.charAt(0) + first.slice(1).toLowerCase() : null
}

export function parseSupplierSheet(name: string, rows: Cell[][]): SheetImport {
  const supplier = String(rows[1]?.[1] ?? name).trim().toUpperCase() || name.toUpperCase()
  const region = [rows[3]?.[0], rows[3]?.[1]].filter(Boolean).join(' ').trim() || null

  const invoices = new Map<string, ImportInvoice & { _m: number[]; _c: number[]; _l: number[] }>()
  let pendingDate: string | null = null
  let cur: (ImportInvoice & { _m: number[]; _c: number[]; _l: number[] }) | null = null
  const typeCount = new Map<string, number>()
  const report = { items: 0, skipped: 0, divergent: 0, withoutTipo: 0 }

  const open = (nota: string, uf: string | null) => {
    const key = `${nota}|${pendingDate ?? 'sem-data'}`
    let inv = invoices.get(key)
    if (!inv) {
      inv = { key, numero_nota: nota, data_emissao: pendingDate, uf, comissao: 0.125, lucro: 0.33, maquininha: 0.069, items: [], _m: [], _c: [], _l: [] }
      invoices.set(key, inv)
    } else if (uf && !inv.uf) inv.uf = uf
    cur = inv
  }

  for (let i = 4; i < rows.length; i++) {
    const r = rows[i] ?? []
    const b = r[1]
    const ncmNum = num(r[2])
    const isItem = ncmNum !== null && String(Math.trunc(ncmNum)).length === 8 && typeof b === 'string' && b.trim() !== ''

    // "Anotações" e "Cotação" ficam abaixo das notas de compra: nada dali entra
    if (typeof b === 'string' && !isItem && /^\s*(anota[çc][õo]es?|cota[çc][ãa]o)\b/i.test(b)) break

    if (b instanceof Date) { pendingDate = isoDate(b); cur = null; continue }
    if (!isItem && typeof b === 'string') {
      const m = b.match(NOTA_RE)
      if (m) { open(m[1].replace(/\./g, ''), m[2] ? m[2].toUpperCase() : null); continue }
    }
    if (!isItem) continue

    const qty = num(r[0]), total = num(r[3])
    if (!qty || qty <= 0 || !total || total <= 0) { report.skipped++; continue }
    if (!cur) open('sem-nota', null)

    const tipo = normalizeTipo(r[4])
    if (!tipo) report.withoutTipo++
    const ipi = num(r[6]) ?? 0
    const icms = num(r[10]) ?? 0
    const fecoep = num(r[12]) ?? 0
    const maq = num(r[14]), imp = num(r[15]), com = num(r[16]), luc = num(r[17])
    const custo = num(r[13]), venda = num(r[19])

    // confere contra o preço que a própria planilha calculou
    if (venda != null && maq != null && imp != null && com != null && luc != null) {
      const res = computeQuote({
        unitPrice: total / qty, quantity: qty, ipiPct: ipi, icmsPct: icms / total, fecoepPct: fecoep / total, tipoIcms: tipo,
        metrics: [
          { key: 'm', label: 'm', kind: 'price_percent', value: maq }, { key: 'i', label: 'i', kind: 'price_percent', value: imp },
          { key: 'c', label: 'c', kind: 'price_percent', value: com }, { key: 'l', label: 'l', kind: 'price_percent', value: luc },
        ],
      })
      if (res.priceCredit != null && Math.abs(res.priceCredit - venda) > 0.02) report.divergent++
    }

    const item: ImportItem = {
      numero_item: cur!.items.length + 1,
      descricao: String(b).replace(/\s+/g, ' ').trim(),
      ncm: String(Math.trunc(ncmNum!)),
      quantidade: qty, valor_total: total, ipi_percent: ipi, tipo_icms: tipo,
      valor_icms: icms, valor_fecoep: fecoep,
      custo_unitario: custo, preco_credito: venda, imposto_ant_percent: imp, maquininha: maq, comissao: com, lucro: luc,
    }
    cur!.items.push(item)
    if (maq != null) cur!._m.push(maq)
    if (com != null) cur!._c.push(com)
    if (luc != null) cur!._l.push(luc)
    report.items++

    const t = typeName(item.descricao)
    if (t) { const k = `${item.ncm}|${t}`; typeCount.set(k, (typeCount.get(k) ?? 0) + 1) }
  }

  const list = Array.from(invoices.values()).filter(v => v.items.length > 0).map(v => {
    const { _m, _c, _l, ...inv } = v
    return { ...inv, maquininha: mode(_m, 0.069), comissao: mode(_c, 0.125), lucro: mode(_l, 0.33) }
  })

  const ufs = list.map(v => v.uf).filter(Boolean) as string[]
  const defaultUf = ufs.length ? Array.from(ufs.reduce((m, u) => m.set(u, (m.get(u) ?? 0) + 1), new Map<string, number>())).sort((a, b) => b[1] - a[1])[0][0] : null

  const types = Array.from(typeCount.entries()).map(([k, count]) => {
    const [ncm, tname] = k.split('|'); return { ncm, name: tname, count }
  })

  return { supplier, region, defaultUf, invoices: list, types, report }
}
