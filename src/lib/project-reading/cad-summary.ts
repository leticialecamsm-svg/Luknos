// Página(s) de resumo para o orçamentista: o que lançar no orçamento, separado
// por ambiente, seguido do total geral. Folha A4 em pé.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { describe, type Item } from './cad-legend'
import { safeText } from './cad-text'

export interface LinhaResumo { qtd: string; un: string; descricao: string; detalhe?: string; instalacao: string; potencia: string; temp: string }
export interface GrupoResumo { titulo: string; linhas: LinhaResumo[] }

const br = (n: number) => n.toFixed(2).replace('.', ',')
export const SEM_AMBIENTE = 'Sem ambiente marcado'

function linha(it: Item, qty: number, meters: number): LinhaResumo {
  const trecho = it.kind === 'perfil' || it.kind === 'fita'
  const pecas = trecho ? `${qty} ${qty === 1 ? 'peça' : 'peças'}` : ''
  return {
    qtd: trecho ? br(meters) : String(qty), un: trecho ? 'm' : 'un',
    descricao: describe(it),
    // no perfil, a fita é outro produto: sai escrita logo abaixo, com a mesma metragem
    detalhe: it.kind === 'perfil' ? `Fita${it.tapeModel ? ` ${it.tapeModel}` : ''}: ${br(meters)} m · ${pecas}` : trecho ? pecas : undefined,
    instalacao: it.mounting || '-', potencia: it.power || '-', temp: it.light || '-',
  }
}

/** Uma lista por ambiente (os sem ambiente por último) e o total geral. */
export function resumoPorAmbiente(items: Item[]): { ambientes: GrupoResumo[]; total: GrupoResumo } {
  const nomes = Array.from(new Set(items.flatMap(it => Object.keys(it.porAmbiente))))
    .sort((a, b) => Number(!a) - Number(!b) || a.localeCompare(b, 'pt-BR', { numeric: true }))
  const ambientes = nomes.map(n => ({
    titulo: n || SEM_AMBIENTE,
    linhas: items.filter(it => it.porAmbiente[n]).map(it => linha(it, it.porAmbiente[n].qty, it.porAmbiente[n].meters)),
  }))
  return { ambientes, total: { titulo: 'TOTAL GERAL', linhas: items.map(it => linha(it, it.qty, it.meters)) } }
}

const COLS = [['OK', 20], ['Qtd.', 38], ['Un.', 22], ['Descrição', 241], ['Instalação', 62], ['Potência', 76], ['Temp.', 40]] as const
const W = 595, H = 842, M = 48, LARG = COLS.reduce((s, c) => s + c[1], 0)

export interface CabecalhoResumo { proprietario: string; endereco: string; escritorio: string; data: string; pavimento: string }

/** Acrescenta as páginas de resumo no fim do documento. */
export async function addSummaryPages(doc: PDFDocument, info: CabecalhoResumo, items: Item[]): Promise<number> {
  if (!items.length) return 0
  const normal = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const paginas: PDFPage[] = []
  let page!: PDFPage, y = 0

  const texto = (t: string, x: number, yy: number, size: number, font: PDFFont = normal, gray = 0.08) => page.drawText(safeText(t), { x, y: H - yy, size, font, color: rgb(gray, gray, gray) })
  /** Quebra em linhas que cabem na largura. */
  const quebrar = (t: string, size: number, max: number, font: PDFFont = normal) => {
    const out: string[] = []
    let atual = ''
    for (let palavra of safeText(t).split(/\s+/).filter(Boolean)) {
      const junto = atual ? `${atual} ${palavra}` : palavra
      if (font.widthOfTextAtSize(junto, size) <= max) { atual = junto; continue }
      if (atual) out.push(atual)
      while (palavra.length > 1 && font.widthOfTextAtSize(palavra, size) > max) {
        let n = palavra.length - 1
        while (n > 1 && font.widthOfTextAtSize(palavra.slice(0, n), size) > max) n--
        out.push(palavra.slice(0, n)); palavra = palavra.slice(n)
      }
      atual = palavra
    }
    if (atual) out.push(atual)
    return out.length ? out : ['-']
  }
  const traco = (x0: number, y0: number, x1: number, y1: number, gray = 0.75) => page.drawLine({ start: { x: x0, y: H - y0 }, end: { x: x1, y: H - y1 }, thickness: 0.5, color: rgb(gray, gray, gray) })
  const faixa = (yy: number, h: number, gray: number) => page.drawRectangle({ x: M, y: H - yy - h, width: LARG, height: h, color: rgb(gray, gray, gray) })

  const novaPagina = () => {
    page = doc.addPage([W, H]); paginas.push(page)
    texto('RESUMO PARA ORÇAMENTO', M, 52, 15, bold)
    texto(info.pavimento.toUpperCase(), W - M - bold.widthOfTextAtSize(safeText(info.pavimento.toUpperCase()), 10), 52, 10, bold)
    y = 68
    for (const [rotulo, valor] of [['Proprietário', info.proprietario], ['Endereço da obra', info.endereco.replace(/\n/g, ' ')], ['Escritório responsável', info.escritorio.replace(/\n/g, ' ')], ['Data', info.data]]) {
      const x = M + 104
      texto(`${rotulo}:`, M, y, 8, bold, 0.3)
      for (const l of quebrar(valor || '-', 8, W - M - x).slice(0, 2)) { texto(l, x, y, 8); y += 11 }
    }
    y += 8
  }
  const cabecalhoTabela = (titulo: string) => {
    faixa(y, 17, 0.2)
    page.drawText(safeText(titulo), { x: M + 6, y: H - y - 12, size: 9.5, font: bold, color: rgb(1, 1, 1) })
    y += 17
    faixa(y, 13, 0.92)
    let x = M
    for (const [nome, w] of COLS) { texto(nome, x + 3, y + 9, 7, bold, 0.25); x += w }
    y += 13
  }
  const LIMITE = H - 40

  novaPagina()
  const { ambientes, total } = resumoPorAmbiente(items)
  for (const grupo of [...ambientes, total]) {
    const medidas = grupo.linhas.map(l => {
      const celulas = [l.qtd, l.un, l.descricao, l.instalacao, l.potencia, l.temp].map((v, i) => quebrar(v, i === 0 ? 9 : 8, COLS[i + 1][1] - 6, i === 0 ? bold : normal))
      const detalhe = l.detalhe ? quebrar(l.detalhe, 7, COLS[3][1] - 6) : []
      const alto = Math.max(...celulas.map((c, i) => c.length * 10 + (i === 2 ? detalhe.length * 9 : 0))) + 7
      return { celulas, detalhe, alto }
    })
    // o título do ambiente não fica sozinho no pé da folha
    if (y + 30 + (medidas[0]?.alto ?? 0) > LIMITE) novaPagina()
    cabecalhoTabela(grupo.titulo)
    for (const m of medidas) {
      if (y + m.alto > LIMITE) { novaPagina(); cabecalhoTabela(`${grupo.titulo} (continuação)`) }
      page.drawRectangle({ x: M + 6, y: H - y - 13, width: 8, height: 8, borderWidth: 0.7, borderColor: rgb(0.45, 0.45, 0.45) })
      let x = M + COLS[0][1]
      m.celulas.forEach((c, i) => {
        c.forEach((t, k) => texto(t, x + 3, y + 12 + k * 10, i === 0 ? 9 : 8, i === 0 ? bold : normal))
        if (i === 2) m.detalhe.forEach((t, k) => texto(t, x + 3, y + 12 + c.length * 10 + k * 9, 7, normal, 0.35))
        x += COLS[i + 1][1]
      })
      y += m.alto
      traco(M, y, M + LARG, y)
    }
    y += 14
  }
  paginas.forEach((p, i) => { page = p; texto(`Resumo ${i + 1}/${paginas.length}`, W - M - 50, H - 22, 7, normal, 0.45) })
  return paginas.length
}
