import { describe, expect, it, vi, afterEach } from 'vitest'

describe('internal companies pagespeed run', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('insère mobile + desktop en historique', async () => {
    const runCalls: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            lighthouseResult: {
              categories: {
                performance: { score: 0.9 },
                accessibility: { score: 0.4 },
                seo: { score: 0.8 },
                'best-practices': { score: 0.7 },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    vi.doMock('../../db.js', () => ({
      getDb: async () => ({
        get: async (sql: string, params: any[]) => {
          if (sql.includes('FROM company_profile') && params[0] === 'b1') return { business_id: 'b1', website_url: 'https://acme.fr' }
          return null
        },
        run: async (sql: string, params: any[]) => {
          runCalls.push({ sql, params })
        },
      }),
    }))

    const { runPagespeedHandler } = await import('./internalCompanies')
    const req: any = { params: { companyKey: 'business:b1' } }
    const res: any = { statusCode: 200, body: null, status: (c: number) => ((res.statusCode = c), res), json: (b: any) => ((res.body = b), res) }
    await runPagespeedHandler(req, res)

    const inserts = runCalls.filter((c) => String(c.sql).includes('INSERT INTO company_pagespeed_run'))
    expect(inserts.length).toBe(2)
  })
})

