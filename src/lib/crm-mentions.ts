// Menções em grupo (@pessoa).
// No WhatsApp o texto leva "@<número>" (o número do identificador da pessoa) e a mensagem leva
// a lista dos mencionados; quem lê vê o nome. Aqui o atendente digita/escolhe "@Nome" e a troca
// pelo número acontece só na hora de enviar; ao receber, o número vira o nome de novo.

export interface GroupMember { jid: string; phone: string | null; name: string | null; admin: boolean }
export interface MentionPick { name: string; jid: string }

const userPart = (jid: string) => jid.split('@')[0]

export function memberLabel(m: GroupMember): string {
  return (m.name ?? '').trim() || (m.phone ? `+${m.phone}` : userPart(m.jid))
}

// número (do identificador ou do telefone) → nome, para trocar "@2223…" por "@Fulano" ao exibir
export function buildMentionNames(members: GroupMember[], speakers: { jid: string | null; name: string | null }[] = []): Record<string, string> {
  const map: Record<string, string> = {}
  for (const s of speakers) if (s.jid && s.name) map[userPart(s.jid)] = s.name.trim()
  for (const m of members) {
    const label = memberLabel(m)
    map[userPart(m.jid)] = label
    if (m.phone) map[m.phone] = label
  }
  return map
}

// Troca "@<número>" por "*@Nome*" (negrito) quando o número é conhecido.
export function renderMentions(text: string, names: Record<string, string>): string {
  if (!text || !text.includes('@')) return text
  return text.replace(/@(\d{6,})/g, (all, digits: string) => {
    const name = names[digits]
    return name ? `*@${name.replace(/[*_~`]/g, '')}*` : all
  })
}

// Prepara o texto para enviar: "@Nome" vira "@<número>" e devolve os JIDs mencionados.
export function applyMentionsToSend(text: string, picks: MentionPick[]): { text: string; mentioned: string[]; all: boolean } {
  let out = text
  const mentioned: string[] = []
  const sorted = [...picks].sort((a, b) => b.name.length - a.name.length) // nomes longos primeiro
  for (const p of sorted) {
    const token = `@${p.name}`
    if (!out.includes(token)) continue
    out = out.split(token).join(`@${userPart(p.jid)}`)
    if (!mentioned.includes(p.jid)) mentioned.push(p.jid)
  }
  const all = /(^|\s)@todos\b/i.test(out)
  return { text: out, mentioned, all }
}

// Há um "@algo" sendo digitado logo antes do cursor? (começa no início ou depois de espaço)
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (query.includes('\n') || query.length > 30) return null
  return { start: at, query }
}

// Filtra os membros pelo que foi digitado (sem acento, em qualquer parte do nome ou do telefone).
export function filterMembers(members: GroupMember[], query: string): GroupMember[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(query.trim())
  const list = members.filter((m) => !q || norm(memberLabel(m)).includes(q) || (m.phone ?? '').includes(q.replace(/\D/g, '') || '§'))
  return list.sort((a, b) => memberLabel(a).localeCompare(memberLabel(b), 'pt-BR')).slice(0, 8)
}
