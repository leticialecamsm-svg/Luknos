import { describe, it, expect } from 'vitest'
import { groupReactions, isValidReaction } from './crm-reactions'

describe('crm-reactions', () => {
  it('agrupa por emoji, conta e marca a nossa', () => {
    const chips = groupReactions([
      { emoji: '👍', from_me: false, reactor_name: 'Ana' },
      { emoji: '❤️', from_me: true },
      { emoji: '👍', from_me: true },
    ])
    expect(chips[0]).toEqual({ emoji: '👍', count: 2, mine: true, names: ['Ana'] })
    expect(chips[1]).toEqual({ emoji: '❤️', count: 1, mine: true, names: [] })
  })
  it('sem reações devolve lista vazia', () => {
    expect(groupReactions([])).toEqual([])
  })
  it('valida o emoji', () => {
    expect(isValidReaction('👍')).toBe(true)
    expect(isValidReaction('')).toBe(true)
    expect(isValidReaction('💣')).toBe(false)
  })
})
