// Cor determinística de avatar de iniciais: o mesmo id/nome sempre cai na
// mesma cor (hash simples -> índice na paleta). Reutilizável pra equipe.

export const AVATAR_PALETTE: { bg: string; text: string }[] = [
  { bg: '#E0E7FF', text: '#3730A3' }, // índigo
  { bg: '#FCE7F3', text: '#9D174D' }, // rosa
  { bg: '#DCFCE7', text: '#166534' }, // verde
  { bg: '#FEF3C7', text: '#92400E' }, // âmbar
  { bg: '#E0F2FE', text: '#075985' }, // azul-céu
  { bg: '#EDE9FE', text: '#5B21B6' }, // violeta
  { bg: '#FFEDD5', text: '#9A3412' }, // laranja
  { bg: '#CCFBF1', text: '#115E59' }, // turquesa
]

export function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  return h
}

export function avatarColor(seed: string | null | undefined): { bg: string; text: string } {
  return AVATAR_PALETTE[hashString(seed || '?') % AVATAR_PALETTE.length]
}
