// Leitura da "aba" de um fornecedor em Cotação e Preços (notas + itens com a foto do catálogo
// casada) e do catálogo dele. Sem checagem de acesso: quem chama confere (getSupplierSheet,
// cálculo de preços do Orçamento de Produtos, cron). Não é 'use server' de propósito.

import { createAdminClient } from '@/lib/supabase/admin'
import { matchCatalog, catalogSourceFor, type CatalogEntry } from '@/lib/catalog/match'
import { existingRows } from '@/lib/catalog/sync-utils'
import type { SheetInvoice } from './actions'

export async function loadSupplierSheet(supplierId: string): Promise<{ invoices: SheetInvoice[] } | { error: string }> {
  const { data, error } = await createAdminClient().from('purchase_invoices')
    .select('id, numero_nota, data_emissao, uf_origem, source, on_hold, maquininha, comissao, lucro, purchase_invoice_items(id, numero_item, quantidade, descricao, ncm, valor_total, tipo_icms, ipi_percent, valor_icms, valor_fecoep, custo_unitario, preco_credito, imposto_ant_percent, maquininha, comissao, lucro, codigo_produto, catalog_ref)')
    .eq('pricing_supplier_id', supplierId).order('data_emissao', { ascending: false, nullsFirst: false })
  if (error) return { error: error.message }
  const catalog = await loadCatalog(supplierId)
  const byRef = new Map(catalog.map(c => [c.ref, c]))
  // O mesmo produto aparece com código numa nota (XML) e sem código em outra (planilha): quem não tem
  // código aprende o da mesma descrição neste fornecedor, e a foto sai pelo código, não pelo nome.
  const descKey = (d: string) => String(d ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  const codeByDesc = new Map<string, string>()
  for (const r of (data ?? []) as any[]) for (const i of r.purchase_invoice_items ?? []) {
    const code = String(i.codigo_produto ?? '').trim()
    if (code && !codeByDesc.has(descKey(i.descricao))) codeByDesc.set(descKey(i.descricao), code)
  }
  // Nota lançada por planilha não tem código, mas a NF-e dela costuma estar no radar de notas de entrada
  // (nfe_received, com o XML): mesmo número de nota + mesma posição + mesma descrição = o cProd do item.
  // Só leitura: não grava nada nas notas.
  const codeByPos = new Map<string, string>()
  const numeros = Array.from(new Set(((data ?? []) as any[]).map(r => String(r.numero_nota ?? '')).filter(Boolean)))
  if (numeros.length) {
    const { data: nfes } = await createAdminClient().from('nfe_received').select('numero_nota, items_json').in('numero_nota', numeros).not('items_json', 'is', null)
    for (const n of (nfes ?? []) as any[]) for (const e of Array.isArray(n.items_json) ? n.items_json : []) {
      const code = String(e.cProd ?? '').trim()
      if (!code) continue
      codeByPos.set(`${n.numero_nota}|${e.nItem}|${descKey(e.xProd)}`, code)
      if (!codeByDesc.has(descKey(e.xProd))) codeByDesc.set(descKey(e.xProd), code)
    }
  }
  const invoices: SheetInvoice[] = (data ?? []).map((r: any) => ({
    id: r.id, numero_nota: r.numero_nota, data_emissao: r.data_emissao, uf_origem: r.uf_origem, source: r.source, on_hold: !!r.on_hold,
    items: [...(r.purchase_invoice_items ?? [])].sort((a, b) => a.numero_item - b.numero_item).map((i: any) => ({
      ...i, quantidade: Number(i.quantidade), valor_total: Number(i.valor_total), ipi_percent: Number(i.ipi_percent),
      valor_icms: Number(i.valor_icms), valor_fecoep: Number(i.valor_fecoep),
      custo_unitario: i.custo_unitario == null ? null : Number(i.custo_unitario), preco_credito: i.preco_credito == null ? null : Number(i.preco_credito),
      imposto_ant_percent: i.imposto_ant_percent == null ? null : Number(i.imposto_ant_percent),
      maquininha: Number(i.maquininha ?? r.maquininha), comissao: Number(i.comissao ?? r.comissao), lucro: Number(i.lucro ?? r.lucro),
      photo: catalog.length ? matchCatalog({ ...i, codigo_produto: i.codigo_produto || codeByPos.get(`${r.numero_nota}|${i.numero_item}|${descKey(i.descricao)}`) || codeByDesc.get(descKey(i.descricao)) || null }, catalog, byRef) : null,
    })),
  }))
  return { invoices }
}

// Catálogo com fotos do fornecedor: Accord (copiado do site), Hevvy (do catálogo PDF)
// e, para todos, as fotos enviadas à mão (os demais fornecedores só têm essas).
export async function catalogSource(supplierId: string) {
  const { data } = await createAdminClient().from('pricing_suppliers').select('name').eq('id', supplierId).maybeSingle()
  return (data && catalogSourceFor(data.name)) || `sup-${supplierId}`
}

export async function loadCatalog(supplierId: string): Promise<CatalogEntry[]> {
  const source = await catalogSource(supplierId)
  // Em páginas: o banco devolve no máximo 1000 linhas por consulta e a Usina tem quase 3000.
  const data = await existingRows(createAdminClient(), source,
    'ref, name, kind, line, altura_cm, largura_cm, profundidade_cm, diametro_cm, product_url, image_url, source_image_url, finishes, model, ean, variant')
  return data.sort((a, b) => String(a.name).localeCompare(String(b.name))).map((c: any) => ({
    ...c, finishes: c.finishes ?? [],
    altura_cm: c.altura_cm == null ? null : Number(c.altura_cm), largura_cm: c.largura_cm == null ? null : Number(c.largura_cm),
    profundidade_cm: c.profundidade_cm == null ? null : Number(c.profundidade_cm), diametro_cm: c.diametro_cm == null ? null : Number(c.diametro_cm),
  }))
}

