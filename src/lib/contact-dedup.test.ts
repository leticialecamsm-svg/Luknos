import { describe, it, expect } from 'vitest'
import { normalizeContactName, findDuplicateContact } from './contact-dedup'

const base = [
  { id: '1', name: 'Adna Oliveira', phone: null, email: null },
  { id: '2', name: 'Maria Silva', phone: '82 99111-2222', email: 'maria@x.com' },
]

describe('normalizeContactName', () => {
  it('ignora acento, caixa, pontuação e espaços', () => {
    expect(normalizeContactName('  Ádna   OLIVEIRA. ')).toBe('adna oliveira')
    expect(normalizeContactName('João-Paulo Conceição')).toBe('joao paulo conceicao')
  })
})

describe('findDuplicateContact', () => {
  it('pega nome igual com acento diferente (caso Adna)', () => {
    const d = findDuplicateContact({ name: 'Ádna Oliveira', phone: '82 9127-5606' }, base)
    expect(d?.contact.id).toBe('1')
    expect(d?.reason).toBe('name')
  })
  it('pega mesmo telefone com e sem 9º dígito e DDI', () => {
    expect(findDuplicateContact({ name: 'Outra', phone: '+55 82 9111-2222' }, base)?.reason).toBe('phone')
  })
  it('pega mesmo e-mail ignorando caixa', () => {
    expect(findDuplicateContact({ name: 'Outra', email: 'MARIA@x.com ' }, base)?.reason).toBe('email')
  })
  it('homônimo com telefone diferente passa', () => {
    expect(findDuplicateContact({ name: 'Maria Silva', phone: '82 98888-7777' }, base)).toBeNull()
  })
  it('homônimo sem telefone é barrado', () => {
    expect(findDuplicateContact({ name: 'maria silva' }, base)?.contact.id).toBe('2')
  })
  it('ignora o próprio contato ao editar', () => {
    expect(findDuplicateContact({ name: 'Adna Oliveira' }, base, '1')).toBeNull()
  })
})

describe('findDuplicateContact sem checar telefone (fora do CRM)', () => {
  it('telefone igual com nome diferente passa', () => {
    expect(findDuplicateContact({ name: 'Rafael', phone: '82 99111-2222' }, base, null, { phone: false })).toBeNull()
  })
  it('nome igual e mesmo telefone continua barrado', () => {
    expect(findDuplicateContact({ name: 'Maria Silva', phone: '82 9111-2222' }, base, null, { phone: false })?.reason).toBe('name')
  })
})
