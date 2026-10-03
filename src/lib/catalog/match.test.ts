import { describe, expect, it } from 'vitest'
import { descDims, matchCatalog, type CatalogEntry } from './match'

const entry = (ref: string, name: string, line: string, d: Partial<CatalogEntry> = {}): CatalogEntry => ({
  ref, name, kind: name.split(' ')[0].toLowerCase(), line,
  altura_cm: null, largura_cm: null, profundidade_cm: null, diametro_cm: null,
  product_url: null, image_url: `https://x/${ref}.jpg`, source_image_url: null, finishes: [], ...d,
})

const catalog = [
  entry('1145', 'Pendente Accord Cônico', 'conica', { diametro_cm: 45, altura_cm: 28, finishes: [{ code: '48', name: 'Lâmina Tingida Cappuccino', url: 'https://x/48.png' }] }),
  entry('1233', 'Pendente Accord Cônico', 'conica', { diametro_cm: 16, altura_cm: 30 }),
  entry('4199', 'Arandela Accord Cônica', 'conica', { largura_cm: 15, profundidade_cm: 17, altura_cm: 17 }),
  entry('1364', 'Pendente Accord Fuchsia', 'fuchsia', { diametro_cm: 60, altura_cm: 40 }),
  entry('1365', 'Pendente Accord Fuchsia', 'fuchsia', { diametro_cm: 95, altura_cm: 22 }),
  entry('5113', 'Plafon Accord Horizon', 'horizon', { diametro_cm: 50, altura_cm: 15 }),
]

describe('descDims', () => {
  it('lê medidas com X, vírgula e CM', () => {
    expect(descDims('ARANDELA LEAF 33X9,5X34')).toEqual([33, 9.5, 34])
    expect(descDims('ARANDELA FLEXIVEL CILINDRICA 43CM')).toEqual([43])
    expect(descDims('PENDENTE HORIZON RINGS 30W')).toEqual([])
  })
})

describe('matchCatalog', () => {
  it('usa o código do XML com o acabamento', () => {
    const p = matchCatalog({ codigo_produto: '1145A.48', descricao: 'PENDENTE CONICO 45X28' }, catalog)
    expect(p).toMatchObject({ ref: '1145', match: 'codigo', finish: { code: '48' } })
  })

  it('usa a REF escrita na descrição', () => {
    expect(matchCatalog({ descricao: 'PENDENTE FUCHSIA GRANDE REF 1365' }, catalog)).toMatchObject({ ref: '1365', match: 'descricao' })
  })

  it('sugere pelo nome e medidas, respeitando o tipo', () => {
    expect(matchCatalog({ descricao: 'PENDENTE CONICO 16X30' }, catalog)?.ref).toBe('1233')
    expect(matchCatalog({ descricao: 'ARANDELA CONICA 15X17X17' }, catalog)?.ref).toBe('4199')
    expect(matchCatalog({ descricao: 'PENDENTE FUCHSIA 60X40' }, catalog)).toMatchObject({ ref: '1364', match: 'nome' })
  })

  it('não chuta quando as medidas não batem ou o tipo é outro', () => {
    expect(matchCatalog({ descricao: 'PENDENTE FUCHSIA 30X10' }, catalog)).toBeNull()
    expect(matchCatalog({ descricao: 'PENDENTE HORIZON - 22X50' }, catalog)).toBeNull()
  })

  it('respeita a escolha manual e o "sem foto"', () => {
    expect(matchCatalog({ descricao: 'PENDENTE FUCHSIA 60X40', catalog_ref: '1365' }, catalog)).toMatchObject({ ref: '1365', match: 'manual' })
    expect(matchCatalog({ codigo_produto: '1145A.48', descricao: 'X', catalog_ref: '-' }, catalog)).toBeNull()
  })
})
