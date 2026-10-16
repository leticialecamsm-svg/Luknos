import { describe, it, expect } from 'vitest'
import { applyFormat, parseInline, parseWhatsApp, stripFormatting } from './wa-format'

describe('applyFormat (botões do editor)', () => {
  it('negrito na seleção', () => {
    expect(applyFormat('oi mundo', 3, 8, 'bold')).toEqual({ value: 'oi *mundo*', start: 4, end: 9 })
  })
  it('sem seleção: insere marcadores e cursor no meio', () => {
    expect(applyFormat('oi ', 3, 3, 'italic')).toEqual({ value: 'oi __', start: 4, end: 4 })
  })
  it('alterna: clicar de novo remove', () => {
    const a = applyFormat('oi mundo', 3, 8, 'bold')
    expect(applyFormat(a.value, a.start, a.end, 'bold').value).toBe('oi mundo')
  })
  it('espaços nas pontas ficam fora dos marcadores', () => {
    expect(applyFormat('a  casa  b', 1, 9, 'bold').value).toBe('a  *casa*  b')
  })
  it('riscado, código e monoespaçado', () => {
    expect(applyFormat('x', 0, 1, 'strike').value).toBe('~x~')
    expect(applyFormat('x', 0, 1, 'code').value).toBe('`x`')
    expect(applyFormat('x', 0, 1, 'mono').value).toBe('```x```')
  })
  it('lista com marcadores em várias linhas, e alternar remove', () => {
    const a = applyFormat('um\ndois\ntres', 0, 12, 'bullet')
    expect(a.value).toBe('- um\n- dois\n- tres')
    expect(applyFormat(a.value, a.start, a.end, 'bullet').value).toBe('um\ndois\ntres')
  })
  it('lista numerada e citação', () => {
    expect(applyFormat('a\nb', 0, 3, 'numbered').value).toBe('1. a\n2. b')
    expect(applyFormat('frase', 0, 5, 'quote').value).toBe('> frase')
  })
  it('lista só na linha onde está o cursor', () => {
    expect(applyFormat('a\nb\nc', 2, 2, 'bullet').value).toBe('a\n- b\nc')
  })
  it('trocar o tipo de prefixo não acumula', () => {
    expect(applyFormat('- a', 0, 3, 'quote').value).toBe('> a')
  })
})

describe('parseInline (exibição)', () => {
  it('negrito, itálico, riscado, código', () => {
    expect(parseInline('*a* _b_ ~c~ `d`')).toEqual([
      { t: 'b', c: [{ t: 'text', v: 'a' }] }, { t: 'text', v: ' ' },
      { t: 'i', c: [{ t: 'text', v: 'b' }] }, { t: 'text', v: ' ' },
      { t: 's', c: [{ t: 'text', v: 'c' }] }, { t: 'text', v: ' ' },
      { t: 'code', v: 'd' },
    ])
  })
  it('aninhado: negrito com itálico dentro', () => {
    expect(parseInline('*oi _você_*')).toEqual([{ t: 'b', c: [{ t: 'text', v: 'oi ' }, { t: 'i', c: [{ t: 'text', v: 'você' }] }] }])
  })
  it('asterisco solto, multiplicação e espaços não formatam', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ t: 'text', v: '2 * 3 * 4' }])
    expect(parseInline('* texto *')).toEqual([{ t: 'text', v: '* texto *' }])
    expect(parseInline('snake_case_name')).toEqual([{ t: 'text', v: 'snake_case_name' }])
  })
  it('código não interpreta o que está dentro', () => {
    expect(parseInline('`*x*`')).toEqual([{ t: 'code', v: '*x*' }])
  })
  it('link vira link, sem a pontuação final', () => {
    expect(parseInline('veja https://a.com/x.')).toEqual([{ t: 'text', v: 'veja ' }, { t: 'link', v: 'https://a.com/x' }, { t: 'text', v: '.' }])
  })
  it('HTML fica como texto', () => {
    expect(parseInline('<b>oi</b>')).toEqual([{ t: 'text', v: '<b>oi</b>' }])
  })
})

describe('parseWhatsApp (blocos)', () => {
  it('lista, numerada e citação', () => {
    const b = parseWhatsApp('- a\n1. b\n> c\ntexto')
    expect(b.map((x) => x.t)).toEqual(['li', 'li', 'quote', 'p'])
    expect((b[1] as any).n).toBe(1)
  })
  it('bloco mono em várias linhas', () => {
    expect(parseWhatsApp('```\nlinha1\nlinha2\n```')).toEqual([{ t: 'mono', v: 'linha1\nlinha2\n' }])
  })
  it('mono sem fechar vira texto comum', () => {
    expect(parseWhatsApp('```abc')[0].t).toBe('p')
  })
  it('"*texto*" no começo da linha é negrito, não lista', () => {
    expect(parseWhatsApp('*Atenção*')[0].t).toBe('p')
  })
})

describe('stripFormatting (prévia)', () => {
  it('tira os marcadores', () => {
    expect(stripFormatting('resposta *com negrito* e _itálico_')).toBe('resposta com negrito e itálico')
    expect(stripFormatting('`0ieee`')).toBe('0ieee')
    expect(stripFormatting('- a\n- b')).toBe('a b')
  })
  it('vazio', () => { expect(stripFormatting(null)).toBe('') })
})
