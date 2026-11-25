// Estado editável do laboratório CAD e sua forma salva.
// Os objetos do arquivo são referenciados pelo "handle" do CAD (estável), e não
// pela posição na lista — assim um desenho salvo continua certo mesmo se o
// leitor passar a enxergar mais objetos numa versão futura.
import { appendLibBlock, type CadModel, type LibBlock } from './cad'

export type M6 = [number, number, number, number, number, number]
/** Especificação de um item do projeto (vai pra contagem e legenda). */
export interface Spec { name: string; mounting: string; power: string; light: string; color: string }
export interface Shape {
  spec?: Spec
  id: number
  kind: 'line' | 'rect' | 'circle' | 'text' | 'arrow' | 'perfil' | 'fita' | 'fonte' | 'legenda'
  pts: number[]; stroke: string; fill: string | null
  text?: string; h?: number; rot?: number
  w?: number // espessura do perfil / largura da fonte (unidades do desenho)
  tapeColor?: string // cor da fita dentro do perfil
  wm?: number; volt?: number // fita: potência por metro e tensão
  watts?: number // fonte
  link?: number // fonte: id da fita/perfil que ela alimenta
}
export interface Dim { id: number; ax: number; ay: number; bx: number; by: number; off: number }
export interface Cp { id: number; src: number; xf: M6; attrs?: Record<string, string>; spec?: Spec }
export interface Edits { ov: Record<number, M6 | null>; cp: Cp[]; shapes: Shape[]; dims: Dim[]; next: number }
export const EMPTY_EDITS: Edits = { ov: {}, cp: [], shapes: [], dims: [], next: 1 }

export interface SavedState {
  v: 1
  ov: [string, M6 | null][]
  cp: { id: number; ref: { h: string } | { lib: string }; xf: M6; attrs?: Record<string, string>; spec?: Spec }[]
  shapes: Shape[]
  dims: Dim[]
  next: number
  libs: LibBlock[] // definições usadas, guardadas junto pra não depender da biblioteca
  hidden: string[] // camadas desligadas
}

export function serializeState(model: CadModel, ed: Edits, layerVis: boolean[], libDefs: Map<string, LibBlock>): SavedState {
  const used = new Set<string>()
  const cp: SavedState['cp'] = ed.cp.map(c => {
    const o = model.objs[c.src]
    if (o.kind === 'LIB') used.add(o.name)
    return { id: c.id, ref: o.kind === 'LIB' ? { lib: o.name } : { h: o.h }, xf: c.xf, attrs: c.attrs, spec: c.spec }
  })
  return {
    v: 1,
    ov: Object.entries(ed.ov).map(([i, xf]) => [model.objs[Number(i)].h, xf]),
    cp, shapes: ed.shapes, dims: ed.dims, next: ed.next,
    libs: Array.from(used).map(n => libDefs.get(n)).filter((b): b is LibBlock => !!b),
    hidden: model.layers.filter((_, i) => !layerVis[i]).map(l => l.name),
  }
}

export function restoreState(base: CadModel, saved: SavedState) {
  let model = base
  const libObj = new Map<string, number>()
  const libDefs = new Map<string, LibBlock>()
  for (const b of saved.libs ?? []) {
    const r = appendLibBlock(model, b)
    model = r.model
    libObj.set(b.name, r.obj); libDefs.set(b.name, b)
  }
  const byHandle = new Map<string, number>()
  base.objs.forEach((o, i) => byHandle.set(o.h, i))
  let lost = 0
  const ov: Edits['ov'] = {}
  for (const [h, xf] of saved.ov ?? []) { const i = byHandle.get(h); if (i === undefined) lost++; else ov[i] = xf }
  const cp: Cp[] = []
  for (const c of saved.cp ?? []) {
    const src = 'lib' in c.ref ? libObj.get(c.ref.lib) : byHandle.get(c.ref.h)
    if (src === undefined) lost++; else cp.push({ id: c.id, src, xf: c.xf, attrs: c.attrs, spec: c.spec })
  }
  const edits: Edits = { ov, cp, shapes: saved.shapes ?? [], dims: saved.dims ?? [], next: saved.next ?? 1 }
  const hidden = new Set(saved.hidden ?? [])
  const layerVis = model.layers.map(l => !hidden.has(l.name))
  return { model, edits, layerVis, libObj, libDefs, lost }
}
