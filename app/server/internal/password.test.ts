import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('internal password', () => {
  it('hash et vérifie un mot de passe', () => {
    const hash = hashPassword('secret')
    expect(verifyPassword('secret', hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
  }, 20_000)
})
