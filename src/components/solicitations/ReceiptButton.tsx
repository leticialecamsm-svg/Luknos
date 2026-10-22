'use client'

// Botão "Gerar recibo" da aba Negociação da solicitação. Abre um modal com os
// dados do cliente (nome, CPF, endereço, valor, data) e gera o recibo numa
// janela nova, já pronta pra imprimir ou salvar em PDF pelo navegador.

import { useState } from 'react'
import { Receipt, X, Printer } from 'lucide-react'
import { Portal } from '@/components/ui/Portal'

const CNPJ = '45.118.870/0001-06'
const NAVY = '#0A1F3B'
const GOLD = '#CBA455'

// ── Valor por extenso ──────────────────────────────────────────────────────
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100), r = n % 100
  const partes: string[] = []
  if (c) partes.push(CENTENAS[c])
  if (r < 20) { if (r) partes.push(UNIDADES[r]) }
  else {
    const d = Math.floor(r / 10), u = r % 10
    partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d])
  }
  return partes.join(' e ')
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const grupos: number[] = []
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000) }
  const escalas: [string, string][] = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']]
  const partes: { txt: string; valor: number }[] = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]
    if (!g) continue
    let txt = i === 1 && g === 1 ? 'mil' : ate999(g)
    if (i === 1 && g !== 1) txt += ' mil'
    if (i >= 2) txt += ' ' + (g === 1 ? escalas[i][0] : escalas[i][1])
    partes.push({ txt, valor: g })
  }
  // "e" antes do último grupo quando ele é < 100 ou centena redonda (ex.: mil e cem, dois mil e vinte);
  // nos demais casos só espaço (ex.: vinte e três mil setecentos e cinquenta e dois)
  return partes.reduce((acc, p, idx) => {
    if (idx === 0) return p.txt
    const ultimo = idx === partes.length - 1
    const usaE = ultimo && (p.valor < 100 || p.valor % 100 === 0)
    return acc + (usaE ? ' e ' : ' ') + p.txt
  }, '')
}

export function valorPorExtenso(valor: number): string {
  const centavosTotal = Math.round(valor * 100)
  const reais = Math.floor(centavosTotal / 100)
  const centavos = centavosTotal % 100
  const partes: string[] = []
  if (reais > 0) {
    let txt = inteiroPorExtenso(reais)
    // "um milhão de reais", "dois milhões de reais"
    if (reais % 1_000_000 === 0) txt += ' de'
    partes.push(`${txt} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  return partes.length ? partes.join(' e ') : 'zero reais'
}

// ── Formatação ─────────────────────────────────────────────────────────────
function maskCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

function maskMoney(v: string) {
  const d = v.replace(/\D/g, '')
  if (!d) return ''
  return (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseMoney(v: string) {
  return Number(v.replace(/\./g, '').replace(',', '.')) || 0
}

function fmtMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function dataPorExtenso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const mes = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { month: 'long' })
  return `${d} de ${mes} de ${y}`
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type ReceiptData = {
  name: string
  cpf: string
  address: string
  value: number
  date: string
  reference: string
  number: number | null
}

// Estética do PDF de orçamento (components/proposals/ProposalPrint.tsx): Poppins,
// mesmas cores, tamanhos de fonte, espaçamentos, caixa azul do valor e rodapé.
function receiptHtml(d: ReceiptData, origin: string) {
  const valor = fmtMoney(d.value)
  const extenso = valorPorExtenso(d.value)
  const numero = d.number ? `Nº ${String(d.number).padStart(4, '0')}` : ''
  const font = (w: number) => `@font-face { font-family: 'Poppins'; font-weight: ${w}; font-style: normal; font-display: block; src: url('${origin}/fonts/Poppins-${w}.woff2') format('woff2'); }`
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Recibo ${esc(numero)} - ${esc(d.name)}</title>
<style>
  ${font(400)} ${font(500)} ${font(600)}
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #e9ebef; }
  body { font-family: 'Poppins', system-ui, sans-serif; color: #1f2937; font-size: 10pt;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; margin: 24px auto; background: #fff; position: relative; overflow: hidden;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1); display: flex; flex-direction: column; }
  .topbar { height: 4mm; background: ${NAVY}; position: relative; }
  .topbar::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 2px; background: ${GOLD}; }
  .watermark { position: absolute; right: -38mm; bottom: 38mm; width: 150mm; opacity: .05; pointer-events: none; }
  .content { flex: 1; padding: 12mm 14mm 0; position: relative; display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: flex-start; }
  header img { height: 15mm; }
  .doc { text-align: right; }
  .doc .eyebrow { font-size: 8pt; letter-spacing: .2em; text-transform: uppercase; color: ${GOLD}; font-weight: 600; }
  .doc .num { font-size: 9pt; color: #6b7280; }
  .title-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16mm;
               padding-bottom: 20px; border-bottom: 2px solid ${NAVY}; }
  h1 { font-size: 18pt; font-weight: 600; letter-spacing: .2em; color: ${NAVY}; line-height: 1.25; }
  .amount { background: ${NAVY}; color: #fff; padding: 12px 16px; border-radius: 6px; text-align: right; min-width: 72mm; }
  .amount small { display: block; font-size: 8pt; letter-spacing: .15em; text-transform: uppercase; color: ${GOLD}; margin-bottom: 2px; }
  .amount strong { font-size: 15pt; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .body { margin-top: 12mm; font-size: 10pt; line-height: 1.8; color: #374151; text-align: justify; }
  .body b { font-weight: 600; color: #111827; }
  .closing { margin-top: 8mm; font-size: 10pt; color: #374151; }
  .date { margin-top: auto; text-align: right; font-size: 10pt; color: #374151; padding-bottom: 20mm; }
  .sign { text-align: center; padding-bottom: 16mm; }
  .sign .line { width: 80mm; margin: 0 auto 8px; border-top: 1px solid ${NAVY}; }
  .sign .who { font-size: 10pt; font-weight: 600; color: ${NAVY}; }
  .sign .cnpj { font-size: 8pt; color: #6b7280; }
  .sign .role { font-size: 7.5pt; color: #9ca3af; margin-top: 2px; }
  footer { background: ${NAVY}; color: #cbd5e1; padding: 4mm 14mm; display: flex; justify-content: space-between;
           align-items: center; font-size: 7.5pt; position: relative; }
  footer::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: ${GOLD}; }
  footer b { color: #fff; font-weight: 500; }
  .toolbar { position: fixed; top: 12px; right: 16px; display: flex; gap: 8px; }
  .toolbar button { font: 500 14px 'Poppins', sans-serif; padding: 8px 16px; border-radius: 99px; border: 0;
                    background: ${NAVY}; color: #fff; cursor: pointer; }
  @media print {
    html, body { background: #fff; }
    .page { margin: 0; box-shadow: none; }
    .toolbar { display: none; }
  }
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
  <div class="page">
    <div class="topbar"></div>
    <img class="watermark" src="${origin}/logo.svg" alt="">
    <div class="content">
      <header>
        <img src="${origin}/logo-full.svg" alt="Luknos Iluminação">
        <div class="doc">
          <div class="eyebrow">Comprovante de pagamento</div>
          ${numero ? `<div class="num">${esc(numero)}</div>` : ''}
        </div>
      </header>

      <div class="title-row">
        <h1>RECIBO</h1>
        <div class="amount"><small>Valor recebido</small><strong>${esc(valor)}</strong></div>
      </div>

      <p class="body">
        A <b>Luknos Iluminação</b>, inscrita no CNPJ <b>${CNPJ}</b>, declara que recebeu de
        <b>${esc(d.name)}</b>${d.cpf ? `, CPF <b>${esc(d.cpf)}</b>` : ''}${d.address ? `, residente em <b>${esc(d.address)}</b>` : ''},
        a quantia de <b>${esc(valor)}</b> (${esc(extenso)})${d.reference ? `, referente a <b>${esc(d.reference)}</b>` : ''}.
      </p>

      <p class="closing">Para comprovação do pagamento, firma-se o presente recibo, dando plena e geral quitação do valor acima.</p>

      <div class="date">Maceió, ${esc(dataPorExtenso(d.date))}.</div>

      <div class="sign">
        <div class="line"></div>
        <div class="who">Luknos Iluminação</div>
        <div class="cnpj">CNPJ ${CNPJ}</div>
        <div class="role">Assinatura do responsável</div>
      </div>
    </div>
    <footer>
      <span><b>Luknos Iluminação</b> &nbsp;·&nbsp; CNPJ ${CNPJ}</span>
      <span>Maceió · Alagoas</span>
    </footer>
  </div>
  <script>
    var imgs = Array.prototype.slice.call(document.images);
    Promise.all(imgs.map(function (i) { return i.complete ? 0 : new Promise(function (r) { i.onload = i.onerror = r }) })
      .concat(document.fonts ? [document.fonts.ready] : []))
      .then(function () { setTimeout(function () { window.print() }, 150) });
  </script>
</body></html>`
}

export function ReceiptButton({
  clientName, value, solicitationNumber,
}: {
  clientName: string | null
  value: number | null
  solicitationNumber: number | null
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '', cpf: '', address: '', value: '', date: todayIso(), reference: 'iluminação técnica',
  })
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setForm(f => ({
      ...f,
      name: f.name || clientName || '',
      value: f.value || (value ? maskMoney(value.toFixed(2)) : ''),
    }))
    setError(null)
    setOpen(true)
  }

  function generate(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseMoney(form.value)
    if (!form.name.trim()) return setError('Informe o nome completo do cliente.')
    if (form.cpf && form.cpf.replace(/\D/g, '').length !== 11) return setError('CPF incompleto.')
    if (amount <= 0) return setError('Informe o valor recebido.')
    if (!form.date) return setError('Informe a data.')

    const win = window.open('', '_blank')
    if (!win) return setError('O navegador bloqueou a janela do recibo. Libere pop-ups para este site.')
    win.document.open()
    win.document.write(receiptHtml({
      name: form.name.trim(), cpf: form.cpf, address: form.address.trim(), value: amount,
      date: form.date, reference: form.reference.trim(), number: solicitationNumber,
    }, window.location.origin))
    win.document.close()
    setOpen(false)
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <button type="button" onClick={openModal} className="btn-secondary">
        <Receipt className="w-4 h-4" /> Gerar recibo
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
            <form
              onSubmit={generate}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-200"
            >
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-surface-border">
                <Receipt className="w-5 h-5 shrink-0" style={{ color: GOLD }} />
                <h3 className="text-base font-semibold text-navy">Gerar recibo</h3>
                <button type="button" onClick={() => setOpen(false)} className="ml-auto text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="label">Nome completo do cliente</label>
                  <input className="input" value={form.name} onChange={set('name')} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">CPF</label>
                    <input
                      className="input" inputMode="numeric" placeholder="000.000.000-00"
                      value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: maskCpf(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="label">Data</label>
                    <input className="input" type="date" value={form.date} onChange={set('date')} />
                  </div>
                </div>
                <div>
                  <label className="label">Endereço</label>
                  <input className="input" placeholder="Rua, número, bairro, cidade/UF" value={form.address} onChange={set('address')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Valor (R$)</label>
                    <input
                      className="input" inputMode="numeric" placeholder="0,00"
                      value={form.value} onChange={e => setForm(f => ({ ...f, value: maskMoney(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="label">Referente a</label>
                    <input className="input" value={form.reference} onChange={set('reference')} />
                  </div>
                </div>
                {parseMoney(form.value) > 0 && (
                  <p className="text-xs text-gray-500 italic">{valorPorExtenso(parseMoney(form.value))}</p>
                )}
                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
                <button type="submit" className="btn-primary"><Printer className="w-4 h-4" /> Gerar recibo</button>
              </div>
            </form>
          </div>
        </Portal>
      )}
    </>
  )
}
