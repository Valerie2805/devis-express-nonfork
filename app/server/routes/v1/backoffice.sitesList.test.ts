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

describe('backoffice sites list', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('staff liste ses leads assignés avec statut site', async () => {
    const allCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string, params: any[]) => {
          allCalls.push({ sql, params })
          return [
            { lead_id: 'l1', first_name: 'A', city: 'Paris', site_status: 'in_progress', portal_id: 'p1', preview_enabled: 0 },
          ]
        },
        get: async () => ({ config_json: '{}' }),
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/sites', 'get')
    const req: any = { params: { businessId: 'b1' }, auth: { business_id: 'b1', role: 'staff', user_id: 'u_staff' }, query: {} }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.items?.[0]?.lead_id).toBe('l1')
    const call = allCalls[0]
    expect(String(call.sql)).toContain('lead_site_state')
    expect(call.params).toContain('u_staff')
  })
})

