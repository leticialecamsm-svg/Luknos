// Service worker do Luknos: existe só para exibir os avisos de mensagem do CRM como notificação
// "persistente" do Chrome (o mesmo método do WhatsApp Web) e abrir a conversa ao clicar.
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
