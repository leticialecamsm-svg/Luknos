import { describe, it, expect } from 'vitest'
import { isValidInstanceName, samePhoneDigits, groupByStage, normalizeStageName, sameStageName, validateStageInput, STAGE_NAME_MAX, type CrmStage } from './crm-stages'

const S = (id: string, position: number): CrmStage => ({ id, name: id, color: '#3b82f6', position, restart_on_inbound: false })

describe('validateStageInput', () => {
  it('aceita e normaliza nome', () => {
    expect(validateStageInput({ name: '  Em   conversa ', color: '#ABCDEF' })).toEqual({ name: 'Em conversa', color: '#abcdef', restart_on_inbound: false })
  })
  it('rejeita vazio / só espaços / só espaço unicode', () => {
    for (const n of ['', '   ', '\t\n']) expect(validateStageInput({ name: n, color: '#000000' })).toHaveProperty('error')
  })
  it('limite de tamanho (borda 40 ok, 41 erro)', () => {
    expect(validateStageInput({ name: 'a'.repeat(STAGE_NAME_MAX), color: '#000000' })).not.toHaveProperty('error')
    expect(validateStageInput({ name: 'a'.repeat(STAGE_NAME_MAX + 1), color: '#000000' })).toHaveProperty('error')
  })
  it('rejeita cor inválida (css injection, curto, sem #)', () => {
    for (const c of ['red', '#fff', '000000', '#12345g', 'url(x)', '#000000;background:red', '']) {
      expect(validateStageInput({ name: 'x', color: c })).toHaveProperty('error')
    }
  })
  it('mantém acentos, emoji e HTML como texto (React escapa)', () => {
    const r = validateStageInput({ name: '<b>Orçamento ✅</b>', color: '#000000' }) as any
    expect(r.name).toBe('<b>Orçamento ✅</b>')
  })
})

describe('sameStageName', () => {
  it('ignora caixa e espaços; acentos diferem', () => {
    expect(sameStageName(' Fechado ', 'fechado')).toBe(true)
    expect(sameStageName('Negociação', 'NEGOCIAÇÃO')).toBe(true)
    expect(sameStageName('Negociacao', 'Negociação')).toBe(false)
  })
  it('normalizeStageName colapsa espaços internos', () => {
    expect(normalizeStageName('a   b\t c')).toBe('a b c')
  })
})

describe('groupByStage (invariante: toda conversa aparece exatamente 1 vez)', () => {
  const stages = [S('b', 1), S('a', 0), S('c', 2)]
  it('sem etapa ou etapa inexistente → primeira coluna por position', () => {
    const cards = [
      { id: '1', stage_id: null },
      { id: '2', stage_id: 'zzz' },
      { id: '3', stage_id: 'c' },
      { id: '4', stage_id: 'b' },
    ]
    const g = groupByStage(stages, cards)
    expect(g.get('a')!.map((c) => c.id)).toEqual(['1', '2'])
    expect(g.get('b')!.map((c) => c.id)).toEqual(['4'])
    expect(g.get('c')!.map((c) => c.id)).toEqual(['3'])
    const total = Array.from(g.values()).reduce((n, l) => n + l.length, 0)
    expect(total).toBe(cards.length)
  })
  it('sem colunas: nada some silenciosamente além de não haver onde mostrar', () => {
    expect(groupByStage([], [{ id: '1', stage_id: null }]).size).toBe(0)
  })
  it('preserva a ordem de entrada dos cartões', () => {
    const g = groupByStage(stages, [{ id: '9', stage_id: 'a' }, { id: '1', stage_id: 'a' }])
    expect(g.get('a')!.map((c) => c.id)).toEqual(['9', '1'])
  })
})

describe('instâncias', () => {
  it('nome da instância: aceita acento/espaço/hífen, rejeita / ? # %', () => {
    expect(isValidInstanceName('Letícia Pimentel - Bussiness')).toBe(true)
    expect(isValidInstanceName('vendas_maria.2')).toBe(true)
    for (const n of ['a/b', 'a?b', 'a#b', 'a%20b', '', '   ', 'x'.repeat(61)]) expect(isValidInstanceName(n)).toBe(false)
  })
  it('telefone duplicado é comparado só pelos dígitos', () => {
    expect(samePhoneDigits('+55 82 99999-9999', '+5582999999999')).toBe(true)
    expect(samePhoneDigits('+5582999999999', '+5582988888888')).toBe(false)
    expect(samePhoneDigits(null, null)).toBe(false)
    expect(samePhoneDigits('', '')).toBe(false)
  })
})
