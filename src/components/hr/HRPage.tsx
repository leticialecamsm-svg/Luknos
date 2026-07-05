'use client'

import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronRight, Upload, X, Pencil, Check, AlertCircle, FileText, Trash2 } from 'lucide-react'
import { useState, useRef, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { upsertPayrollEntry, savePayrollMonthUpload, deletePayrollMonthUpload, deletePayrollEntry } from '@/lib/actions'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// Nomes/IDs que não devem aparecer em Remuneração mesmo sem role admin
const ADMIN_NAMES = ['Luknos', 'João', 'Letícia', 'Leticia']

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Props {
  earnings: Record<string, any>
  payroll: any[]
  monthUpload: { file_url: string; file_name: string } | null
  allUsers: any[]
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
        className="flex items-center gap-1 group justify-end w-full"
      >
        <span className="tabular-nums">{formatCurrency(value)}</span>
        <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <span className="text-xs text-gray-400">R$</span>
      <input
        autoFocus
        className="w-24 text-right border border-brand-400 rounded px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-brand-500"
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

  const totalComm = rows
    .filter((r: any) => r.user?.role !== 'admin')
    .reduce((s: number, r: any) => s + r.total, 0)

  const detailRow = detailUser ? rows.find((r: any) => r.user?.id === detailUser) : null
  void detailRow

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Total de comissões no mês</p>
          <p className="text-3xl font-bold text-emerald-700 mt-0.5">{formatCurrency(totalComm)}</p>
        </div>
        <p className="text-sm text-gray-400">{rows.length} colaborador{rows.length !== 1 ? 'es' : ''}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_160px_180px_160px_140px] border-b border-gray-100 bg-gray-50">
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

          return (
            <div key={r.user?.id} className="border-b border-gray-100 last:border-0">
              <div className="grid grid-cols-[1fr_160px_180px_160px_140px] items-center hover:bg-gray-50 transition-colors">
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
          <div className="grid grid-cols-[1fr_160px_180px_160px_140px] bg-gray-50 border-t-2 border-gray-200">
            <div className="px-4 py-3 text-sm font-bold text-gray-700">
              Total a pagar
              <span className="ml-1 text-[10px] font-normal text-gray-400">(excl. admin)</span>
            </div>
            <div className="px-4 py-3 text-sm font-bold text-right tabular-nums">
              {formatCurrency(rows.filter((r: any) => r.user?.role !== 'admin').reduce((s: number, r: any) => s + r.sellerSales, 0))}
            </div>
            <div className="px-4 py-3 text-sm font-bold text-right tabular-nums">
              {formatCurrency(rows.filter((r: any) => r.user?.role !== 'admin').reduce((s: number, r: any) => s + r.sellerComm, 0))}
            </div>
            <div className="px-4 py-3 text-sm font-bold text-right tabular-nums">
              {formatCurrency(rows.filter((r: any) => r.user?.role !== 'admin').reduce((s: number, r: any) => s + r.projetistaComm, 0))}
            </div>
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
  monthUpload: initialMonthUpload,
  allUsers,
  year,
  month,
}: {
  earnings: Record<string, any>
  payroll: any[]
  monthUpload: { file_url: string; file_name: string } | null
  allUsers: any[]
  year: number
  month: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [monthUpload, setMonthUpload] = useState(initialMonthUpload)
  const [deletingUpload, setDeletingUpload] = useState(false)

  const [localPayroll, setLocalPayroll] = useState<Record<string, any>>(() => {
    const m: Record<string, any> = {}
    for (const p of payroll) if (p.user_id) m[p.user_id] = { ...p }
    return m
  })
  const fileRef = useRef<HTMLInputElement>(null)

  // Exclude admins and known owner accounts from Remuneração
  const collaborators = allUsers.filter((u: any) =>
    u.role !== 'admin' && !ADMIN_NAMES.includes(u.name)
  )

  function matchUser(pdfName: string) {
    return collaborators.find((u: any) => {
      const sys = (u.name ?? '').toUpperCase()
      const pdf = pdfName.toUpperCase()
      return pdf.split(' ').filter((w: string) => w.length > 3).some((w: string) => sys.includes(w))
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(false)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('year', String(year))
      fd.append('month', String(month))

      const res = await fetch('/api/hr/split-receipts', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok || data.error) {
        setUploadError(data.error ?? 'Erro ao processar PDF')
        return
      }

      const errors: string[] = []

      for (const emp of data.employees as any[]) {
        const match = matchUser(emp.name)
        if (!match) {
          errors.push(`Colaborador não encontrado: ${emp.name}`)
          continue
        }
        const entry = {
          user_id: match.id,
          employee_name: emp.name,
          year,
          month,
          liquido: emp.liquido,
          receipt_url: emp.receiptUrl,
        }
        const result = await upsertPayrollEntry(entry)
        if (result && 'error' in result) {
          errors.push(`Erro ao salvar ${emp.name}: ${result.error}`)
          continue
        }
        setLocalPayroll(prev => ({
          ...prev,
          [match.id]: { ...(prev[match.id] ?? {}), ...entry },
        }))
      }

      // Save original file reference for this month
      if (data.originalUrl) {
        const uploadResult = await savePayrollMonthUpload(year, month, data.originalUrl, data.originalName ?? file.name)
        if (!uploadResult || 'error' in uploadResult) {
          errors.push('Aviso: arquivo original não foi registrado')
        } else {
          setMonthUpload({ file_url: data.originalUrl, file_name: data.originalName ?? file.name })
        }
      }

      if (errors.length > 0) {
        setUploadError(errors.join(' | '))
      } else {
        setUploadSuccess(true)
      }

      startTransition(() => router.refresh())
    } catch (err: any) {
      setUploadError(err.message ?? 'Erro inesperado')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteUpload() {
    if (!confirm('Remover o arquivo de recibo deste mês? Os dados de salário importados serão mantidos.')) return
    setDeletingUpload(true)
    try {
      await deletePayrollMonthUpload(year, month)
      setMonthUpload(null)
      startTransition(() => router.refresh())
    } finally {
      setDeletingUpload(false)
    }
  }

  async function handleFieldChange(userId: string, field: string, value: number) {
    const current = localPayroll[userId] ?? {}
    const updated = { ...current, user_id: userId, year, month, [field]: value }
    setLocalPayroll(prev => ({ ...prev, [userId]: updated }))
    const result = await upsertPayrollEntry({ employee_name: updated.employee_name ?? '', ...updated })
    if (result && 'error' in result) {
      // revert
      setLocalPayroll(prev => ({ ...prev, [userId]: current }))
      alert(`Erro ao salvar: ${result.error}`)
    }
  }

  async function handleDeleteRow(userId: string) {
    if (!confirm('Remover os dados de remuneração deste colaborador para este mês?')) return
    await deletePayrollEntry(year, month, userId)
    setLocalPayroll(prev => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }

  const totalSalarios = collaborators.reduce((s, u: any) => s + (localPayroll[u.id]?.liquido ?? 0), 0)
  const totalVT = collaborators.reduce((s, u: any) => s + (localPayroll[u.id]?.vt_next_month ?? 0), 0)
  const totalComissoes = Object.values(earnings)
    .filter((r: any) => r.user?.role !== 'admin' && !ADMIN_NAMES.includes(r.user?.name))
    .reduce((s: number, r: any) => s + (r.total ?? 0), 0)
  const totalGeral = totalSalarios + totalVT + totalComissoes

  // Fixed column widths for proper alignment
  const COLS = 'grid-cols-[1fr_150px_160px_150px_140px_52px]'

  return (
    <div className="space-y-4">
      {/* Upload + arquivo registrado */}
      <div className={cn(
        'bg-white border rounded-xl px-5 py-4',
        uploadSuccess ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200'
      )}>
        {monthUpload ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{monthUpload.file_name}</p>
                <p className="text-xs text-gray-500">Recibo importado para {MONTH_NAMES[month - 1]} {year}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={monthUpload.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-600 hover:underline font-medium"
              >
                Visualizar
              </a>
              <button
                onClick={handleDeleteUpload}
                disabled={deletingUpload}
                className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                title="Remover arquivo"
              >
                <Trash2 className="w-4 h-4" />
                {deletingUpload ? 'Removendo...' : 'Remover'}
              </button>
              <div className="w-px h-5 bg-gray-200" />
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-sm btn-primary py-1.5 px-3 disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Processando...' : 'Substituir'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Importar Recibo de Pagamento (PDF)</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Envie o <strong>Recibo de Pagamento</strong> da contabilidade. O sistema separa automaticamente
                um recibo por colaborador e salva o PDF individual de cada um.
              </p>
              {uploadError && (
                <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
              {uploadSuccess && <p className="text-xs text-emerald-700 mt-2 font-medium">✓ Recibos processados e salvos com sucesso!</p>}
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
        )}
        {uploadError && monthUpload && (
          <div className="flex items-start gap-1.5 mt-3 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total salários (líquido)', value: totalSalarios, color: 'text-blue-700' },
          { label: 'Total V.T. (mês seguinte)', value: totalVT, color: 'text-amber-700' },
          { label: 'Total comissões', value: totalComissoes, color: 'text-violet-700' },
          { label: 'Total geral a pagar', value: totalGeral, color: 'text-emerald-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn('text-xl font-bold mt-0.5', color)}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className={cn('grid border-b border-gray-100 bg-gray-50', COLS)}>
          {['Colaborador', 'Salário (líquido)', 'V.T. mês seguinte', 'Comissão total', 'Total a pagar', ''].map((h, i) => (
            <div key={i} className={cn('px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide', i > 0 && i < 5 && 'text-right')}>{h}</div>
          ))}
        </div>

        {collaborators.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">Nenhum colaborador encontrado</div>
        )}

        {collaborators.map((u: any) => {
          const r = earnings[u.id]
          const p = localPayroll[u.id]
          const comm = r?.total ?? 0
          const liquido = p?.liquido ?? 0
          const vt = p?.vt_next_month ?? 0
          const total = liquido + vt + comm
          const hasData = !!p
          const receiptUrl = p?.receipt_url

          return (
            <div key={u.id} className={cn('grid items-center border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group', COLS)}>
              {/* Colaborador */}
              <div className="px-4 py-3.5 flex items-center gap-3 min-w-0">
                <Avatar user={u} size={32} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                  {!hasData && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                      Sem recibo importado
                    </span>
                  )}
                </div>
              </div>

              {/* Salário líquido — editável */}
              <div className="px-4 py-3.5 text-sm font-semibold text-blue-700">
                <EditableValue value={liquido} onSave={v => handleFieldChange(u.id, 'liquido', v)} />
              </div>

              {/* V.T. mês seguinte — editável */}
              <div className="px-4 py-3.5 text-sm text-amber-700">
                <EditableValue value={vt} onSave={v => handleFieldChange(u.id, 'vt_next_month', v)} />
              </div>

              {/* Comissão — readonly */}
              <div className="px-4 py-3.5 text-sm font-semibold text-violet-700 text-right tabular-nums">
                {comm > 0 ? formatCurrency(comm) : '—'}
              </div>

              {/* Total */}
              <div className="px-4 py-3.5 text-sm font-bold text-emerald-700 text-right tabular-nums">
                {formatCurrency(total)}
              </div>

              {/* Recibo PDF + delete */}
              <div className="px-2 py-3.5 flex items-center justify-center gap-1">
                {receiptUrl ? (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir recibo individual"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-300" title="Sem recibo">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                  </div>
                )}
                {hasData && (
                  <button
                    onClick={() => handleDeleteRow(u.id)}
                    title="Remover dados deste colaborador"
                    className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-7 h-7 rounded text-gray-300 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {collaborators.length > 0 && (
          <div className={cn('grid bg-gray-50 border-t-2 border-gray-200', COLS)}>
            <div className="px-4 py-3 text-sm font-bold text-gray-700">Total</div>
            <div className="px-4 py-3 text-sm font-bold text-blue-700 text-right tabular-nums">{formatCurrency(totalSalarios)}</div>
            <div className="px-4 py-3 text-sm font-bold text-amber-700 text-right tabular-nums">{formatCurrency(totalVT)}</div>
            <div className="px-4 py-3 text-sm font-bold text-violet-700 text-right tabular-nums">{formatCurrency(totalComissoes)}</div>
            <div className="px-4 py-3 text-sm font-bold text-emerald-700 text-right tabular-nums">{formatCurrency(totalGeral)}</div>
            <div className="px-4 py-3" />
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Clique em qualquer valor para editar. Os dados são salvos automaticamente.
        Passe o mouse sobre uma linha para ver a opção de remover.
      </p>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export function HRPage({ earnings, payroll, monthUpload, allUsers, year, month, initialTab }: Props) {
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
      {tab === 'remuneracao' && (
        <RemuneracaoTab
          key={`${year}-${month}`}
          earnings={earnings}
          payroll={payroll}
          monthUpload={monthUpload}
          allUsers={allUsers}
          year={year}
          month={month}
        />
      )}
    </div>
  )
}
