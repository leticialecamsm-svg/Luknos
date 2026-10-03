import { describe, expect, it } from 'vitest'
import { kindOf, parseCodes, pickCard, tipoDaPagina, type Card } from './usina-sync'

const card = (tipo: string): Card => ({ fam: 'x', tipo, img: '/a.jpg', linha: 'decorativo' })

describe('parseCodes', () => {
  it('lê a coluna "Descrição" pelo cabeçalho, mesmo quando não é a última', () => {
    const html = `<caption>Códigos da família Aivi</caption><table><thead><tr><th>Código</th><th>Dimensão (mm)</th><th>Descrição</th><th>Garantia</th></tr></thead>
      <tbody><tr><td><a>19750-6LED3</a></td><td>1000X140X100</td><td>Pendente Aivi</td><td>2 anos</td></tr></tbody></table>`
    expect(parseCodes(html)).toEqual([['19750-6LED3', '1000X140X100', 'Pendente Aivi']])
  })

  it('sem coluna de descrição, a descrição fica vazia (não vira "2 anos")', () => {
    const html = `<caption>Códigos da família Pegasus</caption><table><thead><tr><th>Código</th><th>Dimensão (mm)</th><th>Garantia</th></tr></thead>
      <tbody><tr><td>19472-42LED3</td><td>Ø420X80</td><td>2 anos</td></tr></tbody></table>`
    expect(parseCodes(html)).toEqual([['19472-42LED3', 'Ø420X80', '']])
  })
})

describe('tipo do código', () => {
  it('lê o tipo da página do código', () => {
    const html = '<h1>x</h1><p>Código</p><p>19472-42LED3</p><p>Pegasus ·</p><p>Plafon/Arandela ·</p><p>Decorativo</p>'
    expect(tipoDaPagina(html, '19472-42LED3')).toBe('Plafon/Arandela')
  })

  it('escolhe o cartão certo', () => {
    const cards = [card('arandela'), card('plafonarandela'), card('pendente'), card('pendente-vertical')]
    expect(pickCard(cards, 'Plafon/Arandela')?.tipo).toBe('plafonarandela')
    expect(pickCard(cards, 'Pendente Vertical Aivi')?.tipo).toBe('pendente-vertical')
    expect(pickCard(cards, 'Pendente Aivi')?.tipo).toBe('pendente')
    expect(pickCard(cards, 'Canopla Blank')).toBeNull()
  })

  it('tipo a partir do slug', () => {
    expect(kindOf('pendente-vertical')).toBe('pendente')
    expect(kindOf('plafonarandela')).toBe('plafon')
    expect(kindOf('embutido-no-frame')).toBe('embutido')
  })
})
