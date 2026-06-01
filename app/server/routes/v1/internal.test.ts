import { describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../../internal/password'

function createRes() {
  const out: any = { statusCode: 200, body: null }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.json = (body: any) => {
    out.body = body
    return out
  }
  return out
}

describe('internal routes', () => {
  it('retourne un token sur login valide', async () => {
    process.env.INTERNAL_JWT_SECRET = 'test-secret'
    vi.mock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({
          internal_user_id: 'iu-1',
          email: 'a@b.c',
          role: 'admin',
          password_hash: hashPassword('pw'),
        }),
      }),
    }))
    const mod = await import('./internal')
    const req: any = { body: { email: 'a@b.c', password: 'pw' } }
    const res = createRes()
    await mod.internalLoginHandler(req, res as any)
    expect(res.statusCode).toBe(200)
    expect(typeof res.body?.token).toBe('string')
  }, 20_000)
})
