'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { subscribeCrmMessages } from '@/lib/crm-realtime'
import { getPushPublicKey, savePushSubscription, removePushSubscription, sendMyTestPush, type IncomingNotice } from '@/lib/crm-actions'
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

function urlBase64ToBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// Inscreve este navegador no push (banner do sistema mesmo com o Luknos em segundo plano).
// Devolve true quando o push está ativo.
async function ensurePush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js'))
    await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const key = await getPushPublicKey()
      if (!key) return false
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) as BufferSource })
    }
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    // A inscrição quase nunca muda: grava no servidor só quando é nova ou a cada 24 h
    // (antes era uma chamada a cada abertura de página, na fila das ações).
    const SAVED_KEY = 'crm-push-saved'
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null') as { endpoint: string; at: number } | null
      if (saved?.endpoint === json.endpoint && Date.now() - saved.at < 24 * 3600_000) return true
    } catch { /* sem armazenamento: grava */ }
    const r = await savePushSubscription(json, navigator.userAgent)
    const ok = !('error' in r && r.error)
    if (ok) try { localStorage.setItem(SAVED_KEY, JSON.stringify({ endpoint: json.endpoint, at: Date.now() })) } catch { /* ignore */ }
    return ok
  } catch {
    return false
  }
}

async function dropPush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    try { localStorage.removeItem('crm-push-saved') } catch { /* ignore */ }
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe() }
  } catch { /* ignore */ }
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
  // com o push ativo, o banner do sistema vem pelo service worker (mesmo com a aba congelada);
  // a página só mostra o cartão quando está à frente
  const pushRef = useRef(false)
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
    if (permissionRef.current === 'granted' && !(pushRef.current && info.conversation_id !== 'teste')) {
      const when = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(info.at))
      const title = `WhatsApp ${info.instance_label}`
      const options: NotificationOptions = { body: `• ${info.title} disse:\n  ${info.body}\n${when}`, icon: info.photo ?? undefined, tag: info.conversation_id, data: { url: `/crm/conversas?c=${info.conversation_id}` } }
      void showBanner(title, options, () => { window.focus(); if (info.conversation_id !== 'teste') routerRef.current.push(`/crm/conversas?c=${info.conversation_id}`) })
      if (away) return // com o sistema escondido só o banner faz sentido
    }
    if (pushRef.current && away && info.conversation_id !== 'teste') return // o banner já veio pelo push
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

  // Permissão dada e avisos ligados: inscreve no push (e renova a inscrição a cada abertura).
  useEffect(() => {
    if (!active || permission !== 'granted' || !enabled) return
    let alive = true
    ensurePush().then((ok) => { if (alive) pushRef.current = ok })
    return () => { alive = false }
  }, [active, permission, enabled])

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
      const info = await fetch(`/api/crm/notice?m=${encodeURIComponent(m.id)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<IncomingNotice | null>) : null))
        .catch(() => null)
      if (!info) return
      if (document.visibilityState === 'visible' && getOpenConversationId() === info.conversation_id) return
      showRef.current(info)
    })
  }, [active])

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on); enabledRef.current = on
    try { localStorage.setItem(PREF_KEY, on ? '1' : '0') } catch { /* ignore */ }
    if (!on) { pushRef.current = false; void dropPush() }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPermission(p); permissionRef.current = p
  }, [])

  // Com o push ativo, o teste passa pelo servidor (o mesmo caminho de uma mensagem de verdade).
  const test = useCallback(async () => {
    if (pushRef.current) {
      const r = await sendMyTestPush().catch(() => null)
      if (r && 'sent' in r && r.sent > 0) return
    }
    showLocalTest()
  }, [])
  const showLocalTest = useCallback(() => show({ conversation_id: 'teste', title: 'Aviso de teste', body: 'É assim que as novas mensagens vão aparecer.', photo: null, instance_label: 'Seu WhatsApp', color_index: 0, at: new Date().toISOString() }), [show])

  return { permission, enabled, setEnabled, requestPermission, test, notices, dismiss, open, answerAsk }
}
