import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildCadModel } from './cad'
import { plotLayout, buildPlotPdf, parseColor, ink, safeText, plotPadrao, trimArea } from './cad-plot'

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
      items: [{ key: 'a', kind: 'bloco', block: 'Vigo', name: 'Vigo', mounting: 'Embutir', power: '3W', light: '3000K', color: '', qty: 2, meters: 0, keys: [], rooms: 'Sala, Cozinha' }],
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
})
