import { describe, expect, it } from 'vitest'
import { computeMailgunSignature, verifyMailgunSignature } from './mailgun'

describe('mailgun', () => {
  it('valide une signature correcte', () => {
    const key = 'k'
    const timestamp = '1710000000'
    const token = 't'
    const signature = computeMailgunSignature(key, timestamp, token)
    expect(verifyMailgunSignature({ timestamp, token, signature }, key)).toBe(true)
  })

  it('refuse une signature incorrecte', () => {
    const key = 'k'
    expect(verifyMailgunSignature({ timestamp: '1', token: 't', signature: 'bad' }, key)).toBe(false)
  })
})

