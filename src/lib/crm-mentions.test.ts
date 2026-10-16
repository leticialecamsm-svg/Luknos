import { describe, it, expect } from 'vitest'
import { applyMentionsToSend, activeMention, buildMentionNames, filterMembers, renderMentions, type GroupMember } from './crm-mentions'

const members: GroupMember[] = [
  { jid: '22235767173326@lid', phone: '5582991999249', name: 'Jennifer Luknos Iluminação', admin: false },
  { jid: '277978940498064@lid', phone: null, name: 'Biel', admin: true },
  { jid: '455484657852@lid', phone: '5582988888888', name: null, admin: false },
]

describe('crm-mentions', () => {
  it('troca o número pelo nome ao exibir', () => {
    const names = buildMentionNames(members)
    expect(renderMentions('Está a caminho? @277978940498064', names)).toBe('Está a caminho? *@Biel*')
    expect(renderMentions('oi @5582991999249', names)).toBe('oi *@Jennifer Luknos Iluminação*')
    expect(renderMentions('@999999999999 desconhecido', names)).toBe('@999999999999 desconhecido')
  })
  it('usa quem já falou no grupo quando a lista não veio', () => {
    const names = buildMentionNames([], [{ jid: '31241810219248@lid', name: 'João Pedro' }])
    expect(renderMentions('@31241810219248', names)).toBe('*@João Pedro*')
  })
  it('na hora de enviar, "@Nome" vira "@número" e lista os mencionados', () => {
    const r = applyMentionsToSend('@Biel e @Jennifer Luknos Iluminação, vejam', [
      { name: 'Biel', jid: '277978940498064@lid' },
      { name: 'Jennifer Luknos Iluminação', jid: '22235767173326@lid' },
    ])
    expect(r.text).toBe('@277978940498064 e @22235767173326, vejam')
    expect(r.mentioned).toEqual(['22235767173326@lid', '277978940498064@lid'])
    expect(r.all).toBe(false)
  })
  it('mantém só quem ainda está no texto', () => {
    const r = applyMentionsToSend('oi', [{ name: 'Biel', jid: '277978940498064@lid' }])
    expect(r.mentioned).toEqual([])
  })
  it('reconhece @todos', () => {
    expect(applyMentionsToSend('atenção @todos', []).all).toBe(true)
  })
  it('detecta o @ sendo digitado', () => {
    expect(activeMention('oi @bi', 6)).toEqual({ start: 3, query: 'bi' })
    expect(activeMention('email a@b.com', 13)).toBeNull()
    expect(activeMention('oi', 2)).toBeNull()
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' })
  })
  it('filtra por nome sem acento', () => {
    expect(filterMembers(members, 'jen').map((m) => m.name)).toEqual(['Jennifer Luknos Iluminação'])
    expect(filterMembers(members, 'ilum').length).toBe(1)
    expect(filterMembers(members, '').length).toBe(3)
  })
})
