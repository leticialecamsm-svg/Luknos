import { describe, it, expect } from 'vitest'
import { samePhone, phoneVariants, formatPhoneBR, extractLinks, isContactType, formatPhoneForContact, CONTACT_TYPES, isOpenQuote, isSpecifierType } from './crm-panel'

describe('samePhone (celular BR com/sem 9º dígito e DDI)', () => {
  it('mesmo número em formatos diferentes', () => {
    expect(samePhone('+55 82 99999-9999', '5582999999999')).toBe(true)
    expect(samePhone('(82) 99999-9999', '+5582999999999')).toBe(true)
  })
  it('com e sem o 9º dígito', () => {
    expect(samePhone('558299999999', '5582999999999')).toBe(true) // 12 vs 13 dígitos
    expect(samePhone('82 9327-7730', '558293277730')).toBe(true)
  })
  it('números diferentes', () => {
    expect(samePhone('5582999999999', '5582988888888')).toBe(false)
    expect(samePhone('5582999999999', '5511999999999')).toBe(false)
  })
  it('vazio nunca casa', () => {
    expect(samePhone('', '')).toBe(false)
    expect(samePhone(null, '5582999999999')).toBe(false)
    expect(phoneVariants('abc')).toEqual([])
  })
})

describe('formatPhoneBR', () => {
  it('formata', () => {
    expect(formatPhoneBR('5582993277730')).toBe('+55 82 99327-7730')
    expect(formatPhoneBR('558293277730')).toBe('+55 82 9327-7730')
    expect(formatPhoneBR('15551234567')).toBe('+15551234567')
    expect(formatPhoneBR('')).toBe('')
  })
})

describe('extractLinks', () => {
  it('acha links e tira pontuação final', () => {
    expect(extractLinks('veja https://exemplo.com/a?b=1, e http://x.com.br.')).toEqual(['https://exemplo.com/a?b=1', 'http://x.com.br'])
  })
  it('sem links', () => {
    expect(extractLinks('oi tudo bem')).toEqual([])
    expect(extractLinks(null)).toEqual([])
  })
  it('não pega link dentro de parênteses fechando', () => {
    expect(extractLinks('(https://a.com/x)')).toEqual(['https://a.com/x'])
  })
})

describe('categorias de contato', () => {
  it('todas as categorias do sistema', () => {
    expect(CONTACT_TYPES.map((t) => t.value)).toEqual(['client', 'architect', 'designer', 'electrician', 'engineer', 'plasterer', 'other'])
    expect(isContactType('architect')).toBe(true)
    expect(isContactType('hacker')).toBe(false)
    expect(isContactType(undefined)).toBe(false)
  })
  it('telefone no padrão do cadastro', () => {
    expect(formatPhoneForContact('558296717950')).toBe('55 82 9671-7950')
    expect(formatPhoneForContact('5582996717950')).toBe('55 82 99671-7950')
  })
})

describe('orçamento em aberto / especificador', () => {
  it('em aberto: sem negociação, fria, morna, sem previsão', () => {
    expect(isOpenQuote(null)).toBe(true)
    for (const t of ['cold', 'warm', 'no_forecast']) expect(isOpenQuote({ temperature: t })).toBe(true)
  })
  it('fechado e perdido não são em aberto', () => {
    expect(isOpenQuote({ temperature: 'closed' })).toBe(false)
    expect(isOpenQuote({ temperature: 'lost' })).toBe(false)
  })
  it('especificadores', () => {
    for (const t of ['architect', 'designer', 'electrician', 'engineer', 'plasterer']) expect(isSpecifierType(t)).toBe(true)
    expect(isSpecifierType('client')).toBe(false)
    expect(isSpecifierType('other')).toBe(false)
    expect(isSpecifierType(null)).toBe(false)
  })
})
