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

describe('backoffice prospection (owner)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('search_places renvoie les résultats', async () => {
    vi.resetModules()
    vi.doMock('../../prospection/places.js', () => ({
      searchPlaces: async () => [{ place_id: 'p1', name: 'X' }],
      getPlaceDetails: async () => null,
    }))
    vi.doMock('../../db.js', () => ({ getDb: async () => ({}) }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/search_places', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { query: 'plombier paris' },
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.results?.[0]?.place_id).toBe('p1')
  }, 20000)

  it('import_places upsert prospect + lien business_prospect', async () => {
    vi.resetModules()
    vi.doMock('../../prospection/places.js', () => ({
      searchPlaces: async () => [],
      getPlaceDetails: async () => ({ place_id: 'p1', name: 'X', phone: null, website: null, address: null, lat: null, lng: null, rating: null, reviews_count: null }),
    }))
    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/import_places', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { place_ids: ['p1'], trade_id: 't1' },
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.imported).toBe(1)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO prospect'))).toBe(true)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO business_prospect'))).toBe(true)
  }, 20000)
})
