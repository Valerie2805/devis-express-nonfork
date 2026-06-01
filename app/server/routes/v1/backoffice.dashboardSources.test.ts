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

describe('backoffice dashboard sources', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it(
    'calcule sources depuis lead.attribution_json',
    async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (_sql: string) => ({ config_json: '{}' }),
        all: async (sql: string) => {
          if (sql.includes('FROM lead'))
            return [
              { decision: 'qualified', created_at: new Date().toISOString(), first_human_response_at: null, status: 'new', attribution_json: JSON.stringify({ utm_source: 'google', referrer: 'https://google.com' }) },
              { decision: 'qualified', created_at: new Date().toISOString(), first_human_response_at: null, status: 'new', attribution_json: JSON.stringify({}) },
            ]
          if (sql.includes('FROM analytics_event')) return []
          return []
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/dashboard', 'get')
    const req: any = { params: { businessId: 'b1' }, query: { range: 'last_7_days' }, auth: { business_id: 'b1', role: 'owner', user_id: 'u1' } }
    const res = createRes()
    await handler(req, res as any, () => {})
    await res.done

    expect(res.statusCode).toBe(200)
    expect(res.body?.sources?.Google).toBe(1)
    expect(res.body?.sources?.Direct).toBe(1)
    expect(res.body?.charts?.urgency?.now).toBe(0)
    },
    20_000,
  )
})
