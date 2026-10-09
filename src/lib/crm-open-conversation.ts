// Qual conversa está aberta na tela do CRM agora (para não avisar de algo que já está à vista).
type W = Window & { __crmOpenConv?: string | null }

export function setOpenConversationId(id: string | null) {
  if (typeof window !== 'undefined') (window as W).__crmOpenConv = id
}
export function getOpenConversationId(): string | null {
  return typeof window !== 'undefined' ? (window as W).__crmOpenConv ?? null : null
}
