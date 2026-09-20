// Nomes diferentes para a mesma coisa: cada fornecedor escreve de um jeito
// ("Fonte", "Driver", "Drive"…). A busca de tipo expande o que a pessoa digitou
// para o grupo inteiro e avisa quando o fornecedor usa outro nome.
const GROUPS: string[][] = [
  ['fonte', 'driver', 'drive', 'transformador', 'chaveada'],
  ['lampada', 'lamp', 'bulbo'],
  ['dicroica', 'dicroico', 'mr16'],
  ['pendente', 'lustre'],
  ['perfil', 'perfis'],
  ['fita', 'fitas'],
  ['spot', 'spots'],
  ['arandela', 'arandelas'],
  ['espeto', 'espetos'],
  ['plafon', 'plafom'],
]

export const normText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Termos equivalentes ao que foi digitado (inclui o próprio termo).
export function expandTerms(query: string): string[] {
  const tokens = normText(query).split(/\s+/).filter(t => t.length >= 2)
  const out = new Set<string>(tokens)
  for (const t of tokens) {
    for (const g of GROUPS) if (g.some(w => w === t || (t.length >= 3 && w.startsWith(t)))) g.forEach(w => out.add(w))
  }
  return Array.from(out)
}

// O nome do tipo bate com a busca? `viaSynonym` = bateu por sinônimo, não pelo que foi digitado.
export function matchType(name: string, query: string): { match: boolean; viaSynonym: boolean } {
  const q = normText(query).trim()
  if (!q) return { match: true, viaSynonym: false }
  const n = normText(name)
  if (n.includes(q)) return { match: true, viaSynonym: false }
  const terms = expandTerms(query).filter(t => !q.split(/\s+/).includes(t))
  return terms.some(t => n.includes(t)) ? { match: true, viaSynonym: true } : { match: false, viaSynonym: false }
}
