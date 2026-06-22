'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSchedules } from '@/lib/actions'
import { CalendarClock, MapPin, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'

const TYPE_CONFIG: Record<string, { label: string; bg: string; border: string; text: string }> = {
  visita:    { label: 'Visita',    bg: 'bg-blue-50',  border: 'border-l-blue-500',  text: 'text-blue-700' },
  reuniao:   { label: 'Reunião',   bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
  follow_up: { label: 'Follow-up', bg: 'bg-green-50', border: 'border-l-green-500', text: 'text-green-700' },
}

function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DashboardAgenda() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'today' | 'week'>('today')

  useEffect(() => {
    getSchedules().then(d => { setSchedules(d as any[]); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const today = new Date()
  const todayISO = isoOf(today)
  // semana: domingo → sábado
  const weekStart = new Date(today); weekStart.setHours(0,0,0,0); weekStart.setDate(today.getDate() - today.getDay())
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
  const weekStartISO = isoOf(weekStart), weekEndISO = isoOf(weekEnd)

  const sortFn = (a: any, b: any) =>
    a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '')

  const todayList = schedules.filter(s => s.scheduled_date === todayISO).sort(sortFn)
  const weekList = schedules.filter(s => s.scheduled_date >= weekStartISO && s.scheduled_date <= weekEndISO).sort(sortFn)
  const list = tab === 'today' ? todayList : weekList

  function dayLabel(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-brand-500" /> Agenda
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-surface-secondary rounded-lg p-0.5">
            {([['today', `Hoje (${todayList.length})`], ['week', `Semana (${weekList.length})`]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTab(v)}
                className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {label}
              </button>
            ))}
          </div>
          <Link href="/schedules" className="text-gray-300 hover:text-brand-500" title="Ver agenda">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <div className="p-3 max-h-[340px] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
        ) : list.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            {tab === 'today' ? 'Nenhum agendamento hoje' : 'Nenhum agendamento esta semana'}
          </p>
        ) : (
          <div className="space-y-2">
            {list.map(s => {
              const tc = TYPE_CONFIG[s.type] ?? { label: s.type, bg: 'bg-gray-50', border: 'border-l-gray-400', text: 'text-gray-600' }
              return (
                <Link key={s.id} href="/schedules"
                  className={cn('block rounded-lg border-l-4 px-3 py-2 hover:shadow-sm transition-all', tc.bg, tc.border)}>
                  <div className="flex items-center gap-2">
                    {tab === 'week' && <span className="text-[11px] font-semibold text-gray-500 capitalize">{dayLabel(s.scheduled_date)}</span>}
                    {s.scheduled_time && <span className="text-xs font-bold text-gray-800">{String(s.scheduled_time).slice(0,5)}</span>}
                    <span className={cn('text-[10px] font-bold ml-auto', tc.text)}>{tc.label}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{s.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {s.location && <span className="text-xs text-gray-500 flex items-center gap-1 min-w-0 truncate"><MapPin className="w-3 h-3 shrink-0" /> {s.location}</span>}
                    {s.participants?.length > 0 && (
                      <div className="flex -space-x-1 ml-auto">
                        {s.participants.slice(0, 3).map((p: any) => <Avatar key={p.id} user={p} size={18} className="ring-1 ring-white" />)}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
