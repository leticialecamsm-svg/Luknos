import { describe, it, expect } from 'vitest'
import { parseContactCard, prettyPhone } from './crm-contact-card'

describe('crm-contact-card', () => {
  it('lê um contato com telefone', () => {
    expect(parseContactCard('👤 Contato\nMaxwell Luz&tudo · +5582993079580')).toEqual([{ name: 'Maxwell Luz&tudo', phone: '+5582993079580' }])
  })
  it('lê vários contatos', () => {
    expect(parseContactCard('👤 Contatos\nAna · +5582999990000\nBeto')).toEqual([
      { name: 'Ana', phone: '+5582999990000' },
      { name: 'Beto', phone: null },
    ])
  })
  it('aceita o formato antigo', () => {
    expect(parseContactCard('👤 Contato: Fulano')).toEqual([{ name: 'Fulano', phone: null }])
  })
  it('não confunde outras mensagens', () => {
    expect(parseContactCard('📍 Localização')).toBeNull()
    expect(parseContactCard('oi')).toBeNull()
    expect(parseContactCard(null)).toBeNull()
  })
  it('formata telefone brasileiro', () => {
    expect(prettyPhone('+5582993079580')).toBe('+55 82 99307-9580')
    expect(prettyPhone('+14155550123')).toBe('+14155550123')
    expect(prettyPhone(null)).toBe('')
  })
})
