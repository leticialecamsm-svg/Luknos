// Cartão de contato recebido/enviado: o robô grava a mensagem como
//   "👤 Contato\nNome · +5582..."   (ou "👤 Contatos" com uma linha por pessoa).
// Mensagens antigas vieram como "👤 Contato: Nome". Devolve null se não for um cartão.
export interface ContactCardPerson { name: string; phone: string | null }

export function parseContactCard(body: string | null | undefined): ContactCardPerson[] | null {
  if (!body || !body.startsWith('👤')) return null
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
  const head = lines[0]
  if (!/^👤\s*Contatos?\b/.test(head)) return null
  const legacy = head.match(/^👤\s*Contatos?:\s*(.+)$/)
  if (legacy) return [{ name: legacy[1].trim(), phone: null }]
  const people = lines.slice(1).map((l) => {
    const [name, phone] = l.split(' · ')
    return { name: (name ?? '').trim(), phone: phone?.trim() || null }
  }).filter((p) => p.name)
  return people.length ? people : null
}

// "+5582993079580" → "+55 82 99307-9580" (aceita o formato brasileiro; senão devolve como veio).
export function prettyPhone(phone: string | null): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  const m = d.match(/^55(\d{2})(9?\d{4})(\d{4})$/)
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : phone
}
