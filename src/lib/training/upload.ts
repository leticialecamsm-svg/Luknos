'use client'

import { createClient } from '@/lib/supabase/client'
import { createTrainingUpload } from './actions'

// Sobe o arquivo direto do navegador pro bucket 'training' (o servidor só
// assina a URL) — mesmo padrão dos anexos de orçamento.
export async function uploadTrainingFile(trackId: string, file: File): Promise<{ error?: string; path?: string; name?: string }> {
  try {
    const prep = await createTrainingUpload({ trackId, fileName: file.name, sizeBytes: file.size })
    if (prep.error) return { error: prep.error }
    if (!prep.path || !prep.token) return { error: 'Não foi possível preparar o envio' }
    const { error } = await createClient().storage.from('training').uploadToSignedUrl(prep.path, prep.token, file, {
      contentType: file.type || 'application/octet-stream',
    })
    if (error) return { error: error.message }
    return { path: prep.path, name: file.name }
  } catch (e: any) {
    return { error: e?.message ?? 'Falha no envio do arquivo' }
  }
}
