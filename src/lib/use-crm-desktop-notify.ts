'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { subscribeCrmMessages } from '@/lib/crm-realtime'
import { getIncomingNotification, type IncomingNotice } from '@/lib/crm-actions'
import { getOpenConversationId } from '@/lib/crm-open-conversation'
import { useToast } from '@/components/ui/Toast'

const PREF_KEY = 'crm-desktop-notify'

export type NotifyPermission = NotificationPermission | 'unsupported'

// Aviso de mensagem nova atribuída a quem está logado, em qualquer página do sistema:
// notificação do navegador (o banner no canto da tela, como o WhatsApp Web) quando permitida;
// senão, um aviso dentro da página. Não avisa de conversa que já está aberta e à vista.
export function useCrmDesktopNotify(active: boolean) {
  const router = useRouter()
  const toast = useToast()
  const [permission, setPermission] = useState<NotifyPermission>('default')
  const [enabled, setEnabledState] = useState(true)
  const enabledRef = useRef(true)
  const permissionRef = useRef<NotifyPermission>('default')
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    if (typeof Notification === 'undefined') { setPermission('unsupported'); permissionRef.current = 'unsupported'; return }
    setPermission(Notification.permission); permissionRef.current = Notification.permission
    try {
      const on = localStorage.getItem(PREF_KEY) !== '0'
      setEnabledState(on); enabledRef.current = on
    } catch { /* ignore */ }
  }, [])

  // Uma vez só: lembra de ativar o banner do sistema (precisa de um clique do usuário).
  useEffect(() => {
    if (!active || permission !== 'default') return
    try {
      if (localStorage.getItem('crm-notify-hint') === '1') return
      const t = setTimeout(() => {
        toast.info('AVISOS DE MENSAGENS', 'Clique no sino para ativar os avisos no canto da tela')
        try { localStorage.setItem('crm-notify-hint', '1') } catch { /* ignore */ }
      }, 6000)
      return () => clearTimeout(t)
    } catch { /* ignore */ }
  }, [active, permission, toast])

  const show = useCallback((info: IncomingNotice) => {
    if (permissionRef.current === 'granted') {
      try {
        const n = new Notification(info.title, { body: info.body, icon: info.photo ?? undefined, tag: info.conversation_id })
        n.onclick = () => { window.focus(); routerRef.current.push(`/crm/conversas?c=${info.conversation_id}`); n.close() }
        return
      } catch { /* cai para o aviso na página */ }
    }
    toast.info(info.title, info.body)
  }, [toast])

  // "show" fica numa ref: se ele mudasse a cada renderização, o canal seria refeito toda hora.
  const showRef = useRef(show)
  showRef.current = show

  useEffect(() => {
    if (!active) return
    const seen = new Set<string>()
    return subscribeCrmMessages('crm:notify', 'INSERT', async (payload) => {
      const m = payload.new as { id: string; direction: string; is_system: boolean } | null
      if (!m || m.direction !== 'inbound' || m.is_system || seen.has(m.id) || !enabledRef.current) return
      seen.add(m.id)
      const info = await getIncomingNotification(m.id).catch(() => null)
      if (!info) return
      if (document.visibilityState === 'visible' && getOpenConversationId() === info.conversation_id) return
      showRef.current(info)
    })
  }, [active])

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on); enabledRef.current = on
    try { localStorage.setItem(PREF_KEY, on ? '1' : '0') } catch { /* ignore */ }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPermission(p); permissionRef.current = p
  }, [])

  const test = useCallback(() => show({ conversation_id: 'teste', title: 'Aviso de teste', body: 'É assim que as novas mensagens vão aparecer.', photo: null }), [show])

  return { permission, enabled, setEnabled, requestPermission, test }
}
