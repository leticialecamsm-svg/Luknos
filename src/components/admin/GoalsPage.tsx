'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setMonthlyGoal } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, Target, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

interface GoalEntry {
  year: number
  month: number
  goals: { user_id: string | null; target: number }[]
}

interface Props {
  users: any[]
  selectedGoals: any[]
  history: GoalEntry[]
  year: number
  month: number
  isCurrentMonth: boolean
  currentMonthHasGoals: boolean
  currentYear: number
  currentMonth: number
}

function GoalInput({
  defaultValue,
  onSave,
}: {
  defaultValue: number
  onSave: (v: number) => Promise<void>
}) {
  const [value, setValue] = useState(String(defaultValue || ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleBlur() {
    const n = parseFloat(value.replace(/\./g, '').replace(',', '.'))
    if (isNaN(n) || n === defaultValue) return
    setSaving(true)
    await onSave(n)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex items-center gap-1.5">
      {saved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
      {saving && <Clock className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">R$</span>
        <input
          className="w-36 pl-7 pr-2 py-1.5 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={handleBlur}
          placeholder="0"
        />
      </div>
    </div>
  )
}

export function GoalsPage({
  users,
  selectedGoals,
  history,
  year,
  month,
  isCurrentMonth,
  currentMonthHasGoals,
  currentYear,
  currentMonth,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function navigate(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    router.push(`/admin/goals?year=${y}&month=${m}`)
  }

  function goToCurrentMonth() {
    router.push(`/admin/goals?year=${currentYear}&month=${currentMonth}`)
  }

  function getGoal(userId: string | null) {
    return selectedGoals.find((g: any) => g.user_id === userId)?.target ?? 0
  }

  async function handleGoalUpdate(userId: string | null, value: number) {
    await setMonthlyGoal(userId, value, year, month)
    startTransition(() => router.refresh())
  }

  const hasAnyGoalThisMonth = selectedGoals.some((g: any) => g.user_id)
  const showNeedsSetup = isCurrentMonth && !currentMonthHasGoals

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Metas mensais</h1>
          <p className="text-sm text-gray-500">Histórico e configuração de metas por mês</p>
        </div>
      </div>

      {/* Aviso: mês atual sem metas */}
      {showNeedsSetup && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            <p className="font-semibold">Metas de {MONTH_NAMES[currentMonth - 1]} ainda não foram cadastradas.</p>
            <p className="mt-0.5">
              O dashboard está usando metas do mês anterior como referência.{' '}
              <button onClick={goToCurrentMonth} className="underline font-medium">
                Cadastrar agora
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Seletor de mês */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-500" />
            <h2 className="text-sm font-semibold text-gray-700">
              {MONTH_NAMES[month - 1]} {year}
              {isCurrentMonth && (
                <span className="ml-2 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                  MÊS ATUAL
                </span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700">
            <button onClick={() => navigate(-1)} className="hover:text-gray-900 px-1 py-0.5">◀</button>
            <span className="w-32 text-center text-xs">{MONTH_NAMES[month - 1].toUpperCase()} {year}</span>
            <button onClick={() => navigate(1)} className="hover:text-gray-900 px-1 py-0.5">▶</button>
          </div>
        </div>

        {!hasAnyGoalThisMonth && (
          <p className="text-xs text-gray-400 italic">
            Nenhuma meta cadastrada para este mês. Preencha os campos abaixo para salvar.
          </p>
        )}

        {/* Meta da loja */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-brand-50 border border-brand-100">
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">L</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Meta da loja</p>
            <p className="text-xs text-gray-400">Soma de todas as vendas</p>
          </div>
          <GoalInput defaultValue={getGoal(null)} onSave={v => handleGoalUpdate(null, v)} />
        </div>

        {/* Metas por colaborador */}
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
              {u.avatar_url ? (
                <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover shrink-0" alt={u.name} />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                  style={{ backgroundColor: u.avatar_color ?? '#6B7280' }}
                >
                  {getInitials(u.name)}
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-gray-400 capitalize">{u.role}</p>
              </div>
              <GoalInput defaultValue={getGoal(u.id)} onSave={v => handleGoalUpdate(u.id, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Histórico */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Histórico</h2>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {history.map(entry => {
              const isSelected = entry.year === year && entry.month === month
              const storeGoal = entry.goals.find((g: any) => g.user_id === null)?.target ?? 0
              const userGoals = entry.goals.filter((g: any) => g.user_id)
              const isThisCurrentMonth = entry.year === currentYear && entry.month === currentMonth

              return (
                <button
                  key={`${entry.year}-${entry.month}`}
                  onClick={() => router.push(`/admin/goals?year=${entry.year}&month=${entry.month}`)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                    isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
                  )}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {MONTH_NAMES[entry.month - 1]} {entry.year}
                      </p>
                      {isThisCurrentMonth && (
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                          ATUAL
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {userGoals.length} colaborador{userGoals.length !== 1 ? 'es' : ''} com meta
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(storeGoal)}</p>
                    <p className="text-xs text-gray-400">meta da loja</p>
                  </div>
                  <ChevronLeft className={cn(
                    'w-4 h-4 text-gray-400 rotate-180',
                    isSelected && 'text-brand-500'
                  )} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
