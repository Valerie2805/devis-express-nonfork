import { describe, expect, it, vi, afterEach } from 'vitest'

describe('internal companies profile patch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('met à jour le CA et le secteur', async () => {
    const runCalls: any[] = []
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string, params: any[]) => {
          if (sql.includes('SELECT * FROM company_profile') && params[0] === 'b1') return { business_id: 'b1' }
          return null
        },
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
        },
      }),
    }))

    const { patchCompanyProfileHandler } = await import('./internalCompanies')
    const req: any = {
      params: { companyKey: 'business:b1' },
      body: { annual_revenue_eur: 120000, naf_code: '4332A', sector_label: 'Plombier' },
    }
    const res: any = { statusCode: 200, body: null, status: (c: number) => ((res.statusCode = c), res), json: (b: any) => ((res.body = b), res) }
    await patchCompanyProfileHandler(req, res)

    expect(res.statusCode).toBe(200)
    expect(runCalls.some((c) => String(c.sql).includes('UPDATE company_profile'))).toBe(true)
  })
})
