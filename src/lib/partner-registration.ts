// Lê a mensagem "CADASTRO DE PARCEIRO" devolvida preenchida pelo arquiteto e separa os campos.
// Tolera pontuação diferente (•, -, *), negrito do WhatsApp, maiúsculas/acentos e endereço em duas linhas.

export interface PartnerRegistration {
  name: string
  cpf: string
  email: string
  pixKey: string
  birthDate: string // AAAA-MM-DD ou '' quando não deu para entender
  address: string
  phone: string
  company: string
}

export const PARTNER_TEMPLATE_RE = /cadastro\s+de\s+parceiro/i

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

type Key = keyof PartnerRegistration
// rótulo (já sem acento, minúsculo) → campo
const LABELS: [RegExp, Key][] = [
  [/^nome( completo)?$/, 'name'],
  [/^cpf$/, 'cpf'],
  [/^e-?mail$/, 'email'],
  [/^chave( pix)?$/, 'pixKey'],
  [/^pix$/, 'pixKey'],
  [/^(data de )?nascimento$/, 'birthDate'],
  [/^data de nasc\.?$/, 'birthDate'],
  [/^endereco( completo)?$/, 'address'],
  [/^(telefone|celular|whatsapp)$/, 'phone'],
  [/^(empresa|escritorio|empresa\s*\/\s*escritorio)$/, 'company'],
]

export function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : raw.trim()
}

// "19/08/1993", "19-8-93", "19 08 1993" → "1993-08-19"
export function parseBirthDate(raw: string): string {
  const m = raw.match(/(\d{1,2})\s*[\/.\-\s]\s*(\d{1,2})\s*[\/.\-\s]\s*(\d{2,4})/)
  if (!m) return ''
  const day = Number(m[1]), month = Number(m[2])
  let year = Number(m[3])
  if (m[3].length === 2) year += year > 30 ? 1900 : 2000
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > new Date().getFullYear()) return ''
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCMonth() !== month - 1) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}


function validCpf(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

// Dados soltos, sem rótulo ("Maria Silva / 040.432.404-57 / maria@x.com / 82 98201-7686 / 23.09.1981 / Rua …"):
// cada linha é reconhecida pelo formato.
function parseLoose(text: string): PartnerRegistration {
  const out: PartnerRegistration = { name: '', cpf: '', email: '', pixKey: '', birthDate: '', address: '', phone: '', company: '' }
  const rest: string[] = []
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/^[\s•·▪●\-–—*>]+/, '').replace(/[*_~]/g, '').trim()
    if (!line || PARTNER_TEMPLATE_RE.test(line)) continue
    const digits = line.replace(/\D/g, '')
    const email = line.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/)?.[0]
    if (email && !out.email) { out.email = email.toLowerCase(); continue }
    if (/^\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}$/.test(line) && !out.birthDate) { out.birthDate = parseBirthDate(line); if (out.birthDate) continue }
    if (/^[\d.\-\s]+$/.test(line) && digits.length === 11 && !out.cpf && (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(line) || validCpf(line))) { out.cpf = formatCpf(line); continue }
    if (/^[\d()+\-\s.]+$/.test(line) && digits.length >= 10 && digits.length <= 13 && !out.phone) { out.phone = line; continue }
    rest.push(line)
  }
  // sobra: nome (linha só com letras) e endereço (linha com números, rua/avenida/CEP…)
  for (const line of rest) {
    const hasDigit = /\d/.test(line)
    if (!hasDigit && !out.name && /[A-Za-zÀ-ÿ]/.test(line) && line.split(/\s+/).length >= 2 && line.length <= 80) out.name = line.replace(/\s+/g, ' ')
    else if ((hasDigit || /\b(rua|r\.|av|avenida|travessa|alameda|rodovia|bairro|cep)\b/i.test(line)) && line.length >= 10) out.address = [out.address, line].filter(Boolean).join(' ').replace(/\s+/g, ' ')
  }
  return out
}

// `replyToTemplate`: a mensagem responde ao nosso modelo "CADASTRO DE PARCEIRO" (o cliente citou o modelo).
export function parsePartnerRegistration(text: string | null | undefined, replyToTemplate = false): PartnerRegistration | null {
  if (!text) return null
  if (!PARTNER_TEMPLATE_RE.test(text)) {
    const r = parseLoose(text)
    // resposta ao modelo: basta nome + mais um dado; fora disso, só com CPF e e-mail juntos (sinal forte de cadastro)
    const extras = [r.cpf, r.email, r.phone, r.birthDate].filter(Boolean).length
    return (replyToTemplate && r.name && extras >= 1) || (r.cpf && r.email && r.name) ? r : null
  }
  const out: PartnerRegistration = { name: '', cpf: '', email: '', pixKey: '', birthDate: '', address: '', phone: '', company: '' }
  let current: Key | null = null
  const raw: Partial<Record<Key, string>> = {}

  for (const lineRaw of text.split(/\r?\n/)) {
    // tira marcadores e a formatação do WhatsApp (*negrito*, _itálico_, ~riscado~)
    const line = lineRaw.replace(/^[\s•·▪●\-–—*>]+/, '').replace(/[*_~]/g, '').trim()
    if (!line || PARTNER_TEMPLATE_RE.test(line)) continue
    const idx = line.indexOf(':')
    if (idx > 0) {
      const label = norm(line.slice(0, idx))
      const hit = LABELS.find(([re]) => re.test(label))
      if (hit) {
        current = hit[1]
        raw[current] = line.slice(idx + 1).trim()
        continue
      }
    }
    // linha sem rótulo: continuação do campo anterior (endereço em duas linhas, nome na linha de baixo)
    if (current && (current === 'address' || !raw[current])) {
      raw[current] = [raw[current], line].filter(Boolean).join(' ')
    }
  }

  out.name = (raw.name ?? '').replace(/\s+/g, ' ').trim()
  out.cpf = formatCpf(raw.cpf ?? '')
  out.email = ((raw.email ?? '').match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/)?.[0] ?? '').toLowerCase()
  out.pixKey = (raw.pixKey ?? '').trim()
  out.birthDate = parseBirthDate(raw.birthDate ?? '')
  out.address = (raw.address ?? '').replace(/\s+/g, ' ').trim()
  out.phone = (raw.phone ?? '').trim()
  out.company = (raw.company ?? '').replace(/\s+/g, ' ').trim()
  return out
}

// A mensagem só vira botão quando o arquiteto de fato preencheu (o modelo em branco que a loja envia não conta).
export function isFilledRegistration(r: PartnerRegistration | null): r is PartnerRegistration {
  return !!r && r.name.length >= 3
}

export function formatBirthDate(iso: string | null | undefined): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
