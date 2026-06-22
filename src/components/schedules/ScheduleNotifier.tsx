'use client'

import { useState, useEffect, useRef } from 'react'
import { getSchedules } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Bell, X, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = { visita: 'Visita', reuniao: 'Reunião', follow_up: 'Follow-up' }

// offsets em minutos antes do horário (0 = no momento)
const OFFSETS = [
  { min: 60, label: 'em 1 hora' },
  { min: 10, label: 'em 10 minutos' },
  { min: 5,  label: 'em 5 minutos' },
  { min: 0,  label: 'agora' },
]

interface Notif { id: string; title: string; body: string; at: number }

function fired(key: string) {
  try { return localStorage.getItem('schednotif:' + key) === '1' } catch { return false }
}
function markFired(key: string) {
  try { localStorage.setItem('schednotif:' + key, '1') } catch {}
}

export function ScheduleNotifier() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const schedulesRef = useRef<any[]>([])

  // Carrega/atualiza agendamentos periodicamente
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const data = await getSchedules()
        if (alive) schedulesRef.current = data as any[]
      } catch {}
    }
    load()
    const refetch = setInterval(load, 5 * 60 * 1000) // a cada 5 min
    return () => { alive = false; clearInterval(refetch) }
  }, [])

  // Checa horários a cada 30s
  useEffect(() => {
    function check() {
      const now = Date.now()
      for (const s of schedulesRef.current) {
        if (!s.scheduled_time) continue
        const time = String(s.scheduled_time).slice(0, 5) // HH:MM
        const target = new Date(`${s.scheduled_date}T${time}:00`).getTime()
        if (isNaN(target)) continue
        for (const off of OFFSETS) {
          const fireAt = target - off.min * 60 * 1000
          const delta = now - fireAt
          // dispara se passou do momento há no máximo 90s (janela do poll) e ainda não disparou
          if (delta >= 0 && delta < 90 * 1000) {
            const key = `${s.id}:${off.min}`
            if (fired(key)) continue
            markFired(key)
            const tipo = TYPE_LABEL[s.type] ?? s.type
            const body = `${tipo} · ${time}${s.location ? ' · ' + s.location : ''}`
            toast.info(`${s.title} — ${off.label}`, body)
            setNotifs(prev => [{ id: key, title: `${s.title} — ${off.label}`, body, at: now }, ...prev].slice(0, 30))
          }
        }
      }
    }
    check()
    const timer = setInterval(check, 30 * 1000)
    return () => clearInterval(timer)
  }, [toast])

  const unread = notifs.length

  return (
    <div className="fixed top-4 right-4 z-[60]">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-10 h-10 rounded-full bg-white shadow-md border border-surface-border flex items-center justify-center text-gray-600 hover:text-brand-600 transition-colors"
        title="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-surface-border overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Notificações</span>
            {notifs.length > 0 && (
              <button onClick={() => setNotifs([])} className="text-xs text-gray-400 hover:text-gray-600">Limpar</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                <CalendarClock className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                Nenhuma notificação
              </div>
            ) : (
              notifs.map(n => (
                <div key={n.id + n.at} className="px-4 py-3 border-b border-surface-border last:border-0">
                  <p className="text-sm font-medium text-gray-800">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
