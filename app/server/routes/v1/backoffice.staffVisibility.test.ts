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

describe('staff lead visibility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('staff ne voit que ses leads assignés', async () => {
    const allCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => ({ c: 0 }),
        all: async (sql: string, params: any[]) => {
          allCalls.push({ sql, params })
          return []
        },
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads', 'get')
    const req: any = {
      params: { businessId: 'b1' },
      query: {},
      auth: { business_id: 'b1', role: 'staff', user_id: 'u_staff' },
    }
    const res = createRes()
    await handler(req, res as any, () => {})

    expect(res.statusCode).toBe(200)
    const call = allCalls.find((c) => String(c.sql).includes('FROM lead'))
    expect(call).toBeTruthy()
    expect(call.params).toContain('u_staff')
  })
})
