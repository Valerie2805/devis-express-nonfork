import { describe, expect, it } from 'vitest'
import { detectStandardPresence, hasPricingSignals } from './siteAudit'

describe('site audit presence', () => {
  it('détecte une page CGV', () => {
    const p = detectStandardPresence([
      'https://example.fr/',
      'https://example.fr/conditions-generales-de-vente',
      'https://example.fr/contact',
    ])
    expect(p.cgv).toBe(true)
    expect(p.contact).toBe(true)
  })

  it('détecte des signaux de tarifs dans le texte', () => {
    expect(hasPricingSignals('Tarifs : forfait à partir de 49€ TTC')).toBe(true)
    expect(hasPricingSignals('Nos prix : 120 euros')).toBe(true)
    expect(hasPricingSignals('Prix Nobel de la paix 2020')).toBe(false)
  })
})
