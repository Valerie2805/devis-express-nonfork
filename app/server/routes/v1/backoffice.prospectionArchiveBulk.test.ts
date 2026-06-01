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
  return out
}

function getRouteHandler(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods?.[method])
  if (!layer) throw new Error('route not found')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

describe('backoffice prospection archive bulk', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('GET prospects masque archived par défaut', async () => {
    const allCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ c: 0 }),
        all: async (sql: string, params: any[]) => {
          allCalls.push({ sql, params })
          return []
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: { limit: '50', offset: '0' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(allCalls.some((c) => Array.isArray(c.params) && c.params.includes('archived'))).toBe(true)
  }, 20_000)

  it('archive tous les prospects filtrés (limit)', async () => {
    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string) => {
          if (sql.includes('SELECT p.prospect_id')) return [{ prospect_id: 'p1' }, { prospect_id: 'p2' }]
          return []
        },
        get: async () => null,
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects/archive_bulk', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { q: 'elec', limit: 200 },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE prospect SET status') && c.params.includes('archived'))).toBe(true)
  }, 20_000)
})
