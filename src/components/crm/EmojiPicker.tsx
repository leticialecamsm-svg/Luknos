'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const CATEGORIES: { id: string; icon: string; label: string; emojis: string[] }[] = [
  { id: 'faces', icon: '😀', label: 'Rostos', emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕'.split(' ') },
  { id: 'gestures', icon: '👍', label: 'Gestos', emojis: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 ✍️ 💪 👏 🙌 👐 🤲 🫶 🫡 🫰 🤳 💅'.split(' ') },
  { id: 'hearts', icon: '❤️', label: 'Corações', emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✨ 💫 ⭐ 🌟 💥 💢 💦 💤 🔥 🎉 🎊 🎈 🎁 🏆 🥇'.split(' ') },
  { id: 'work', icon: '💡', label: 'Trabalho', emojis: '💡 🔦 🏮 🕯️ 🛋️ 🪑 🚪 🪟 🏠 🏡 🏢 🏗️ 🧱 🔧 🔨 🛠️ ⚙️ 🔌 🔋 📐 📏 ✏️ 🖊️ 📝 📄 📑 📋 📁 📂 🗂️ 📎 📌 📍 📅 🗓️ ⏰ ⌛ 💻 🖥️ 📱 ☎️ 📞 📧 ✉️ 📦 🚚 🚛 🧾 💰 💵 💳 💲 📊 📈 📉 ✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ ➕ ➖ ➡️ ⬅️ 🔝 🆗 🆕'.split(' ') },
  { id: 'nature', icon: '🌿', label: 'Natureza', emojis: '🌞 🌝 🌙 ⭐ ☁️ ⛅ 🌧️ ⛈️ 🌈 ❄️ 🔥 💧 🌊 🌱 🌿 🍀 🌳 🌴 🌵 🌷 🌹 🌻 🌼 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦋 🐝'.split(' ') },
  { id: 'food', icon: '☕', label: 'Comida', emojis: '☕ 🍵 🍺 🍻 🥂 🍷 🍹 🍾 🧃 🥤 🍎 🍌 🍇 🍓 🍉 🍍 🥭 🍑 🍋 🥑 🍅 🌽 🥕 🍔 🍕 🌭 🥪 🌮 🍟 🍝 🍣 🍰 🎂 🍪 🍫 🍩 🍿'.split(' ') },
]

const RECENT_KEY = 'crm-recent-emojis'

// Seletor de emojis simples (sem dependências): categorias + "recentes".
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState<string>('faces')
  const [recent, setRecent] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')) } catch { /* sem recentes */ }
  }, [])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  function pick(e: string) {
    onPick(e)
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 16)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const list = CATEGORIES.find((c) => c.id === cat)?.emojis ?? []
  return (
    <div ref={ref} role="dialog" aria-label="Emojis" className="absolute bottom-full left-0 mb-2 z-30 w-80 bg-white border border-gray-200 rounded-xl shadow-xl">
      <div className="flex border-b border-gray-100 px-1" role="tablist">
        {CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} title={c.label} aria-label={c.label} onClick={() => setCat(c.id)}
            className={cn('flex-1 py-2 text-lg rounded-t-lg border-b-2', cat === c.id ? 'border-gray-900' : 'border-transparent opacity-60 hover:opacity-100')}>
            {c.icon}
          </button>
        ))}
      </div>
      {recent.length > 0 && cat === 'faces' && (
        <div className="px-2 pt-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Recentes</p>
          <div className="flex flex-wrap">{recent.map((e) => <EmojiBtn key={'r' + e} e={e} onPick={pick} />)}</div>
        </div>
      )}
      <div className="p-2 h-48 overflow-y-auto">
        <div className="flex flex-wrap">{list.map((e) => <EmojiBtn key={e} e={e} onPick={pick} />)}</div>
      </div>
    </div>
  )
}

function EmojiBtn({ e, onPick }: { e: string; onPick: (e: string) => void }) {
  return <button type="button" onClick={() => onPick(e)} className="w-9 h-9 text-xl rounded-lg hover:bg-gray-100 flex items-center justify-center">{e}</button>
}
