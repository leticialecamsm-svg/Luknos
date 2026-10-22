// Monta a tabela catalog_prices: para cada produto do catálogo, o preço de venda da compra
// mais recente dele (o mesmo casamento nota ↔ catálogo que põe a foto em Cotação e Preços).
// Sem checagem de acesso: chamado pelo cron e por refreshCatalogPrices (que confere admin).

import { createAdminClient } from '@/lib/supabase/admin'
import { catalogSource, loadSupplierSheet } from '@/lib/pricing/sheet'

type Row = {
  source: string; ref: string; price: number; cost: number | null; invoice_date: string | null
  invoice_number: string | null; supplier_desc: string; match: string; updated_at: string
}

// palpite pelo nome perde para código/REF/escolha manual, mesmo sendo mais recente
const strength = (m: string) => (m === 'nome' ? 0 : 1)

export async function rebuildCatalogPrices(): Promise<{ suppliers: number; prices: number } | { error: string }> {
  const db = createAdminClient()
  const { data: sups, error } = await db.from('pricing_suppliers').select('id').eq('is_active', true)
  if (error) return { error: error.message }
  const now = new Date().toISOString()
  const best = new Map<string, Row>()

  const ids = (sups ?? []).map(s => s.id as string)
  for (let i = 0; i < ids.length; i += 4) {
    await Promise.all(ids.slice(i, i + 4).map(async id => {
      const [source, sheet] = await Promise.all([catalogSource(id), loadSupplierSheet(id)])
      if ('error' in sheet) return
      // notas vêm da mais recente para a mais antiga
      for (const inv of sheet.invoices) {
        if (inv.on_hold) continue
        for (const it of inv.items) {
          const p = it.photo
          if (!p || p.generic || !it.preco_credito || it.preco_credito <= 0) continue
          const key = `${source}|${p.ref}`
          const cur = best.get(key)
          if (cur && strength(cur.match) >= strength(p.match)) continue
          best.set(key, {
            source, ref: p.ref, price: Math.round(it.preco_credito * 100) / 100,
            cost: it.custo_unitario == null ? null : Math.round(it.custo_unitario * 100) / 100,
            invoice_date: inv.data_emissao, invoice_number: inv.numero_nota,
            supplier_desc: it.descricao, match: p.match, updated_at: now,
          })
        }
      }
    }))
  }

  const rows = Array.from(best.values())
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await db.from('catalog_prices').upsert(rows.slice(i, i + 500), { onConflict: 'source,ref' })
    if (e) return { error: e.message }
  }
  // o que não apareceu nesta rodada (nota excluída, foto trocada) sai
  await db.from('catalog_prices').delete().lt('updated_at', now)
  return { suppliers: ids.length, prices: rows.length }
}
