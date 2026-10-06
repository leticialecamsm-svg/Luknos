import { describe, expect, it } from 'vitest'
import { kindOf, rowFor } from './embuled-sync'

describe('embuled — linhas do catálogo', () => {
  const parent = { id: 1, name: 'Sinu', sku: 'EBAR9113-EBAR9114', type: 'variable', permalink: 'https://embuled.com/produto/sinu/', images: [], categories: [{ name: 'Arandelas' }] }
  it('variação leva o atributo no nome e herda o tipo da categoria do produto', () => {
    const v = { id: 2, name: 'Sinu', sku: 'EBAR9113', type: 'variation', parent: 1, permalink: '', images: [], attributes: [{ name: 'Cor', value: 'preto' }] }
    expect(rowFor(v, parent)).toMatchObject({ name: 'Sinu preto', line: 'Sinu', kind: 'arandela', variant: 'preto' })
  })
  it('tipo pelo nome quando a categoria não ajuda', () => {
    expect(kindOf('Espeto Led')).toBe('espeto')
    expect(kindOf('Hex Antiofuscante | 18W')).toBeNull()
  })
})
