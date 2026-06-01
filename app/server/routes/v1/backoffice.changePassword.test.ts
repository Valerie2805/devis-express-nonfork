import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>((r) => {
    resolveDone = r
  })
  const out: any = { statusCode: 200, body: null, done }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.json = (body: any) => {
    out.body = body
    resolveDone?.()
    return out
  }
  out.end = () => {
    resolveDone?.()
    return out
  }
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('backoffice change password', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('change le mot de passe du user connecté', async () => {
    const runCalls: any[] = []
    const hash = 'hash:oldpass'

    vi.resetModules()
    vi.doMock('bcryptjs', () => ({
      default: {
        compareSync: (plain: string, hashed: string) => hashed === `hash:${plain}`,
        hashSync: (plain: string) => `hash:${plain}`,
      },
    }))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('SELECT user_id') && sql.includes('password_hash')) return { user_id: 'u1', password_hash: hash }
          return null
        },
        all: async () => [],
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/me/password', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'staff', user_id: 'u1' },
      body: { old_password: 'oldpass', new_password: 'newpass123' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(204)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE business_user SET password_hash'))).toBe(true)
  }, 20000)

  it('refuse si ancien mot de passe invalide', async () => {
    const hash = 'hash:oldpass'

    vi.resetModules()
    vi.doMock('bcryptjs', () => ({
      default: {
        compareSync: (plain: string, hashed: string) => hashed === `hash:${plain}`,
        hashSync: (plain: string) => `hash:${plain}`,
      },
    }))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('SELECT user_id') && sql.includes('password_hash')) return { user_id: 'u1', password_hash: hash }
          return null
        },
        all: async () => [],
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/me/password', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'staff', user_id: 'u1' },
      body: { old_password: 'wrong', new_password: 'newpass123' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(401)
  }, 20000)
})
