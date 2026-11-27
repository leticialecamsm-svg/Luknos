import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { collectItems } from './cad-legend'
import { resumoPorAmbiente, SEM_AMBIENTE } from './cad-summary'
import { buildPlotPdf, plotPadrao } from './cad-plot'
import { EMPTY_EDITS, type Edits } from './cad-state'
import { buildCadModel, appendLibBlock, type LibBlock } from './cad'

const spot: LibBlock = { name: 'Spot', unitToMeters: 1, cols: ['#fff'], segs: [-0.1, -0.1, 0.1, 0.1], segC: [0], texts: [], fills: [], bbox: [-0.1, -0.1, 0.1, 0.1] }
const base = buildCadModel({ header: { INSUNITS: 6 }, tables: { LAYER: { entries: [] }, BLOCK_RECORD: { entries: [{ name: '*Model_Space', entities: [] }] } } })
const { model, obj } = appendLibBlock(base, spot)
const spec = { name: 'Spot PAR20', mounting: 'Embutir', power: '7W', light: '3000K', color: '' }
const sala = (id: number, text: string, x: number) => ({ id, kind: 'ambiente' as const, pts: [x, 0, x + 10, 0, x + 10, 10, x, 10], text, stroke: '#fff', fill: null })
const ed: Edits = {
  ...EMPTY_EDITS, next: 50,
  cp: [[1, 2], [2, 3], [3, 22], [4, 40]].map(([id, x]) => ({ id, src: obj, xf: [1, 0, 0, 1, x, 5] as [number, number, number, number, number, number], spec })),
  shapes: [
    sala(10, 'Sala', 0), sala(11, 'Cozinha', 20),
    { id: 12, kind: 'perfil', pts: [1, 1, 4, 1], w: 0.03, wm: 9.6, stroke: '#eee', tapeColor: '#f00', fill: null, spec: { ...spec, name: 'Perfil Slim', power: '', tapeModel: 'COB 9,6' } },
    // fonte fora de qualquer ambiente: acompanha a fita que alimenta
    { id: 13, kind: 'fonte', pts: [15, -5], watts: 48, volt: 12, link: 12, stroke: '#0ff', fill: null },
  ],
}

describe('resumo para o orçamentista', () => {
  const items = collectItems(model, ed, 1)
  it('separa as quantidades por ambiente e soma no total', () => {
    const r = resumoPorAmbiente(items)
    expect(r.ambientes.map(a => a.titulo)).toEqual(['Cozinha', 'Sala', SEM_AMBIENTE])
    const de = (t: string) => r.ambientes.find(a => a.titulo === t)!.linhas.map(l => `${l.qtd} ${l.un} ${l.descricao}`)
    expect(de('Cozinha')).toEqual(['1 un Spot PAR20'])
    expect(de('Sala')).toEqual(['2 un Spot PAR20', '3,00 m Perfil Slim', '1 un Fonte 48w 12v'])
    expect(de(SEM_AMBIENTE)).toEqual(['1 un Spot PAR20'])
    expect(r.total.linhas[0]).toMatchObject({ qtd: '4', un: 'un' })
    expect(r.total.linhas[1].detalhe).toBe('Fita COB 9,6: 3,00 m · 1 peça')
  })
  it('só entra no PDF quando escolhido, e quebra em várias folhas se precisar', async () => {
    const paginas = async (resumo: boolean, lista = items) => (await PDFDocument.load(await buildPlotPdf({
      info: { ...plotPadrao(), resumo }, area: [0, 0, 30, 10], unitToMeters: 1, items: lista, logo: null, drawPlan: () => {}, drawSymbol: () => {},
    }))).getPageCount()
    expect(await paginas(false)).toBe(1)
    expect(await paginas(true)).toBe(2)
    const muitos = Array.from({ length: 60 }, (_, i) => ({ ...items[0], key: String(i), name: `Item ${i}` }))
    expect(await paginas(true, muitos)).toBeGreaterThan(2)
  })
})
