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

describe('internal companies type filter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('type=prospect ne renvoie que des prospects', async () => {
    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        all: async (sql: string) => {
          if (sql.includes('FROM business')) return [{ business_id: 'b1', company_name: 'ACME', city: 'Paris' }]
          if (sql.includes('FROM prospect')) return [{ prospect_id: 'p1', name: 'Beta', city: 'Lyon', website: 'https://beta.fr' }]
          if (sql.includes('FROM company_profile')) return []
          if (sql.includes('FROM company_pagespeed_run')) return []
          return []
        },
      }),
    }))
    const { listCompaniesHandler } = await import('./internalCompanies')
    const req: any = { query: { type: 'prospect' } }
    const res = createRes()
    await listCompaniesHandler(req, res as any)
    expect(res.statusCode).toBe(200)
    expect(res.body.items.length).toBe(1)
    expect(res.body.items[0].company_key).toBe('prospect:p1')
  })
})

