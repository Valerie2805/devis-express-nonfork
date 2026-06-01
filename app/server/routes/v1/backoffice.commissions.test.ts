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

describe('backoffice commissions (owner)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('liste les commissions par lead et agrège par mois', async () => {
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('SELECT config_json FROM business')) return { config_json: JSON.stringify({ settings: { commissions: { default_rate_pct: 12 } } }) }
          return null
        },
        all: async (sql: string) => {
          if (sql.includes('FROM lead_commission_rate')) return [{ lead_id: 'l1', rate_pct: 20 }]
          if (sql.includes('FROM lead_revenue_entry'))
            return [
              { lead_id: 'l1', amount_cents: 20000, currency: 'EUR', invoiced_at: '2026-04-15T10:00:00.000Z' },
              { lead_id: 'l1', amount_cents: 10000, currency: 'EUR', invoiced_at: '2026-05-02T10:00:00.000Z' },
            ]
          return [
            { lead_id: 'l1', first_name: 'A', city: 'Paris', outcome_json: JSON.stringify({ amount_cents: 10000, currency: 'EUR', won_at: '2026-04-10T10:00:00.000Z' }) },
            { lead_id: 'l2', first_name: 'B', city: 'Lyon', outcome_json: JSON.stringify({ amount_cents: 5000, currency: 'EUR', won_at: '2026-04-11T10:00:00.000Z' }) },
          ]
        },
        run: async () => {},
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/commissions', 'get')
    const req: any = { params: { businessId: 'b1' }, auth: { business_id: 'b1', role: 'owner', user_id: 'u1' }, query: {} }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(res.body.items.length).toBe(2)
    const l1 = res.body.items.find((x: any) => x.lead_id === 'l1')
    const l2 = res.body.items.find((x: any) => x.lead_id === 'l2')
    expect(l1.rate_pct).toBe(20)
    expect(l1.amount_cents).toBe(30000)
    expect(l1.commission_cents).toBe(6000)
    expect(l1.months).toEqual(['2026-04', '2026-05'])
    expect(l1.by_month).toEqual([
      { month: '2026-04', amount_cents: 20000, commission_cents: 4000 },
      { month: '2026-05', amount_cents: 10000, commission_cents: 2000 },
    ])
    expect(l2.rate_pct).toBe(12)
    expect(l2.commission_cents).toBe(600)
    expect(res.body.totals_by_month['2026-04'].commission_cents).toBe(4600)
    expect(res.body.totals_by_month['2026-05'].commission_cents).toBe(2000)
  }, 20_000)

  it('met à jour le taux de commission d’un lead', async () => {
    const runCalls: any[] = []
    vi.resetModules()
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string) => {
          if (sql.includes('SELECT config_json FROM business')) return { config_json: '{}' }
          if (sql.includes('SELECT lead_id FROM lead')) return { lead_id: 'l1' }
          return null
        },
        run: async (sql: string, params: any[]) => runCalls.push({ sql, params }),
        all: async () => [],
      }),
    }))

    const router = (await import('./backoffice')).default as any
    const handler = getRouteHandler(router, '/backoffice/:businessId/leads/:leadId/commission_rate', 'put')
    const req: any = {
      params: { businessId: 'b1', leadId: 'l1' },
      auth: { business_id: 'b1', role: 'owner', user_id: 'u1' },
      body: { rate_pct: 15 },
      header: () => '',
      ip: '127.0.0.1',
    }
    const res = createRes()
    await handler(req, res as any, (e: any) => {
      if (e) throw e
    })
    await res.done
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO lead_commission_rate'))).toBe(true)
  })
})
