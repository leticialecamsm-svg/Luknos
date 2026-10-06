import { describe, expect, it } from 'vitest'
import { dimsOf, kindOf, parseProduct } from './blumenau-sync'

describe('blumenau — página de produto', () => {
  const obj = JSON.stringify({ Id: '5808', Nome: 'Arandela Colonial Nina Quadrada - Vidro Liso - Preto', Tensao: '100-240V', Temperatura: null, Sku: '102800-01',
    Caracteristicas: "<table><tr><td class='t'>Potência:</td><td class='v'>20W</td></tr><tr><td class='t'>Dimensões (MM):</td><td class='v'>217,00 x 290,00 x 154,00 (Comp. x Alt. x Larg.)</td></tr></table>" })
  const lit = JSON.stringify(obj).replace(/'/g, "\\'")
  const html = `<meta property="og:image" content="https://blumenauiluminacao.com.br/resize/x.png" /><script>$scope.product = JSON.parse(${lit});</script>`
  it('lê SKU, nome, potência, medidas e foto', () => {
    expect(parseProduct(html)).toMatchObject({ sku: '102800-01', name: 'Arandela Colonial Nina Quadrada - Vidro Liso - Preto', volt: '100-240V', power: '20W', image: 'https://blumenauiluminacao.com.br/resize/x.png' })
  })
  it('medidas em cm e tipo', () => {
    expect(dimsOf('217,00 x 290,00 x 154,00 (Comp. x Alt. x Larg.)')).toMatchObject({ largura_cm: 21.7, altura_cm: 29, profundidade_cm: 15.4 })
    expect(kindOf('Fita de LED 22W/m')).toBe('fita')
  })
})
