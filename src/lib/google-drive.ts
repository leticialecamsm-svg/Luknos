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

// Inicia uma sessão de upload resumable e devolve a URL de upload.
// O cliente faz PUT direto nessa URL com o conteúdo do arquivo — contorna
// o limite de 4,5 MB de body das Vercel Functions. A URL já embute a
// autorização, então o browser não precisa de token.
export async function createResumableUploadSession(opts: {
  folderId: string
  name: string
  mimeType: string
  // Site de onde o navegador vai enviar: o Drive só libera (CORS) a resposta
  // final do upload para a origem informada ao criar a sessão.
  origin?: string | null
}): Promise<{ uploadUrl: string }> {
  const token = await getAccessToken()
  const meta = JSON.stringify({ name: opts.name, parents: [opts.folderId] })
  const res = await fetch(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': opts.mimeType,
      ...(opts.origin ? { Origin: opts.origin } : {}),
    },
    body: meta,
  })
  if (!res.ok) throw new Error(`Drive resumable init falhou: ${res.status} ${await res.text()}`)
  const uploadUrl = res.headers.get('Location')
  if (!uploadUrl) throw new Error('Drive não retornou Location')
  return { uploadUrl }
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
// Mesmo nome da subpasta da etapa Orçamento em solicitations/actions (STAGE_FOLDER_NAME.orcamento).
export const ORCAMENTO_SUBFOLDER = 'Orçamento'

export async function syncQuoteFilesToDrive(quoteId: string) {
  const db = createAdminClient()
  const { data: quote } = await db
    .from('quotes')
    .select('id, number, drive_link, client_id, solicitation_id')
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

  // Orçamento ligado a uma solicitação: os anexos ficam na subpasta "Orçamento" da
  // solicitação (a mesma que aparece no card Arquivos da etapa), não soltos na pasta do cliente.
  const uploadFolderId = quote.solicitation_id
    ? (await findOrCreateFolder(ORCAMENTO_SUBFOLDER, folderId)).id
    : folderId

  let synced = 0
  let failed = 0
  for (const f of jobs) {
    try {
      const { data: blob, error } = await db.storage.from(f.bucket).download(f.storage_path)
      if (error || !blob) throw new Error(error?.message ?? 'arquivo não encontrado no storage')
      const up = await uploadFile({
        folderId: uploadFolderId,
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
  return { ok: failed === 0, synced, failed, folder_id: uploadFolderId }
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

export async function copyFile(fileId: string, opts: { folderId: string; name: string }): Promise<{ id: string; webViewLink: string }> {
  const res = await gfetch(`${DRIVE}/files/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true&fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: opts.name, parents: [opts.folderId] }),
  })
  return res.json()
}

// Conteúdo de um arquivo (com Range opcional, para áudio/vídeo em partes). Não lança erro:
// quem chama decide o que fazer com o status.
export async function driveDownload(fileId: string, range?: string | null): Promise<Response> {
  const token = await getAccessToken()
  return fetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
  })
}

// Envio em partes (resumable) para arquivos grandes: abre a sessão e devolve a URL de envio.
export async function driveResumableStart(opts: { folderId: string; name: string; mimeType: string }): Promise<string> {
  const token = await getAccessToken()
  const res = await fetch(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': opts.mimeType },
    body: JSON.stringify({ name: opts.name, parents: [opts.folderId] }),
  })
  const location = res.headers.get('location')
  if (!res.ok || !location) throw new Error(`Drive ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return location
}

// Manda uma parte. `total` só na última (antes disso o tamanho final ainda não é conhecido).
// Partes intermediárias precisam ter tamanho múltiplo de 256 KB.
export async function driveResumablePut(uploadUrl: string, chunk: Uint8Array, start: number, total: number | null): Promise<{ id: string; webViewLink: string } | null> {
  const token = await getAccessToken()
  const end = start + chunk.length - 1
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Range': chunk.length ? `bytes ${start}-${end}/${total ?? '*'}` : `bytes */${total}` },
    body: Buffer.from(chunk),
  })
  if (res.status === 308) return null
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return res.json()
}

export async function driveUpdateMeta(fileId: string, meta: { name?: string; mimeType?: string }): Promise<void> {
  await gfetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  })
}


// ── Mover anexos de orçamento já enviados para a subpasta "Orçamento" ──────────
// Antes, os anexos iam soltos para a pasta do cliente; agora ficam na subpasta
// "Orçamento" da solicitação. Esta rotina leva os antigos para lá.
// `execute=false` só lista (não cria pasta nem move nada).
export interface MoveItem { quote: number; file: string; driveId: string; status: 'a_mover' | 'movido' | 'ja_na_subpasta' | 'em_outro_lugar' | 'nao_encontrado' | 'erro'; detail?: string }

export async function moveQuoteFilesToOrcamento(execute: boolean): Promise<{ items: MoveItem[]; summary: Record<string, number> }> {
  const db = createAdminClient()
  const { data: quotes } = await db.from('quotes').select('id, number, drive_link').not('solicitation_id', 'is', null).not('drive_link', 'is', null)
  const items: MoveItem[] = []

  for (const q of (quotes ?? []) as any[]) {
    const rootId = folderIdFromLink(q.drive_link)
    if (!rootId) continue
    const [{ data: manual }, { data: robot }] = await Promise.all([
      db.from('quote_attachments').select('file_name, drive_file_id').eq('quote_id', q.id).not('drive_file_id', 'is', null),
      db.from('wa_attachments').select('file_name, drive_file_id').eq('system_quote_id', String(q.number)).not('drive_file_id', 'is', null),
    ])
    const files = [...(manual ?? []), ...(robot ?? [])] as { file_name: string; drive_file_id: string }[]
    if (!files.length) continue
    let targetId: string | null = null
    for (const f of files) {
      const item: MoveItem = { quote: q.number, file: f.file_name, driveId: f.drive_file_id, status: 'em_outro_lugar' }
      try {
        const res = await gfetch(`${DRIVE}/files/${encodeURIComponent(f.drive_file_id)}?fields=parents,trashed&supportsAllDrives=true`).catch((e: any) => e)
        if (res instanceof Error) { item.status = /404/.test(res.message) ? 'nao_encontrado' : 'erro'; item.detail = res.message.slice(0, 120); items.push(item); continue }
        const meta = await res.json()
        const parents: string[] = meta.parents ?? []
        if (meta.trashed) { item.status = 'nao_encontrado'; item.detail = 'na lixeira' }
        else if (parents.includes(rootId)) {
          item.status = 'a_mover'
          if (execute) {
            targetId ??= (await findOrCreateFolder(ORCAMENTO_SUBFOLDER, rootId)).id
            await gfetch(`${DRIVE}/files/${encodeURIComponent(f.drive_file_id)}?addParents=${targetId}&removeParents=${rootId}&supportsAllDrives=true&fields=id`, { method: 'PATCH' })
            item.status = 'movido'
          }
        } else if (parents.length) {
          // já está numa subpasta (ex.: já na "Orçamento") ou em outro lugar: não mexe
          item.status = 'ja_na_subpasta'
        }
      } catch (e: any) {
        item.status = 'erro'; item.detail = String(e?.message ?? e).slice(0, 120)
      }
      items.push(item)
    }
  }
  const summary: Record<string, number> = {}
  for (const i of items) summary[i.status] = (summary[i.status] ?? 0) + 1
  return { items, summary }
}
