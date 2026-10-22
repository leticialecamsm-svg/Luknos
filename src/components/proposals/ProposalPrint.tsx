'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Proposal } from '@/lib/proposals/actions'
import {
  brl, itemTotal, proposalCode, proposalTotals, roomTotal, sourceLabel, PRINT_LABELS, type PrintOptions,
} from '@/lib/proposals/calc'

const NAVY = '#0A1F3B'
const GOLD = '#CBA455'

// Folha A4 do orçamento para o cliente. "Imprimir / Salvar PDF" usa a impressão do navegador
// (fotos e fontes saem iguais à tela); a barra de opções no topo não sai no papel.
export function ProposalPrint({ proposal: p, initialOptions, autoPrint }: { proposal: Proposal; initialOptions: PrintOptions; autoPrint: boolean }) {
  const [o, setO] = useState(initialOptions)
  const rooms = useMemo(() => p.rooms.filter(r => r.items.length), [p.rooms])
  const t = proposalTotals(p.rooms, p.discount_type, p.discount_value)
  const showDiscount = o.total && o.discount && t.discount > 0
  const finalTotal = showDiscount ? t.total : t.subtotal
  const date = parseISO(p.proposal_date)

  // Espera as fotos carregarem antes de abrir a impressão.
  useEffect(() => {
    if (!autoPrint) return
    let done = false
    const imgs = Array.from(document.images)
    const ready = Promise.all(imgs.map(img => (img.complete ? null : new Promise(r => { img.onload = img.onerror = r }))))
    const go = () => { if (!done) { done = true; setTimeout(() => window.print(), 200) } }
    ready.then(go)
    const t = setTimeout(go, 6000)
    return () => clearTimeout(t)
  }, [autoPrint])

  return (
    <div className="proposal-print min-h-screen bg-[#e9ebef] print:bg-white">
      <style>{`
        @page { size: A4; margin: 12mm 12mm 14mm; }
        @media print {
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: auto !important; min-height: 0 !important; }
          html, body { background: #fff !important; }
        }
        .proposal-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        .keep-next { break-after: avoid; page-break-after: avoid; }
      `}</style>

      {/* Barra de opções (só na tela) */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[210mm] mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <button onClick={() => (window.history.length > 1 ? window.history.back() : window.close())} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" title="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {PRINT_LABELS.map(({ key, label }) => {
              const disabled = key === 'discount' && !o.total
              return (
                <button key={key} type="button" disabled={disabled} onClick={() => setO(cur => ({ ...cur, [key]: !cur[key] }))}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-30 ${o[key] ? 'bg-[#0A1F3B] border-[#0A1F3B] text-white' : 'bg-white border-gray-300 text-gray-500 line-through'}`}>
                  {label}
                </button>
              )
            })}
          </div>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white" style={{ background: NAVY }}>
            <Printer className="w-4 h-4" /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div className="sheet bg-white mx-auto my-6 shadow-lg w-[210mm] min-h-[297mm] px-[14mm] py-[12mm] text-[#1f2937]" style={{ fontSize: '10pt' }}>
        {/* Cabeçalho */}
        <header className="flex items-start justify-between pb-5" style={{ borderBottom: `2px solid ${NAVY}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full.svg" alt="Luknos Iluminação" style={{ height: '15mm' }} />
          <div className="text-right">
            <p className="uppercase tracking-[0.2em] text-[8pt] font-semibold" style={{ color: GOLD }}>Orçamento</p>
            <p className="text-[18pt] font-semibold leading-tight" style={{ color: NAVY }}>Nº {proposalCode(p.number)}</p>
            <p className="text-[9pt] text-gray-500">{format(date, 'dd/MM/yyyy')}</p>
          </div>
        </header>

        {/* Dados */}
        <section className="grid grid-cols-3 gap-4 py-4 text-[9pt]">
          <Info label="Cliente" value={p.client_name || '—'} />
          <Info label="Arquiteto(a)" value={p.architect_name || '—'} />
          <Info label="Consultor(a)" value={p.seller_name || '—'} />
        </section>

        {/* Ambientes */}
        {rooms.map(room => (
          <section key={room.id} className="mt-4">
            <div className="keep-next flex items-baseline justify-between pb-1.5 mb-1" style={{ borderBottom: `1px solid ${GOLD}` }}>
              <h2 className="text-[11pt] font-semibold uppercase tracking-wide" style={{ color: NAVY }}>{room.name}</h2>
              <span className="text-[8pt] text-gray-400">{room.items.length} {room.items.length === 1 ? 'item' : 'itens'}</span>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[7.5pt] uppercase tracking-wider text-gray-400">
                  {o.images && <th className="w-[25mm]" />}
                  <th className="text-left font-medium py-1">Produto</th>
                  <th className="text-center font-medium py-1 w-[12mm]">Qtd</th>
                  {o.prices && <th className="text-right font-medium py-1 w-[25mm]">Unitário</th>}
                  {o.prices && <th className="text-right font-medium py-1 w-[27mm]">Total</th>}
                </tr>
              </thead>
              <tbody>
                {room.items.map(item => {
                  const brand = o.brand ? sourceLabel(item.source) : null
                  const meta = [o.ref && item.ref && `Cód. ${item.ref}`, brand].filter(Boolean).join(' · ')
                  return (
                    <tr key={item.id} className="avoid-break border-b border-gray-100 last:border-0 align-middle">
                      {o.images && (
                        <td className="py-1.5 pr-3">
                          <div className="w-[22mm] h-[22mm] flex items-center justify-center">
                            {item.image_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={item.image_url} alt="" className="max-w-full max-h-full object-contain" />
                              : <span className="w-full h-full rounded bg-gray-50" />}
                          </div>
                        </td>
                      )}
                      <td className="py-2 pr-3">
                        <p className="font-medium text-[9.5pt] leading-snug text-gray-900">{item.name || '—'}</p>
                        {meta && <p className="text-[8pt] text-gray-500">{meta}</p>}
                        {item.note && <p className="text-[8pt] text-gray-500 italic">{item.note}</p>}
                      </td>
                      <td className="text-center tabular-nums">{item.qty}</td>
                      {o.prices && <td className="text-right tabular-nums text-gray-600">{brl(Number(item.unit_price) || 0)}</td>}
                      {o.prices && <td className="text-right tabular-nums font-medium">{brl(itemTotal(item))}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {o.roomTotals && (
              <div className="avoid-break flex justify-end mt-1">
                <p className="text-[9pt] px-3 py-1 rounded" style={{ background: '#f4f1ea' }}>
                  <span className="text-gray-500">Total {room.name}</span>
                  <span className="ml-3 font-semibold tabular-nums" style={{ color: NAVY }}>{brl(roomTotal(room))}</span>
                </p>
              </div>
            )}
          </section>
        ))}

        {rooms.length === 0 && <p className="text-center text-gray-400 py-16">Nenhum produto neste orçamento.</p>}

        {/* Fechamento */}
        <section className="avoid-break mt-8 grid grid-cols-[1fr_72mm] gap-8 items-start">
          <div className="space-y-3 text-[9pt]">
            {o.total && p.payment_terms && <Block title="Condições de pagamento" text={p.payment_terms} />}
            {p.valid_days && <Block title="Validade" text={`${p.valid_days} dias (até ${format(addDays(date, p.valid_days), 'dd/MM/yyyy')})`} />}
            {o.notes && p.notes && <Block title="Observações" text={p.notes} />}
          </div>
          {o.total && (
            <div className="text-[9.5pt]">
              {showDiscount && (
                <>
                  <Row label="Subtotal" value={brl(t.subtotal)} />
                  <Row label={`Desconto${p.discount_type === 'percent' ? ` (${p.discount_value.toLocaleString('pt-BR')}%)` : ''}`} value={`− ${brl(t.discount)}`} />
                </>
              )}
              <div className="mt-2 rounded-md px-4 py-3 flex items-baseline justify-between text-white" style={{ background: NAVY }}>
                <span className="text-[8pt] uppercase tracking-[0.15em]" style={{ color: GOLD }}>Total</span>
                <span className="text-[15pt] font-semibold tabular-nums">{brl(finalTotal)}</span>
              </div>
            </div>
          )}
        </section>

        <footer className="mt-10 pt-3 text-center text-[7.5pt] text-gray-400" style={{ borderTop: '1px solid #e5e7eb' }}>
          Luknos Iluminação · CNPJ 45.118.870/0001-06 · luknosiluminacao.com.br
        </footer>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[7.5pt] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  )
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-[7.5pt] uppercase tracking-wider font-semibold" style={{ color: GOLD }}>{title}</p>
      <p className="whitespace-pre-line text-gray-700">{text}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 text-gray-600">
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  )
}
