import { describe, it, expect } from 'vitest'
import { calcularFita, calcularPlanoDeCorte, round2, sugerirFonte } from './calculations'

describe('calcularFita', () => {
  it('exemplo do documento: 5m × 10W/m → 60W com margem de 20%', () => {
    const r = calcularFita(5, 10)
    expect(r.consumoW).toBe(50)
    expect(r.fonteMinimaW).toBe(60)
  })

  it('exemplo do documento: 8,40m × 12W/m → 120,96W com margem de 20%', () => {
    const r = calcularFita(8.4, 12)
    expect(r.consumoW).toBe(100.8)
    expect(r.fonteMinimaW).toBe(120.96)
  })

  it('recalcula ao alterar o W/m (mesmo trecho, W/m diferente)', () => {
    const antes = calcularFita(8.4, 12)
    const depois = calcularFita(8.4, 15)
    expect(depois.consumoW).not.toBe(antes.consumoW)
    expect(depois.consumoW).toBe(126)
    expect(depois.fonteMinimaW).toBe(151.2)
  })

  it('rejeita comprimento negativo', () => {
    expect(() => calcularFita(-1, 10)).toThrow()
  })

  it('rejeita W/m negativo', () => {
    expect(() => calcularFita(5, -10)).toThrow()
  })

  it('comprimento ou potência zero resulta em consumo zero, sem erro', () => {
    expect(calcularFita(0, 10).fonteMinimaW).toBe(0)
    expect(calcularFita(5, 0).fonteMinimaW).toBe(0)
  })
})

describe('calcularPlanoDeCorte', () => {
  it('exemplo do documento: barras de 3m, trechos 2.40+2.40+1.80 (sala) + 1.10+1.10 (cozinha) + 2.70 (suíte)', () => {
    const trechos = [
      { id: '1', comprimentoM: 2.40, ambiente: 'Sala' },
      { id: '2', comprimentoM: 2.40, ambiente: 'Sala' },
      { id: '3', comprimentoM: 1.80, ambiente: 'Sala' },
      { id: '4', comprimentoM: 1.10, ambiente: 'Cozinha' },
      { id: '5', comprimentoM: 1.10, ambiente: 'Cozinha' },
      { id: '6', comprimentoM: 2.70, ambiente: 'Suíte' },
    ]
    const plano = calcularPlanoDeCorte(trechos, 3)
    // total necessário = 11.5m; com barras de 3m, no mínimo 4 barras (12m)
    expect(plano.totalNecessarioM).toBeCloseTo(11.5)
    expect(plano.quantidadePecas).toBeGreaterThanOrEqual(4)
    // toda peça precisa ter sobra >= 0 e <= comprimento comercial
    for (const p of plano.pecas) {
      expect(p.sobraM).toBeGreaterThanOrEqual(-1e-9)
      expect(p.sobraM).toBeLessThanOrEqual(3)
    }
  })

  it('reaproveita sobra de um ambiente em outro (não calcula ambiente isolado)', () => {
    // Sala pede 2.9m (sobra 0.1m numa barra de 3m); Cozinha pede 0.1m, que
    // deveria caber na sobra da barra da Sala em vez de abrir peça nova.
    const trechos = [
      { id: 'sala-1', comprimentoM: 2.9, ambiente: 'Sala' },
      { id: 'cozinha-1', comprimentoM: 0.1, ambiente: 'Cozinha' },
    ]
    const plano = calcularPlanoDeCorte(trechos, 3)
    expect(plano.quantidadePecas).toBe(1)
    expect(plano.pecas[0].cortes.map(c => c.id).sort()).toEqual(['cozinha-1', 'sala-1'])
  })

  it('rejeita trecho maior que o comprimento comercial', () => {
    expect(() => calcularPlanoDeCorte([{ id: '1', comprimentoM: 5 }], 3)).toThrow()
  })

  it('rejeita comprimento comercial zero ou negativo', () => {
    expect(() => calcularPlanoDeCorte([{ id: '1', comprimentoM: 1 }], 0)).toThrow()
  })

  it('ignora trechos com comprimento zero ou negativo sem quebrar o cálculo', () => {
    const plano = calcularPlanoDeCorte([{ id: '1', comprimentoM: 0 }, { id: '2', comprimentoM: 2 }], 3)
    expect(plano.quantidadePecas).toBe(1)
    expect(plano.pecas[0].cortes.length).toBe(1)
  })

  it('lista vazia resulta em zero peças, sem erro', () => {
    const plano = calcularPlanoDeCorte([], 5)
    expect(plano.quantidadePecas).toBe(0)
    expect(plano.sobraTotalM).toBe(0)
  })

  it('rolo de fita: 5m, trechos 3.80 + 1.10 + 4.20 + 2.50', () => {
    const trechos = [
      { id: 'a', comprimentoM: 3.8 },
      { id: 'b', comprimentoM: 1.1 },
      { id: 'c', comprimentoM: 4.2 },
      { id: 'd', comprimentoM: 2.5 },
    ]
    const plano = calcularPlanoDeCorte(trechos, 5)
    expect(plano.totalNecessarioM).toBeCloseTo(11.6)
    // 4.20 sozinho quase enche um rolo; 3.80+1.10=4.90 cabem juntos; 2.50 sobra pra outro rolo
    expect(plano.quantidadePecas).toBeGreaterThanOrEqual(3)
  })
})

describe('round2', () => {
  it('arredonda pra duas casas decimais', () => {
    expect(round2(1.005)).toBeCloseTo(1.01, 2)
    expect(round2(120.955)).toBeCloseTo(120.96, 1)
  })
})

describe('sugerirFonte', () => {
  it('sugere exatamente o valor do catálogo quando bate certinho', () => {
    expect(sugerirFonte(60)).toBe(60)
  })

  it('sugere a próxima potência acima quando não bate exato (nunca abaixo do mínimo)', () => {
    expect(sugerirFonte(45)).toBe(48)
    expect(sugerirFonte(48.01)).toBe(60)
  })

  it('exemplo real: fonte mínima 40W (0.80m x 22W/m x 1.2 = 21.12W) sugere 24W', () => {
    expect(sugerirFonte(21.12)).toBe(24)
  })

  it('acima do maior item do catálogo retorna null (precisa mais de uma fonte)', () => {
    expect(sugerirFonte(450)).toBeNull()
  })

  it('mínimo zero ou negativo retorna null', () => {
    expect(sugerirFonte(0)).toBeNull()
    expect(sugerirFonte(-5)).toBeNull()
  })
})
