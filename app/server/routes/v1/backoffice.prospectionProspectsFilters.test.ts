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

describe('backoffice prospection prospects filters', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('retourne score + emails parsés', async () => {
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ c: 1 }),
        all: async () => [
          {
            prospect_id: 'p1',
            name: 'X',
            trade_id: null,
            phone: '+331',
            website: 'https://x.test',
            emails_json: '["a@x.test"]',
            notes: 'n',
            address: 'addr',
            city: 'Paris',
            lat: null,
            lng: null,
            rating: 4.5,
            reviews_count: 10,
            status: 'new',
            updated_at: '2024-01-01T00:00:00.000Z',
            imported_at: '2024-01-01T00:00:00.000Z',
            score: 77,
          },
        ],
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: { limit: '50', offset: '0', has_email: '1', sort: 'score' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.items?.[0]?.emails?.[0]).toBe('a@x.test')
    expect(typeof res.body.items?.[0]?.score).toBe('number')
  }, 20_000)
})

