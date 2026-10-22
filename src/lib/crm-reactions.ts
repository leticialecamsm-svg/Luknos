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

// (RegExp com 'u' pelo construtor: o tsconfig ainda mira ES5)
const EMOJI_ONLY = new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Component}|\\p{Regional_Indicator}|\\u200d|\\ufe0f|\\u20e3)+$', 'u')
const EMOJI_ANY = new RegExp('\\p{Extended_Pictographic}|\\p{Regional_Indicator}|\\u20e3', 'u')

// Um único emoji (pode ter tom de pele, bandeira ou junções como 👩‍💻).
export function isSingleEmoji(s: string): boolean {
  if (!s || s.length > 32) return false
  if (!EMOJI_ONLY.test(s) || !EMOJI_ANY.test(s)) return false
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(seg.segment(s)).length === 1
}

// Emoji aceito para reagir: qualquer emoji, ou vazio (tira a reação).
export function isValidReaction(emoji: string): boolean {
  return emoji === '' || isSingleEmoji(emoji)
}

// Seletor de reações: emojis por grupo (os mais usados em atendimento primeiro).
export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Carinhas', emojis: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 🤡 👻 👽 🤖 😺 😸 😹 😻'.split(' ') },
  { label: 'Gestos', emojis: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 🫡 🫠 🫢 🤷 🤦 🙋 🙆 🙅 💁 🙇'.split(' ') },
  { label: 'Corações', emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ❤️‍🔥'.split(' ') },
  { label: 'Comemoração', emojis: '🎉 🎊 🥂 🍾 🎁 🎈 🏆 🥇 ⭐ 🌟 ✨ 💫 🔥 💯 ✅ ☑️ ✔️ ❌ ❗ ❓ ⚠️ 🚀 👀 💡 🕯️ 🔦 🏠 🏡 🛋️ 🛠️ 🔧 🔨 📐 📏 📦 🚚 💰 💵 💳 🧾 📄 📎 📌 📍 🗓️ ⏰ ⌛ 📞 📱 💬 🗨️'.split(' ') },
  { label: 'Natureza', emojis: '☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌈 ❄️ 🌙 🌸 🌹 🌻 🌷 🌱 🌿 🍀 🌵 🐶 🐱 🦋 🐝 ☕ 🍕 🍔 🍰 🎂 🍫 🍷 🍺'.split(' ') },
]
