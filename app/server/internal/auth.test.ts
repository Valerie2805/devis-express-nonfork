import { describe, expect, it } from 'vitest'
import { signInternalToken, verifyInternalToken } from './auth.js'

describe('internal auth', () => {
  it('signe et vérifie un token', () => {
    const secret = 'test-secret'
    const token = signInternalToken({ internal_user_id: 'iu-1', email: 'a@b.c' }, secret)
    const payload = verifyInternalToken(token, secret)
    expect(payload.internal_user_id).toBe('iu-1')
  })
})
