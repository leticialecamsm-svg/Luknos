'use client'

import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronDown, ChevronRight, Info, Upload, X, Pencil, Check, AlertCircle, Link2 } from 'lucide-react'
import { useState, useRef, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { upsertPayrollEntry } from '@/lib/actions'
import type { PayrollEmployee } from '@/app/api/hr/parse-payroll/route'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Props {
  earnings: Record<string, any>
  payroll: any[]
  year: number
  month: number
  initialTab: 'comissao' | 'remuneracao'
}

// ── Utilitários ────────────────────────────────────────────────────────────────

function EditableValue({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [str, setStr] = useState(value.toFixed(2).replace('.', ','))

  if (!editing) {
    return (
      <button
        onClick={() => { setStr(value.toFixed(2).replace('.', ',')); setEditing(true) }}
        className="flex items-center gap-1 group"
      >
        <span className="tabular-nums">{formatCurrency(value)}</span>
        <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400">R$</span>
      <input
        autoFocus
        className="w-28 text-right border border-brand-400 rounded px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-brand-500"
        value={str}
        onChange={e => setStr(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0); setEditing(false) }
          if (e.key === 'Escape') setEditing(false)
        }}
      />
      <button onClick={() => { onSave(parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0); setEditing(false) }}>
        <Check className="w-4 h-4 text-emerald-500" />
      </button>
      <button onClick={() => setEditing(false)}>
        <X className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  )
}

// ── Aba Comissão ───────────────────────────────────────────────────────────────

function CommissionTab({ earnings }: { earnings: Record<string, any> }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detailUser, setDetailUser] = useState<string | null>(null)

  const rows = Object.values(earnings)
    .filter((r: any) => r.total > 0 || r.sellerSales > 0)
    .sort((a: any, b: any) => b.total - a.total)

  const totalComm = rows.reduce((s: number, r: any) => s + r.total, 0)

  const detailRow = detailUser ? rows.find((r: any) => r.user?.id === detailUser) : null

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Total de comissões no mês</p>
          <p className="text-3xl font-bold text-emerald-700 mt-0.5">{formatCurrency(totalComm)}</p>
        </div>
        <p className="text-sm text-gray-400">{rows.length} colaborador{rows.length !== 1 ? 'es' : ''}</p>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] border-b border-gray-100 bg-gray-50">
          {['Colaborador','Vendas no mês','Com. vendedor (1%)','Com. projetista','Total'].map((h, i) => (
            <div key={i} className={cn('px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide', i > 0 && 'text-right')}>{h}</div>
          ))}
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma comissão registrada para este mês</div>
        )}

        {rows.map((r: any) => {
          const isOpen = expanded === r.user?.id
          const isDetail = detailUser === r.user?.id
          const hasProjDetails = r.projetistaSales?.length > 0
          const allSales = [
            ...(r.sellerSales > 0 ? [{ label: 'Comissão de Vendedor', value: r.sellerSales, comm: r.sellerComm, rate: 1, type: 'seller' }] : []),
          ]

          return (
            <div key={r.user?.id} className="border-b border-gray-100 last:border-0">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center hover:bg-gray-50 transition-colors">
                {/* Nome */}
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <Avatar user={r.user} size={32} />
                  <div>
                    <button
                      onClick={() => setDetailUser(isDetail ? null : r.user?.id)}
                      className="text-sm font-semibold text-gray-900 hover:text-brand-600 text-left"
                    >
                      {r.user?.name}
                    </button>
                    <div className="flex gap-1.5 mt-0.5">
                      {r.sellerComm > 0 && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Vendedor</span>}
                      {r.projetistaComm > 0 && <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Projetista</span>}
                    </div>
                  </div>
                  {hasProjDetails && (
                    <button onClick={() => setExpanded(isOpen ? null : r.user?.id)} className="ml-auto">
                      <ChevronRight className={cn('w-4 h-4 text-gray-400 transition-transform', isOpen && 'rotate-90')} />
                    </button>
                  )}
                </div>
                <div className="px-4 py-3.5 text-sm text-gray-700 text-right tabular-nums">{r.sellerSales > 0 ? formatCurrency(r.sellerSales) : '—'}</div>
                <div className="px-4 py-3.5 text-sm text-gray-700 text-right tabular-nums">{r.sellerComm > 0 ? formatCurrency(r.sellerComm) : '—'}</div>
                <div className="px-4 py-3.5 text-sm text-gray-700 text-right tabular-nums">{r.projetistaComm > 0 ? formatCurrency(r.projetistaComm) : '—'}</div>
                <div className="px-4 py-3.5 text-sm font-bold text-emerald-700 text-right tabular-nums">{formatCurrency(r.total)}</div>
              </div>

              {/* Painel detalhe de vendas */}
              {isDetail && (
                <div className="bg-blue-50 border-t border-blue-100 px-4 py-3 space-y-3">
                  {r.sellerSales > 0 && (
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Vendas como vendedor</p>
                      {r.sellerDetails?.length > 0 ? (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-blue-600 border-b border-blue-200">
                              <th className="text-left pb-2 font-semibold">Orçamento</th>
                              <th className="text-left pb-2 font-semibold">Cliente</th>
                              <th className="text-right pb-2 font-semibold">Valor venda</th>
                              <th className="text-right pb-2 font-semibold">Participação</th>
                              <th className="text-right pb-2 font-semibold">Com. (1%)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.sellerDetails.map((s: any, i: number) => (
                              <tr key={i} className="border-b border-blue-100 last:border-0">
                                <td className="py-2 font-mono text-blue-800">#{s.number}</td>
                                <td className="py-2 text-gray-700">{s.client_name}</td>
                                <td className="py-2 text-right tabular-nums text-gray-700">{formatCurrency(s.value)}</td>
                                <td className="py-2 text-right text-blue-600 font-semibold">
                                  {s.num_owners > 1 ? `1/${s.num_owners}` : '100%'}
                                </td>
                                <td className="py-2 text-right tabular-nums font-bold text-blue-700">{formatCurrency(s.comm)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-xs text-blue-500 italic">Detalhamento por venda não disponível</p>
                      )}
                    </div>
                  )}

                  {r.projetistaSales?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2">Projetos como projetista responsável</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-violet-600 border-b border-violet-200">
                            <th className="text-left pb-2 font-semibold">Orçamento</th>
                            <th className="text-left pb-2 font-semibold">Cliente</th>
                            <th className="text-right pb-2 font-semibold">Valor</th>
                            <th className="text-right pb-2 font-semibold">Taxa</th>
                            <th className="text-right pb-2 font-semibold">Comissão</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.projetistaSales.map((p: any, i: number) => (
                            <tr key={i} className="border-b border-violet-100 last:border-0">
                              <td className="py-2 font-mono text-violet-800">#{p.number}</td>
                              <td className="py-2 text-gray-700">{p.client_name}</td>
                              <td className="py-2 text-right tabular-nums text-gray-700">{formatCurrency(p.value)}</td>
                              <td className="py-2 text-right text-violet-600 font-semibold">{p.rate}%</td>
                              <td className="py-2 text-right tabular-nums font-bold text-violet-700">{formatCurrency(p.comm)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1 border-t border-blue-200">
                    <span className="text-xs font-bold text-blue-800">Total de comissão</span>
                    <span className="text-sm font-bold text-emerald-700">{formatCurrency(r.total)}</span>
                  </div>
                </div>
              )}

              {/* Detalhe projetos projetista */}
              {isOpen && hasProjDetails && !isDetail && (
                <div className="bg-violet-50 border-t border-violet-100 px-4 py-3">
                  <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2">Projetos como responsável</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-violet-600 border-b border-violet-200">
                        <th className="text-left pb-2 font-semibold">Orçamento</th>
                        <th className="text-left pb-2 font-semibold">Cliente</th>
                        <th className="text-right pb-2 font-semibold">Valor</th>
                        <th className="text-right pb-2 font-semibold">Taxa</th>
                        <th className="text-right pb-2 font-semibold">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.projetistaSales.map((p: any, i: number) => (
                        <tr key={i} className="border-b border-violet-100 last:border-0">
                          <td className="py-2 font-mono text-violet-800">#{p.number}</td>
                          <td className="py-2 text-gray-700">{p.client_name}</td>
                          <td className="py-2 text-right tabular-nums text-gray-700">{formatCurrency(p.value)}</td>
                          <td className="py-2 text-right text-violet-600 font-semibold">{p.rate}%</td>
                          <td className="py-2 text-right tabular-nums font-bold text-violet-700">{formatCurrency(p.comm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}

        {rows.length > 0 && (
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] bg-gray-50 border-t-2 border-gray-200">
            <div className="px-4 py-3 text-sm font-bold text-gray-700">Total</div>
            <div className="px-4 py-3 text-sm font-bold text-right tabular-nums">{formatCurrency(rows.reduce((s: number, r: any) => s + r.sellerSales, 0))}</div>
            <div className="px-4 py-3 text-sm font-bold text-right tabular-nums">{formatCurrency(rows.reduce((s: number, r: any) => s + r.sellerComm, 0))}</div>
            <div className="px-4 py-3 text-sm font-bold text-right tabular-nums">{formatCurrency(rows.reduce((s: number, r: any) => s + r.projetistaComm, 0))}</div>
            <div className="px-4 py-3 text-sm font-bold text-emerald-700 text-right tabular-nums">{formatCurrency(totalComm)}</div>
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700">
        <strong>⚠️ Divisão de vendas:</strong> A comissão de vendedor (1%) é calculada sobre o valor atribuído a cada colaborador na view <code>sales_by_month</code>.
        Verifique se a view divide o <code>final_value</code> pelo número de donos.
      </div>
    </div>
  )
}

// ── Aba Remuneração ────────────────────────────────────────────────────────────

function RemuneracaoTab({
  earnings,
  payroll,
  year,
  month,
}: {
  earnings: Record<string, any>
  payroll: any[]
  year: number
  month: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  // local payroll state for manual editing
  const [localPayroll, setLocalPayroll] = useState<Record<string, any>>(() => {
    const m: Record<string, any> = {}
    for (const p of payroll) if (p.user_id) m[p.user_id] = { ...p }
    return m
  })
  const fileRef = useRef<HTMLInputElement>(null)

  const commRows = Object.values(earnings).filter((r: any) => r.user)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(false)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/hr/parse-payroll', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok || data.error) {
        setUploadError(data.error ?? 'Erro ao processar PDF')
        return
      }

      const parsed: PayrollEmployee[] = data.employees

      // Match parsed employees to system users by name similarity
      for (const emp of parsed) {
        const match = commRows.find((r: any) => {
          const sysName = (r.user.name ?? '').toUpperCase()
          const pdfName = emp.name.toUpperCase()
          // Check if any word in the PDF name matches any word in the system name
          const pdfWords = pdfName.split(' ').filter((w: string) => w.length > 3)
          return pdfWords.some((w: string) => sysName.includes(w))
        })

        if (match) {
          const entry = {
            user_id: match.user.id,
            employee_name: emp.name,
            year,
            month,
            salary_base: emp.salaryBase,
            total_proventos: emp.totalProventos,
            total_descontos: emp.totalDescontos,
            liquido: emp.liquido,
            fgts: emp.fgts,
            line_items: emp.lineItems,
          }
          await upsertPayrollEntry(entry)
          setLocalPayroll(prev => ({ ...prev, [match.user.id]: entry }))
        }
      }

      setUploadSuccess(true)
      startTransition(() => router.refresh())
    } catch (err: any) {
      setUploadError(err.message ?? 'Erro inesperado')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleFieldChange(userId: string, field: string, value: number) {
    const current = localPayroll[userId] ?? {}
    const updated = { ...current, user_id: userId, year, month, [field]: value }
    // Recalculate liquido if proventos or descontos changed
    if (field === 'total_proventos' || field === 'total_descontos') {
      updated.liquido = (updated.total_proventos ?? 0) - (updated.total_descontos ?? 0)
    }
    setLocalPayroll(prev => ({ ...prev, [userId]: updated }))
    await upsertPayrollEntry({
      employee_name: updated.employee_name ?? '',
      ...updated,
      line_items: updated.line_items ?? [],
    })
  }

  const totalSalarios = Object.values(localPayroll).reduce((s, p: any) => s + (p.liquido ?? 0), 0)
  const totalComissoes = Object.values(earnings).reduce((s: number, r: any) => s + (r.total ?? 0), 0)
  const totalGeral = totalSalarios + totalComissoes

  return (
    <div className="space-y-4">
      {/* Upload PDF */}
      <div className={cn(
        'bg-white border rounded-xl px-5 py-4 flex items-start gap-4',
        uploadSuccess ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200'
      )}>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">Importar Extrato Mensal (PDF)</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Envie o <strong>Extrato Mensal</strong> da contabilidade para preencher automaticamente os dados de salário.
            Os valores podem ser editados manualmente depois.
          </p>
          {uploadError && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {uploadError}
            </div>
          )}
          {uploadSuccess && <p className="text-xs text-emerald-700 mt-2 font-medium">✓ Dados importados com sucesso!</p>}
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 btn-primary text-sm py-2 px-4 disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Processando...' : 'Carregar PDF'}
          </button>
        </div>
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total salários (líquido)', value: totalSalarios, color: 'text-blue-700' },
          { label: 'Total comissões', value: totalComissoes, color: 'text-violet-700' },
          { label: 'Total geral a pagar', value: totalGeral, color: 'text-emerald-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn('text-2xl font-bold mt-0.5', color)}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {/* Tabela por colaborador */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] border-b border-gray-100 bg-gray-50">
          {['Colaborador','Sal. base','Proventos','Descontos','Líquido CLT','Comissão','Total a pagar'].map((h, i) => (
            <div key={i} className={cn('px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide', i > 0 && 'text-right')}>{h}</div>
          ))}
        </div>

        {commRows.map((r: any) => {
          const p = localPayroll[r.user.id]
          const comm = r.total ?? 0
          const liquido = p?.liquido ?? 0
          const totalAPagar = liquido + comm
          const hasData = !!p

          return (
            <div key={r.user.id} className="border-b border-gray-100 last:border-0">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center hover:bg-gray-50 px-3 py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar user={r.user} size={28} />
                  <p className="text-sm font-medium text-gray-900">{r.user.name}</p>
                  {!hasData && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                      Sem folha
                    </span>
                  )}
                </div>

                {/* Sal. base */}
                <div className="px-2 text-sm text-gray-600 text-right">
                  <EditableValue
                    value={p?.salary_base ?? 0}
                    onSave={v => handleFieldChange(r.user.id, 'salary_base', v)}
                  />
                </div>
                {/* Proventos */}
                <div className="px-2 text-sm text-gray-600 text-right">
                  <EditableValue
                    value={p?.total_proventos ?? 0}
                    onSave={v => handleFieldChange(r.user.id, 'total_proventos', v)}
                  />
                </div>
                {/* Descontos */}
                <div className="px-2 text-sm text-red-600 text-right">
                  <EditableValue
                    value={p?.total_descontos ?? 0}
                    onSave={v => handleFieldChange(r.user.id, 'total_descontos', v)}
                  />
                </div>
                {/* Líquido CLT */}
                <div className="px-2 text-sm font-semibold text-blue-700 text-right">
                  <EditableValue
                    value={liquido}
                    onSave={v => handleFieldChange(r.user.id, 'liquido', v)}
                  />
                </div>
                {/* Comissão */}
                <div className="px-2 text-sm font-semibold text-violet-700 text-right tabular-nums">
                  {formatCurrency(comm)}
                </div>
                {/* Total */}
                <div className="px-2 text-sm font-bold text-emerald-700 text-right tabular-nums">
                  {formatCurrency(totalAPagar)}
                </div>
              </div>

              {/* Itens da folha */}
              {hasData && p.line_items?.length > 0 && (
                <div className="bg-gray-50 px-4 pb-3 pt-0">
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-9">
                    {(p.line_items as any[]).map((item: any, i: number) => (
                      <span key={i} className={cn(
                        'text-[11px]',
                        item.type === 'P' ? 'text-emerald-700' : 'text-red-600'
                      )}>
                        {item.type === 'D' ? '−' : '+'} {item.description}: {formatCurrency(item.value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Totais */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] bg-gray-50 border-t-2 border-gray-200 px-3 py-3">
          <div className="text-sm font-bold text-gray-700">Total</div>
          <div className="px-2" />
          <div className="px-2 text-sm font-bold text-right tabular-nums">
            {formatCurrency(Object.values(localPayroll).reduce((s, p: any) => s + (p.total_proventos ?? 0), 0))}
          </div>
          <div className="px-2 text-sm font-bold text-red-600 text-right tabular-nums">
            {formatCurrency(Object.values(localPayroll).reduce((s, p: any) => s + (p.total_descontos ?? 0), 0))}
          </div>
          <div className="px-2 text-sm font-bold text-blue-700 text-right tabular-nums">{formatCurrency(totalSalarios)}</div>
          <div className="px-2 text-sm font-bold text-violet-700 text-right tabular-nums">{formatCurrency(totalComissoes)}</div>
          <div className="px-2 text-sm font-bold text-emerald-700 text-right tabular-nums">{formatCurrency(totalGeral)}</div>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Clique em qualquer valor para editar manualmente. Os dados são salvos automaticamente ao confirmar.
      </p>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export function HRPage({ earnings, payroll, year, month, initialTab }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'comissao' | 'remuneracao'>(initialTab)

  function navigateMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    router.push(`/hr?year=${y}&month=${m}&tab=${tab}`)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RH</h1>
          <p className="text-sm text-gray-500 mt-1">Comissões e remuneração dos colaboradores</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700">
          <button onClick={() => navigateMonth(-1)} className="hover:text-gray-900 px-1">◀</button>
          <span className="w-36 text-center">{MONTH_NAMES[month - 1].toUpperCase()} {year}</span>
          <button onClick={() => navigateMonth(1)} className="hover:text-gray-900 px-1">▶</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'comissao', label: 'Comissão' },
          { key: 'remuneracao', label: 'Remuneração' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn(
              'px-5 py-1.5 rounded-md text-sm font-medium transition-all',
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'comissao' && <CommissionTab earnings={earnings} />}
      {tab === 'remuneracao' && <RemuneracaoTab earnings={earnings} payroll={payroll} year={year} month={month} />}
    </div>
  )
}
