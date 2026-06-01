import { describe, expect, it } from 'vitest'
import { requireInternalAuth } from './middleware'
import { signInternalToken } from './auth.js'

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

describe('requireInternalAuth', () => {
  it('refuse sans token', () => {
    process.env.INTERNAL_JWT_SECRET = 'test-secret'
    const req: any = { header: () => '' }
    const res = createRes()
    let called = false
    requireInternalAuth(req, res as any, () => {
      called = true
    })
    expect(called).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('accepte avec un token valide', () => {
    process.env.INTERNAL_JWT_SECRET = 'test-secret'
    const token = signInternalToken({ internal_user_id: 'iu-1', email: 'a@b.c', role: 'admin' }, 'test-secret')
    const req: any = { header: () => `Bearer ${token}` }
    const res = createRes()
    let called = false
    requireInternalAuth(req, res as any, () => {
      called = true
    })
    expect(called).toBe(true)
    expect(req.internal_auth?.internal_user_id).toBe('iu-1')
  })
})
