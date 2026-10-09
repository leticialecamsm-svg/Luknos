// Reações rápidas oferecidas no menu da mensagem (as mesmas seis do WhatsApp).
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export interface ReactionRow { emoji: string; from_me: boolean; reactor_name?: string | null }
export interface ReactionChip { emoji: string; count: number; mine: boolean; names: string[] }

// Agrupa as reações de uma mensagem por emoji (mais usados primeiro), marcando a nossa.
export function groupReactions(rows: ReactionRow[]): ReactionChip[] {
  const by = new Map<string, ReactionChip>()
  for (const r of rows) {
    const c = by.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] }
    c.count++
    if (r.from_me) c.mine = true
    else if (r.reactor_name) c.names.push(r.reactor_name)
    by.set(r.emoji, c)
  }
  return Array.from(by.values()).sort((a, b) => b.count - a.count)
}

// Emoji aceito para reagir: um dos rápidos, ou vazio (tira a reação).
export function isValidReaction(emoji: string): boolean {
  return emoji === '' || (QUICK_REACTIONS as readonly string[]).includes(emoji)
}
