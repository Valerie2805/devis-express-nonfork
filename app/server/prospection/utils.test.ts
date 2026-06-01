import { describe, expect, it } from 'vitest'
import { parseInboundAlias } from './utils'

describe('parseInboundAlias', () => {
  it('extrait prospectId', () => {
    expect(parseInboundAlias('p_abc@inbound.example.com', 'inbound.example.com')).toBe('abc')
  })

  it('retourne null si domaine ne match pas', () => {
    expect(parseInboundAlias('p_abc@inbound.example.com', 'other.example.com')).toBe(null)
  })
})

