// Visual compartilhado entre as abas do CRM (Quadro e Conversas) para manter
// as duas com a mesma cara.

// Cor do avatar sem foto, estável por conversa.
export function getAvatarColor(id: string): string {
  const colors = [
    'from-blue-400 to-blue-600',
    'from-green-400 to-green-600',
    'from-purple-400 to-purple-600',
    'from-pink-400 to-pink-600',
    'from-yellow-400 to-yellow-600',
    'from-red-400 to-red-600',
    'from-indigo-400 to-indigo-600',
    'from-cyan-400 to-cyan-600',
  ]
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}
