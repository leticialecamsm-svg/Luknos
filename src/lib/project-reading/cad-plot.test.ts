import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildCadModel } from './cad'
import { plotLayout, buildPlotPdf, parseColor, ink, safeText, plotPadrao, trimArea, LADO_W } from './cad-plot'

describe('plotagem', () => {
  it('escala fixa vale no papel: 10 m em 1/100 ocupam 100 mm', () => {
    const L = plotLayout({ papel: 'A4', escala: 100, legenda: false }, 0, [0, 0, 10, 5], 1)
    expect(10 * L.ptPorUnidade * 25.4 / 72).toBeCloseTo(100)
    expect(L.cabe).toBe(true)
    expect(L.rotuloEscala).toBe('1/100')
  })
  it('avisa quando a área não cabe na escala e ajusta quando escala é livre', () => {
    expect(plotLayout({ papel: 'A4', escala: 25, legenda: false }, 0, [0, 0, 30, 20], 1).cabe).toBe(false)
    const L = plotLayout({ papel: 'A3', escala: 0, legenda: true }, 12, [0, 0, 30, 20], 1)
    expect(L.cabe).toBe(true)
    expect(L.tabelas).toBe(2)
    expect(L.rotuloEscala).toMatch(/^ajustada \(~1\/\d+\)$/)
  })
  it('cores claras viram tinta no papel; coloridas ficam', () => {
    expect(ink(parseColor('#e5e7eb'))).toEqual([0.08, 0.08, 0.08])
    expect(ink(parseColor('#ff69b4'), 'originais')[0]).toBe(1)
    // amarelo escurece mantendo o tom; azul escuro fica como está; P&B é preto
    const [r, g, b] = ink(parseColor('#facc15'))
    expect(0.299 * r + 0.587 * g + 0.114 * b).toBeCloseTo(0.46)
    expect(g / r).toBeCloseTo(204 / 250)
    expect(b).toBeLessThan(r)
    expect(ink(parseColor('#1d4ed8'))).toEqual(parseColor('#1d4ed8'))
    expect(ink(parseColor('#facc15'), 'pb')).toEqual([0.08, 0.08, 0.08])
    expect(safeText('a ≈ ✓ ção')).toBe('a ~ ? ção')
  })
  it('gera um PDF de uma página no tamanho escolhido', async () => {
    const bytes = await buildPlotPdf({
      info: { ...plotPadrao(), papel: 'A3', proprietario: 'Fulano', endereco: 'Rua A\nMaceió' }, area: [0, 0, 10, 8], unitToMeters: 1, logo: null,
      items: [{ key: 'a', kind: 'bloco', block: 'Vigo', name: 'Vigo', mounting: 'Embutir', power: '3W', light: '3000K', color: '', qty: 2, meters: 0, keys: [], rooms: 'Sala, Cozinha', porAmbiente: {} }],
      drawPlan: ctx => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(50, 50); ctx.stroke(); ctx.save(); ctx.translate(10, 10); ctx.rotate(1); ctx.font = '8px sans-serif'; ctx.fillText('oi', 0, 0); ctx.restore(); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(20, 20, 5, 0, 6.28); ctx.fill('evenodd') },
      drawSymbol: () => {},
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getPage(0).getSize()).toEqual({ width: 1191, height: 842 })
  })
  it('tira os códigos de formatação do texto do AutoCAD', () => {
    const m = buildCadModel({ header: {}, tables: { LAYER: { entries: [] }, BLOCK_RECORD: { entries: [{ name: '*Model_Space', entities: [{ type: 'MTEXT', layer: '0', insertionPoint: { x: 0, y: 0 }, textHeight: 1, text: '\\pxqc;Para facilitar\\Pa leitura' }] }] } } })
    expect(m.texts[0].text).toBe('Para facilitar a leitura')
  })
  it('apara o vazio em volta do desenho e amplia a planta quando pedido', () => {
    const caixas: [number, number, number, number][] = [[20, 30, 40, 50], [35, 45, 60, 70], [500, 500, 600, 600]]
    const a = trimArea([0, 0, 100, 100], caixas)
    expect(a[0]).toBeCloseTo(20 - 0.48); expect(a[3]).toBeCloseTo(70 + 0.48)
    expect(trimArea([0, 0, 1, 1], [])).toEqual([0, 0, 1, 1])
    const base = { papel: 'A4' as const, escala: 0, legenda: false }
    expect(plotLayout({ ...base, zoom: 1.5 }, 0, a, 1).ptPorUnidade).toBeCloseTo(plotLayout(base, 0, a, 1).ptPorUnidade * 1.5)
  })
  it('girar a planta de lado aproveita a folha e o desenho continua dentro do quadro', async () => {
    const alta: [number, number, number, number] = [0, 0, 5, 10]
    const base = { papel: 'A4' as const, escala: 0, legenda: false }
    expect(plotLayout({ ...base, giro: 90 }, 0, alta, 1).ptPorUnidade).toBeGreaterThan(plotLayout(base, 0, alta, 1).ptPorUnidade * 1.5)
    for (const giro of [0, 90, 180, 270] as const) {
      const L = plotLayout({ ...base, giro }, 0, alta, 1)
      const cantos: [number, number][] = []
      let quadro: [number, number] = [0, 0]
      await buildPlotPdf({
        info: { ...plotPadrao(), legenda: false, giro }, area: alta, unitToMeters: 1, logo: null, items: [], drawSymbol: () => {},
        drawPlan: (ctx, v, w, h) => {
          quadro = [w, h]
          for (const [x, y] of [[0, 0], [5, 10]]) cantos.push([(x - v.cx) * v.scale + w / 2, h / 2 - (y - v.cy) * v.scale])
        },
      })
      // a área inteira cabe no quadro, que mantém a proporção do desenho em pé
      expect(quadro[0] / quadro[1]).toBeCloseTo(0.5)
      expect(Math.abs(cantos[1][0] - cantos[0][0])).toBeCloseTo(5 * L.ptPorUnidade)
      expect(cantos[0][0]).toBeCloseTo(0); expect(cantos[1][1]).toBeCloseTo(0)
    }
  })
  it('texto de cota segue a direção informada no MTEXT', () => {
    const mt = (extra: object) => ({ type: 'MTEXT', layer: '0', insertionPoint: { x: 0, y: 0 }, textHeight: 1, text: '4,15', ...extra })
    const m = buildCadModel({ header: {}, tables: { LAYER: { entries: [] }, BLOCK_RECORD: { entries: [{ name: '*Model_Space', entities: [mt({ rotation: 0, direction: { x: 0, y: 1 } }), mt({ rotation: 0.5, direction: { x: 1, y: 0 } }), mt({ rotation: 0.25 })] }] } } })
    expect(m.texts.map(t => Number(t.rot.toFixed(4)))).toEqual([1.5708, 0.5, 0.25])
  })
})

describe('legenda no lado direito', () => {
  const quadrada: [number, number, number, number] = [0, 0, 10, 10]
  const base = { papel: 'A4' as const, escala: 0, legenda: true }
  it('dá mais tamanho à planta quadrada e a área dela não invade a legenda', () => {
    const baixo = plotLayout(base, 7, quadrada, 1), lado = plotLayout({ ...base, legendaPos: 'lado' as const }, 7, quadrada, 1)
    expect(lado.ptPorUnidade).toBeGreaterThan(baixo.ptPorUnidade * 1.3)
    expect(lado.tabelas).toBe(0)
    expect(lado.regiao.x + lado.regiao.w).toBeLessThanOrEqual(813.4 - LADO_W - 6)
  })
  it('sem itens ou sem legenda, não reserva a lateral', () => {
    expect(plotLayout({ ...base, legendaPos: 'lado' as const }, 0, quadrada, 1).lateral).toBe(false)
    expect(plotLayout({ ...base, legenda: false, legendaPos: 'lado' as const }, 7, quadrada, 1).lateral).toBe(false)
  })
})
