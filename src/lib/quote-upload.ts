'use client'

import { createClient } from '@/lib/supabase/client'
import { createQuoteAttachmentUpload, confirmQuoteAttachment } from '@/lib/actions'

/**
 * Sobe um anexo de orçamento direto do navegador pro Supabase Storage.
 *
 * O servidor só assina a URL de upload — o arquivo nunca passa por uma server
 * action, que morreria no limite de 1 MB do Next / 4,5 MB da Vercel. Qualquer
 * falha vira `{ error }`, nunca uma exceção solta (era isso que derrubava a
 * página inteira com "Application error").
 */
export async function uploadQuoteFile(quoteId: string, file: File): Promise<{ error?: string }> {
  try {
    const prep = await createQuoteAttachmentUpload({
      quoteId,
      fileName: file.name,
      sizeBytes: file.size,
    })
    if (prep.error) return { error: prep.error }
    if (!prep.path || !prep.token) return { error: 'Não foi possível preparar o envio' }

    const { error: upErr } = await createClient()
      .storage
      .from('quote-attachments')
      .uploadToSignedUrl(prep.path, prep.token, file, {
        contentType: file.type || 'application/octet-stream',
      })
    if (upErr) return { error: upErr.message }

    const done = await confirmQuoteAttachment({
      quoteId,
      storagePath: prep.path,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    })
    if (done.error) return { error: done.error }

    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Falha no envio do arquivo' }
  }
}
