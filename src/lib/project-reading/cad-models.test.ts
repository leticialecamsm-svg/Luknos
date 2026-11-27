import { describe, it, expect } from 'vitest'
import { itensDoDesenho } from './cad-models'
import { collectItems } from './cad-legend'
import { EMPTY_EDITS, serializeState, restoreState, type Edits } from './cad-state'
import { buildCadModel, appendLibBlock, type LibBlock } from './cad'

const spot: LibBlock = { name: 'Spot', unitToMeters: 1, cols: ['#fff'], segs: [-0.1, -0.1, 0.1, 0.1], segC: [0], texts: [], fills: [], bbox: [-0.1, -0.1, 0.1, 0.1] }
const vazio = (unit: number) => ({ ...buildCadModel({ header: { INSUNITS: 6 }, tables: { LAYER: { entries: [] }, BLOCK_RECORD: { entries: [{ name: '*Model_Space', entities: [] }] } } }), unitToMeters: unit })
const spec = { name: 'Spot PAR20', mounting: 'Embutir', power: '7W', light: '3000K', color: '#ff0000', rooms: 'Sala' }
// origem desenhada em centímetros, com o bloco em 150% e girado 90°
const { model, obj } = appendLibBlock(vazio(0.01), spot)
const ed: Edits = {
  ...EMPTY_EDITS, next: 20,
  cp: [1, 2].map(id => ({ id, src: obj, xf: [0, 150, -150, 0, id * 500, 0] as [number, number, number, number, number, number], spec })),
  shapes: [{ id: 10, kind: 'perfil', pts: [0, 0, 200, 0], w: 3, wm: 9.6, volt: 24, stroke: '#eeeeee', tapeColor: '#ff0000', fill: null, spec: { name: 'Perfil Slim', mounting: '', power: '', light: '3000K', color: '#eeeeee', tapeModel: 'COB' } },
    { id: 11, kind: 'fonte', pts: [0, -10], watts: 48, volt: 24, link: 10, stroke: '#0ff', fill: null }],
}
const salvo = JSON.parse(JSON.stringify(serializeState(model, ed, model.layers.map(() => true), new Map([[spot.name, spot]]))))

describe('itens prontos de outro desenho', () => {
  const modelos = itensDoDesenho(salvo)
  it('traz um por variação, sem fontes nem ambientes', () => {
    expect(modelos.map(m => m.nome)).toEqual(['Spot PAR20', 'Perfil Slim'])
    expect(modelos[0].spec.rooms).toBeUndefined()
    expect(modelos[1]).toMatchObject({ wm: 9.6, volt: 24, tapeColor: '#ff0000' })
    expect(modelos[1].espessura).toBeCloseTo(0.03)
  })
  it('guarda giro e escala sem depender da unidade do arquivo', () => {
    modelos[0].lin!.forEach((v, i) => expect(v).toBeCloseTo([0, 1.5, -1.5, 0][i]))
  })
  it('a chave bate com a do item colocado no desenho de destino', () => {
    const destino = appendLibBlock(vazio(1), spot)
    const novo: Edits = { ...EMPTY_EDITS, next: 3, cp: [{ id: 1, src: destino.obj, xf: [1, 0, 0, 1, 0, 0], spec: modelos[0].spec }],
      shapes: [{ id: 2, kind: 'perfil', pts: [0, 0, 1, 0], w: 0.03, wm: 9.6, stroke: '#eeeeee', tapeColor: '#ff0000', fill: null, spec: modelos[1].spec }] }
    expect(collectItems(destino.model, novo, 1).map(i => i.key)).toEqual(modelos.map(m => m.key))
  })
  it('os itens prontos são salvos com o desenho', () => {
    const base = vazio(1)
    const s = JSON.parse(JSON.stringify(serializeState(base, { ...EMPTY_EDITS, modelos }, [], new Map())))
    expect(restoreState(base, s).edits.modelos).toEqual(modelos)
    expect(itensDoDesenho(s)).toEqual(modelos)
  })
})
