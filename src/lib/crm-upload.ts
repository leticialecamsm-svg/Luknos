'use client'

import { createClient } from '@/lib/supabase/client'
import { createCrmAttachmentUpload } from '@/lib/crm-actions'

// Sobe um arquivo pra enviar numa conversa do CRM direto do navegador pro
// Storage (mesmo motivo de quote-upload.ts: foge do limite de corpo da
// Vercel/Next). Devolve o storage_path pra sendCrmMessage mandar pra Evolution.
export async function uploadCrmFile(
  conversationId: string,
  file: File,
): Promise<{ error?: string; storagePath?: string }> {
  try {
    const prep = await createCrmAttachmentUpload({
      conversationId,
      fileName: file.name,
      sizeBytes: file.size,
    })
    if (prep.error) return { error: prep.error }
    if (!prep.path || !prep.token) return { error: 'Não foi possível preparar o envio' }

    const { error: upErr } = await createClient()
      .storage
      .from('crm-attachments')
      .uploadToSignedUrl(prep.path, prep.token, file, {
        contentType: file.type || 'application/octet-stream',
      })
    if (upErr) return { error: upErr.message }

    return { storagePath: prep.path }
  } catch (e: any) {
    return { error: e?.message ?? 'Falha no envio do arquivo' }
  }
}
