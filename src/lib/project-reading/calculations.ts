// Cálculos determinísticos de fita de LED, fonte e plano de corte (perfil e
// rolo de fita) — funções puras, sem I/O. Nenhuma IA entra aqui (doc, seção
// 13/14: "Não utilizar IA para esse cálculo").

/** Margem de segurança obrigatória no dimensionamento de fonte. */
export const FONTE_MARGEM_SEGURANCA = 1.2 // +20%

export interface FitaCalculo {
  comprimentoM: number
  potenciaWPorM: number
  consumoW: number       // comprimento × W/m
  fonteMinimaW: number   // consumo × 1.20
}

/**
 * Consumo e potência mínima de fonte de um trecho de fita de LED.
 * Nunca usa a potência da legenda do PDF por padrão — o W/m é sempre um
 * valor informado pelo consultor (doc, seção 11).
 */
export function calcularFita(comprimentoM: number, potenciaWPorM: number): FitaCalculo {
  if (comprimentoM < 0) throw new Error('Comprimento não pode ser negativo.')
  if (potenciaWPorM < 0) throw new Error('Potência por metro não pode ser negativa.')
  const consumoW = comprimentoM * potenciaWPorM
  const fonteMinimaW = consumoW * FONTE_MARGEM_SEGURANCA
  return {
    comprimentoM,
    potenciaWPorM,
    consumoW: round2(consumoW),
    fonteMinimaW: round2(fonteMinimaW),
  }
}

// ── Plano de corte (perfis e rolos de fita) ─────────────────────────────────
//
// Mesmo algoritmo serve pra perfil (barra comercial) e fita (rolo comercial):
// dado um comprimento de peça comercial e uma lista de trechos necessários
// (do projeto inteiro, não por ambiente — doc, seção 13: "Analisar o
// projeto inteiro"), decide quantas peças comprar e como cortar cada uma,
// maximizando reaproveitamento de sobra entre ambientes.
//
// Estratégia: first-fit-decreasing — ordena os trechos do maior pro menor e
// encaixa cada um na primeira peça em aberto que ainda tenha espaço; se
// nenhuma couber, abre uma peça nova. É determinístico, sem IA, e dá um
// resultado bom o suficiente pra decisão de compra (não precisa ser o plano
// matematicamente ótimo — doc, seção 1: "Não precisamos de automação
// perfeita").

export interface TrechoNecessario {
  id: string            // id da medição de origem, pra rastrear de volta ao ambiente
  comprimentoM: number
  ambiente?: string | null
}

export interface PecaCortada {
  pecaIndex: number
  cortes: { id: string; comprimentoM: number; ambiente?: string | null }[]
  sobraM: number
  /** Tamanho comercial desta peça (varia entre peças quando há mais de um tamanho disponível). */
  comprimentoM?: number
}

export interface PlanoDeCorte {
  comprimentoComercialM: number
  quantidadePecas: number
  pecas: PecaCortada[]
  totalNecessarioM: number
  totalComercialM: number
  sobraTotalM: number
  desperdicioPct: number
}

export function calcularPlanoDeCorte(trechos: TrechoNecessario[], comprimentoComercialM: number): PlanoDeCorte {
  if (comprimentoComercialM <= 0) throw new Error('Comprimento comercial precisa ser maior que zero.')
  const validos = trechos.filter(t => t.comprimentoM > 0)

  for (const t of validos) {
    if (t.comprimentoM > comprimentoComercialM + 1e-9) {
      throw new Error(`Trecho de ${t.comprimentoM}m não cabe numa peça comercial de ${comprimentoComercialM}m.`)
    }
  }

  const ordenados = [...validos].sort((a, b) => b.comprimentoM - a.comprimentoM)
  const pecas: PecaCortada[] = []

  for (const trecho of ordenados) {
    // Primeira peça já aberta que tenha espaço sobrando pra esse trecho
    let destino = pecas.find(p => p.sobraM >= trecho.comprimentoM - 1e-9)
    if (!destino) {
      destino = { pecaIndex: pecas.length + 1, cortes: [], sobraM: comprimentoComercialM }
      pecas.push(destino)
    }
    destino.cortes.push({ id: trecho.id, comprimentoM: trecho.comprimentoM, ambiente: trecho.ambiente })
    destino.sobraM = round2(destino.sobraM - trecho.comprimentoM)
  }

  const totalNecessarioM = round2(validos.reduce((s, t) => s + t.comprimentoM, 0))
  const totalComercialM = round2(pecas.length * comprimentoComercialM)
  const sobraTotalM = round2(pecas.reduce((s, p) => s + p.sobraM, 0))

  return {
    comprimentoComercialM,
    quantidadePecas: pecas.length,
    pecas,
    totalNecessarioM,
    totalComercialM,
    sobraTotalM,
    desperdicioPct: totalComercialM > 0 ? round2((sobraTotalM / totalComercialM) * 100) : 0,
  }
}

// ── Plano de corte com vários tamanhos de barra ─────────────────────────────
//
// Diferente do calcularPlanoDeCorte acima (um tamanho só, trecho maior que a
// peça dá erro): aqui um trecho maior que a maior barra é dividido em
// emenda (barras cheias + sobra), e a sobra entra no encaixe junto com os
// outros trechos — então duas sancas de 2,43m e 2,49m com barra de 2m viram
// 3 barras (2 cheias + 1 dividida entre as duas sobras), não 4. Com mais de
// um tamanho disponível, cada barra nova é escolhida (e depois encolhida)
// pro menor tamanho que comporta o que vai nela: 4,2m com 2m e 3m vira
// 3m + 2m, não 3m + 3m. Roda duas estratégias de abertura de barra e fica
// com a que compra menos material.

export interface EmendaInfo {
  id: string
  comprimentoTotalM: number
  partesM: number[]
  ambiente?: string | null
}

export interface PlanoOtimizado extends PlanoDeCorte {
  emendas: EmendaInfo[]
}

interface BarraAberta { tamanho: number; usado: number; cortes: PecaCortada['cortes'] }

export function planejarCortes(trechos: TrechoNecessario[], tamanhosM: number[]): PlanoOtimizado {
  const tamanhos = Array.from(new Set(tamanhosM.filter(t => t > 0))).sort((a, b) => a - b)
  if (tamanhos.length === 0) throw new Error('Informe ao menos um tamanho comercial maior que zero.')
  const maior = tamanhos[tamanhos.length - 1]
  const eps = 1e-9

  const pecasBrutas: { id: string; comprimentoM: number; ambiente?: string | null }[] = []
  const emendas: EmendaInfo[] = []
  for (const t of trechos.filter(x => x.comprimentoM > 0)) {
    if (t.comprimentoM <= maior + eps) {
      pecasBrutas.push({ id: t.id, comprimentoM: t.comprimentoM, ambiente: t.ambiente })
      continue
    }
    const partes: number[] = []
    let resto = t.comprimentoM
    while (resto > maior + eps) { partes.push(maior); resto = round2(resto - maior) }
    if (resto > eps) partes.push(resto)
    partes.forEach((len, i) => pecasBrutas.push({ id: i === 0 ? t.id : `${t.id}~emenda${i}`, comprimentoM: len, ambiente: t.ambiente }))
    emendas.push({ id: t.id, comprimentoTotalM: round2(t.comprimentoM), partesM: partes.map(round2), ambiente: t.ambiente })
  }
  const ordenados = [...pecasBrutas].sort((a, b) => b.comprimentoM - a.comprimentoM)
  const menorQueCabe = (len: number) => tamanhos.find(t => t >= len - eps) ?? maior

  function empacotar(abrirComMaior: boolean): BarraAberta[] {
    const barras: BarraAberta[] = []
    for (const p of ordenados) {
      // melhor encaixe: a barra aberta com menos espaço livre que ainda comporta
      let alvo: BarraAberta | undefined
      for (const b of barras) {
        const livre = b.tamanho - b.usado
        if (livre >= p.comprimentoM - eps && (!alvo || livre < alvo.tamanho - alvo.usado)) alvo = b
      }
      if (!alvo) {
        // trocar uma barra aberta por um tamanho maior só vale se sair
        // mais barato que abrir uma barra nova
        const custoNova = abrirComMaior ? maior : menorQueCabe(p.comprimentoM)
        let melhor: { b: BarraAberta; novoTam: number; custo: number } | undefined
        for (const b of barras) {
          const novoTam = tamanhos.find(t => t >= b.usado + p.comprimentoM - eps)
          if (novoTam && novoTam > b.tamanho && novoTam - b.tamanho < custoNova - eps && (!melhor || novoTam - b.tamanho < melhor.custo)) {
            melhor = { b, novoTam, custo: novoTam - b.tamanho }
          }
        }
        if (melhor) { melhor.b.tamanho = melhor.novoTam; alvo = melhor.b }
      }
      if (!alvo) {
        alvo = { tamanho: abrirComMaior ? maior : menorQueCabe(p.comprimentoM), usado: 0, cortes: [] }
        barras.push(alvo)
      }
      alvo.cortes.push({ id: p.id, comprimentoM: p.comprimentoM, ambiente: p.ambiente })
      alvo.usado = round2(alvo.usado + p.comprimentoM)
    }
    // encolhe cada barra pro menor tamanho que comporta o que ficou nela
    for (const b of barras) b.tamanho = tamanhos.find(t => t >= b.usado - eps) ?? b.tamanho
    return barras
  }

  const total = (bs: BarraAberta[]) => round2(bs.reduce((s, b) => s + b.tamanho, 0))
  const candidatos = [empacotar(false), empacotar(true)]
  const barras = candidatos.reduce((best, c) =>
    total(c) < total(best) - eps || (Math.abs(total(c) - total(best)) <= eps && c.length < best.length) ? c : best)

  const pecas: PecaCortada[] = barras.map((b, i) => ({
    pecaIndex: i + 1, cortes: b.cortes, sobraM: round2(b.tamanho - b.usado), comprimentoM: b.tamanho,
  }))
  const totalNecessarioM = round2(ordenados.reduce((s, p) => s + p.comprimentoM, 0))
  const totalComercialM = total(barras)
  const sobraTotalM = round2(pecas.reduce((s, p) => s + p.sobraM, 0))
  return {
    comprimentoComercialM: maior, quantidadePecas: pecas.length, pecas,
    totalNecessarioM, totalComercialM, sobraTotalM,
    desperdicioPct: totalComercialM > 0 ? round2((sobraTotalM / totalComercialM) * 100) : 0,
    emendas,
  }
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ── Sugestão de fonte 12V ────────────────────────────────────────────────────
// Catálogo comercial informado pela Letícia. Sugere a próxima potência
// disponível acima (ou igual) do mínimo calculado — nunca abaixo, senão a
// fonte não aguenta a carga. `null` quando a necessidade passa do maior item
// do catálogo (aí o caso é dividir em mais de uma fonte, não sugerir uma só).
export const CATALOGO_FONTES_12V = [18, 24, 36, 48, 60, 72, 100, 120, 150, 200, 300, 400]

export function sugerirFonte(minimaW: number): number | null {
  if (minimaW <= 0) return null
  return CATALOGO_FONTES_12V.find(w => w >= minimaW) ?? null
}
