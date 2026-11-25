// Estado editável do laboratório CAD e sua forma salva.
// Os objetos do arquivo são referenciados pelo "handle" do CAD (estável), e não
// pela posição na lista — assim um desenho salvo continua certo mesmo se o
// leitor passar a enxergar mais objetos numa versão futura.
import { appendLibBlock, unitName, type CadModel, type LibBlock } from './cad'
import type { PlotInfo } from './cad-plot'

export type M6 = [number, number, number, number, number, number]
/** Especificação de um item do projeto (vai pra contagem e legenda). */
export interface Spec { name: string; mounting: string; power: string; light: string; color: string; rooms?: string /* ambientes digitados; vazio = automático */ }
export interface Shape {
  spec?: Spec
  dash?: boolean // linha de eixo (traço-ponto)
  id: number
  kind: 'line' | 'rect' | 'circle' | 'text' | 'arrow' | 'perfil' | 'fita' | 'fonte' | 'legenda' | 'ambiente'
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
  plot?: PlotInfo // dados do carimbo e área da última plotagem
  unit?: number // metros por unidade do desenho usados neste trabalho
}

/**
 * Reajusta o que foi colocado depois de uma troca de unidade: blocos voltam ao
 * tamanho real (mantendo giro e espelho) e medidas digitadas (espessura,
 * fonte, textos) acompanham a nova unidade. Pontos clicados não mudam.
 */
export function refitSizes(model: CadModel, ed: Edits, libDefs: Map<string, LibBlock>, oldUnit: number): Edits {
  const k = oldUnit / model.unitToMeters
  return {
    ...ed,
    cp: ed.cp.map(c => {
      const o = model.objs[c.src]
      const def = o?.kind === 'LIB' ? libDefs.get(o.name) : undefined
      if (!def) return c
      const [a, b, cc, d, e, f] = c.xf
      const r = def.unitToMeters / model.unitToMeters / (Math.hypot(a, b) || 1)
      return { ...c, xf: [a * r, b * r, cc * r, d * r, e, f] as M6 }
    }),
    shapes: ed.shapes.map(s => {
      if (s.kind === 'perfil' || s.kind === 'fonte') return { ...s, w: (s.w ?? 0) * k }
      if (s.kind === 'text' || s.kind === 'arrow') return { ...s, h: (s.h ?? 0) * k }
      return s
    }),
  }
}

export function serializeState(model: CadModel, ed: Edits, layerVis: boolean[], libDefs: Map<string, LibBlock>, plot?: PlotInfo): SavedState {
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
    plot,
    unit: model.unitToMeters,
  }
}

export function restoreState(base: CadModel, saved: SavedState) {
  const unit = saved.unit ?? base.unitToMeters
  let model: CadModel = unit === base.unitToMeters ? base : { ...base, unitToMeters: unit, unitName: unitName(unit) }
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
  let edits: Edits = { ov, cp, shapes: saved.shapes ?? [], dims: saved.dims ?? [], next: saved.next ?? 1 }
  // trabalho salvo antes da correção de unidade: ajusta o tamanho do que foi colocado
  const antes = base.declaredUnitToMeters
  if (saved.unit === undefined && antes !== undefined && antes !== unit) edits = refitSizes(model, edits, libDefs, antes)
  const hidden = new Set(saved.hidden ?? [])
  const layerVis = model.layers.map(l => !hidden.has(l.name))
  return { model, edits, layerVis, libObj, libDefs, lost }
}
