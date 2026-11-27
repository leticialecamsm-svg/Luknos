import { describe as suite, it, expect } from 'vitest'
import { collectItems, describe, guessSpec, qtyLabel, legendLayout } from './cad-legend'
import { EMPTY_EDITS, serializeState, restoreState, type Edits } from './cad-state'
import { buildCadModel, appendLibBlock, type LibBlock } from './cad'

const vigo: LibBlock = { name: 'Vigo 1 foco', unitToMeters: 1, cols: ['#fff'], segs: [0, 0, 1, 1], segC: [0], texts: [], fills: [], bbox: [0, 0, 1, 1] }
const base = buildCadModel({ header: { INSUNITS: 6 }, tables: { LAYER: { entries: [] }, BLOCK_RECORD: { entries: [{ name: '*Model_Space', entities: [] }] } } })
const { model, obj } = appendLibBlock(base, vigo)
const rosa = { name: 'Vigo', mounting: 'Embutir', power: '3W', light: '3000K', color: '#ff69b4' }

const ed: Edits = {
  ...EMPTY_EDITS, next: 10,
  cp: [
    { id: 1, src: obj, xf: [1, 0, 0, 1, 0, 0], spec: rosa },
    { id: 2, src: obj, xf: [1, 0, 0, 1, 1, 0], spec: { ...rosa } },
    { id: 3, src: obj, xf: [1, 0, 0, 1, 2, 0], spec: { ...rosa, color: '#00ff00', light: '4000K' } },
  ],
  shapes: [
    { id: 4, kind: 'perfil', pts: [0, 0, 2, 0], w: 0.03, wm: 9.6, stroke: '#eee', tapeColor: '#f00', fill: null },
    { id: 5, kind: 'perfil', pts: [0, 1, 1.5, 1], w: 0.03, wm: 9.6, stroke: '#eee', tapeColor: '#f00', fill: null },
    { id: 6, kind: 'fonte', pts: [0, -1], watts: 48, volt: 12, link: 4, stroke: '#0ff', fill: null },
    { id: 7, kind: 'line', pts: [0, 0, 1, 1], stroke: '#fff', fill: null },
  ],
}

suite('itens do projeto e legenda', () => {
  it('soma iguais e separa variações de cor/especificação', () => {
    const items = collectItems(model, ed, 1)
    expect(items).toHaveLength(4)
    expect(items.filter(i => i.kind === 'bloco').map(i => i.qty).sort()).toEqual([1, 2])
    const perfil = items.find(i => i.kind === 'perfil')!
    expect(qtyLabel(perfil)).toBe('3,50 m (2 pç)')
    expect(items.some(i => i.name === 'line')).toBe(false)
    expect(legendLayout(items, 0.1).rows).toHaveLength(4)
  })
  it('sugere instalação e potência pelo nome do bloco', () => {
    expect(guessSpec('Painel Embutido 18W')).toMatchObject({ mounting: 'Embutir', power: '18W' })
    expect(guessSpec('sobrepor painel 24w')).toMatchObject({ mounting: 'Sobrepor', power: '24W' })
  })
  it('especificações sobrevivem a salvar e reabrir', () => {
    const defs = new Map([[vigo.name, vigo]])
    const saved = JSON.parse(JSON.stringify(serializeState(model, ed, model.layers.map(() => true), defs)))
    expect(restoreState(base, saved).edits.cp[0].spec).toEqual(rosa)
  })
})

suite('descrição na legenda', () => {
  it('não mostra a espessura do perfil e junta perfis que só diferem nela', () => {
    const outro: Edits = { ...ed, shapes: ed.shapes.map(s => (s.id === 5 ? { ...s, w: 0.07 } : s)) }
    const perfis = collectItems(model, outro, 1).filter(i => i.kind === 'perfil')
    expect(perfis).toHaveLength(1)
    expect(describe(perfis[0])).toBe('Perfil + Fita')
  })
  it('mostra potência e tensão junto do nome da fonte, sem repetir', () => {
    const fonte = collectItems(model, ed, 1).find(i => i.kind === 'fonte')!
    expect(describe(fonte)).toBe('Fonte 48w 12v')
    expect(describe({ ...fonte, name: 'Fonte 48W' })).toBe('Fonte 48W 12v')
    expect(describe({ ...fonte, name: 'Fonte 148w' })).toBe('Fonte 148w 48w 12v')
  })
})
