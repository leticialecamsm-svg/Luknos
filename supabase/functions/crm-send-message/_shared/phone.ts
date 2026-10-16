export function onlyDigits(raw: string): string { return (raw ?? '').replace(/\D/g, '') }
export function phoneVariants(raw: string): string[] {
  const d = onlyDigits(raw); const out = new Set<string>(); if (!d) return []; out.add(d)
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) {
    const ddd = d.slice(2, 4), num = d.slice(4)
    if (num.length === 9 && num.startsWith('9')) out.add('55' + ddd + num.slice(1))
    if (num.length === 8) out.add('55' + ddd + '9' + num)
  }
  return [...out]
}
export function samePhone(a: string, b: string): boolean { const av = new Set(phoneVariants(a)); return phoneVariants(b).some((v) => av.has(v)) }
export function toE164(raw: string): string | null { const d = onlyDigits(raw); if (!d) return null; if (d.length >= 11 && d.length <= 15 && !d.startsWith('0')) return '+' + d; return null }
