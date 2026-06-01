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

describe('backoffice leads query', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it(
    'passe q/from/to dans la requête SQL',
    async () => {
    const allCalls: any[] = []
    const getCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string, params: any[]) => {
          allCalls.push({ sql, params })
          return []
        },
        get: async (sql: string, params: any[]) => {
          getCalls.push({ sql, params })
          return { c: 0 }
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: { q: 'paris', from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z', limit: '10', offset: '0' },
      auth: { business_id: 'b1', user_id: 'u1', role: 'owner' },
    }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done

    expect(allCalls.length).toBe(1)
    expect(allCalls[0].sql).toContain('created_at >=')
    expect(allCalls[0].sql).toContain('created_at <=')
    expect(allCalls[0].sql).toContain('lead_id LIKE ?')
    expect(getCalls[0].sql).toContain('COUNT(*)')
    },
    20_000,
  )
})
