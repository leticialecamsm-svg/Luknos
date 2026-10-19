import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { driveResumablePut, driveResumableStart, driveRootFolderId, driveUpdateMeta, findOrCreateFolder, trashFile, uploadFile } from '@/lib/google-drive'

// Arquivos do CRM no Google Drive: pasta "CRM WhatsApp/AAAA-MM" dentro da pasta raiz da Luknos.
// Um arquivo com o mesmo conteúdo é guardado uma vez só (os 4 números recebem as mesmas coisas).

const folderCache = new Map<string, string>()

async function monthFolder(date: Date): Promise<string> {
  const month = date.toISOString().slice(0, 7)
  const hit = folderCache.get(month)
  if (hit) return hit
  let base = folderCache.get('base')
  if (!base) {
    base = (await findOrCreateFolder('CRM WhatsApp', driveRootFolderId())).id
    folderCache.set('base', base)
  }
  const id = (await findOrCreateFolder(month, base)).id
  folderCache.set(month, id)
  return id
}

export interface StoredMedia { driveFileId: string; webViewLink: string | null; size: number }

export async function storeCrmMediaInDrive(bytes: Uint8Array, opts: { mimeType: string | null; fileName: string; at?: string | Date }): Promise<StoredMedia> {
  const admin = createAdminClient()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const { data: known } = await admin.from('crm_media_blobs').select('drive_file_id, web_view_link, size').eq('sha256', sha256).maybeSingle()
  if (known) return { driveFileId: known.drive_file_id, webViewLink: known.web_view_link, size: Number(known.size ?? bytes.length) }

  const folderId = await monthFolder(opts.at ? new Date(opts.at) : new Date())
  const safe = opts.fileName.replace(/[\\/:*?"<>|]+/g, '_').slice(-150) || 'arquivo'
  const up = await uploadFile({ folderId, name: `${sha256.slice(0, 8)}-${safe}`, mimeType: opts.mimeType || 'application/octet-stream', data: bytes })
  if (!up?.id) throw new Error('O Drive não confirmou o envio do arquivo')
  await admin.from('crm_media_blobs').upsert(
    { sha256, drive_file_id: up.id, web_view_link: up.webViewLink ?? null, mime_type: opts.mimeType, size: bytes.length },
    { onConflict: 'sha256', ignoreDuplicates: true },
  )
  return { driveFileId: up.id, webViewLink: up.webViewLink ?? null, size: bytes.length }
}

// Mensagem que já tinha o arquivo no Supabase: passa para o Drive e libera o espaço.
// Só apaga do Supabase se nenhuma outra mensagem usar o mesmo arquivo.
export async function offloadMessageToDrive(m: { id: string; storage_path: string; file_name: string | null; mime_type: string | null; created_at: string }): Promise<void> {
  const admin = createAdminClient()
  const { data: blob, error } = await admin.storage.from('crm-attachments').download(m.storage_path)
  if (error || !blob) throw new Error(error?.message ?? 'arquivo não encontrado no Supabase')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const stored = await storeCrmMediaInDrive(bytes, { mimeType: m.mime_type, fileName: m.file_name ?? m.storage_path.split('/').pop() ?? 'arquivo', at: m.created_at })
  await admin.from('crm_messages')
    .update({ drive_file_id: stored.driveFileId, media_size: stored.size, storage_path: null })
    .eq('id', m.id)
  const { count } = await admin.from('crm_messages').select('id', { count: 'exact', head: true }).eq('storage_path', m.storage_path)
  const { count: stickers } = await admin.from('crm_stickers').select('id', { count: 'exact', head: true }).eq('storage_path', m.storage_path)
  if (!count && !stickers) await admin.storage.from('crm-attachments').remove([m.storage_path])
}

// Arquivo grande vindo da Evolution ({ "base64": "...", "mimetype": ..., "fileName": ... }):
// lê a resposta aos poucos, decodifica o base64 em pedaços e manda para o Drive em partes de 8 MB.
// Nunca guarda o arquivo inteiro na memória (um documento grande derrubava a função).
const DRIVE_CHUNK = 8 * 1024 * 1024 // múltiplo de 256 KB, como o Drive exige

export async function streamEvolutionMediaToDrive(body: ReadableStream<Uint8Array>, opts: { fallbackName: string; at?: string | Date }) {
  const folderId = await monthFolder(opts.at ? new Date(opts.at) : new Date())
  const hash = createHash('sha256')
  const decoder = new TextDecoder()
  let outside = ''          // o JSON fora do base64 (pequeno: nome, tipo, tamanho...)
  let inB64 = false
  let doneB64 = false
  let b64rest = ''          // sobra de caracteres que ainda não fecham um grupo de 4
  let pending: Buffer[] = []
  let pendingLen = 0
  let sent = 0
  let uploadUrl: string | null = null
  let result: { id: string; webViewLink: string } | null = null

  const flush = async (final: boolean) => {
    while (pendingLen >= DRIVE_CHUNK || (final && pendingLen >= 0)) {
      const all = Buffer.concat(pending)
      const take = final && all.length <= DRIVE_CHUNK ? all.length : DRIVE_CHUNK
      const piece = all.subarray(0, take)
      const rest = all.subarray(take)
      if (!uploadUrl) uploadUrl = await driveResumableStart({ folderId, name: `${Date.now()}-${opts.fallbackName}`, mimeType: 'application/octet-stream' })
      const isLast = final && rest.length === 0
      const r = await driveResumablePut(uploadUrl, piece, sent, isLast ? sent + piece.length : null)
      sent += piece.length
      pending = rest.length ? [Buffer.from(rest)] : []
      pendingLen = rest.length
      if (isLast) { result = r; break }
    }
  }

  const feedB64 = async (chunk: string) => {
    b64rest += chunk
    const usable = b64rest.length - (b64rest.length % 4)
    if (!usable) return
    const bytes = Buffer.from(b64rest.slice(0, usable), 'base64')
    b64rest = b64rest.slice(usable)
    hash.update(bytes)
    pending.push(bytes); pendingLen += bytes.length
    if (pendingLen >= DRIVE_CHUNK) await flush(false)
  }

  const reader = body.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    let text = done ? decoder.decode() : decoder.decode(value, { stream: true })
    while (text) {
      if (!inB64 && !doneB64) {
        outside += text; text = ''
        const m = /"base64"\s*:\s*"(?:data:[^,"]*,)?/.exec(outside)
        if (m) { text = outside.slice(m.index + m[0].length); outside = outside.slice(0, m.index); inB64 = true }
        else if (outside.length > 200_000) throw new Error('Resposta inesperada da Evolution')
      } else if (inB64) {
        const end = text.indexOf('"')
        if (end < 0) { await feedB64(text); text = '' }
        else { await feedB64(text.slice(0, end)); outside += text.slice(end + 1); text = ''; inB64 = false; doneB64 = true }
      } else { outside += text; text = '' }
    }
    if (done) break
  }

  if (!doneB64) {
    let err = 'O WhatsApp não liberou este arquivo (pode ter expirado). Peça para reenviarem.'
    try { const j = JSON.parse(outside); if (j?.error) err = String(j.error) } catch { /* mantém a mensagem padrão */ }
    throw new Error(err)
  }
  if (b64rest) await feedB64(b64rest.padEnd(b64rest.length + ((4 - (b64rest.length % 4)) % 4), '='))
  await flush(true)
  const uploaded = result as { id: string; webViewLink: string } | null
  if (!uploaded?.id) throw new Error('O Drive não confirmou o envio do arquivo')

  const pick = (k: string) => { const m = new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`).exec(outside); return m ? m[1] : null }
  const mimeType = pick('mimetype')
  const fileName = pick('fileName') ?? opts.fallbackName
  const sha256 = hash.digest('hex')
  const admin = createAdminClient()
  const { data: known } = await admin.from('crm_media_blobs').select('drive_file_id, web_view_link, size').eq('sha256', sha256).maybeSingle()
  if (known) {
    await trashFile(uploaded.id).catch(() => {})
    return { driveFileId: known.drive_file_id as string, webViewLink: known.web_view_link as string | null, size: Number(known.size ?? sent), mimeType, fileName }
  }
  await driveUpdateMeta(uploaded.id, { name: `${sha256.slice(0, 8)}-${fileName.replace(/[\\/:*?"<>|]+/g, '_').slice(-150)}`, ...(mimeType ? { mimeType } : {}) }).catch(() => {})
  await admin.from('crm_media_blobs').upsert(
    { sha256, drive_file_id: uploaded.id, web_view_link: uploaded.webViewLink ?? null, mime_type: mimeType, size: sent },
    { onConflict: 'sha256', ignoreDuplicates: true },
  )
  return { driveFileId: uploaded.id, webViewLink: uploaded.webViewLink ?? null, size: sent, mimeType, fileName }
}

// Busca no WhatsApp (via Evolution) a mídia que ainda não foi baixada, guarda no Drive e
// grava na mensagem. Devolve o id do arquivo no Drive.
export async function fetchCrmMediaToDrive(m: { id: string; file_name: string | null; mime_type: string | null; created_at: string }): Promise<string> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/crm-send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'x-internal-call': '1' },
    body: JSON.stringify({ action: 'fetch_media', message_id: m.id }),
  })
  if (!res.ok || !res.body) throw new Error(`Não foi possível baixar o arquivo (${res.status})`)
  // lido e enviado ao Drive em pedaços: arquivo grande não cabe inteiro na memória
  const stored = await streamEvolutionMediaToDrive(res.body, { fallbackName: m.file_name ?? 'arquivo', at: m.created_at })
  await createAdminClient().from('crm_messages')
    .update({ drive_file_id: stored.driveFileId, media_size: stored.size, mime_type: m.mime_type ?? stored.mimeType, file_name: m.file_name ?? stored.fileName })
    .eq('id', m.id)
  return stored.driveFileId
}
