import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Marca manualmente uma NF-e recebida como entregue (ou não) — notas entregues
// saem da consulta de "Atualizar passagens", economizando a cota da SEFAZ pra
// quem ainda está de fato em trânsito.
export async function POST(req: Request) {
  try {
    const { chave_nfe, entregue } = await req.json()
    if (!chave_nfe || typeof entregue !== 'boolean') {
      return NextResponse.json({ error: 'chave_nfe e entregue são obrigatórios' }, { status: 400 })
    }
    const supabase = createAdminClient()
    const { error } = await supabase.from('nfe_received').update({ entregue }).eq('chave_nfe', chave_nfe)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
