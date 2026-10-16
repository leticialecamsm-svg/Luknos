import { describe, expect, it } from 'vitest'
import { cleanTitle, modelOf, parseProduct, sizeDims } from './sorteluz-sync'

describe('sorteluz — título, modelo e página', () => {
  it('tira código e "Ref." do título, de qualquer lado', () => {
    expect(cleanTitle('20876 - Painel de LED Embutir 18W 6400K DOB RED. ABS', '20876')).toBe('Painel de LED Embutir 18W 6400K DOB RED. ABS')
    expect(cleanTitle('REF.: 10672 - SERRA COPO DIAMANTADO 40MM', '10672')).toBe('SERRA COPO DIAMANTADO 40MM')
    expect(cleanTitle('DESENTUPIDOR TUFÃO 5M - 10615', '10615')).toBe('DESENTUPIDOR TUFÃO 5M')
    expect(cleanTitle('Globo 11W 6500K - Ref.: 20372', '20372')).toBe('Globo 11W 6500K')
  })
  it('acha o modelo do fabricante no nome', () => {
    expect(modelOf('PERFIL SO-205 2M BRANCO (EMBUTIR)')).toBe('SO-205')
    expect(modelOf('Perfil PXG-401A 2M')).toBe('PXG-401A')
    expect(modelOf('Drive DC 300W/12V')).toBeNull()
  })
  it('lê título, código, potência e foto da página do produto', () => {
    const html = `<div class="item-produto" id="lightgallery"><a href="assets/img/uploads/prod_1.png"><img src="assets/img/uploads/prod_1.png" /></a></div>
      <div class="item-produto descricao-produto"><div><h2>20876 - Painel de LED Embutir 18W 6400K DOB RED. ABS</h2><p>Marca: Forluz
Cód.: 20876
Potência: 18W
Temp. de Cor: 6400k
Tam.: 220x220mm
Tensão: BIVOLT</p></div>`
    expect(parseProduct(html)).toMatchObject({ brand: 'Forluz', code: '20876', power: '18W', temp: '6400k', size: '220x220mm', volt: 'BIVOLT', image: 'assets/img/uploads/prod_1.png' })
  })
  it('tamanho em mm, cm ou metros', () => {
    expect(sizeDims('220x220mm')).toMatchObject({ largura_cm: 22, altura_cm: 22 })
    expect(sizeDims('16X25CM')).toMatchObject({ largura_cm: 16, altura_cm: 25 })
    expect(sizeDims('2M')).toMatchObject({ largura_cm: null, altura_cm: null })
  })
})
