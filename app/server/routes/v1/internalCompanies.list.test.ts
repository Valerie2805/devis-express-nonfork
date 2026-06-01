import { describe, expect, it, vi, afterEach } from 'vitest'

function createRes() {
  const out: any = { statusCode: 200, body: null }
  out.status = (code: number) => {
    out.statusCode = code
    return out
  }
  out.json = (body: any) => {
    out.body = body
    return out
  }
  return out
}

describe('internal companies list', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('filtre sur accessibilité', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string) => {
          if (sql.includes('FROM business')) return [{ business_id: 'b1', company_name: 'ACME', city: 'Paris' }]
          if (sql.includes('FROM prospect')) return [{ prospect_id: 'p1', name: 'Beta', city: 'Lyon', website: 'https://beta.fr' }]
          if (sql.includes('FROM company_profile'))
            return [
              { business_id: 'b1', website_url: 'https://acme.fr', legal_contact_email: null, headcount_range: '2_10', naf_code: '4332A', sector_label: 'Plombier', annual_revenue_eur: 120000 },
              { prospect_id: 'p1', website_url: 'https://beta.fr', legal_contact_email: null, headcount_range: null, naf_code: null, sector_label: null, annual_revenue_eur: null },
            ]
          if (sql.includes('FROM company_pagespeed_run'))
            return [
              { business_id: 'b1', prospect_id: null, strategy: 'mobile', accessibility_score: 40, fetched_at: '2026-01-01T00:00:00.000Z' },
              { business_id: null, prospect_id: 'p1', strategy: 'mobile', accessibility_score: 90, fetched_at: '2026-01-01T00:00:00.000Z' },
            ]
          return []
        },
      }),
    }))

    const { listCompaniesHandler } = await import('./internalCompanies')
    const req: any = { query: { accessibility_lt: '50' } }
    const res = createRes()
    await listCompaniesHandler(req, res as any)
    expect(res.statusCode).toBe(200)
    expect(res.body.items.length).toBe(1)
    expect(res.body.items[0].company_key).toBe('business:b1')
    expect(res.body.items[0].headcount_range).toBe('2_10')
    expect(res.body.items[0].annual_revenue_eur).toBe(120000)
  })
})
