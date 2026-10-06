import { describe, expect, it } from 'vitest'
import { erpKind, parseFamily, parseGallery } from './avant-sync'

describe('avant — família e galeria', () => {
  const html = `<title>Fita LED Risqué TRIO - Avant</title>
    <meta property="og:image" content="https://avantlux.com.br/wp-content/uploads/2024/08/trio-1.png" />
    <img src="https://avantlux.com.br/wp-content/uploads/2024/08/297057846-LED-FITA-INT-RISQUE-TRIO-IP20-40WM-5M-RGB-24V-e1723814153316-1-300x300.png" />
    <img src="https://avantlux.com.br/wp-content/uploads/2024/08/297057846-LED-FITA-INT-RISQUE-TRIO-IP20-40WM-5M-RGB-24V-e1723814153316-1-150x150.png" />
    <img src="https://avantlux.com.br/wp-content/uploads/2024/08/589518075-LED-ARANDELA-MARINA-15W-3000K-6500K-300-DO.png" />`
  it('lê o código e a descrição do ERP no nome do arquivo e devolve o original', () => {
    const g = parseGallery(html)
    expect(g).toHaveLength(2)
    expect(g[0]).toMatchObject({ code: '297057846', erp: 'LED-FITA-INT-RISQUE-TRIO-IP20-40WM-5M-RGB-24V' })
    expect(g[0].url).toBe('https://avantlux.com.br/wp-content/uploads/2024/08/297057846-LED-FITA-INT-RISQUE-TRIO-IP20-40WM-5M-RGB-24V-e1723814153316-1.png')
    expect(g[1]).toMatchObject({ code: '589518075', erp: 'LED-ARANDELA-MARINA-15W-3000K-6500K-300-DO' })
  })
  it('lê o nome e a foto principal da família', () => {
    expect(parseFamily(html)).toMatchObject({ title: 'Fita LED Risqué TRIO', image: 'https://avantlux.com.br/wp-content/uploads/2024/08/trio-1.png' })
  })
  it('tipo pela descrição do ERP', () => {
    expect(erpKind('LED-FITA-INT-RISQUE-TRIO-IP20')).toBe('fita')
    expect(erpKind('ARAND-ECLIPSE-4XG9-160X30CM-PRETO')).toBe('arandela')
    expect(erpKind('PEND-ORGANICO-REDONDO-60CM')).toBe('pendente')
    expect(erpKind('KIT-GANCHO-HIGH-BAY-LINEAR-PRO')).toBe('gancho')
    expect(erpKind('LED-BALIZADOR-EFFECT-WASH')).toBe('balizador')
  })
})
