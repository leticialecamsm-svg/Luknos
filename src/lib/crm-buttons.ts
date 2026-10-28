// Mensagem de empresa com botões: o webhook guarda o texto e, depois de uma linha em branco,
// um botão por linha ("🔘 Sim", "🔗 Site · https://…", "📞 Ligar · +55…", "📋 Ver opções").
// Aqui separa o texto dos botões para desenhá-los como no WhatsApp.

export interface WaButton {
  kind: 'reply' | 'url' | 'call' | 'list'
  label: string
  value: string | null
}

const KIND: Record<string, WaButton['kind']> = { '🔘': 'reply', '🔗': 'url', '📞': 'call', '📋': 'list' }
const LINE = /^(🔘|🔗|📞|📋) (.+)$/

export function splitButtons(body: string | null): { text: string; buttons: WaButton[] } {
  const src = body ?? ''
  const cut = src.lastIndexOf('\n\n')
  if (cut < 0) return { text: src, buttons: [] }
  const lines = src.slice(cut + 2).split('\n')
  const buttons: WaButton[] = []
  for (const l of lines) {
    const m = l.match(LINE)
    if (!m) return { text: src, buttons: [] }
    const [label, value] = m[2].split(' · ')
    buttons.push({ kind: KIND[m[1]], label: label.trim(), value: value?.trim() || null })
  }
  return { text: src.slice(0, cut).trim(), buttons }
}
