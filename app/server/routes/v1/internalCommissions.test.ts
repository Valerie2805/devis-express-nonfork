import { describe, expect, it, vi, afterEach } from 'vitest'

describe('internal commissions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('calcule et enregistre une commission', async () => {
    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async () => null,
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
        },
        all: async () => [],
      }),
    }))
    const { upsertCommissionHandler } = await import('./internalCommissions')
    const req: any = { body: { month: '2026-04', company_key: 'business:b1', ca_eur: 10000, rate_pct: 10, charges_pct: 22 } }
    const res: any = { statusCode: 200, body: null, status: (c: number) => ((res.statusCode = c), res), json: (b: any) => ((res.body = b), res) }
    await upsertCommissionHandler(req, res)
    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('INSERT INTO commission_entry'))).toBe(true)
    expect(res.body?.entry?.commission_gross_eur).toBe(1000)
    expect(res.body?.entry?.charges_amount_eur).toBe(220)
    expect(res.body?.entry?.commission_net_eur).toBe(780)
  }, 20_000)

  it('liste et agrège par mois', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async () => [
          { entry_id: 'e1', month: '2026-04', ca_eur: 10000, commission_gross_eur: 1000, charges_amount_eur: 200, commission_net_eur: 800 },
          { entry_id: 'e2', month: '2026-04', ca_eur: 5000, commission_gross_eur: 500, charges_amount_eur: 100, commission_net_eur: 400 },
          { entry_id: 'e3', month: '2026-05', ca_eur: 2000, commission_gross_eur: 200, charges_amount_eur: 40, commission_net_eur: 160 },
        ],
        get: async () => null,
        run: async () => {},
      }),
    }))
    const { listCommissionsHandler } = await import('./internalCommissions')
    const req: any = { query: { from: '2026-04', to: '2026-05' } }
    const res: any = { statusCode: 200, body: null, status: (c: number) => ((res.statusCode = c), res), json: (b: any) => ((res.body = b), res) }
    await listCommissionsHandler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.totals_by_month?.['2026-04']?.commission_net_eur).toBe(1200)
    expect(res.body?.totals_by_month?.['2026-05']?.commission_net_eur).toBe(160)
  }, 20_000)

  it('expose company_key dans les items', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async () => [{ entry_id: 'e1', month: '2026-04', business_id: 'b1', prospect_id: null, ca_eur: 100, commission_gross_eur: 10, charges_amount_eur: 2, commission_net_eur: 8 }],
        get: async () => null,
        run: async () => {},
      }),
    }))
    const { listCommissionsHandler } = await import('./internalCommissions')
    const req: any = { query: {} }
    const res: any = { statusCode: 200, body: null, status: (c: number) => ((res.statusCode = c), res), json: (b: any) => ((res.body = b), res) }
    await listCommissionsHandler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.items?.[0]?.company_key).toBe('business:b1')
  }, 20_000)
})
