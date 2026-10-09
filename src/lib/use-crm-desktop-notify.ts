'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { subscribeCrmMessages } from '@/lib/crm-realtime'
import { getIncomingNotification, type IncomingNotice } from '@/lib/crm-actions'
import { getOpenConversationId } from '@/lib/crm-open-conversation'
import type { NoticeItem } from '@/components/crm/CrmNoticeStack'

const PREF_KEY = 'crm-desktop-notify'

export type NotifyPermission = NotificationPermission | 'unsupported'

// Banner do Chrome. Preferimos o service worker (notificação "persistente", como o WhatsApp Web):
// é o método que o Chrome no Mac entrega de forma confiável. Se não der, cai no aviso simples da página.
async function showBanner(title: string, options: NotificationOptions, onClick: () => void) {
  try {
    if ('serviceWorker' in navigator) {
      const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready
      await reg.showNotification(title, options)
      return
    }
  } catch { /* tenta o método simples */ }
  try {
    const n = new Notification(title, options)
    n.onclick = () => { onClick(); n.close() }
  } catch { /* sem banner */ }
}

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

  // Mostra o aviso: banner do Chrome (do site Luknos) sempre que a permissão estiver concedida, e o
  // cartão claro dentro da página quando o sistema está à frente. Conversa que já está à vista
  // nem chega aqui (filtrado antes).
  const show = useCallback((info: IncomingNotice) => {
    const away = typeof document !== 'undefined' && (document.visibilityState === 'hidden' || !document.hasFocus())
    if (permissionRef.current === 'granted') {
      const when = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(info.at))
      const title = `${info.title} · ${info.instance_label}`
      const options: NotificationOptions = { body: `${info.body}\n${when}`, icon: info.photo ?? undefined, tag: info.conversation_id, data: { url: `/crm/conversas?c=${info.conversation_id}` } }
      void showBanner(title, options, () => { window.focus(); if (info.conversation_id !== 'teste') routerRef.current.push(`/crm/conversas?c=${info.conversation_id}`) })
      if (away) return // com o sistema escondido só o banner faz sentido
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

  // Clique no banner (vindo do service worker): abre a conversa
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'crm-open' && typeof e.data.url === 'string') routerRef.current.push(e.data.url) }
    navigator.serviceWorker.addEventListener('message', onMsg)
    // já deixa o service worker pronto quando a permissão existe
    if (permissionRef.current === 'granted') navigator.serviceWorker.register('/sw.js').catch(() => {})
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [active, permission])

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
