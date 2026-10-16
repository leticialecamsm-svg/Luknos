import { describe, it, expect } from 'vitest'
import { nextSpeed, speedLabel, computePeaks, fallbackPeaks, formatClock, ratioFromPointer, fileExtension, extColor } from './audio-ui'

describe('velocidade', () => {
  it('cicla 1x → 1,5x → 2x → 1x', () => {
    expect(nextSpeed(1)).toBe(1.5)
    expect(nextSpeed(1.5)).toBe(2)
    expect(nextSpeed(2)).toBe(1)
    expect(nextSpeed(0.75)).toBe(1) // valor desconhecido volta para 1x
  })
  it('rótulos em português', () => {
    expect(speedLabel(1)).toBe('1x'); expect(speedLabel(1.5)).toBe('1,5x'); expect(speedLabel(2)).toBe('2x')
  })
})

describe('computePeaks', () => {
  it('N barras entre 0 e 1, normalizadas pelo maior pico', () => {
    const samples = new Float32Array(1000)
    samples[10] = 0.5; samples[510] = -1
    const p = computePeaks(samples, 10)
    expect(p).toHaveLength(10)
    expect(Math.max(...p)).toBe(1)
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0.08)
    expect(p[5]).toBe(1)
    expect(p[0]).toBeCloseTo(0.5)
  })
  it('silêncio e vazio não quebram', () => {
    expect(computePeaks(new Float32Array(100), 4)).toEqual([0.08, 0.08, 0.08, 0.08])
    expect(computePeaks([], 3)).toEqual([0.08, 0.08, 0.08])
    expect(computePeaks([0.5], 0)).toEqual([])
  })
  it('menos amostras que barras', () => {
    expect(computePeaks([0.5, 1], 5)).toHaveLength(5)
  })
  it('fallback é estável para a mesma semente', () => {
    expect(fallbackPeaks('abc', 8)).toEqual(fallbackPeaks('abc', 8))
    expect(fallbackPeaks('abc', 8)).not.toEqual(fallbackPeaks('abd', 8))
    expect(fallbackPeaks('x', 5).every((v) => v >= 0.2 && v <= 1)).toBe(true)
  })
})

describe('relógio e posição', () => {
  it('formata mm:ss', () => {
    expect(formatClock(0)).toBe('0:00'); expect(formatClock(62.9)).toBe('1:02'); expect(formatClock(NaN)).toBe('0:00'); expect(formatClock(Infinity)).toBe('0:00')
  })
  it('clique na onda vira proporção limitada a 0..1', () => {
    expect(ratioFromPointer(150, 100, 200)).toBe(0.25)
    expect(ratioFromPointer(50, 100, 200)).toBe(0)
    expect(ratioFromPointer(400, 100, 200)).toBe(1)
    expect(ratioFromPointer(10, 0, 0)).toBe(0)
  })
})

describe('arquivos', () => {
  it('extensão', () => {
    expect(fileExtension('Projeto Final.DWG')).toBe('dwg')
    expect(fileExtension('arquivo')).toBe('')
    expect(fileExtension('a.tar.gz')).toBe('gz')
    expect(fileExtension(null)).toBe('')
  })
  it('cor por extensão, com padrão', () => {
    expect(extColor('pdf').fg).toBe('#B91C1C')
    expect(extColor('xyz').bg).toBe('#F1F5F9')
  })
})
