// Plotagem em PDF do laboratório CAD, no padrão das pranchas da Luknos:
// planta (vetor) + legenda + carimbo. Todas as medidas do layout estão em
// pontos numa folha A4 deitada (842 × 595) e escalam juntas nas folhas maiores.
import { PDFDocument, PDFFont, PDFPage, PDFOperator, PDFOperatorNames as Op, StandardFonts, degrees, rgb, moveTo, lineTo, closePath, stroke, fill, setFillingRgbColor, setStrokingRgbColor, setLineWidth, setDashPattern, pushGraphicsState, popGraphicsState, setGraphicsState, setLineCap, LineCapStyle, rectangle, clip, endPath } from 'pdf-lib'
import type { Item } from './cad-legend'
import { describe, qtyLabel } from './cad-legend'

export const PAPEIS = { A4: [842, 595], A3: [1191, 842], A2: [1684, 1191], A1: [2384, 1684] } as const
export type Papel = keyof typeof PAPEIS
export const ESCALAS = [0, 25, 50, 75, 100, 125, 200] // 0 = ajustar à folha

export interface PlotInfo {
  endereco: string; proprietario: string; escritorio: string; data: string
  pavimento: string; desenho: string
  papel: Papel; escala: number; legenda: boolean
  area?: [number, number, number, number] // x0, y0, x1, y1 no desenho
}
export const plotPadrao = (): PlotInfo => ({
  endereco: '', proprietario: '', escritorio: '', data: new Date().toLocaleDateString('pt-BR'),
  pavimento: 'TÉRREO', desenho: '01/01', papel: 'A4', escala: 0, legenda: true,
})

const EMPRESA = ['Av. Menino Marcelo, 7737A - Serraria, Maceió - AL,', '57046-000 |', '82 9117-9279 | comercial@luknoseletrica.com.br']
export const OBSERVACOES = [
  'Todas as cotas e posições dos pontos de iluminação deverão ser conferidas em obra antes do início da execução.',
  'As alturas indicadas em projeto deverão considerar o nível do piso acabado.',
  'Conferir as dimensões e condições do forro antes da instalação de luminárias embutidas, garantindo espaço suficiente para acomodação dos equipamentos.',
  'Verificar a compatibilidade entre as luminárias especificadas e os sistemas construtivos de forros, sancas, marcenarias e revestimentos.',
  'A infraestrutura elétrica deverá atender à potência e à quantidade de equipamentos previstas no projeto.',
  'Nos pontos destinados à instalação de arandelas, pendentes e luminárias decorativas, respeitar as posições e alturas indicadas em planta.',
  'As luminárias embutidas deverão possuir espaço adequado para instalação, ventilação e manutenção, conforme orientação do fabricante.',
  'Para iluminação integrada à marcenaria, prever antecipadamente os espaços destinados aos perfis, fitas de LED, cabeamentos e respectivos drivers.',
  'A instalação de fitas de LED deverá considerar o dimensionamento correto das fontes de alimentação, de acordo com a potência total e o comprimento utilizado.',
  'Prever acesso para manutenção e substituição de fontes, drivers e demais componentes elétricos, evitando instalações inacessíveis.',
  'Conferir as especificações técnicas, dimensões, acabamentos e temperaturas de cor dos produtos antes da aquisição e instalação.',
  'Qualquer alteração de posicionamento, modelo ou especificação dos equipamentos deverá ser previamente compatibilizada com o projeto luminotécnico.',
  'Em caso de divergências entre as condições encontradas em obra e as informações apresentadas em projeto, consultar a equipe responsável antes da execução.',
  'Os circuitos, dispositivos de proteção, condutores e conexões deverão ser dimensionados e executados por profissional habilitado, em conformidade com as normas técnicas aplicáveis.',
  'A instalação de todos os equipamentos deverá seguir rigorosamente as recomendações dos fabricantes e ser realizada por profissionais qualificados.',
]

const FRAME = { x0: 56.4, x1: 813.4, y0: 28.2, banda: 472.8, y1: 566 }
const MM_POR_PT = 25.4 / 72
const LEG_COLS = [['Símbolo', 32], ['Descrição', 112], ['Instalação', 40], ['Quantidade', 48], ['Lâmp./Fita', 44], ['Temp.', 32]] as const
const LEG_W = LEG_COLS.reduce((s, c) => s + c[1], 0)

/** Divisão da folha e escala da planta (medidas em pontos de A4). */
export function plotLayout(info: Pick<PlotInfo, 'papel' | 'escala' | 'legenda'>, nItens: number, area: [number, number, number, number], unitToMeters: number) {
  const [W, H] = PAPEIS[info.papel]
  const f = W / 842
  const linhas = info.legenda ? nItens : 0
  const tabelas = linhas > 7 ? 2 : linhas > 0 ? 1 : 0
  const porTabela = tabelas ? Math.ceil(linhas / tabelas) : 0
  const rowH = porTabela ? Math.min(9.5, 130 / porTabela) : 0
  const legendaH = porTabela ? 12 + 9 + porTabela * rowH : 0
  const legendaTop = FRAME.banda - 5 - legendaH
  // a planta ocupa do topo da moldura até o título da planta (26 pt) acima da legenda
  const regiao = { x: FRAME.x0 + 2, y: FRAME.y0 + 2, w: FRAME.x1 - FRAME.x0 - 4, h: (legendaH ? legendaTop : FRAME.banda) - FRAME.y0 - 30 }
  const aw = Math.max(1e-9, area[2] - area[0]), ah = Math.max(1e-9, area[3] - area[1])
  // pontos (na folha final) por unidade do desenho
  const ajuste = Math.min((regiao.w * f) / aw, (regiao.h * f) / ah)
  const ptPorUnidade = info.escala ? (unitToMeters * 1000) / (info.escala * MM_POR_PT) : ajuste
  const denom = (unitToMeters * 1000) / (ptPorUnidade * MM_POR_PT)
  return {
    W, H, f, regiao, tabelas, porTabela, rowH, legendaTop, ptPorUnidade, denom,
    cabe: ptPorUnidade <= ajuste * 1.001,
    rotuloEscala: info.escala ? `1/${info.escala}` : `ajustada (~1/${Math.round(denom)})`,
  }
}

// ── Contexto "canvas" que escreve no PDF ─────────────────────────────────────
type RGB = [number, number, number]
export function parseColor(c: string): RGB {
  let m = /^#([0-9a-f]{6})$/i.exec(c)
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] }
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c)
  if (m) return [parseInt(m[1], 16) / 15, parseInt(m[2], 16) / 15, parseInt(m[3], 16) / 15]
  const h = /^hsl\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/.exec(c)
  if (h) {
    const hue = Number(h[1]) / 360, s = Number(h[2]) / 100, l = Number(h[3]) / 100
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
    const ch = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
    return [ch(hue + 1 / 3), ch(hue), ch(hue - 1 / 3)]
  }
  const r = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(c)
  return r ? [Number(r[1]) / 255, Number(r[2]) / 255, Number(r[3]) / 255] : [0, 0, 0]
}
/** Linhas e textos claros (feitos pro fundo escuro) viram tinta escura no papel. */
export function ink([r, g, b]: RGB): RGB {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return Math.max(r, g, b) - Math.min(r, g, b) < 0.14 && lum > 0.6 ? [0.08, 0.08, 0.08] : [r, g, b]
}
/** As fontes padrão do PDF só têm o alfabeto latino. */
export const safeText = (t: string) => t.replace(/≈/g, '~').replace(/[^\x20-\x7E\xA0-\xFF—–‘’“”•…€]/g, '?')

type M = [number, number, number, number, number, number]

export class PdfCanvas {
  fillStyle = '#000000'; strokeStyle = '#000000'; lineWidth = 1; lineCap = 'round'; globalAlpha = 1
  font = '10px sans-serif'; textAlign: string = 'start'; textBaseline: string = 'alphabetic'
  private m: M = [1, 0, 0, 1, 0, 0]
  private stack: any[] = []
  private path: PDFOperator[] = []
  private ops: PDFOperator[] = []
  private dash: number[] = []
  private alphas = new Map<number, any>()
  // lineScale: espessuras pensadas pra tela ficam finas no papel
  constructor(private doc: PDFDocument, private page: PDFPage, private fonts: { normal: PDFFont; bold: PDFFont }, private ox: number, private oy: number, private lineScale: number) {}

  private pt(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.m
    return [this.ox + a * x + c * y + e, this.page.getHeight() - (this.oy + b * x + d * y + f)]
  }
  // listas grandes (um traçado pode ter centenas de milhares de operações) vão em blocos
  push(...ops: PDFOperator[]) { this.pushList(ops) }
  private pushList(ops: PDFOperator[]) { for (let i = 0; i < ops.length; i++) this.ops.push(ops[i]); if (this.ops.length > 4000) this.flush() }
  flush() { for (let i = 0; i < this.ops.length; i += 4000) this.page.pushOperators(...this.ops.slice(i, i + 4000)); this.ops = [] }
  clipRect(x: number, y: number, w: number, h: number) { const H = this.page.getHeight(); this.push(pushGraphicsState(), rectangle(x, H - y - h, w, h), clip(), endPath()) }
  endClip() { this.push(popGraphicsState()); this.flush() }

  save() { this.stack.push({ m: [...this.m] as M, f: this.fillStyle, s: this.strokeStyle, w: this.lineWidth, a: this.globalAlpha, font: this.font, ta: this.textAlign, tb: this.textBaseline }) }
  restore() { const s = this.stack.pop(); if (!s) return; this.m = s.m; this.fillStyle = s.f; this.strokeStyle = s.s; this.lineWidth = s.w; this.globalAlpha = s.a; this.font = s.font; this.textAlign = s.ta; this.textBaseline = s.tb }
  setTransform() { this.m = [1, 0, 0, 1, 0, 0] }
  translate(x: number, y: number) { const [a, b, c, d, e, f] = this.m; this.m = [a, b, c, d, a * x + c * y + e, b * x + d * y + f] }
  rotate(r: number) { const [a, b, c, d, e, f] = this.m, cos = Math.cos(r), sin = Math.sin(r); this.m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f] }
  setLineDash(d: number[]) { this.dash = d }
  beginPath() { this.path = [] }
  moveTo(x: number, y: number) { this.path.push(moveTo(...this.pt(x, y))) }
  lineTo(x: number, y: number) { this.path.push(this.path.length ? lineTo(...this.pt(x, y)) : moveTo(...this.pt(x, y))) }
  closePath() { this.path.push(closePath()) }
  rect(x: number, y: number, w: number, h: number) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath() }
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    const n = 48
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; const px = x + r * Math.cos(a), py = y + r * Math.sin(a); if (i === 0) this.moveTo(px, py); else this.lineTo(px, py) }
  }
  private alpha(a: number) {
    const k = Math.round(a * 100) / 100
    let name = this.alphas.get(k)
    if (!name) { name = this.page.node.newExtGState('GS', this.doc.context.obj({ Type: 'ExtGState', ca: k, CA: k })); this.alphas.set(k, name) }
    return setGraphicsState(name)
  }
  stroke() {
    if (!this.path.length) return
    const [r, g, b] = ink(parseColor(this.strokeStyle))
    this.push(pushGraphicsState(), this.alpha(this.globalAlpha), setStrokingRgbColor(r, g, b), setLineWidth(Math.max(0.1, this.lineWidth * this.lineScale)), setLineCap(LineCapStyle.Round), setDashPattern(this.dash.map(v => v * this.lineScale * 1.4), 0))
    this.pushList(this.path)
    this.push(stroke(), popGraphicsState())
  }
  fill(rule?: string) {
    if (!this.path.length) return
    const [r, g, b] = parseColor(this.fillStyle)
    this.push(pushGraphicsState(), this.alpha(this.globalAlpha), setFillingRgbColor(r, g, b))
    this.pushList(this.path)
    this.push(rule === 'evenodd' ? PDFOperator.of(Op.FillEvenOdd) : fill(), popGraphicsState())
  }
  fillRect(x: number, y: number, w: number, h: number) { const p = this.path; this.path = []; this.rect(x, y, w, h); this.fill(); this.path = p }
  strokeRect(x: number, y: number, w: number, h: number) { const p = this.path; this.path = []; this.rect(x, y, w, h); this.stroke(); this.path = p }
  strokeText() { /* o halo de leitura da tela não é usado no papel */ }
  private fontInfo() { const size = parseFloat(/([\d.]+)px/.exec(this.font)?.[1] ?? '10'); return { size, font: /bold/.test(this.font) ? this.fonts.bold : this.fonts.normal } }
  measureText(t: string) { const { size, font } = this.fontInfo(); return { width: font.widthOfTextAtSize(safeText(t), size) } }
  fillText(t: string, x: number, y: number) {
    const text = safeText(t)
    const { size, font } = this.fontInfo()
    if (!(size > 0.2) || !text) return
    const w = font.widthOfTextAtSize(text, size)
    const dx = this.textAlign === 'center' ? -w / 2 : this.textAlign === 'right' ? -w : 0
    const dy = this.textBaseline === 'middle' ? size * 0.35 : this.textBaseline === 'top' ? size * 0.76 : this.textBaseline === 'bottom' ? -size * 0.2 : 0
    const [px, py] = this.pt(x + dx, y + dy)
    const [r, g, b] = ink(parseColor(this.fillStyle))
    this.flush()
    this.page.drawText(text, { x: px, y: py, size, font, color: rgb(r, g, b), opacity: this.globalAlpha, rotate: degrees((-Math.atan2(this.m[1], this.m[0]) * 180) / Math.PI) })
  }
}

// ── Montagem da prancha ──────────────────────────────────────────────────────
export interface PlotInput {
  info: PlotInfo
  area: [number, number, number, number]
  unitToMeters: number
  items: Item[]
  logo: ArrayBuffer | Uint8Array | null
  /** Desenha a planta num "canvas" de w×h com `scale` pontos por unidade, centrado em (cx, cy). */
  drawPlan: (ctx: CanvasRenderingContext2D, view: { cx: number; cy: number; scale: number }, w: number, h: number) => void
  /** Desenha o símbolo do item numa célula centrada em (x, y), em pontos a partir do canto superior esquerdo da folha. */
  drawSymbol: (ctx: CanvasRenderingContext2D, item: Item, x: number, y: number, w: number, h: number) => void
}

export async function buildPlotPdf(p: PlotInput): Promise<Uint8Array> {
  const { info, items } = p
  const L = plotLayout(info, items.length, p.area, p.unitToMeters)
  const { f } = L
  const doc = await PDFDocument.create()
  const page = doc.addPage([L.W, L.H])
  const fonts = { normal: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) }
  const H = L.H
  doc.setTitle(`Planta de iluminação - ${info.proprietario || info.pavimento}`)

  // planta, recortada na região
  // só a área marcada vai pro papel, centralizada no espaço da planta
  const area = { w: L.regiao.w * f, h: L.regiao.h * f }
  const cw = Math.min(area.w, (p.area[2] - p.area[0]) * L.ptPorUnidade), ch = Math.min(area.h, (p.area[3] - p.area[1]) * L.ptPorUnidade)
  const R = { x: L.regiao.x * f + (area.w - cw) / 2, y: L.regiao.y * f + (area.h - ch) / 2, w: cw, h: ch }
  const plan = new PdfCanvas(doc, page, fonts, R.x, R.y, 0.28 * f)
  plan.clipRect(R.x, R.y, R.w, R.h)
  p.drawPlan(plan as unknown as CanvasRenderingContext2D, { cx: (p.area[0] + p.area[2]) / 2, cy: (p.area[1] + p.area[3]) / 2, scale: L.ptPorUnidade }, R.w, R.h)
  plan.endClip()

  // helpers em coordenadas de A4 (origem no topo), escaladas por f
  const line = (x0: number, y0: number, x1: number, y1: number, width = 0.4) => page.drawLine({ start: { x: x0 * f, y: H - y0 * f }, end: { x: x1 * f, y: H - y1 * f }, thickness: width * f, color: rgb(0.25, 0.25, 0.25) })
  const box = (x: number, y: number, w: number, h: number, gray: number) => page.drawRectangle({ x: x * f, y: H - (y + h) * f, width: w * f, height: h * f, color: rgb(gray, gray, gray) })
  const text = (t: string, x: number, y: number, size: number, o: { bold?: boolean; align?: 'left' | 'center' | 'right'; max?: number; color?: RGB } = {}) => {
    const font = o.bold ? fonts.bold : fonts.normal
    const s = safeText(t)
    let sz = size
    if (o.max) { const w = font.widthOfTextAtSize(s, sz); if (w > o.max) sz = (sz * o.max) / w }
    const w = font.widthOfTextAtSize(s, sz)
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
    const c = o.color ?? [0.05, 0.05, 0.05]
    page.drawText(s, { x: x0 * f, y: H - y * f, size: sz * f, font, color: rgb(...c) })
  }

  // título da planta (à direita, abaixo do desenho)
  const baseTit = L.regiao.y + L.regiao.h + 8
  text('PLANTA DE LUMINÁRIAS', FRAME.x1 - 6, baseTit, 6.5, { align: 'right' })
  text(`PLANTA BAIXA - ${info.pavimento.toUpperCase()}`, FRAME.x1 - 6, baseTit + 8, 6.5, { align: 'right' })
  text(`ESCALA ______________ ${L.rotuloEscala}`, FRAME.x1 - 6, baseTit + 16, 5.5, { align: 'right' })

  // legenda
  if (L.tabelas) {
    const top = L.legendaTop
    for (let t = 0; t < L.tabelas; t++) {
      const x = FRAME.x0 + 24 + t * (LEG_W + 12)
      const linhas = items.slice(t * L.porTabela, (t + 1) * L.porTabela)
      if (!linhas.length) continue
      if (t === 0) text(`LEGENDA ${info.pavimento.toUpperCase()}`, x, top + 8, 7)
      const y0 = top + 12, headH = 9, h = headH + linhas.length * L.rowH
      box(x, y0, LEG_W, h, 1)
      for (let r = 0; r <= linhas.length; r++) line(x, y0 + headH + r * L.rowH, x + LEG_W, y0 + headH + r * L.rowH, 0.25)
      line(x, y0, x + LEG_W, y0, 0.25)
      let cx = x
      for (const [nome, w] of LEG_COLS) { line(cx, y0, cx, y0 + h, 0.25); text(nome, cx + w / 2, y0 + 6, 3.8, { align: 'center' }); cx += w }
      line(cx, y0, cx, y0 + h, 0.25)
      const sym = new PdfCanvas(doc, page, fonts, 0, 0, 0.28 * f)
      linhas.forEach((it, r) => {
        const my = y0 + headH + r * L.rowH + L.rowH / 2
        const size = Math.min(3.6, L.rowH * 0.45)
        const cells = [describe(it), it.mounting || '-', qtyLabel(it), it.power || '-', it.light || '-']
        let c = x + LEG_COLS[0][1]
        cells.forEach((v, i) => { const w = LEG_COLS[i + 1][1]; text(v, c + w / 2, my + size * 0.36, size, { align: 'center', max: w - 3 }); c += w })
        p.drawSymbol(sym as unknown as CanvasRenderingContext2D, it, (x + LEG_COLS[0][1] / 2) * f, my * f, (LEG_COLS[0][1] - 6) * f, (L.rowH * 0.75) * f)
      })
      sym.flush()
    }
  }

  // moldura e carimbo
  const { x0, x1, y0, banda, y1 } = FRAME
  box(x0, banda, x1 - x0, y1 - banda, 0.937)
  box(x0, banda, 128.8, y1 - banda, 0.89)
  line(x0, y0, x1, y0); line(x1, y0, x1, y1 + 10); line(x0, y0, x0, y1 + 10)
  line(x0 - 11, banda, x1 + 11, banda); line(x0 - 11, y1, x1 + 11, y1)

  if (p.logo) { const img = await doc.embedPng(p.logo); page.drawImage(img, { x: 62 * f, y: H - 529 * f, width: 122 * f, height: ((122 * img.height) / img.width) * f }) }
  EMPRESA.forEach((l, i) => text(l, 83, 534 + i * 4.7, 3.9))

  const col2 = 192, max2 = 114
  const bloco = (titulo: string, valor: string, yt: number, yv: number) => {
    text(titulo, col2, yt, 7.4, { bold: true, max: max2 })
    valor.split('\n').slice(0, 2).forEach((l, i) => text(l.trim(), col2, yv + i * 7.4, 5.6, { max: max2 }))
  }
  bloco('ENDEREÇO DA OBRA', info.endereco, 491, 503)
  bloco('PROPRIETÁRIO', info.proprietario, 524, 533)
  bloco('ESCRITÓRIO RESPONSÁVEL', info.escritorio, 545, 554)

  line(311.5, 481, 311.5, 558)
  text('PROJETO DE ILUMINAÇÃO', 317, 489, 9.6, { max: 146 })
  text('PLANTA ILUMINAÇÃO', 317, 506.5, 11.6, { bold: true, max: 146 })
  text(info.pavimento.toUpperCase(), 317, 525, 8, { max: 146 })
  text(`ESCALA: ${L.rotuloEscala}`, 317, 537, 5.8, { max: 146 })
  text(`DATA: ${info.data}`, 317, 554, 5.8)
  text('DESENHO:', 383, 554, 5.8)
  text(info.desenho, 465, 554, 10, { align: 'right', max: 46 })

  line(468.6, 478, 468.6, 560)
  text('OBSERVAÇÕES GERAIS', 473, 480, 4.2)
  OBSERVACOES.forEach((o, i) => {
    const y = 489 + i * 4.8
    text(`${i + 1}.`, 480, y, 3.6, { align: 'right' })
    text(o, 484, y, 3.6, { max: x1 - 484 - 3 })
  })

  return doc.save()
}
