import { describe, expect, it } from 'vitest'
import { descDims, matchCatalog, type CatalogEntry } from './match'

const entry = (ref: string, name: string, line: string | null, d: Partial<CatalogEntry> = {}): CatalogEntry => ({
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
    expect(descDims('PENDENTE ANGULAR RD 190X460MM')).toEqual([19, 46])
    expect(descDims('PENDENTE AGORA D250X157MM')).toEqual([25, 15.7])
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

describe('matchCatalog — Hevvy (modelo + cor, sem medidas)', () => {
  const hevvy = [
    entry('1088', 'Arandela Katana', 'Arandelas Katana', { model: 'SL-5910L/W2 BK' }),
    entry('1091', 'Arandela Katana', 'Arandelas Katana', { model: 'SL-5910L/W2 GD' }),
    entry('1087', 'Arandela Katana', 'Arandelas Katana', { model: 'SL-5910M/W2 BK' }),
    entry('1534', 'Arandela Tron', 'Arandelas Tron', { model: 'PZ-002/80WL1 GD+BK' }),
    entry('1539', 'Arandela Tron', 'Arandelas Tron', { model: 'PZ-002/80WL1 BK', ean: '7899923400000' }),
  ]

  it('acha o modelo na descrição e escolhe a cor', () => {
    expect(matchCatalog({ descricao: 'ARANDELA KATANA LED 3000K 29W SL-5910L W2 SAND GOL' }, hevvy)?.ref).toBe('1091')
    expect(matchCatalog({ descricao: 'ARANDELA KATANA LED 3000K 29W SL-5910L W2 BK' }, hevvy)?.ref).toBe('1088')
    expect(matchCatalog({ descricao: 'ARANDELA KATANA LED 3000K 24W SL-5910M W2 BLACK' }, hevvy)?.ref).toBe('1087')
  })

  it('sem medidas no catálogo, aceita pelo nome e desempata pela cor', () => {
    expect(matchCatalog({ descricao: 'ARANDELA TRON 89CM 31W 3000K BLACK' }, hevvy)).toMatchObject({ ref: '1539', match: 'nome' })
  })

  it('código do XML pode ser EAN ou modelo', () => {
    expect(matchCatalog({ codigo_produto: '7899923400000', descricao: 'X' }, hevvy)?.ref).toBe('1539')
    expect(matchCatalog({ codigo_produto: 'SL-5910L/W2 GD', descricao: 'ARANDELA' }, hevvy)).toMatchObject({ ref: '1091', match: 'codigo' })
  })
})

describe('matchCatalog — Skylight, Spotline e Usina', () => {
  const cat = [
    entry('SKY-4122M', 'Pendente BOMBYX', 'BOMBYX', { kind: 'pendente', largura_cm: 60, altura_cm: 26, model: 'SKY-4122M', variant: 'BRANCO' }),
    entry('SKY-4122P', 'Pendente BOMBYX', 'BOMBYX', { kind: 'pendente', largura_cm: 60, altura_cm: 26, model: 'SKY-4122P', variant: 'PRETO' }),
    { ...entry('SKY-CB02BR', 'CABO TECIDO - BRANCO', null), kind: null },
    entry('1096/1', 'Pendente Rio', null, { kind: 'pendente', model: '1096/1' }),
    entry('1500', 'Pendente Hoop', 'Hoop', { kind: 'pendente' }),
    entry('19750-6LED3', 'Pendente Angular', 'Angular', { kind: 'pendente', diametro_cm: 19, altura_cm: 46, model: '19750-6LED3' }),
    entry('19760-1LED3', 'Abajur Angular', 'Angular', { kind: 'abajur', diametro_cm: 26, altura_cm: 52, model: '19760-1LED3' }),
  ]

  it('código do XML igual à ref do catálogo', () => {
    expect(matchCatalog({ codigo_produto: 'SKY-4122P', descricao: 'PENDENTE BOMBYX 60CM' }, cat)).toMatchObject({ ref: 'SKY-4122P', match: 'codigo' })
  })

  it('número do modelo no começo da descrição (Spotline)', () => {
    expect(matchCatalog({ descricao: '1096/1 PENDENTE RIO PRETO 3000 K FCP ST [ BC=760,38 ]' }, cat)).toMatchObject({ ref: '1096/1', match: 'descricao' })
  })

  it('número solto não é código: "1500 lm" não vira a ref 1500', () => {
    expect(matchCatalog({ descricao: 'FITA LED 1500 LM' }, cat)).toBeNull()
  })

  it('palavra rara pesa mais que cor e acessório: Bombyx branco não vira cabo branco; a cor desempata', () => {
    expect(matchCatalog({ descricao: 'PENDENTE BOMBYX 60CM BRANCO - 2MT DE CABO' }, cat)).toMatchObject({ ref: 'SKY-4122M', match: 'nome' })
    expect(matchCatalog({ descricao: 'PENDENTE BOMBYX 60CM PRETO' }, cat)?.ref).toBe('SKY-4122P')
  })

  it('medidas em mm e tipo obrigatório (Usina)', () => {
    expect(matchCatalog({ descricao: 'PENDENTE ANGULAR RD 190X460MM 1G9 CN-F FCP ST [ BC=398,28 ]' }, cat)?.ref).toBe('19750-6LED3')
    expect(matchCatalog({ descricao: 'ABAJUR ANGULAR RD 260X520MM 1 G45 CN-F FCP ST' }, cat)?.ref).toBe('19760-1LED3')
    expect(matchCatalog({ descricao: 'ABAJUR ANGULAR RD 190X460MM' }, cat)).toBeNull()
  })
})

describe('matchCatalog — empate entre produtos', () => {
  it('no empate vale o produto cujo nome a nota mais cobre (fonte × cabo conector fonte/fita)', () => {
    const cat = [entry('A-CABO', 'Cabo conector fonte/fita 10mm', null), entry('B-FONTE', 'Fonte Metálica', null)]
    expect(matchCatalog({ descricao: 'FONTE SLIM 200W 12V 16,6A BIVOLT' }, cat)?.ref).toBe('B-FONTE')
    expect(matchCatalog({ descricao: 'FONTE SLIM 200W 12V 16,6A BIVOLT' }, [...cat].reverse())?.ref).toBe('B-FONTE')
  })
})

describe('matchCatalog — especificação não decide o produto', () => {
  it('"IP65" e "RGB" soltos num acessório não ganham do produto certo', () => {
    const cat = [
      entry('P-PLUG', 'Plug para Fita COB IP65 127V/200V', null),
      entry('P-FITA', 'Fita Pix 12V', null),
      entry('P-POP', 'Fita Led Pop', null),
      entry('P-EMENDA', 'Emenda L 90º Fita RGB', null),
    ]
    expect(matchCatalog({ descricao: 'FITA LED PIX 10W 12V 3000K IP65 2835 5M' }, cat)?.ref).toBe('P-FITA')
    expect(matchCatalog({ descricao: 'FITA LED POP 10W 12V RGB IP20 60 LEDS/M 5M' }, cat)?.ref).toBe('P-POP')
  })
})

describe('matchCatalog — nome do produto no começo da nota; "luminária" genérica', () => {
  const cat = [
    entry('L-DIC', 'Dicróica', null), entry('L-DIC2', 'Mini Dicróica', null), entry('L-DIC3', 'Dicróica Rgb', null),
    entry('L-SOLO', 'Embutido De Solo Flat', null), entry('L-4F', 'De Solo 4 Fachos', null, { kind: 'luminaria' }),
    ...Array.from({ length: 30 }, (_, i) => entry(`L-X${i}`, `Produto ${i}`, null)),
  ]
  it('palavra comum no catálogo basta quando a nota começa com o nome inteiro', () => {
    expect(matchCatalog({ descricao: 'DICROICA GU10 LED 6,5W 4000K 127/220V' }, cat)?.ref).toBe('L-DIC')
  })
  it('"LUMINARIA" não impede casar com um produto de outro tipo', () => {
    expect(matchCatalog({ descricao: 'LUMINARIA LED EMBUTIDO DE SOLO FLAT PRETO 3W 2700K IP67' }, cat)?.ref).toBe('L-SOLO')
  })
})
