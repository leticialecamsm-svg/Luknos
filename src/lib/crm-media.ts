import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { driveRootFolderId, findOrCreateFolder, uploadFile } from '@/lib/google-drive'

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
