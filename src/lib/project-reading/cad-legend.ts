// Itens do projeto (blocos da biblioteca, perfis, fitas e fontes colocados no
// desenho), agrupados por variação, e o desenho da tabela de legenda.
import type { CadModel } from './cad'
import type { Edits, Shape, Spec } from './cad-state'
import { polyLength } from './cad-tape'

export const MONTAGENS = ['', 'Embutir', 'Sobrepor', 'Pendente', 'Arandela', 'Trilho']
export const CORES_LUZ = ['', '2400K', '2700K', '3000K', '4000K', '5000K', '6500K', 'RGB']

export interface Item {
  key: string
  kind: 'bloco' | 'perfil' | 'fita' | 'fonte'
  block?: string
  name: string
  mounting: string
  power: string
  light: string
  color: string // '' = cores originais do bloco
  tapeColor?: string
  thickness?: number // cm (perfil)
  qty: number
  meters: number
  keys: string[] // chaves de seleção no desenho
}

const br = (n: number, d = 2) => n.toFixed(d).replace('.', ',')

/** Especificação sugerida a partir do nome do bloco ("Painel Embutido 18W"). */
export function guessSpec(name: string): Spec {
  const w = /(\d+(?:[.,]\d+)?)\s*w\b/i.exec(name)
  return {
    name, color: '', light: '',
    mounting: /embut/i.test(name) ? 'Embutir' : /sobrep/i.test(name) ? 'Sobrepor' : /pendent/i.test(name) ? 'Pendente' : '',
    power: w ? `${w[1]}W` : '',
  }
}

export function collectItems(model: CadModel, ed: Edits, unitToMeters: number): Item[] {
  const map = new Map<string, Item>()
  const add = (it: Omit<Item, 'key' | 'qty' | 'meters' | 'keys'>, selKey: string, meters = 0) => {
    const key = [it.kind, it.block ?? '', it.name, it.mounting, it.power, it.light, it.color, it.tapeColor ?? '', it.thickness ?? ''].join('|').toLowerCase()
    let cur = map.get(key)
    if (!cur) { cur = { ...it, key, qty: 0, meters: 0, keys: [] }; map.set(key, cur) }
    cur.qty++; cur.meters += meters; cur.keys.push(selKey)
  }
  for (const c of ed.cp) {
    const o = model.objs[c.src]
    if (!o || o.kind !== 'LIB') continue
    const s = c.spec ?? guessSpec(o.name)
    add({ kind: 'bloco', block: o.name, name: s.name || o.name, mounting: s.mounting, power: s.power, light: s.light, color: s.color }, 'c' + c.id)
  }
  for (const s of ed.shapes) {
    if (s.kind === 'perfil' || s.kind === 'fita') {
      const sp = s.spec
      add({
        kind: s.kind, name: sp?.name || (s.kind === 'perfil' ? 'Perfil + Fita' : 'Fita LED'),
        mounting: sp?.mounting ?? '', power: s.wm ? `${String(s.wm).replace('.', ',')} W/m` : '', light: sp?.light ?? '',
        color: s.stroke, tapeColor: s.kind === 'perfil' ? s.tapeColor : undefined,
        thickness: s.kind === 'perfil' ? Math.round((s.w ?? 0) * unitToMeters * 1000) / 10 : undefined,
      }, 's' + s.id, polyLength(s.pts) * unitToMeters)
    } else if (s.kind === 'fonte') {
      const sp = s.spec
      add({ kind: 'fonte', name: sp?.name || 'Fonte', mounting: sp?.mounting ?? '', power: `${s.watts ?? 0}W ${s.volt ?? 12}V`, light: '', color: s.stroke }, 's' + s.id)
    }
  }
  const ordem = { bloco: 0, perfil: 1, fita: 2, fonte: 3 }
  return Array.from(map.values()).sort((a, b) => ordem[a.kind] - ordem[b.kind] || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
}

export const qtyLabel = (it: Item) => (it.kind === 'perfil' || it.kind === 'fita' ? `${br(it.meters)} m (${it.qty} pç)` : `${it.qty} un`)

export function describe(it: Item) {
  const parts = [it.name]
  if (it.kind === 'bloco' && it.block && it.block.toLowerCase() !== it.name.toLowerCase()) parts.push(`(${it.block})`)
  if (it.thickness) parts.push(`${br(it.thickness, 1)} cm`)
  return parts.join(' ')
}

export const LEGEND_HEADERS = ['Símbolo', 'Descrição', 'Instalação', 'Potência', 'Cor da luz', 'Qtd.']
export const legendCells = (it: Item) => [describe(it), it.mounting || '—', it.power || '—', it.light || '—', qtyLabel(it)]

/**
 * Medidas da tabela em unidades do desenho, a partir da altura do texto `h`.
 * A largura das colunas acompanha o maior texto.
 */
export function legendLayout(items: Item[], h: number) {
  const rows = items.map(legendCells)
  const widths = LEGEND_HEADERS.map((head, c) => {
    if (c === 0) return h * 5
    const longest = Math.max(head.length, ...rows.map(r => r[c - 1].length))
    return h * (longest * 0.62 + 1.6)
  })
  const titleH = h * 2.4, headH = h * 2, rowH = h * 3
  const width = widths.reduce((a, b) => a + b, 0)
  const height = titleH + headH + rowH * Math.max(1, rows.length)
  return { rows, widths, titleH, headH, rowH, width, height }
}

/** Cantos da tabela (âncora no canto superior esquerdo). */
export function legendPoly(s: Shape, width: number, height: number): number[] {
  const [x, y] = s.pts
  return [x, y, x + width, y, x + width, y - height, x, y - height]
}
