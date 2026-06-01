import { describe, expect, it } from 'vitest'
import { loginInternalUser } from './login'
import { hashPassword } from './password.js'

describe('loginInternalUser', () => {
  it('retourne un token si credentials valides', async () => {
    process.env.INTERNAL_JWT_SECRET = 'test-secret'
    const db: any = {
      get: async () => ({
        internal_user_id: 'iu-1',
        email: 'a@b.c',
        role: 'admin',
        password_hash: hashPassword('pw'),
      }),
    }
    const token = await loginInternalUser(db, 'a@b.c', 'pw')
    expect(typeof token).toBe('string')
    expect(token?.length).toBeGreaterThan(10)
  }, 20_000)

  it('retourne null si credentials invalides', async () => {
    process.env.INTERNAL_JWT_SECRET = 'test-secret'
    const db: any = {
      get: async () => ({
        internal_user_id: 'iu-1',
        email: 'a@b.c',
        role: 'admin',
        password_hash: hashPassword('pw'),
      }),
    }
    const token = await loginInternalUser(db, 'a@b.c', 'wrong')
    expect(token).toBe(null)
  }, 20_000)
})
