'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { subscribeCrmMessages } from '@/lib/crm-realtime'
import { getIncomingNotification, type IncomingNotice } from '@/lib/crm-actions'
import { getOpenConversationId } from '@/lib/crm-open-conversation'
import type { NoticeItem } from '@/components/crm/CrmNoticeStack'

const PREF_KEY = 'crm-desktop-notify'

export type NotifyPermission = NotificationPermission | 'unsupported'

// Aviso de mensagem nova atribuída a quem está logado, em qualquer página do sistema:
// notificação do navegador (o banner no canto da tela, como o WhatsApp Web) quando permitida;
// senão, um aviso dentro da página. Não avisa de conversa que já está aberta e à vista.
export function useCrmDesktopNotify(active: boolean) {
  const router = useRouter()
  const [notices, setNotices] = useState<NoticeItem[]>([])
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

  // Mostra o aviso: cartão claro no canto da tela (aba à vista) ou banner do sistema (aba escondida).
  const show = useCallback((info: IncomingNotice) => {
    // "Longe" = outra aba, outra janela ou outro programa na frente: aí vale o banner do sistema,
    // como no WhatsApp Web. Com o sistema à frente, o cartão aparece na própria página.
    const away = typeof document !== 'undefined' && (document.visibilityState === 'hidden' || !document.hasFocus())
    if (away && permissionRef.current === 'granted') {
      try {
        const when = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(info.at))
        const n = new Notification(`${info.title} · ${info.instance_label}`, { body: `${info.body}\n${when}`, icon: info.photo ?? undefined, tag: info.conversation_id })
        n.onclick = () => { window.focus(); routerRef.current.push(`/crm/conversas?c=${info.conversation_id}`); n.close() }
        return
      } catch { /* cai para o cartão na página */ }
    }
    const key = `${info.conversation_id}-${Date.now()}`
    setNotices((cur) => [{ ...info, key }, ...cur.filter((x) => x.conversation_id !== info.conversation_id)].slice(0, 3))
  }, [])

  // Uma vez só (até a pessoa responder): convida a ativar o banner do sistema. O Chrome só deixa
  // pedir a permissão a partir de um clique, por isso o convite é um cartão com botão.
  useEffect(() => {
    if (!active || permission !== 'default') return
    try { if (localStorage.getItem('crm-notify-ask') === '1') return } catch { /* ignore */ }
    const t = setTimeout(() => {
      setNotices((cur) => (cur.some((n) => n.kind === 'ask') ? cur : [{
        conversation_id: '__ask', title: 'Avisos de novas mensagens', body: 'Quer receber o aviso no canto da tela, igual ao WhatsApp Web, mesmo quando estiver em outra aba ou programa?',
        photo: null, instance_label: '', color_index: 0, at: new Date().toISOString(), key: 'ask', kind: 'ask' as const,
      }, ...cur].slice(0, 3)))
    }, 5000)
    return () => clearTimeout(t)
  }, [active, permission])

  const answerAsk = useCallback(async (accept: boolean) => {
    try { localStorage.setItem('crm-notify-ask', '1') } catch { /* ignore */ }
    setNotices((cur) => cur.filter((n) => n.kind !== 'ask'))
    if (accept && typeof Notification !== 'undefined') {
      const p = await Notification.requestPermission()
      setPermission(p); permissionRef.current = p
    }
  }, [])

  const dismiss = useCallback((key: string) => setNotices((cur) => cur.filter((n) => n.key !== key)), [])
  const open = useCallback((n: NoticeItem) => {
    dismiss(n.key)
    if (n.conversation_id !== 'teste') routerRef.current.push(`/crm/conversas?c=${n.conversation_id}`)
  }, [dismiss])

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

  const test = useCallback(() => show({ conversation_id: 'teste', title: 'Aviso de teste', body: 'É assim que as novas mensagens vão aparecer.', photo: null, instance_label: 'Seu WhatsApp', color_index: 0, at: new Date().toISOString() }), [show])

  return { permission, enabled, setEnabled, requestPermission, test, notices, dismiss, open, answerAsk }
}
