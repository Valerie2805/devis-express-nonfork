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

describe('backoffice prospection reviews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('importe des avis Google pour un prospect existant', async () => {
    const runCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../prospection/places.js', () => ({
      getPlaceDetails: async () => ({
        place_id: 'pid1',
        name: 'X',
        address: 'A',
        lat: null,
        lng: null,
        rating: null,
        reviews_count: 1,
        phone: null,
        website: null,
        reviews: [{ author_name: 'Alice', rating: 5, text: 'Super', time: 1700000000 }],
      }),
    }))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async () => [{ prospect_id: 'gp_pid1', place_id: 'pid1' }],
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
        get: async () => null,
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/import_reviews', 'post')
    const req: any = {
      params: { businessId: 'b1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { prospect_ids: ['gp_pid1'] },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO prospect_review'))).toBe(true)
  }, 20_000)
})

