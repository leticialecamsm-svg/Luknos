import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { messagePreview, isGroupJid } from '@/lib/crm-preview'

// Web Push dos avisos do CRM (o mesmo mecanismo do WhatsApp Web): o servidor manda o aviso direto
// para o Chrome de cada atendente, que mostra o banner do sistema (Mac/Windows) mesmo com o Luknos
// em outra aba, minimizado ou com outro programa na frente.
// As chaves VAPID são criadas no primeiro uso e ficam só no banco (internal_cron_secrets).

let vapidCache: { publicKey: string; privateKey: string } | null = null

export async function vapidKeys() {
  if (vapidCache) return vapidCache
  const admin = createAdminClient()
  const read = async () => {
    const { data } = await admin.from('internal_cron_secrets').select('name, secret').in('name', ['vapid-public', 'vapid-private'])
    const pub = data?.find((r) => r.name === 'vapid-public')?.secret
    const priv = data?.find((r) => r.name === 'vapid-private')?.secret
    return pub && priv ? { publicKey: pub as string, privateKey: priv as string } : null
  }
  let keys = await read()
  if (!keys) {
    const k = webpush.generateVAPIDKeys()
    // se duas chamadas criarem ao mesmo tempo, vale a primeira gravada
    await admin.from('internal_cron_secrets').upsert(
      [{ name: 'vapid-public', secret: k.publicKey }, { name: 'vapid-private', secret: k.privateKey }],
      { onConflict: 'name', ignoreDuplicates: true },
    )
    keys = await read()
  }
  if (!keys) throw new Error('Não foi possível preparar as chaves de aviso')
  vapidCache = keys
  return keys
}

export interface CrmPushPayload { title: string; body: string; icon: string | null; tag: string; url: string; at: string }

// Quem recebe: o atendente da conversa e quem tem a conversa compartilhada (como o aviso da tela).
export async function sendCrmMessagePush(messageId: string) {
  const admin = createAdminClient()
  const { data: m } = await admin
    .from('crm_messages')
    .select('id, conversation_id, direction, is_system, deleted_at, message_type, body, file_name, created_at')
    .eq('id', messageId)
    .maybeSingle()
  if (!m || m.direction !== 'inbound' || m.is_system || m.deleted_at) return { sent: 0, skipped: 'not_inbound' }
  const { data: c } = await admin
    .from('crm_conversations')
    .select('id, remote_jid, status, assigned_user_id, contact_name_cache, contact_photo_url, contacts(name), crm_instances(label)')
    .eq('id', m.conversation_id)
    .maybeSingle()
  if (!c || c.status !== 'open' || isGroupJid(c.remote_jid)) return { sent: 0, skipped: 'not_eligible' }

  const { data: shared } = await admin.from('crm_conversation_access').select('user_id').eq('conversation_id', c.id)
  const users = Array.from(new Set([c.assigned_user_id, ...(shared ?? []).map((s) => s.user_id)].filter(Boolean) as string[]))
  if (!users.length) return { sent: 0, skipped: 'no_recipient' }
  const { data: subs } = await admin.from('crm_push_subscriptions').select('endpoint, p256dh, auth').in('user_id', users)
  if (!subs?.length) return { sent: 0, skipped: 'no_subscription' }

  const name = (c as any).contacts?.name ?? c.contact_name_cache ?? c.remote_jid.split('@')[0]
  const preview = messagePreview({ message_type: m.message_type, body: m.body, file_name: m.file_name })
  const when = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(m.created_at))
  const payload: CrmPushPayload = {
    title: `WhatsApp ${(c as any).crm_instances?.label ?? 'WhatsApp'} do Sistema Luknos`,
    body: `• ${name} disse:\n  ${preview.length > 120 ? preview.slice(0, 117) + '…' : preview}\n${when}`,
    icon: c.contact_photo_url ?? null,
    // tag único por mensagem: o macOS só mostra banner do 1º aviso de um mesmo tag
    // (os seguintes ele atualiza em silêncio). Com o id da mensagem, cada uma aparece.
    tag: m.id,
    url: `/crm/conversas?c=${c.id}`,
    at: m.created_at as string,
  }

  const keys = await vapidKeys()
  webpush.setVapidDetails('mailto:comercial@luknoseletrica.com.br', keys.publicKey, keys.privateKey)
  let sent = 0
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' })
      sent++
      await admin.from('crm_push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('endpoint', s.endpoint)
    } catch (e: any) {
      // inscrição vencida (navegador desinstalado, permissão retirada): apaga
      if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('crm_push_subscriptions').delete().eq('endpoint', s.endpoint)
      else console.warn('push falhou', e?.statusCode, String(e?.body ?? e?.message ?? e).slice(0, 200))
    }
  }))
  return { sent }
}

// Aviso de teste para os navegadores da própria pessoa (botão "Testar" no sino).
export async function sendTestPush(userId: string) {
  const admin = createAdminClient()
  const { data: subs } = await admin.from('crm_push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId)
  if (!subs?.length) return { sent: 0 }
  const keys = await vapidKeys()
  webpush.setVapidDetails('mailto:comercial@luknoseletrica.com.br', keys.publicKey, keys.privateKey)
  const payload = { title: 'Aviso de teste · Luknos', body: 'É assim que as novas mensagens vão aparecer, mesmo em outra aba ou programa.', icon: null, tag: `teste-${Date.now()}`, url: '/crm/conversas', at: new Date().toISOString(), test: true }
  let sent = 0
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 600, urgency: 'high' }); sent++ }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('crm_push_subscriptions').delete().eq('endpoint', s.endpoint) }
  }))
  return { sent }
}

// Aviso do monitor (CRM fora do ar, número desconectado, voltou…) para TODA a equipe que ativou os avisos.
// Tag único por aviso: o macOS só mostra banner do 1º aviso de um mesmo tag.
export async function sendHealthPush(title: string, body: string) {
  const admin = createAdminClient()
  const { data: subs } = await admin.from('crm_push_subscriptions').select('endpoint, p256dh, auth')
  if (!subs?.length) return { sent: 0, skipped: 'no_subscription' }
  const keys = await vapidKeys()
  webpush.setVapidDetails('mailto:comercial@luknoseletrica.com.br', keys.publicKey, keys.privateKey)
  const payload = { title, body, icon: null, tag: `saude-${Date.now()}`, url: '/crm/conversas', at: new Date().toISOString() }
  let sent = 0
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' }); sent++ }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('crm_push_subscriptions').delete().eq('endpoint', s.endpoint) }
  }))
  return { sent }
}
