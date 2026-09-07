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
