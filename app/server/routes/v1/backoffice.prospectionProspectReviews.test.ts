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

describe('backoffice prospection prospect reviews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('liste les avis d’un prospect', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ business_id: 'b1' }),
        all: async () => [
          { author_name: 'Alice', rating: 5, text: 'Super', created_at: '2024-01-01T00:00:00.000Z' },
          { author_name: 'Bob', rating: 4, text: 'Bien', created_at: '2023-12-01T00:00:00.000Z' },
        ],
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/prospection/prospects/:prospectId/reviews', 'get')

    const req: any = {
      params: { businessId: 'b1', prospectId: 'p1' },
      query: {},
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
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.items[0].author_name).toBe('Alice')
  }, 20_000)
})

