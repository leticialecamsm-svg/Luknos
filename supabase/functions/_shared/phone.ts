// Normalização de telefone para casar o remetente do WhatsApp com a whitelist.
// Lida com o "nono dígito" brasileiro (celulares +55 podem vir com ou sem o 9).

export function onlyDigits(raw: string): string {
  return (raw ?? '').replace(/\D/g, '')
}

// Retorna as variações plausíveis de um número (só dígitos), para comparação.
export function phoneVariants(raw: string): string[] {
  const d = onlyDigits(raw)
  const out = new Set<string>()
  if (!d) return []
  out.add(d)

  // Brasil: 55 + DDD(2) + número(8 ou 9)
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) {
    const ddd = d.slice(2, 4)
    const num = d.slice(4)
    if (num.length === 9 && num.startsWith('9')) out.add('55' + ddd + num.slice(1)) // tira o 9
    if (num.length === 8) out.add('55' + ddd + '9' + num) // adiciona o 9
  }
  return [...out]
}

// true se dois números (em qualquer formato) provavelmente são o mesmo.
export function samePhone(a: string, b: string): boolean {
  const av = new Set(phoneVariants(a))
  return phoneVariants(b).some((v) => av.has(v))
}

// Formato E.164 canônico a partir de dígitos (assume BR se vier sem DDI plausível).
export function toE164(raw: string): string | null {
  const d = onlyDigits(raw)
  if (!d) return null
  if (d.length >= 11 && d.length <= 15 && !d.startsWith('0')) return '+' + d
  return null
}
