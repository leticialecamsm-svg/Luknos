// "Itens prontos": os itens de um desenho (com especificações, tamanho e giro)
// levados pra outro, pra colocar sem digitar tudo de novo.
import { chaveDoItem, guessSpec, nomePadrao } from './cad-legend'
import type { ItemModelo, SavedState, Spec } from './cad-state'

const br = (n: number) => String(n).replace('.', ',')
// ambientes digitados são daquela planta: não vão junto
const semAmbientes = ({ rooms: _, ...s }: Spec): Spec => s

/** Lê um desenho salvo e devolve um modelo por variação de item (blocos da biblioteca, perfis e fitas). */
export function itensDoDesenho(saved: SavedState | null | undefined): ItemModelo[] {
  if (!saved) return []
  const out = new Map<string, ItemModelo>()
  const libs = new Map((saved.libs ?? []).map(b => [b.name, b]))
  const guardar = (m: ItemModelo) => { if (!out.has(m.key)) out.set(m.key, m) }
  for (const c of saved.cp ?? []) {
    if (!('lib' in c.ref)) continue
    const lib = libs.get(c.ref.lib)
    if (!lib) continue
    const spec = semAmbientes(c.spec ?? guessSpec(lib.name))
    const key = chaveDoItem({ kind: 'bloco', block: lib.name, name: spec.name || lib.name, mounting: spec.mounting, power: spec.power, light: spec.light, color: spec.color })
    // giro, espelho e escala em relação ao tamanho real do bloco (não dependem da unidade do arquivo)
    const [a, b, cc, d] = c.xf
    const base = saved.unit ? lib.unitToMeters / saved.unit : Math.hypot(a, b) || 1
    guardar({ key, kind: 'bloco', nome: spec.name || lib.name, spec, lib, lin: [a / base, b / base, cc / base, d / base] })
  }
  for (const s of saved.shapes ?? []) {
    if (s.kind !== 'perfil' && s.kind !== 'fita') continue
    const spec = semAmbientes(s.spec ?? { name: nomePadrao(s.kind), mounting: '', power: '', light: '', color: s.stroke })
    const tapeColor = s.kind === 'perfil' ? s.tapeColor : undefined
    const key = chaveDoItem({ kind: s.kind, name: spec.name || nomePadrao(s.kind), mounting: spec.mounting, power: s.wm ? `${br(s.wm)} W/m` : '', light: spec.light, color: s.stroke, tapeColor, tapeModel: s.kind === 'perfil' ? spec.tapeModel?.trim() || undefined : undefined })
    guardar({ key, kind: s.kind, nome: spec.name || nomePadrao(s.kind), spec, stroke: s.stroke, tapeColor, wm: s.wm, volt: s.volt, espessura: s.kind === 'perfil' && saved.unit ? (s.w ?? 0) * saved.unit : undefined })
  }
  // o que foi trazido de outro desenho e ainda não foi colocado também pode seguir adiante
  for (const m of saved.modelos ?? []) guardar(m)
  const ordem = { bloco: 0, perfil: 1, fita: 2 }
  return Array.from(out.values()).sort((a, b) => ordem[a.kind] - ordem[b.kind] || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
}
