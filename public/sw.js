// Service worker do Luknos: recebe os avisos de mensagem do CRM por push (o mesmo método do
// WhatsApp Web) e mostra o banner do sistema — mesmo com o Luknos em outra aba, minimizado ou
// com outro programa na frente. Clicar abre a conversa.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/crm/conversas'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus()
        c.postMessage({ type: 'crm-open', url })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Nova mensagem', body: event.data ? event.data.text() : '' } }
  event.waitUntil((async () => {
    const title = d.title || 'Nova mensagem no CRM'
    const options = {
      body: d.body || '',
      icon: d.icon || undefined,
      tag: d.tag || undefined,
      // mesma conversa: troca o aviso anterior, mas avisa de novo (sem isso o 2º aviso some calado)
      renotify: !!d.tag,
      requireInteraction: false,
      timestamp: d.at ? Date.parse(d.at) : Date.now(),
      data: { url: d.url || '/crm/conversas' },
    }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const focused = wins.some((c) => c.focused && c.visibilityState === 'visible' && c.url.startsWith(self.location.origin))
    await self.registration.showNotification(title, options)
    // Com o Luknos na frente, o aviso aparece dentro da página: tira o banner duplicado.
    if (focused && d.tag && !d.test) {
      const shown = await self.registration.getNotifications({ tag: d.tag })
      shown.forEach((n) => n.close())
    }
  })())
})
