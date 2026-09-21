import { createAdminClient } from '@/lib/supabase/admin'

// Integração Google Drive (conta Workspace da Luknos, OAuth com refresh token).
// O token fica em google_drive_connection (RLS sem policy: só service role).

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

export function driveRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  if (!id) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID não configurado')
  return id
}

export function googleRedirectUri(origin: string): string {
  return `${origin}/api/google/callback`
}

export function buildAuthUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: googleRedirectUri(origin),
    response_type: 'code',
    scope: `${DRIVE_SCOPE} openid email`,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

export async function exchangeCode(code: string, origin: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: googleRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? 'Falha ao trocar o código')
  return json as { access_token: string; refresh_token?: string; id_token?: string }
}

export function emailFromIdToken(idToken?: string): string | null {
  try {
    if (!idToken) return null
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString())
    return payload.email ?? null
  } catch {
    return null
  }
}

let cached: { token: string; exp: number } | null = null

export async function getAccessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const { data } = await createAdminClient()
    .from('google_drive_connection')
    .select('refresh_token')
    .maybeSingle()
  if (!data?.refresh_token) throw new Error('Google Drive não conectado')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: data.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? 'Falha ao renovar o acesso ao Drive')
  cached = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 }
  return cached.token
}

async function gfetch(url: string, init: RequestInit = {}) {
  const token = await getAccessToken()
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive ${res.status}: ${text.slice(0, 300)}`)
  }
  return res
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export function folderIdFromLink(link: string | null | undefined): string | null {
  const m = String(link ?? '').match(/\/folders\/([\w-]+)/)
  return m ? m[1] : null
}

export async function findOrCreateFolder(name: string, parentId: string): Promise<{ id: string; created: boolean }> {
  const params = new URLSearchParams({
    q: `name = '${q(name)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })
  const found = await (await gfetch(`${DRIVE}/files?${params}`)).json()
  if (found.files?.[0]?.id) return { id: found.files[0].id, created: false }
  const res = await gfetch(`${DRIVE}/files?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  return { id: (await res.json()).id, created: true }
}

export async function uploadFile(opts: {
  folderId: string
  name: string
  mimeType: string
  data: Uint8Array
}): Promise<{ id: string; webViewLink: string }> {
  const boundary = `luknos${Date.now()}`
  const meta = JSON.stringify({ name: opts.name, parents: [opts.folderId] })
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--`)
  const body = Buffer.concat([head, Buffer.from(opts.data), tail])
  const res = await gfetch(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return res.json()
}

export async function trashFile(fileId: string): Promise<void> {
  await gfetch(`${DRIVE}/files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

const FOLDER_ILLEGAL = /[\\/:*?"<>|]+/g

export interface DriveFileItem {
  id: string
  name: string
  mimeType: string
  size: number | null
  createdTime: string
  webViewLink: string
  isFolder: boolean
}

// Conteúdo da pasta do orçamento (espelho exibido na aba Anexos).
export async function listFolderFiles(folderId: string): Promise<DriveFileItem[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size,createdTime,webViewLink)',
    orderBy: 'createdTime',
    pageSize: '200',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })
  const json = await (await gfetch(`${DRIVE}/files?${params}`)).json()
  return (json.files ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : null,
    createdTime: f.createdTime,
    webViewLink: f.webViewLink,
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
  }))
}

export async function isDriveConnected(): Promise<boolean> {
  const { data } = await createAdminClient().from('google_drive_connection').select('id').maybeSingle()
  return !!data
}

// Sobe para a pasta do orçamento no Drive tudo que ainda está só no Supabase
// (anexos do robô e anexos manuais). Cria a pasta (nome do cliente, dentro de
// ORÇAMENTOS) se o orçamento ainda não tem uma. A cópia do Supabase só é apagada
// depois do upload confirmado.
export async function syncQuoteFilesToDrive(quoteId: string) {
  const db = createAdminClient()
  const { data: quote } = await db
    .from('quotes')
    .select('id, number, drive_link, client_id')
    .eq('id', quoteId)
    .maybeSingle()
  if (!quote) return { ok: true, synced: 0, failed: 0, skipped: true }

  const [{ data: robot }, { data: manual }] = await Promise.all([
    db
      .from('wa_attachments')
      .select('id, storage_path, file_name, mime_type')
      .eq('system_quote_id', String(quote.number))
      .is('drive_file_id', null),
    db
      .from('quote_attachments')
      .select('id, storage_path, file_name, mime_type')
      .eq('quote_id', quote.id)
      .is('drive_file_id', null),
  ])
  const jobs = [
    ...(robot ?? []).map((f: any) => ({ ...f, table: 'wa_attachments', bucket: 'wa-attachments' })),
    ...(manual ?? []).map((f: any) => ({ ...f, table: 'quote_attachments', bucket: 'quote-attachments' })),
  ]
  if (!jobs.length) return { ok: true, synced: 0, failed: 0 }

  let folderId = folderIdFromLink(quote.drive_link)
  if (!folderId) {
    // link preenchido que não é pasta do Drive: não mexe, fica local
    if (quote.drive_link?.trim()) return { ok: true, synced: 0, failed: 0, skipped: true }
    const { data: client } = quote.client_id
      ? await db.from('contacts').select('name').eq('id', quote.client_id).maybeSingle()
      : { data: null }
    const clientName = String(client?.name ?? '').replace(FOLDER_ILLEGAL, ' ').trim()
    const folder = await findOrCreateFolder(clientName || `Orçamento ${quote.number}`, driveRootFolderId())
    folderId = folder.id
    await db
      .from('quotes')
      .update({ drive_link: `https://drive.google.com/drive/folders/${folderId}` })
      .eq('id', quote.id)
  }

  let synced = 0
  let failed = 0
  for (const f of jobs) {
    try {
      const { data: blob, error } = await db.storage.from(f.bucket).download(f.storage_path)
      if (error || !blob) throw new Error(error?.message ?? 'arquivo não encontrado no storage')
      const up = await uploadFile({
        folderId,
        name: f.file_name,
        mimeType: f.mime_type || 'application/octet-stream',
        data: new Uint8Array(await blob.arrayBuffer()),
      })
      await db
        .from(f.table)
        .update({
          drive_file_id: up.id,
          drive_web_link: up.webViewLink,
          drive_synced_at: new Date().toISOString(),
          drive_error: null,
          storage_deleted_at: new Date().toISOString(),
        })
        .eq('id', f.id)
      await db.storage.from(f.bucket).remove([f.storage_path])
      synced++
    } catch (e: any) {
      failed++
      await db.from(f.table).update({ drive_error: String(e?.message ?? e).slice(0, 500) }).eq('id', f.id)
    }
  }
  return { ok: failed === 0, synced, failed, folder_id: folderId }
}

export async function syncQuoteAttachmentsToDrive(quoteNumber: number) {
  const { data } = await createAdminClient().from('quotes').select('id').eq('number', quoteNumber).maybeSingle()
  if (!data) {
    await createAdminClient()
      .from('wa_attachments')
      .update({ drive_error: 'quote_not_found' })
      .eq('system_quote_id', String(quoteNumber))
      .is('drive_file_id', null)
    return { ok: true, synced: 0, failed: 0, skipped: true }
  }
  return syncQuoteFilesToDrive(data.id)
}
