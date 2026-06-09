import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isToday, isPast, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date.includes('T') ? date : date + 'T00:00:00')
  if (isNaN(d.getTime())) return '—'
  return format(d, "dd/MM/yy", { locale: ptBR })
}

export function formatDateFull(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

export function formatRelative(date: string): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  if (isToday(d)) return 'hoje'
  const diff = differenceInDays(new Date(), d)
  if (diff === 1) return 'ontem'
  if (diff < 7) return `há ${diff} dias`
  return format(d, "dd/MM/yy", { locale: ptBR })
}

export function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false
  return isPast(new Date(deadline + 'T23:59:59'))
}

export function isDueToday(deadline: string | null): boolean {
  if (!deadline) return false
  return isToday(new Date(deadline + 'T00:00:00'))
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

export function getMonthName(month: number): string {
  return format(new Date(2024, month - 1, 1), 'MMMM', { locale: ptBR })
}
