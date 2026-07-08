/** Monta o link de WhatsApp a partir do número + mensagem definidos no content.ts */
export function whatsappHref(wa: { number: string; message?: string }) {
  const digits = (wa.number || '').replace(/\D/g, '')
  const text = wa.message ? `?text=${encodeURIComponent(wa.message)}` : ''
  return `https://wa.me/${digits}${text}`
}
