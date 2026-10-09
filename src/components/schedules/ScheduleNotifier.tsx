'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getSchedules } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Bell, X, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCrmAwaiting } from '@/lib/use-crm-awaiting'
import { formatWaiting } from '@/lib/crm-awaiting'
import { useCrmDesktopNotify } from '@/lib/use-crm-desktop-notify'

const TYPE_LABEL: Record<string, string> = { visita: 'Visita', reuniao: 'Reunião', follow_up: 'Follow-up', lembrete: 'Lembrete' }

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

// mode='fixed' → botão flutuante canto superior direito (legado)
// mode='sidebar' → botão embutido na sidebar (legado, a sidebar não tem mais rodapé)
// mode='header' → sino simples no AppHeader, igual ao ScheduleNotifier do Viver de IA
export function ScheduleNotifier({ mode = 'fixed' }: { mode?: 'fixed' | 'sidebar' | 'header' }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const schedulesRef = useRef<any[]>([])

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const data = await getSchedules()
        if (alive) schedulesRef.current = data as any[]
      } catch {}
    }
    load()
    const refetch = setInterval(load, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(refetch) }
  }, [])

  useEffect(() => {
    function check() {
      const now = Date.now()
      for (const s of schedulesRef.current) {
        if (!s.scheduled_time) continue
        const time = String(s.scheduled_time).slice(0, 5)
        const target = new Date(`${s.scheduled_date}T${time}:00`).getTime()
        if (isNaN(target)) continue
        for (const off of OFFSETS) {
          const fireAt = target - off.min * 60 * 1000
          const delta = now - fireAt
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

  // WhatsApp (CRM): conversas aguardando resposta
  const crm = useCrmAwaiting(mode === 'header')
  const crmCount = crm ? crm.mine + crm.unassigned : 0
  const desk = useCrmDesktopNotify(mode === 'header' && !!crm)
  const crmUrgent = crm ? crm.mine_urgent + crm.unassigned_urgent : 0

  // aviso (uma vez por espera) quando uma conversa SUA passa de 3 h sem resposta
  useEffect(() => {
    if (!crm) return
    const fresh = crm.items.filter((i) => i.mine && i.urgent && !fired(`crm:${i.id}:${i.waiting_since}`))
    if (!fresh.length) return
    fresh.forEach((i) => markFired(`crm:${i.id}:${i.waiting_since}`))
    if (fresh.length === 1) toast.error('URGENTE — SEM RESPOSTA', `${fresh[0].name} espera ${formatWaiting(fresh[0].waiting_since).replace('há ', 'há ')} no WhatsApp`)
    else toast.error('URGENTE — SEM RESPOSTA', `${fresh.length} conversas suas esperam há mais de 3 h no WhatsApp`)
  }, [crm, toast])

  // contador no título da aba: "(3) Dashboard"
  useEffect(() => {
    if (mode !== 'header') return
    const prefix = crmCount > 0 ? `(${crmCount}) ` : ''
    const apply = () => {
      const base = document.title.replace(/^\(\d+\)\s/, '')
      if (document.title !== prefix + base) document.title = prefix + base
    }
    apply()
    const el = document.querySelector('title')
    if (!el) return
    const obs = new MutationObserver(apply)
    obs.observe(el, { childList: true, characterData: true, subtree: true })
    return () => { obs.disconnect(); document.title = document.title.replace(/^\(\d+\)\s/, '') }
  }, [mode, crmCount])

  const unread = notifs.length

  if (mode === 'sidebar') {
    return (
      <div className="relative px-3 pb-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2.5 rounded-pill px-3 py-2 text-navy-muted hover:text-navy hover:bg-[rgba(10,31,59,0.03)] transition-colors text-sm"
          title="Notificações"
        >
          <div className="relative">
            <Bell className="w-4 h-4 shrink-0" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
          <span>Notificações</span>
          {unread > 0 && (
            <span className="ml-auto text-[10px] font-bold text-red-400">{unread}</span>
          )}
        </button>

        {open && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-2xl border border-surface-border overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">Notificações</span>
              <div className="flex items-center gap-2">
                {notifs.length > 0 && (
                  <button onClick={() => setNotifs([])} className="text-xs text-gray-400 hover:text-gray-600">Limpar</button>
                )}
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
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

  if (mode === 'header') {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-navy-muted hover:text-navy hover:bg-[rgba(10,31,59,0.04)] transition-colors"
          title="Notificações"
        >
          <Bell className="w-[18px] h-[18px]" />
          {unread + crmCount > 0 && (
            <span className={cn('absolute top-1 right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-white text-[9px] font-bold flex items-center justify-center', crmUrgent > 0 || unread > 0 ? 'bg-red-500' : 'bg-amber-500')}>
              {unread + crmCount > 9 ? '9+' : unread + crmCount}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-surface-border overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
              <span className="text-sm font-semibold text-navy">Notificações</span>
              {notifs.length > 0 && (
                <button onClick={() => setNotifs([])} className="text-xs text-navy-muted hover:text-navy">Limpar</button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {crm && crm.items.length > 0 && (
                <div className="border-b border-surface-border">
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-muted">
                    WhatsApp aguardando resposta
                  </p>
                  {crm.items.slice(0, 8).map((i) => (
                    <Link
                      key={i.id}
                      href={`/crm/conversas?c=${i.id}`}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-2 hover:bg-[rgba(10,31,59,0.04)]"
                    >
                      <p className="flex items-center gap-1.5 text-sm font-medium text-navy">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', i.urgent ? 'bg-red-500' : 'bg-amber-400')} />
                        <span className="truncate">{i.name}</span>
                        <span className={cn('ml-auto shrink-0 text-[11px] font-semibold', i.urgent ? 'text-red-600' : 'text-navy-muted')}>
                          {i.urgent ? 'URGENTE · ' : ''}{formatWaiting(i.waiting_since)}
                        </span>
                      </p>
                      <p className="text-xs text-navy-muted truncate pl-3.5">
                        {i.unanswered > 1 ? `${i.unanswered} mensagens · ` : ''}{i.preview}{!i.mine ? ' · sem atendente' : ''}
                      </p>
                    </Link>
                  ))}
                  {crm.items.length > 8 && (
                    <Link href="/crm/conversas" onClick={() => setOpen(false)} className="block px-4 py-2 text-xs text-navy-muted hover:text-navy">
                      Ver todas ({crmCount})
                    </Link>
                  )}
                </div>
              )}
              {notifs.length === 0 && !(crm && crm.items.length > 0) ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  <CalendarClock className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                  Nenhuma notificação
                </div>
              ) : (
                notifs.map(n => (
                  <div key={n.id + n.at} className="px-4 py-3 border-b border-surface-border last:border-0">
                    <p className="text-sm font-medium text-navy">{n.title}</p>
                    <p className="text-xs text-navy-muted mt-0.5">{n.body}</p>
                  </div>
                ))
              )}
            </div>
            {crm && desk.permission !== 'unsupported' && (
              <div className="border-t border-surface-border px-4 py-3 text-xs text-navy-muted">
                <p className="font-semibold text-navy mb-1">Avisos de novas mensagens</p>
                {desk.permission === 'denied' ? (
                  <p>Bloqueados no navegador. Libere as notificações deste site nas configurações do Chrome para receber o banner no canto da tela.</p>
                ) : (
                  <>
                    <p className="mb-2">Quando chegar mensagem de uma conversa sua, aparece um aviso no canto da tela, em qualquer página do sistema.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {desk.permission === 'default' && (
                        <button onClick={desk.requestPermission} className="px-3 py-1.5 rounded-full bg-navy text-white font-medium hover:opacity-90">Ativar avisos na tela</button>
                      )}
                      <button
                        onClick={() => desk.setEnabled(!desk.enabled)}
                        role="switch"
                        aria-checked={desk.enabled}
                        className={cn('px-3 py-1.5 rounded-full font-medium border', desk.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200')}
                      >
                        {desk.enabled ? 'Avisos ligados' : 'Avisos desligados'}
                      </button>
                      <button onClick={desk.test} className="px-3 py-1.5 rounded-full border border-surface-border hover:bg-[rgba(10,31,59,0.04)]">Testar</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // mode === 'fixed' (legado, não usado mais)
  return (
    <div className="fixed top-4 right-4 z-30">
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
