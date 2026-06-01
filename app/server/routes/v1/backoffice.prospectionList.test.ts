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

describe('backoffice prospection list + stats', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('liste les prospects du business', async () => {
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (_sql: string) => ({ c: 1, config_json: '{}' }),
        all: async () => [{ prospect_id: 'pr1', name: 'X' }],
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects', 'get')
    const req: any = { params: { businessId: 'b1' }, auth: { business_id: 'b1', role: 'owner', user_id: 'u1' }, query: {} }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.items?.[0]?.prospect_id).toBe('pr1')
  })

  it('retourne des stats simples', async () => {
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('COUNT')) return { c: 10 }
          return { config_json: '{}' }
        },
        all: async () => [{ d: '2026-04-01', c: 2 }],
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/stats', 'get')
    const req: any = { params: { businessId: 'b1' }, auth: { business_id: 'b1', role: 'owner', user_id: 'u1' }, query: {} }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.total).toBe(10)
    expect(res.body.series?.[0]?.d).toBe('2026-04-01')
  })
})
