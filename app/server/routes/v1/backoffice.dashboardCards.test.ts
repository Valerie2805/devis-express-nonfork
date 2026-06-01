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

describe('backoffice dashboard cards', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it(
    'expose calls_clicks, whatsapp_clicks, form_opens',
    async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'))
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (_sql: string) => ({ config_json: '{}' }),
        all: async (sql: string) => {
          if (sql.includes("status = 'won'") || sql.includes('status = "won"'))
            return [
              {
                outcome_json: JSON.stringify({ amount_cents: 12300, currency: 'EUR', won_at: new Date().toISOString() }),
              },
            ]
          if (sql.includes('FROM lead')) return [{ decision: 'qualified', created_at: new Date().toISOString(), first_human_response_at: null, status: 'new' }]
          if (sql.includes('FROM analytics_event'))
            return [
              { name: 'click_call', page_type: 'home', session_id: 's1', properties_json: '{}', utm_json: null, referrer: null },
              { name: 'click_whatsapp', page_type: 'home', session_id: 's2', properties_json: '{}', utm_json: null, referrer: null },
              { name: 'open_quote_form', page_type: 'home', session_id: 's3', properties_json: '{}', utm_json: null, referrer: null },
            ]
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
    expect(res.body?.cards?.calls_clicks).toBe(1)
    expect(res.body?.cards?.whatsapp_clicks).toBe(1)
    expect(res.body?.cards?.form_opens).toBe(1)
    expect(res.body?.cards?.quotes_sent).toBe(0)
    expect(res.body?.cards?.won).toBe(0)
    expect(res.body?.cards?.lost).toBe(0)
    expect(res.body?.charts?.funnel?.form_opens).toBe(1)
    expect(res.body?.cards?.leads_responded_under_10min).toBe(0)
    expect(res.body?.cards?.revenue_cents).toBe(12300)
    },
    20_000,
  )
})
