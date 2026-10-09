'use client'

// Prepara uma imagem para virar figurinha do WhatsApp: 512×512, fundo transparente, .webp.
// Um .webp que já é pequeno é mantido como está (preserva figurinha animada).
export async function toStickerBlob(file: File): Promise<Blob> {
  if (file.type === 'image/webp' && file.size <= 700 * 1024) return file
  const bmp = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu preparar a imagem')
  const scale = Math.min(512 / bmp.width, 512 / bmp.height)
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  ctx.drawImage(bmp, Math.round((512 - w) / 2), Math.round((512 - h) / 2), w, h)
  bmp.close?.()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.9))
  if (!blob) throw new Error('Não foi possível converter a imagem')
  return blob
}
