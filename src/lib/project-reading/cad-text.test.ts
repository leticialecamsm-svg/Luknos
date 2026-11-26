import { describe, it, expect } from 'vitest'
import { deCabecaPraBaixo } from './cad-text'

const H = 0, V = -Math.PI / 2 // texto deitado e texto de baixo pra cima

describe('texto legível na planta girada', () => {
  it('nunca fica de cabeça pra baixo, em qualquer giro', () => {
    for (const giro of [0, 90, 180, 270]) for (const ang of [H, V, Math.PI / 6, -Math.PI / 3, Math.PI, Math.PI / 2]) {
      const virar = deCabecaPraBaixo(ang, giro)
      expect(deCabecaPraBaixo(ang + (virar ? Math.PI : 0), giro)).toBe(false)
    }
  })
  it('com a planta a 90° o texto deitado passa a ler de baixo pra cima', () => {
    expect(deCabecaPraBaixo(H, 90)).toBe(true) // sairia de cima pra baixo
    expect(deCabecaPraBaixo(V, 90)).toBe(false) // o vertical fica deitado, certo
    expect(deCabecaPraBaixo(H, 180)).toBe(true)
    expect(deCabecaPraBaixo(H, 270)).toBe(false)
  })
})
