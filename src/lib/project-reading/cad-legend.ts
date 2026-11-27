// Itens do projeto (blocos da biblioteca, perfis, fitas e fontes colocados no
// desenho), agrupados por variação, e o desenho da tabela de legenda.
import type { CadModel } from './cad'
import type { Edits, Shape, Spec } from './cad-state'
import { tapeMeters } from './cad-tape'
import { roomAt, midOfPath } from './cad-rooms'

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
  qty: number
  meters: number
  keys: string[] // chaves de seleção no desenho
  rooms: string // ambientes onde o item aparece
  tapeModel?: string // modelo da fita dentro do perfil
  porAmbiente: Record<string, { qty: number; meters: number }> // chave '' = fora de ambiente
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

/** O que diferencia uma linha da legenda da outra. */
export const chaveDoItem = (it: Pick<Item, 'kind' | 'block' | 'name' | 'mounting' | 'power' | 'light' | 'color' | 'tapeColor' | 'tapeModel'>) =>
  [it.kind, it.block ?? '', it.name, it.mounting, it.power, it.light, it.color, it.tapeColor ?? '', it.tapeModel ?? ''].join('|').toLowerCase()
export const nomePadrao = (kind: 'perfil' | 'fita') => (kind === 'perfil' ? 'Perfil + Fita' : 'Fita LED')

export function collectItems(model: CadModel, ed: Edits, unitToMeters: number): Item[] {
  const map = new Map<string, Item>()
  const rooms = new Map<string, Set<string>>()
  const add = (it: Omit<Item, 'key' | 'qty' | 'meters' | 'keys' | 'rooms' | 'porAmbiente'>, selKey: string, where: [number, number], typed: string | undefined, meters = 0) => {
    const key = chaveDoItem(it)
    let cur = map.get(key)
    if (!cur) { cur = { ...it, key, qty: 0, meters: 0, keys: [], rooms: '', porAmbiente: {} }; map.set(key, cur); rooms.set(key, new Set()) }
    cur.qty++; cur.meters += meters; cur.keys.push(selKey)
    const names = typed?.trim() ? typed.split(',') : [roomAt(ed.shapes, where[0], where[1])]
    for (const n of names) if (n.trim()) rooms.get(key)!.add(n.trim())
    // vários ambientes digitados no mesmo item não dá pra repartir: ficam como um grupo só
    const grupo = names.map(n => n.trim()).filter(Boolean).join(', ')
    const parte = (cur.porAmbiente[grupo] ??= { qty: 0, meters: 0 })
    parte.qty++; parte.meters += meters
  }
  for (const c of ed.cp) {
    const o = model.objs[c.src]
    if (!o || o.kind !== 'LIB') continue
    const s = c.spec ?? guessSpec(o.name)
    const [x0, y0, x1, y1] = o.bbox, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, m = c.xf
    add({ kind: 'bloco', block: o.name, name: s.name || o.name, mounting: s.mounting, power: s.power, light: s.light, color: s.color }, 'c' + c.id,
      [m[0] * mx + m[2] * my + m[4], m[1] * mx + m[3] * my + m[5]], s.rooms)
  }
  for (const s of ed.shapes) {
    if (s.kind === 'perfil' || s.kind === 'fita') {
      const sp = s.spec
      add({
        kind: s.kind, name: sp?.name || nomePadrao(s.kind),
        mounting: sp?.mounting ?? '', power: s.wm ? `${String(s.wm).replace('.', ',')} W/m` : '', light: sp?.light ?? '',
        color: s.stroke, tapeColor: s.kind === 'perfil' ? s.tapeColor : undefined,
        tapeModel: s.kind === 'perfil' ? sp?.tapeModel?.trim() || undefined : undefined,
      }, 's' + s.id, midOfPath(s.pts), sp?.rooms, tapeMeters(s, unitToMeters))
    } else if (s.kind === 'fonte') {
      const sp = s.spec
      // fonte guardada fora dos ambientes conta no ambiente da fita que ela alimenta
      const fita = ed.shapes.find(x => x.id === s.link)
      const onde: [number, number] = fita && !roomAt(ed.shapes, s.pts[0], s.pts[1]) ? midOfPath(fita.pts) : [s.pts[0], s.pts[1]]
      add({ kind: 'fonte', name: sp?.name || 'Fonte', mounting: sp?.mounting ?? '', power: `${s.watts ?? 0}W ${s.volt ?? 12}V`, light: '', color: s.stroke }, 's' + s.id, onde, sp?.rooms)
    }
  }
  rooms.forEach((set, key) => { map.get(key)!.rooms = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).join(', ') })
  const ordem = { bloco: 0, perfil: 1, fita: 2, fonte: 3 }
  return Array.from(map.values()).sort((a, b) => ordem[a.kind] - ordem[b.kind] || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
}

export const qtyLabel = (it: Item) => (it.kind === 'perfil' || it.kind === 'fita' ? `${br(it.meters)} m (${it.qty} pç)` : `${it.qty} un`)

// o nome digitado vale; o do bloco original e a espessura do perfil não aparecem.
// Na fonte, potência e tensão vão junto do nome ("Fonte 18w 12v").
export function describe(it: Item) {
  if (it.kind !== 'fonte') return it.name
  const faltam = it.power.toLowerCase().split(' ').filter(p => p && !new RegExp(`(^|[^\\d.,])${p.replace(/([wv])$/, '\\s*$1')}(?![a-z])`, 'i').test(it.name))
  return [it.name, ...faltam].join(' ')
}

export const LEGEND_HEADERS = ['Símbolo', 'Descrição', 'Instalação', 'Potência', 'Cor da luz', 'Qtd.', 'Ambientes']
export const legendCells = (it: Item) => [describe(it) + (it.tapeModel ? ` · Fita ${it.tapeModel}` : ''), it.mounting || '—', it.power || '—', it.light || '—', qtyLabel(it), it.rooms || '—']

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
