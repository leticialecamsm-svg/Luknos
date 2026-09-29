'use server'

// Tela de TESTE: emite NF-e/NFC-e avulsa em homologação, escolhendo produtos
// que já existem em Cotação e Preços, sem depender de orçamento/venda ainda
// (isso vem na Fase 3). Serve só para validar a integração com a Focus.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { focusEmitirNfe, focusEmitirNfce, focusConsultar, focusCancelar, type FocusAmbiente } from './focus-client'

async function guardAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Apenas administradores' }
  return { userId: user.id }
}

async function loadConfig() {
  const { data, error } = await createAdminClient().from('fiscal_config').select('*').eq('id', true).single()
  if (error || !data) return { error: error?.message ?? 'Configuração fiscal não encontrada' }
  return { data }
}

export type TestItem = { descricao: string; ncm: string; quantidade: number; valorUnitario: number }

const nowIso = () => {
  const d = new Date()
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  return d.toISOString().slice(0, 19) + sign + pad(Math.floor(Math.abs(tz) / 60)) + ':' + pad(Math.abs(tz) % 60)
}

function buildItems(items: TestItem[]) {
  return items.map((it, i) => ({
    numero_item: String(i + 1),
    codigo_produto: String(i + 1),
    codigo_ncm: it.ncm.replace(/\D/g, '').padStart(8, '0').slice(0, 8),
    descricao: it.descricao,
    cfop: '5102',
    quantidade_comercial: it.quantidade,
    quantidade_tributavel: it.quantidade,
    valor_unitario_comercial: it.valorUnitario,
    valor_unitario_tributavel: it.valorUnitario,
    valor_bruto: Math.round(it.quantidade * it.valorUnitario * 100) / 100,
    unidade_comercial: 'UN',
    unidade_tributavel: 'UN',
    icms_origem: '0',
    icms_situacao_tributaria: '102', // CSOSN — Simples Nacional sem crédito, o padrão visto nas notas reais da loja
  }))
}

async function saveDocument(row: Record<string, unknown>) {
  await createAdminClient().from('fiscal_documents').insert(row)
}

// ── NF-e de teste (cliente com CNPJ/CPF, sem venda associada) ───────────────
export type TestEndereco = { logradouro: string; numero: string; bairro: string; municipio: string; uf: string; cep: string }

export async function emitirNfeTeste(input: { destinatarioNome: string; destinatarioCnpj?: string; destinatarioCpf?: string; endereco: TestEndereco; items: TestItem[] }) {
  const auth = await guardAdmin()
  if ('error' in auth) return { error: auth.error }
  const cfg = await loadConfig()
  if ('error' in cfg) return { error: cfg.error }
  const c = cfg.data
  const ambiente: FocusAmbiente = 'homologacao' // teste sempre em homologação, sem exceção
  const token = c.focus_token_homologacao
  if (!token) return { error: 'Cadastre o token de Homologação em Configurações Fiscais primeiro.' }
  if (!c.cnpj) return { error: 'Cadastre o CNPJ da empresa em Configurações Fiscais primeiro.' }
  if (!input.items.length) return { error: 'Escolha ao menos um item.' }

  const ref = `teste-nfe-${Date.now()}`
  const payload: Record<string, unknown> = {
    natureza_operacao: 'VENDA DE MERCADORIA',
    data_emissao: nowIso(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    cnpj_emitente: c.cnpj.replace(/\D/g, ''),
    presenca_comprador: 1,
    modalidade_frete: 9,
    local_destino: 1,
    consumidor_final: 1,
    nome_destinatario: input.destinatarioNome,
    logradouro_destinatario: input.endereco.logradouro,
    numero_destinatario: input.endereco.numero,
    bairro_destinatario: input.endereco.bairro,
    municipio_destinatario: input.endereco.municipio,
    uf_destinatario: input.endereco.uf,
    cep_destinatario: input.endereco.cep.replace(/\D/g, ''),
    pais_destinatario: 'BRASIL',
    indicador_inscricao_estadual_destinatario: 9, // 9 = não contribuinte, o caso comum de teste
    items: buildItems(input.items),
  }
  if (input.destinatarioCnpj) payload.cnpj_destinatario = input.destinatarioCnpj.replace(/\D/g, '')
  else if (input.destinatarioCpf) payload.cpf_destinatario = input.destinatarioCpf.replace(/\D/g, '')

  const r = await focusEmitirNfe(ambiente, token, ref, payload)
  await saveDocument({
    tipo: 55, ambiente, ref, status: r.ok ? (r.data?.status ?? 'processando') : 'erro_autorizacao',
    numero: r.data?.numero ?? null, serie: r.data?.serie ?? null, chave_nfe: r.data?.chave_nfe ?? null,
    mensagem_sefaz: r.ok ? (r.data?.mensagem_sefaz ?? null) : r.error,
    xml_url: r.data?.caminho_xml_nota_fiscal ?? null, pdf_url: r.data?.caminho_danfe ?? null,
    created_by: auth.userId,
  })
  if (!r.ok) return { error: r.error, raw: r.data }
  return { ok: true, ref, ...r.data }
}

// ── NFC-e de teste (CPF opcional, formas_pagamento fixa em dinheiro) ────────
export async function emitirNfceTeste(input: { destinatarioCpf?: string; items: TestItem[] }) {
  const auth = await guardAdmin()
  if ('error' in auth) return { error: auth.error }
  const cfg = await loadConfig()
  if ('error' in cfg) return { error: cfg.error }
  const c = cfg.data
  const ambiente: FocusAmbiente = 'homologacao'
  const token = c.focus_token_homologacao
  if (!token) return { error: 'Cadastre o token de Homologação em Configurações Fiscais primeiro.' }
  if (!c.cnpj) return { error: 'Cadastre o CNPJ da empresa em Configurações Fiscais primeiro.' }
  if (!input.items.length) return { error: 'Escolha ao menos um item.' }

  const total = input.items.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
  const ref = `teste-nfce-${Date.now()}`
  const payload: Record<string, unknown> = {
    cnpj_emitente: c.cnpj.replace(/\D/g, ''),
    data_emissao: nowIso(),
    presenca_comprador: '1',
    modalidade_frete: '9',
    local_destino: '1',
    natureza_operacao: 'VENDA DE MERCADORIA',
    items: buildItems(input.items),
    formas_pagamento: [{ forma_pagamento: '01', valor_pagamento: Math.round(total * 100) / 100 }], // 01 = dinheiro
  }
  if (input.destinatarioCpf) payload.cpf_destinatario = input.destinatarioCpf.replace(/\D/g, '')

  const r = await focusEmitirNfce(ambiente, token, ref, payload)
  await saveDocument({
    tipo: 65, ambiente, ref, status: r.ok ? (r.data?.status ?? 'processando') : 'erro_autorizacao',
    numero: r.data?.numero ?? null, serie: r.data?.serie ?? null, chave_nfe: r.data?.chave_nfe ?? null,
    mensagem_sefaz: r.ok ? null : r.error,
    xml_url: r.data?.caminho_xml_nota_fiscal ?? null, pdf_url: r.data?.caminho_danfe ?? null, qrcode_url: r.data?.qrcode_url ?? null,
    created_by: auth.userId,
  })
  if (!r.ok) return { error: r.error, raw: r.data }
  return { ok: true, ref, ...r.data }
}

export async function consultarTeste(tipo: 'nfe' | 'nfce', ref: string) {
  const auth = await guardAdmin()
  if ('error' in auth) return { error: auth.error }
  const cfg = await loadConfig()
  if ('error' in cfg) return { error: cfg.error }
  const token = cfg.data.focus_token_homologacao
  if (!token) return { error: 'Sem token de homologação configurado.' }
  const r = await focusConsultar('homologacao', token, tipo, ref)
  if (!r.ok) return { error: r.error, raw: r.data }
  await createAdminClient().from('fiscal_documents').update({
    status: r.data?.status ?? 'processando', mensagem_sefaz: r.data?.mensagem_sefaz ?? null,
    numero: r.data?.numero ?? null, chave_nfe: r.data?.chave_nfe ?? null,
    xml_url: r.data?.caminho_xml_nota_fiscal ?? null, pdf_url: r.data?.caminho_danfe ?? null,
    updated_at: new Date().toISOString(),
  }).eq('ref', ref)
  return { ok: true, ...r.data }
}

export async function cancelarTeste(tipo: 'nfe' | 'nfce', ref: string, justificativa: string) {
  const auth = await guardAdmin()
  if ('error' in auth) return { error: auth.error }
  if (justificativa.trim().length < 15) return { error: 'A justificativa precisa ter pelo menos 15 caracteres.' }
  const cfg = await loadConfig()
  if ('error' in cfg) return { error: cfg.error }
  const token = cfg.data.focus_token_homologacao
  if (!token) return { error: 'Sem token de homologação configurado.' }
  const r = await focusCancelar('homologacao', token, tipo, ref, justificativa.trim())
  if (!r.ok) return { error: r.error, raw: r.data }

  const admin = createAdminClient()
  const { data: doc } = await admin.from('fiscal_documents').select('id').eq('ref', ref).maybeSingle()
  await admin.from('fiscal_documents').update({ status: r.data?.status ?? 'cancelado', updated_at: new Date().toISOString() }).eq('ref', ref)
  if (doc) await admin.from('fiscal_events').insert({ document_id: doc.id, tipo: 'cancelamento', justificativa, protocolo: r.data?.numero_protocolo ?? null, status: r.data?.status ?? null, created_by: auth.userId })
  return { ok: true, ...r.data }
}
