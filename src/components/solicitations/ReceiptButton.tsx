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

// Mesmo padrão visual do PDF de orçamento (components/proposals/ProposalPrint.tsx):
// Poppins, cabeçalho com logo + nº/data e filete azul, dados em colunas, títulos
// dourados, caixa azul com o valor e rodapé discreto com o CNPJ.
function receiptHtml(d: ReceiptData, origin: string) {
  const valor = fmtMoney(d.value)
  const extenso = valorPorExtenso(d.value)
  const numero = d.number ? `Nº ${String(d.number).padStart(4, '0')}` : ''
  const [y, m, day] = d.date.split('-')
  const dataCurta = `${day}/${m}/${y}`
  const font = (w: number) => `@font-face { font-family: 'Poppins'; font-weight: ${w}; font-style: normal; font-display: block; src: url('${origin}/fonts/Poppins-${w}.woff2') format('woff2'); }`
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Recibo ${esc(numero)} - ${esc(d.name)} - Luknos</title>
<style>
  ${font(400)} ${font(500)} ${font(600)}
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #e9ebef; }
  body { font-family: 'Poppins', system-ui, sans-serif; color: #1f2937; font-size: 10pt; }
  .bar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .bar div { max-width: 210mm; margin: 0 auto; padding: 12px 16px; display: flex; justify-content: flex-end; }
  .bar button { font: 500 14px 'Poppins', sans-serif; color: #fff; background: ${NAVY}; border: 0; border-radius: 99px; padding: 8px 16px; cursor: pointer; }
  .sheet { width: 210mm; min-height: 297mm; margin: 24px auto; background: #fff; padding: 12mm 14mm;
           box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1); display: flex; flex-direction: column; }
  .eyebrow { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; }
  .gold { color: ${GOLD}; font-weight: 600; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid ${NAVY}; }
  header img { height: 15mm; }
  header .doc { text-align: right; }
  header .doc .t { font-size: 8pt; text-transform: uppercase; letter-spacing: .2em; font-weight: 600; color: ${GOLD}; }
  header .doc .n { font-size: 18pt; font-weight: 600; line-height: 1.25; color: ${NAVY}; }
  header .doc .d { font-size: 9pt; color: #6b7280; }
  .info { display: grid; grid-template-columns: 1fr .8fr 1.6fr; gap: 16px; padding: 16px 0; font-size: 9pt; }
  .info p:last-child { font-weight: 500; color: #111827; }
  h2 { font-size: 11pt; font-weight: 600; text-transform: uppercase; letter-spacing: .025em; color: ${NAVY};
       padding-bottom: 6px; margin: 16px 0 12px; border-bottom: 1px solid ${GOLD}; }
  .text { font-size: 10pt; line-height: 1.8; color: #374151; text-align: justify; }
  .text b { font-weight: 600; color: #111827; }
  .close { display: grid; grid-template-columns: 1fr 72mm; gap: 32px; align-items: start; margin-top: 32px; font-size: 9pt; }
  .block + .block { margin-top: 12px; }
  .block .gold { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; }
  .block p:last-child { color: #374151; }
  .total { border-radius: 6px; padding: 12px 16px; background: ${NAVY}; color: #fff; display: flex; justify-content: space-between; align-items: baseline; }
  .total span { font-size: 8pt; text-transform: uppercase; letter-spacing: .15em; color: ${GOLD}; }
  .total strong { font-size: 15pt; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sign { margin-top: 34mm; text-align: center; }
  .sign .line { width: 80mm; margin: 0 auto 8px; border-top: 1px solid ${NAVY}; }
  .sign .who { font-size: 10pt; font-weight: 600; color: ${NAVY}; }
  .sign .sub { font-size: 8pt; color: #6b7280; }
  .sign .role { font-size: 7.5pt; color: #9ca3af; margin-top: 2px; }
  footer { margin-top: auto; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 7.5pt; color: #9ca3af; }
  @media print {
    html, body { background: #fff; }
    .bar { display: none; }
    .sheet { margin: 0; box-shadow: none; min-height: 297mm; height: 297mm; }
  }
</style></head>
<body>
  <div class="bar"><div><button onclick="window.print()">Imprimir / Salvar PDF</button></div></div>
  <div class="sheet">
    <header>
      <img src="${origin}/logo-full.svg" alt="Luknos Iluminação">
      <div class="doc">
        <p class="t">Recibo</p>
        ${numero ? `<p class="n">${esc(numero)}</p>` : ''}
        <p class="d">${esc(dataCurta)}</p>
      </div>
    </header>

    <section class="info">
      <div><p class="eyebrow">Cliente</p><p>${esc(d.name)}</p></div>
      <div><p class="eyebrow">CPF</p><p>${esc(d.cpf || '—')}</p></div>
      <div><p class="eyebrow">Endereço</p><p>${esc(d.address || '—')}</p></div>
    </section>

    <h2>Declaração</h2>
    <p class="text">
      A <b>Luknos Iluminação</b>, inscrita no CNPJ <b>${CNPJ}</b>, declara que recebeu de
      <b>${esc(d.name)}</b>${d.cpf ? `, CPF <b>${esc(d.cpf)}</b>` : ''}${d.address ? `, residente em ${esc(d.address)}` : ''},
      a quantia de <b>${esc(valor)}</b> (${esc(extenso)})${d.reference ? `, referente a <b>${esc(d.reference)}</b>` : ''}.
      Para comprovação do pagamento, firma-se o presente recibo, dando plena e geral quitação do valor acima.
    </p>

    <section class="close">
      <div>
        ${d.reference ? `<div class="block"><p class="gold">Referente a</p><p>${esc(d.reference.charAt(0).toUpperCase() + d.reference.slice(1))}</p></div>` : ''}
        <div class="block"><p class="gold">Valor por extenso</p><p>${esc(extenso.charAt(0).toUpperCase() + extenso.slice(1))}</p></div>
        <div class="block"><p class="gold">Local e data</p><p>Maceió, ${esc(dataPorExtenso(d.date))}</p></div>
      </div>
      <div>
        <div class="total"><span>Valor recebido</span><strong>${esc(valor)}</strong></div>
      </div>
    </section>

    <div class="sign">
      <div class="line"></div>
      <p class="who">Luknos Iluminação</p>
      <p class="sub">CNPJ ${CNPJ}</p>
      <p class="role">Assinatura do responsável</p>
    </div>

    <footer>Luknos Iluminação · CNPJ ${CNPJ} · luknosiluminacao.com.br</footer>
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
